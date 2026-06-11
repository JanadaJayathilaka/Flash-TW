import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Text,
  BackHandler,
  TouchableOpacity,
  Image,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AntDesign from '@expo/vector-icons/AntDesign';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import AppHeader from '../src/components/AppHeader';
import Header from '../src/components/Header';
import TabBar from '../src/components/TabBar';
import AllSalesTab from '../src/components/AllSalesTab';
import TopSalesTab from '../src/components/TopSalesTab';
import LaggardsTab from '../src/components/LaggardsTab';
import AnalyticsTab from '../src/components/AnalyticsTab';
import SalesByOriginTab from '../src/components/SalesByOriginTab';
import { TabName, SalesPivotRow } from '../src/types/sales';
import { fetchSalesPivotSum, fetchStoreDetails, fetchLatestDate, fetchAvailableDates } from '../src/services/salesApi';
import { computeDateParams, computeDateParamsFromFiscal, computeCalendarDateParams, buildFiscalIndexes, DateParams, FiscalIndexes } from '../src/utils/dateUtils';
import { useAppTheme } from '../src/theme/ThemeContext';

export type CalendarMode = 'fiscal' | 'calendar';

function normalizeComp(cy: number | null | undefined, ly: number | null | undefined, comp: number | null | undefined): number {
  const cyNum = Number(cy) || 0;
  const lyNum = Number(ly) || 0;
  if (cyNum === 0 || lyNum === 0) return 0;
  return Number(comp) || 0;
}

