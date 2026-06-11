import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, TouchableOpacity, Modal, Pressable } from 'react-native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { CalendarMode } from '../../app/flash-sales';
import { useAppTheme } from '../theme/ThemeContext';

interface HeaderProps {
  displayDate: string;
  onDateSelect?: (date: Date) => void;
  calendarMode?: CalendarMode;
  onCalendarModeChange?: (mode: CalendarMode) => void;
  availableDates?: string[];
  titleOverride?: string;
  showDatePicker?: boolean;
}

const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

export default function Header({ displayDate, onDateSelect, calendarMode = 'fiscal', onCalendarModeChange, availableDates = [], titleOverride, showDatePicker = true }: HeaderProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { theme } = useAppTheme();

  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const h = now.getHours();
  const h12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const mm = String(now.getMinutes()).padStart(2, '0');

  const generated = `Generated: ${now.getFullYear()} ${months[now.getMonth()]} ${String(now.getDate()).padStart(2, '0')} ${days[now.getDay()]} | ${h12}:${mm} ${ampm}${' USA, Pacific'}`;

  // ─── Fiscal modal state ────────────────────────────────────────────────────
  const [showFiscalModal, setShowFiscalModal] = useState(false);

  const fiscalModal = (
    <Modal visible={showFiscalModal} transparent animationType="fade" onRequestClose={() => setShowFiscalModal(false)}>
      <Pressable style={[calStyles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setShowFiscalModal(false)}>
        <View style={[fiscalStyles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[fiscalStyles.title, { color: theme.colors.textPrimary }]}>Select Calendar Mode</Text>
          <View style={fiscalStyles.btnRow}>
            <TouchableOpacity
              style={[
                fiscalStyles.btn,
                { borderColor: theme.colors.primary },
                calendarMode === 'fiscal' && fiscalStyles.btnActive,
                calendarMode === 'fiscal' && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => { setShowFiscalModal(false); onCalendarModeChange?.('fiscal'); }}
            >
              <MaterialCommunityIcons name="calendar-check" size={22} color={calendarMode === 'fiscal' ? theme.colors.textInverse : theme.colors.primary} />
              <Text
                style={[
                  fiscalStyles.btnText,
                  { color: theme.colors.primary },
                  calendarMode === 'fiscal' && fiscalStyles.btnTextActive,
                  calendarMode === 'fiscal' && { color: theme.colors.textInverse },
                ]}
              >
                Fiscal
              </Text>
              
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                fiscalStyles.btn,
                { borderColor: theme.colors.primary },
                calendarMode === 'calendar' && fiscalStyles.btnActive,
                calendarMode === 'calendar' && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => { setShowFiscalModal(false); onCalendarModeChange?.('calendar'); }}
            >
              <MaterialCommunityIcons name="calendar-month" size={22} color={calendarMode === 'calendar' ? theme.colors.textInverse : theme.colors.primary} />
              <Text
                style={[
                  fiscalStyles.btnText,
                  { color: theme.colors.primary },
                  calendarMode === 'calendar' && fiscalStyles.btnTextActive,
                  calendarMode === 'calendar' && { color: theme.colors.textInverse },
                ]}
              >
                Calendar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ─── Calendar state ──────────────────────────────────────────────────────────
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  /** Parse "2026 March 9, Monday" → { year, month (0-based), day } */
  const selectedDay = useMemo(() => {
    const parts = displayDate.split(' ');
    const year = parseInt(parts[0]);
    const month = FULL_MONTHS.indexOf(parts[1]);
    const day = parseInt(parts[2]);
    return (!isNaN(year) && month >= 0 && !isNaN(day)) ? { year, month, day } : null;
  }, [displayDate]);

  // Build set of "YYYY-MM" strings that contain at least one available date
  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    for (const d of availableDates) s.add(d.substring(0, 7));
    return s;
  }, [availableDates]);

  const fmtYM = (y: number, m: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}`;

  const prevYM = calMonth === 0 ? fmtYM(calYear - 1, 11) : fmtYM(calYear, calMonth - 1);
  const nextYM = calMonth === 11 ? fmtYM(calYear + 1, 0)  : fmtYM(calYear, calMonth + 1);
  // Only allow navigation to a month that actually contains available dates
  const canGoPrev = availableMonths.size === 0 || availableMonths.has(prevYM);
  const canGoNext = availableMonths.size === 0 || availableMonths.has(nextYM);

  const openCalendar = () => {
    // Open at the selected date's month; if unavailable fall back to first available month
    if (selectedDay && availableMonths.has(fmtYM(selectedDay.year, selectedDay.month))) {
      setCalYear(selectedDay.year);
      setCalMonth(selectedDay.month);
    } else if (availableDates.length > 0) {
      const first = availableDates[availableDates.length - 1]; // latest date
      const [y, m] = first.split('-').map(Number);
      setCalYear(y);
      setCalMonth(m - 1);
    } else if (selectedDay) {
      setCalYear(selectedDay.year);
      setCalMonth(selectedDay.month);
    }
    setShowCalendar(true);
  };

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (!canGoNext) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const handleDayPress = (day: number) => {
    onDateSelect?.(new Date(calYear, calMonth, day));
    setShowCalendar(false);
  };

  const calendarRows = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [calYear, calMonth]);

  const calendarModal = (
    <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
      <Pressable style={[calStyles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setShowCalendar(false)}>
        <Pressable style={[calStyles.popup, { backgroundColor: theme.colors.surface }]}>
          <View style={calStyles.navRow}>
            <TouchableOpacity onPress={prevMonth} hitSlop={8} disabled={!canGoPrev}>
              <Text
                style={[
                  calStyles.navArrow,
                  { color: theme.colors.textPrimary },
                  !canGoPrev && calStyles.navArrowDisabled,
                  !canGoPrev && { color: theme.colors.textMuted },
                ]}
              >
                ‹
              </Text>
            </TouchableOpacity>
            <Text style={[calStyles.monthTitle, { color: theme.colors.textPrimary }]}>{FULL_MONTHS[calMonth]} {calYear}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={8} disabled={!canGoNext}>
              <Text
                style={[
                  calStyles.navArrow,
                  { color: theme.colors.textPrimary },
                  !canGoNext && calStyles.navArrowDisabled,
                  !canGoNext && { color: theme.colors.textMuted },
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>
          <View style={calStyles.weekRow}>
            {DAY_LABELS.map(d => <Text key={d} style={[calStyles.dayLabel, { color: theme.colors.textMuted }]}>{d}</Text>)}
          </View>
          {calendarRows.map((row, ri) => (
            <View key={ri} style={calStyles.weekRow}>
              {row.map((day, ci) => {
                const isSelected =
                  day !== null &&
                  selectedDay !== null &&
                  day === selectedDay.day &&
                  calYear === selectedDay.year &&
                  calMonth === selectedDay.month;
                const dateStr = day !== null
                  ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  : '';
                const isAvailable = day !== null && availableDates.length > 0 && availableDates.includes(dateStr);
                const isDisabled = day === null || !isAvailable;
                return (
                  <TouchableOpacity
                    key={ci}
                    style={[
                      calStyles.dayCell,
                      isSelected && calStyles.selectedDay,
                      isSelected && { backgroundColor: theme.colors.primary },
                      isDisabled && !isSelected && calStyles.disabledDay,
                    ]}
                    onPress={() => !isDisabled && handleDayPress(day!)}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        calStyles.dayText,
                        { color: theme.colors.textPrimary },
                        isSelected && calStyles.selectedDayText,
                        isSelected && { color: theme.colors.textInverse },
                        isDisabled && calStyles.disabledDayText,
                        isDisabled && { color: theme.colors.textMuted },
                      ]}
                    >
                      {day !== null ? String(day) : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (isLandscape) {
    return (
      <>
        {calendarModal}
        {fiscalModal}
        <View style={[styles.containerLandscape, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 12 }}>
            <Text style={[styles.titleLandscape, { color: theme.colors.textPrimary }]}>{titleOverride ?? `Flash Sales on ${displayDate}`}</Text>
            {showDatePicker && !titleOverride ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={openCalendar} hitSlop={8} style={{ marginLeft: 0 }}>
                  <Text style={{ fontSize: 14, color: theme.colors.textPrimary }}>▼</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.calModeBtn, { backgroundColor: theme.colors.surfaceMuted }]}
                  onPress={() => setShowFiscalModal(true)}
                >
                  <Text style={[styles.calModeBtnText, { color: theme.colors.textSecondary }]}>
                    {calendarMode === 'fiscal' ? 'Fiscal' : 'Calendar'}
                  </Text>
                  <View>
                    <AntDesign style={{ marginTop: 2, marginLeft: 4, position: 'relative' }} name="caret-down" size={12} color={theme.colors.icon} />
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* <TouchableOpacity onPress={() => setShowFiscalModal(true)} style={fiscalStyles.pill}>
              <Text style={fiscalStyles.pillText}>{calendarMode === 'fiscal' ? 'Fiscal' : 'Calendar'}</Text>
              <Text style={{ fontSize: 10, color: '#1e293b', marginLeft: 2 }}>▼</Text>
            </TouchableOpacity>
            <Text style={styles.generatedLandscape}>{generated}</Text> */}
          </View>
        </View>
        {titleOverride ? <View style={[styles.analyticsDivider, { borderBottomColor: theme.colors.divider }, isLandscape && styles.analyticsDividerLandscape]} /> : null}
      </>
    );
  }
  return (
    <>
      {calendarModal}
      {fiscalModal}
      <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0,marginTop: 8 }}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{titleOverride ?? `Flash Sales on ${displayDate}`}</Text>
          {showDatePicker && !titleOverride ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={openCalendar} hitSlop={8} style={{ marginTop: -2 }}>
                <AntDesign style={{ marginTop: 2, marginLeft: 4, position: 'relative' }} name="caret-down" size={13} color={theme.colors.icon} />
              </TouchableOpacity>
             
              <TouchableOpacity
                style={[styles.calModeBtn, { backgroundColor: theme.colors.surfaceMuted }]}
                onPress={() => setShowFiscalModal(true)}
              >
                <Text style={[styles.calModeBtnText, { color: theme.colors.textSecondary }]}>
                  {calendarMode === 'fiscal' ? 'Fiscal' : 'Calendar'}
                </Text>
                <View>
                  <AntDesign style={{ marginTop: 0, marginLeft: 4, position: 'relative' }} name="caret-down" size={13} color={theme.colors.icon} />
                </View>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={[styles.titleDivider, { backgroundColor: theme.colors.divider }]} />
        {/* <TouchableOpacity onPress={() => setShowFiscalModal(true)} style={{ flexDirection: 'row', alignItems: 'center', marginLeft:120 }}>
          <Text style={{ fontSize: 12, color: '#1e293b',fontFamily: "Montserrat_500Medium", }}>
            {calendarMode === 'fiscal' ? 'Fiscal' : 'Calendar'}
          </Text>
          <Text style={{ fontSize: 12, color: '#1e293b', marginLeft: 2 }}>▼</Text>
        </TouchableOpacity> */}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    paddingBottom: 6,
    
  },
  containerLandscape: {
    backgroundColor: '#ffffff',
    paddingBottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 0,
    paddingTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#9da1a7',
    marginHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accentBar: {
    height: 3,
    backgroundColor: '#ef4444',
  },
  generated: {
    fontSize: 11,
    fontFamily: 'Montserrat_700Bold',
    color: '#6b7280',
    textAlign: 'right',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  generatedLandscape: {
    fontSize: 11,
    fontFamily: 'Montserrat_700Bold',
    color: '#6b7280',
    textAlign: 'right',
    flexShrink: 1,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e293b',
    paddingLeft: 12,
    paddingRight: 4,
    textAlign: 'left',
    flexShrink: 1,
  },
  titleLandscape: {
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
    color: '#1e293b',
    textAlign: 'left',
    flexShrink: 1,
    marginRight: 4,
    marginLeft:-14
  },
  titleDivider: {
    height: 1,
    backgroundColor: '#d1d5db',
    marginTop: 4,
    marginHorizontal: 12,
    marginBottom: 6,
  },
  analyticsDivider: {
    borderBottomWidth: 0,
    borderBottomColor: '#d1d5db',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom:0
  },
  analyticsDividerLandscape: {
    borderBottomWidth: 0,
    borderBottomColor: '#d1d5db',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom:0
  },
  calModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    height: 20,
  },
  calModeBtnText: {
    color: "#374151",
    fontSize: 12,
    fontFamily: "Montserrat_500Medium",
    marginRight: 2,
  },
});

const fiscalStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    margin: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Montserrat_700Bold',
    color: '#0a1f44',
    marginBottom: 16,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#1C55CC',
    position: 'relative',
    overflow: 'hidden',
  },

  btnActive: {
    backgroundColor: '#1C55CC',
  },
  btnText: {
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#1C55CC',
  },
  btnTextActive: {
    color: '#ffffff',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
    color: '#1e293b',
  },
});

const calStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popup: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  navArrow: {
    fontSize: 26,
    color: '#0a1f44',
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  navArrowDisabled: {
    color: '#d1d5db',
  },
  monthTitle: {
    fontSize: 15,
    fontFamily: 'Montserrat_700Bold',
    color: '#0a1f44',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 2,
  },
  dayLabel: {
    width: 32,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Montserrat_700Bold',
    color: '#6b7280',
    paddingBottom: 4,
  },
  dayCell: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  selectedDay: {
    backgroundColor: '#0a1f44',
  },
  dayText: {
    fontSize: 13,
    fontFamily: 'Montserrat_500Medium',
    color: '#1e293b',
    textAlign: 'center',
  },
  selectedDayText: {
    color: '#ffffff',
    fontFamily: 'Montserrat_700Bold',
  },
  disabledDay: {
    opacity: 0.25,
  },
  disabledDayText: {
    color: '#9ca3af',
  },
  
});