export default function FlashSales() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [isLandscape, setIsLandscape] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('allSales');
  const [analyticsSmaVisible, setAnalyticsSmaVisible] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [salesData, setSalesData] = useState<SalesPivotRow[]>([]);
  const [registeredStores, setRegisteredStores] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateParams, setDateParams] = useState<DateParams>(computeDateParams());
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('fiscal');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const availableDatesLoadedRef = useRef(false);
  const allSalesExportActionsRef = useRef<{ exportExcel: () => void; exportCSV: () => void; exportPDF?: () => void; printPDF?: () => void }>({
    exportExcel: () => {},
    exportCSV: () => {},
  });
  
  const topSalesExportActionsRef = useRef<{ exportPDF: () => void; printPDF: () => void }>({
    exportPDF: () => {},
    printPDF: () => {},
  });
  const laggardExportActionsRef = useRef<{ exportPDF: () => void; printPDF: () => void }>({
    exportPDF: () => {},
    printPDF: () => {},
  });
  const analyticsExportActionsRef = useRef<{ exportPDF: () => void; printPDF: () => void }>({
    exportPDF: () => {},
    printPDF: () => {},
  });

  // Persist fiscal data across mode switches
  const fiscalIndexesRef = useRef<FiscalIndexes | null>(null);
  const latestDateRef = useRef<string | null>(null);
  const selectedDateRef = useRef<string | null>(null);

  const loadData = useCallback(async (mode?: CalendarMode, dateOverride?: string) => {
    const activeMode = mode ?? calendarMode;
    try {
      setError(null);

      // 1. Fetch latest DB date, store details, and available dates in parallel
      const [latestDateStr, ddsData, datesResult] = await Promise.all([
        fetchLatestDate(),
        fetchStoreDetails().catch(() => null),
        availableDatesLoadedRef.current ? Promise.resolve(null) : fetchAvailableDates().catch(() => []),
      ]);
      if (datesResult !== null && Array.isArray(datesResult) && datesResult.length > 0) {
        setAvailableDates(datesResult);
        availableDatesLoadedRef.current = true;
      }

      // 2. Determine reference date
      let referenceDate: Date | undefined;
      let selectedDateStr: string | undefined;
      const effectiveDateStr = dateOverride ?? selectedDateRef.current ?? latestDateStr;
      if (effectiveDateStr) {
        const [y, m, d] = effectiveDateStr.split('-').map(Number);
        referenceDate = new Date(y, m - 1, d);
        selectedDateStr = effectiveDateStr;
        selectedDateRef.current = effectiveDateStr;
        if (latestDateStr) latestDateRef.current = latestDateStr;
        console.log('[flash-sales] Using date:', effectiveDateStr, dateOverride ? '(user selected)' : '(latest DB)');
      } else {
        console.log('[flash-sales] Could not fetch latest date, falling back to today');
      }

      // Store fiscal indexes for mode switching
      if (ddsData?.FiscalCalendar?.length) {
        fiscalIndexesRef.current = buildFiscalIndexes(ddsData.FiscalCalendar);
      }
      if (ddsData?.SubClass?.length) {
        setRegisteredStores(ddsData.SubClass.length);
      }

      // 3. Compute date params based on active calendar mode
      let params: DateParams;
      if (activeMode === 'calendar' && selectedDateStr) {
        params = computeCalendarDateParams(selectedDateStr);
        // Mirror C# logic: use FiscalWeekInYear from fiscal calendar for the Wk label
        const fiscalEntry = fiscalIndexesRef.current?.calendar[selectedDateStr];
        if (fiscalEntry) {
          params = { ...params, weekNumber: fiscalEntry.WeekInYear };
        }
        console.log('[flash-sales] Using CALENDAR mode date params');
      } else if (activeMode === 'fiscal' && ddsData?.FiscalCalendar?.length && selectedDateStr) {
        const indexes = fiscalIndexesRef.current!;
        const fiscalParams = computeDateParamsFromFiscal(selectedDateStr, indexes);
        if (fiscalParams) {
          params = fiscalParams;
          console.log('[flash-sales] Using FISCAL mode date params');
        } else {
          console.warn('[flash-sales] selectedDate not found in fiscal calendar, falling back to ISO');
          params = computeDateParams(referenceDate);
        }
      } else {
        params = computeDateParams(referenceDate);
      }
      setDateParams(params);

      // 4. Fetch pivot summary data using new SP (AHLIBR.GET_SALES_PVT_SUMRY with 14 params)
      const response = await fetchSalesPivotSum({
        DT_1: params.DT_1,
        DT_2: params.DT_2,
        P_WTD_1_S: params.P_WTD_1_S,
        P_WTD_1_E: params.P_WTD_1_E,
        P_WTD_2_S: params.P_WTD_2_S,
        P_WTD_2_E: params.P_WTD_2_E,
        P_QTD_1_S: params.P_QTD_1_S,
        P_QTD_1_E: params.P_QTD_1_E,
        P_QTD_2_S: params.P_QTD_2_S,
        P_QTD_2_E: params.P_QTD_2_E,
        P_YTD_1_S: params.P_YTD_1_S,
        P_YTD_1_E: params.P_YTD_1_E,
        P_YTD_2_S: params.P_YTD_2_S,
        P_YTD_2_E: params.P_YTD_2_E,
      });

      const normalizedRows = (response.PivotData ?? []).map((row) => ({
        ...row,
        DAY_SALES_COMP: normalizeComp(row.DAY_SALES_CY, row.DAY_SALES_LY, row.DAY_SALES_COMP),
        WTD_SALES_COMP: normalizeComp(row.WTD_SALES_CY, row.WTD_SALES_LY, row.WTD_SALES_COMP),
        QTD_SALES_COMP: normalizeComp(row.QTD_SALES_CY, row.QTD_SALES_LY, row.QTD_SALES_COMP),
        YTD_SALES_COMP: normalizeComp(row.YTD_SALES_CY, row.YTD_SALES_LY, row.YTD_SALES_COMP),
      }));

      setSalesData(normalizedRows);
    } catch (err: any) {
      console.error('Failed to load sales data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [calendarMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleTabChange = useCallback((tab: TabName) => {
    setTabLoading(true);
    if (tab === 'analytics') {
      setAnalyticsSmaVisible(false);
    }
    setActiveTab(tab);
  }, []);

  const handleHeaderBack = useCallback(() => {
    if (activeTab !== 'allSales') {
      setTabLoading(true);
      setActiveTab('allSales');
    } else {
      router.back();
    }
  }, [activeTab, router]);

  const handleHomePress = useCallback(() => {
    if (activeTab !== 'allSales') {
      setTabLoading(true);
      setActiveTab('allSales');
    }
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (activeTab !== 'allSales') {
          setTabLoading(true);
          setActiveTab('allSales');
          return true;
        }
        return false; // let default back (go to dashboard) happen
      });
      return () => sub.remove();
    }, [activeTab])
  );

  useEffect(() => {
    if (!tabLoading) return;
    const timer = setTimeout(() => setTabLoading(false), 350);
    return () => clearTimeout(timer);
  }, [tabLoading, activeTab]);

  const handleCalendarModeChange = useCallback((newMode: CalendarMode) => {
    if (newMode === calendarMode) return;
    setCalendarMode(newMode);
    setLoading(true);
    loadData(newMode, selectedDateRef.current ?? undefined);
  }, [calendarMode, loadData]);

  const handleDateSelect = useCallback((date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    setLoading(true);
    loadData(calendarMode, `${y}-${m}-${d}`);
  }, [calendarMode, loadData]);

  const handleBindAllSalesExportActions = useCallback((actions: { exportExcel: () => void; exportCSV: () => void; exportPDF?: () => void; printPDF?: () => void }) => {
    allSalesExportActionsRef.current = actions;
  }, []);

  

  const handleBindTopSalesExportActions = useCallback((actions: { exportPDF: () => void; printPDF: () => void }) => {
    topSalesExportActionsRef.current = actions;
  }, []);

  const handleBindLaggardsExportActions = useCallback((actions: { exportPDF: () => void; printPDF: () => void }) => {
    laggardExportActionsRef.current = actions;
  }, []);

  const handleBindAnalyticsExportActions = useCallback((actions: { exportPDF: () => void; printPDF: () => void }) => {
    analyticsExportActionsRef.current = actions;
  }, []);

  const showTabToolbar = activeTab === 'allSales' || activeTab === 'topSales' || activeTab === 'laggards' || activeTab === 'analytics';

  const renderTab = () => {
    switch (activeTab) {
      case 'allSales':
        return (
          <AllSalesTab
            data={salesData}
            loading={loading}
            weekNumber={dateParams.weekNumber}
            dayNumber={dateParams.dayNumber}
            quarterNumber={dateParams.quarterNumber}
            calendarDayOfMonth={dateParams.calendarDayOfMonth}
            calendarMonthNumber={dateParams.calendarMonthNumber}
            registeredStores={registeredStores}
            calendarMode={calendarMode}
            onCalendarModeChange={handleCalendarModeChange}
            isLandscape={isLandscape}
            onBindExportActions={handleBindAllSalesExportActions}
          />
        );
      case 'topSales':
        return <TopSalesTab data={salesData} loading={loading} boxDayCY={dateParams.boxDayCY} boxDayLY={dateParams.boxDayLY} isLandscape={isLandscape} onBindExportActions={handleBindTopSalesExportActions} />;
      case 'laggards':
        return <LaggardsTab data={salesData} loading={loading} boxDayCY={dateParams.boxDayCY} boxDayLY={dateParams.boxDayLY} isLandscape={isLandscape} onBindExportActions={handleBindLaggardsExportActions} />;
      case 'analytics':
        return (
          <AnalyticsTab
            smaVisible={analyticsSmaVisible}
            onToggleSma={() => setAnalyticsSmaVisible(v => !v)}
            calendarMode={calendarMode}
            onCalendarModeChange={handleCalendarModeChange}
            dateParams={dateParams}
            onBindExportActions={handleBindAnalyticsExportActions}
          />
        );
      case 'salesByOrigin':
        return <SalesByOriginTab data={salesData} loading={loading} />;
      default:
        return null;
    }
    
  };

  if (loading && salesData.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.appBackground }]} edges={['top', 'bottom']}>
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.colors.statusBarBackground} />
        <View style={[styles.contentWrapper, { backgroundColor: theme.colors.surface }]}>
          <AppHeader  onRotate={() => setIsLandscape(v => !v)} onBack={handleHeaderBack} onHome={handleHomePress} />
          <View style={[styles.centered, { backgroundColor: theme.colors.surface }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading Flash Sales...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error && salesData.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.appBackground }]} edges={['top', 'bottom']}>
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.colors.statusBarBackground} />
        <View style={[styles.contentWrapper, { backgroundColor: theme.colors.surface }]}>
          <AppHeader onRotate={() => setIsLandscape(v => !v)} onBack={handleHeaderBack} onHome={handleHomePress} />
          <View style={[styles.centered, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>Error: {error}</Text>
            <Text style={[styles.retryText, { color: theme.colors.primary }]} onPress={() => loadData()}>
              Tap to retry
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.appBackground }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.colors.statusBarBackground} />
      <View style={[styles.contentWrapper, { backgroundColor: theme.colors.surface }]}>
        <AppHeader onRotate={() => setIsLandscape(v => !v)} onBack={handleHeaderBack} onHome={handleHomePress} />
        <Header
          displayDate={dateParams.displayDate}
          onDateSelect={handleDateSelect}
          calendarMode={calendarMode}
          onCalendarModeChange={handleCalendarModeChange}
          availableDates={availableDates}
          titleOverride={activeTab === 'analytics' ? 'Sales - Analytics' : undefined}
          showDatePicker={activeTab !== 'analytics'}
        />
        {showTabToolbar ? (
          <View style={[styles.analyticsTabRow, { backgroundColor: theme.colors.surface }, activeTab === 'allSales' && styles.allSalesTabRowSpacing]}>
            <View style={styles.analyticsTabsWrap}>
              <TabBar activeTab={activeTab} onTabChange={handleTabChange} alignLeft isLandscape={isLandscape} />
            </View>
            <View style={styles.exportButtonsRow}>
              {activeTab === 'allSales' ? (
                <>
                  <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.surfaceMuted }]} activeOpacity={0.7} onPress={() => allSalesExportActionsRef.current.exportPDF ? allSalesExportActionsRef.current.exportPDF() : null}>
                    <View style={styles.iconCrossWrap}>
                      <AntDesign name="download" size={20} color={theme.colors.icon} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.surfaceMuted }]} activeOpacity={0.7} onPress={() => allSalesExportActionsRef.current.printPDF ? allSalesExportActionsRef.current.printPDF() : null}>
                    <View style={styles.iconCrossWrap}>
                      <MaterialCommunityIcons name="printer-outline" size={24} color={theme.colors.icon} />
                    </View>
                  </TouchableOpacity>
                </>
              ) : activeTab === 'analytics' ? (
                <>
                  <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.surfaceMuted }]} activeOpacity={0.7} onPress={() => analyticsExportActionsRef.current.exportPDF()}>
                    <View style={styles.iconCrossWrap}>
                      <AntDesign name="download" size={20} color={theme.colors.icon} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.surfaceMuted }]} activeOpacity={0.7} onPress={() => analyticsExportActionsRef.current.printPDF()}>
                    <View style={styles.iconCrossWrap}>
                      <MaterialCommunityIcons name="printer-outline" size={24} color={theme.colors.icon} />
                    </View>
                  </TouchableOpacity>
                </>
              ) : (
                <>

                  <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.surfaceMuted }]} activeOpacity={0.7} onPress={() => {
                    if (activeTab === 'topSales') topSalesExportActionsRef.current.exportPDF();
                    else if (activeTab === 'laggards') laggardExportActionsRef.current.exportPDF();

                  }}>
                    <View style={styles.iconCrossWrap}>
                      <AntDesign name="download" size={20} color={theme.colors.icon} />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.surfaceMuted }]} activeOpacity={0.7} onPress={() => {
                    if (activeTab === 'topSales') topSalesExportActionsRef.current.printPDF();
                    else if (activeTab === 'laggards') laggardExportActionsRef.current.printPDF();

                  }}>
                    <View style={styles.iconCrossWrap}>
                      <MaterialCommunityIcons name="printer-outline" size={24} color={theme.colors.icon} />
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : (
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} isLandscape={isLandscape} />
        )}
        
        <View style={[styles.tabContent, { backgroundColor: theme.colors.surface }]}>
          {tabLoading ? (
            <View style={[styles.centered, { backgroundColor: theme.colors.surface }]}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading...</Text>
            </View>
          ) : renderTab()}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#006cc5',
  },
  contentWrapper: {
    flex: 1,
    margin: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    borderWidth: 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Montserrat_500Medium',
    color: '#64748b',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#dc2626',
    marginBottom: 8,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Montserrat_500Medium',
    color: '#2563eb',
    textDecorationLine: 'underline',
  },
  tabContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  
  // ── Analytics landscape toolbar inline in tab row ──
  analyticsTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingRight: 6,
  },
  allSalesTabRowSpacing: {
    paddingBottom: 8,
  },
  analyticsTabsWrap: {
    flex: 1,
  },
  exportButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 6,
    marginBottom: 0,
  },
  exportBtn: {
    width: 34,
    height: 34,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    backgroundColor: '#ffffff',
  },
  exportBtnDisabled: {
   
  },
  iconCrossWrap: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
});

