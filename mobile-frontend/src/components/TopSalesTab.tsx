import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, TextInput, useWindowDimensions, Alert, Platform } from 'react-native';
import { SalesPivotRow } from '../types/sales';
import { formatNumber, formatPercent, getBestMetric } from '../utils/dateUtils';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import EvilIcons from '@expo/vector-icons/EvilIcons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAppTheme } from '../theme/ThemeContext';
interface TopSalesTabProps {
  data: SalesPivotRow[];
  loading: boolean;
  boxDayCY: string;
  boxDayLY: string;
  isLandscape?: boolean;
  onBindExportActions?: (actions: { exportPDF: () => void; printPDF: () => void }) => void;
}

type SortMode = 'storesBySales' | 'storesByLift' | 'territoryBySales' | 'territoryByLift';

const CARD_COLORS = [
  '#1c5e20', // 1st - green
  '#2f7d32', // 2nd - dark blue
  '#43a047', // 3rd - olive
  '#26a59a', // 4th - teal
  '#1d89e4', // 5th - cyan
  '#1564c0', // 6th - purple
  '#3949ab',
  '#5d35b0',
  '#4a148c',
  '#7a1fa2'
];


const TROPHY_COLORS = ['#D7D7D6', '#EDC400', '#AFB8BB', '#B16A24'];
const TROPHY_LABELS = ['PL', 'GL', 'SL', 'BZ'];


function safeMax(arr: number[]): number {
  if (arr.length === 0) return 1;
  return Math.max(...arr, 1);
}

export default function TopSalesTab({ data, loading, boxDayCY, boxDayLY, onBindExportActions }: TopSalesTabProps) {
  const { theme, themeName } = useAppTheme();
  const [sortMode, setSortMode] = useState<SortMode>('storesBySales');
  const [search, setSearch] = useState('');
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const generatePDFHtml = (): string => {
    const storeRows = data.filter((r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL);
    const territoryRows = data.filter((r) => r.IS_TERRITORY_TOTAL);
    const m = getBestMetric(data);

    const getNormalizedLift = (row: SalesPivotRow): number => {
      const ly = Number(row[m.ly] ?? 0);
      const cy = Number(row[m.cy] ?? 0);
      if (ly === 0 || cy === 0) return 0;
      return Number(row[m.comp] ?? 0);
    };

    const positiveStores = storeRows.filter((r) => getNormalizedLift(r) >= 0);
    const positiveTerritories = territoryRows.filter((r) => getNormalizedLift(r) >= 0);

    let sortedData: SalesPivotRow[] = [];
    switch (sortMode) {
      case 'storesBySales':
        sortedData = [...positiveStores].sort((a, b) => (b[m.cy] ?? 0) - (a[m.cy] ?? 0));
        break;
      case 'storesByLift':
        sortedData = [...positiveStores].sort((a, b) => getNormalizedLift(b) - getNormalizedLift(a));
        break;
      case 'territoryBySales':
        sortedData = [...positiveTerritories].sort((a, b) => (b[m.cy] ?? 0) - (a[m.cy] ?? 0));
        break;
      case 'territoryByLift':
        sortedData = [...positiveTerritories].sort((a, b) => getNormalizedLift(b) - getNormalizedLift(a));
        break;
    }

    let rankedData = sortedData.map((row, index) => ({
      row,
      rank: index + 1,
      color: CARD_COLORS[index % CARD_COLORS.length],
    })).slice(0, 10);

    const terms = search.toLowerCase().split('++').map((s) => s.trim()).filter(Boolean);
    if (terms.length > 0) {
      rankedData = rankedData.filter(({ row }) => {
        const searchText = `${row.STORE_ID ?? ''} ${row.STORE_NAME ?? ''} ${row.REGION_ID ?? ''} ${row.TERRITORY ?? ''}`.toLowerCase();
        return terms.some((term) => searchText.includes(term));
      });
    }

    const TROPHY_COLORS_MAP: Record<number, string> = { 0: '#D7D7D6', 1: '#EDC400', 2: '#AFB8BB', 3: '#B16A24' };
    const TROPHY_LABELS_MAP: Record<number, string> = { 0: 'PL', 1: 'GL', 2: 'SL', 3: 'BZ' };

    let htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .header { text-align: center; margin-bottom: 30px; }
            .title { font-size: 28px; font-weight: bold; color: #333; }
            .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
            .cards-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
            .card { 
              background: white; 
              border-radius: 12px; 
              padding: 20px; 
              page-break-inside: avoid;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .rank { font-size: 48px; font-weight: bold; color: white; }
            .trophy-badge { 
              width: 50px; 
              height: 50px; 
              border-radius: 50%; 
              display: flex; 
              flex-direction: column;
              justify-content: center; 
              align-items: center; 
              color: #1e293b;
            }
            .trophy-label { font-size: 12px; font-weight: bold; margin-top: 3px; }
            .store-name { font-size: 24px; font-weight: bold; color: white; margin-bottom: 5px; }
            .territory { font-size: 13px; color: rgba(255,255,255,0.8); margin-bottom: 12px; }
            .bars-container { margin-bottom: 15px; }
            .bar-row { display: flex; align-items: center; margin-bottom: 8px; }
            .bar-label { font-size: 12px; font-weight: bold; color: white; width: 80px; }
            .bar-bg { flex: 1; height: 10px; background: rgba(255,255,255,0.15); border-radius: 5px; overflow: hidden; margin-left: 10px; }
            .bar-fill { height: 10px; border-radius: 5px; }
            .stats { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .stats-value { font-size: 13px; color: white; flex: 1; border-bottom: 1px solid white; padding-right: 10px; }
            .lift-badge { padding: 6px 12px; border-radius: 12px; }
            .lift-text { font-size: 12px; font-weight: bold; }
            .card-bottom { display: flex; justify-content: space-between; align-items: baseline; }
            .sales-label { font-size: 20px; font-weight: 400; color: white; }
            .sales-value { font-size: 24px; font-weight: bold; color: white; }
            .generated-info { text-align: center; font-size: 11px; color: #999; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Top 10 Locations by ${sortMode.includes('Lift') ? 'Sales Lift %' : 'Sales $'}</div>
            <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
          </div>
          <div class="cards-container">
    `;

    rankedData.forEach(({ row, rank, color }) => {
      const ly = row[m.ly] ?? 0;
      const cy = row[m.cy] ?? 0;
      const sTotal = ly + cy || 1;
      const lyPct = (ly / sTotal) * 100;
      const cyPct = (cy / sTotal) * 100;
      const lift = getNormalizedLift(row);
      const liftColor = lift >= 0 ? '#fdfdfd' : '#ffffff';
      const liftTextColor = lift >= 0 ? '#077531' : '#e71111';
      const trophyColor = rank <= 4 ? TROPHY_COLORS_MAP[rank - 1] : '#71717a';
      const trophy = rank <= 4 ? TROPHY_LABELS_MAP[rank - 1] : '';

      htmlContent += `
        <div class="card" style="background-color: ${color};">
          <div class="card-header">
            <div class="rank">${rank}</div>
            ${rank <= 4 ? `<div class="trophy-badge" style="background-color: ${trophyColor};">
              <div class="trophy-label">${trophy}</div>
            </div>` : ''}
          </div>
          <div class="store-name">${sortMode.includes('territory') ? `Location: ${row.REGION_ID ? row.REGION_ID + ' ' : ''}${row.TERRITORY}` : `${row.STORE_ID} ${row.STORE_NAME}`}</div>
          ${!sortMode.includes('territory') && row.TERRITORY ? `<div class="territory">Location: <strong>${row.REGION_ID ? row.REGION_ID + ' ' : ''}${row.TERRITORY}</strong></div>` : ''}
          
          <div class="bars-container">
            <div class="bar-row">
              <div class="bar-label">${boxDayLY}</div>
              <div class="bar-bg">
                <div class="bar-fill" style="width: ${Math.min(lyPct, 100)}%; background-color: rgba(250, 250, 250, 0.6);"></div>
              </div>
            </div>
            <div class="bar-row">
              <div class="bar-label">${boxDayCY}</div>
              <div class="bar-bg">
                <div class="bar-fill" style="width: ${Math.min(cyPct, 100)}%; background-color: rgba(255,255,255,0.8);"></div>
              </div>
            </div>
          </div>

          <div class="stats">
            <div class="stats-value">$${formatNumber(row[m.ly])} / $${formatNumber(row[m.cy])}</div>
            <div class="lift-badge" style="background-color: ${liftColor};">
              <div class="lift-text" style="color: ${!sortMode.includes('Lift') ? liftTextColor : '#000000'};">
                ${!sortMode.includes("Lift") && lift >= 0 ? '+' : ''}${!sortMode.includes("Lift") ? formatPercent(lift) : 'Sales $' + formatNumber(row[m.cy])}
              </div>
            </div>
          </div>

          <div class="card-bottom">
            <div class="sales-label">${sortMode.includes("Lift") ? "Lift" : "Sales"}</div>
            <div class="sales-value">${sortMode.includes("Lift") ? formatPercent(lift) : '$' + formatNumber(row[m.cy])}</div>
          </div>
        </div>
      `;
    });

    htmlContent += `
          </div>
          <div class="generated-info">Generated on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    return htmlContent;
  };

  const handleExportPDF = async () => {
    try {
      const htmlContent = generatePDFHtml();
      const { uri: tempUri } = await Print.printToFileAsync({ html: htmlContent });

      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(tempUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            'TopSales',
            'application/pdf'
          );
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert('Success', 'PDF file saved successfully!');
        }
      } else {
        await Sharing.shareAsync(tempUri, { mimeType: 'application/pdf' });
      }
    } catch (error) {
      console.error('Export PDF error:', error);
      Alert.alert('Error', `Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePrintPDF = async () => {
    try {
      const htmlContent = generatePDFHtml();
      await Print.printAsync({ html: htmlContent });
    } catch (error) {
      console.error('Print error:', error);
      Alert.alert('Error', `Failed to print PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    onBindExportActions?.({
      exportPDF: handleExportPDF,
      printPDF: handlePrintPDF,
    });
  }, [onBindExportActions, sortMode, search]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading...</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>No data available</Text>
      </View>
    );
  }

  const storeRows = data.filter((r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL);
  const territoryRows = data.filter((r) => r.IS_TERRITORY_TOTAL);
  const m = getBestMetric(data);

  // Match web app: treat lift as 0 when either LY or CY is 0.
  const getNormalizedLift = (row: SalesPivotRow): number => {
    const ly = Number(row[m.ly] ?? 0);
    const cy = Number(row[m.cy] ?? 0);
    if (ly === 0 || cy === 0) return 0;
    return Number(row[m.comp] ?? 0);
  };

  // Match web app: only show positive-growth entries in Top Sales
  const positiveStores = storeRows.filter((r) => getNormalizedLift(r) >= 0);
  const positiveTerritories = territoryRows.filter((r) => getNormalizedLift(r) >= 0);

  let sortedData: SalesPivotRow[] = [];
  switch (sortMode) {
    case 'storesBySales':
      sortedData = [...positiveStores].sort((a, b) => (b[m.cy] ?? 0) - (a[m.cy] ?? 0));
      break;
    case 'storesByLift':
      sortedData = [...positiveStores].sort((a, b) => getNormalizedLift(b) - getNormalizedLift(a));
      break;
    case 'territoryBySales':
      sortedData = [...positiveTerritories].sort((a, b) => (b[m.cy] ?? 0) - (a[m.cy] ?? 0));
      break;
    case 'territoryByLift':
      sortedData = [...positiveTerritories].sort((a, b) => getNormalizedLift(b) - getNormalizedLift(a));
      break;
  }

  let rankedData = sortedData.map((row, index) => ({
    row,
    rank: index + 1,
    color: CARD_COLORS[index % CARD_COLORS.length],
  })).slice(0, 10);

  const terms = search.toLowerCase().split('++').map((s) => s.trim()).filter(Boolean);
  if (terms.length > 0) {
    rankedData = rankedData.filter(({ row }) => {
      const searchText = `${row.STORE_ID ?? ''} ${row.STORE_NAME ?? ''} ${row.REGION_ID ?? ''} ${row.TERRITORY ?? ''}`.toLowerCase();
      return terms.some((term) => searchText.includes(term));
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.searchRow, isLandscape && styles.searchRowLandscape]}>
         
        <View style={[styles.searchWrap, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.divider }] }>
          <EvilIcons name="search" size={20} color={theme.colors.icon} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.textPrimary }]}
            value={search}
            onChangeText={setSearch}
           
            placeholderTextColor={theme.colors.textMuted}
          />
         <TouchableOpacity onPress={() => setSearch('')}>
            {themeName === 'default' ? (
              <Image
                source={require('../../assets/images/broom.png')}
                style={{ width: 25, height: 25 }}
              />
            ) : (
              <MaterialCommunityIcons name="broom" size={18} color={theme.colors.icon} />
            )}
          </TouchableOpacity>
        </View>
      </View>
       
      {/* Sort Mode Selector */}
      <View style={[styles.sortContainer, isLandscape && styles.sortContainerLandscape]}>
        {isLandscape ? (
          <View style={styles.sortRowSingle}>
             <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerTopRight]}>
              <View style={styles.cornerTopRightHorizontalShort} />
              <View style={styles.cornerTopRightVerticalLong} />
            </View>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerTopLeft]}>
              <View style={styles.cornerTopLeftHorizontalLong} />
              <View style={styles.cornerTopLeftVerticalShort} />
            </View>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerBottomLeft]}>
              <View style={styles.cornerBottomLeftHorizontalShort} />
              <View style={styles.cornerBottomLeftVerticalLong} />
            </View>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerBottomRight]}>
              <View style={styles.cornerBottomRightHorizontalLong} />
              <View style={styles.cornerBottomRightVerticalShort} />
            </View>
            <TouchableOpacity style={[styles.sortOption, isLandscape && styles.sortOptionLandscape]} onPress={() => setSortMode('storesBySales')}>
              <Image
                source={sortMode === 'storesBySales'
                  ? require('../../assets/images/TopsalesIcons/TopSales_sel.png')
                  : require('../../assets/images/TopsalesIcons/TopSales.png')}
                style={ isLandscape ? styles.radioImageLandscape : styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'storesBySales' && styles.sortTextActive, sortMode === 'storesBySales' && { color: theme.colors.textPrimary }]}>Top 10 by $</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortOption, isLandscape && styles.sortOptionLandscape]} onPress={() => setSortMode('storesByLift')}>
              <Image
                source={sortMode === 'storesByLift'
                  ? require('../../assets/images/TopsalesIcons/TopSalesLift_sel.png')
                  : require('../../assets/images/TopsalesIcons/TopSalesLift.png')}
                style={isLandscape ? styles.radioImageLandscape : styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'storesByLift' && styles.sortTextActive, sortMode === 'storesByLift' && { color: theme.colors.textPrimary }]}>Top 10 by %</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortOption, isLandscape && styles.sortOptionLandscape]} onPress={() => setSortMode('territoryBySales')}>
              <Image
                source={sortMode === 'territoryBySales'
                  ? require('../../assets/images/TopsalesIcons/TerSales_sel.png.png')
                  : require('../../assets/images/TopsalesIcons/TerSales.png')}
                style={isLandscape ? styles.radioImageLandscape : styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'territoryBySales' && styles.sortTextActive, sortMode === 'territoryBySales' && { color: theme.colors.textPrimary }]}>Top by $</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortOption, isLandscape && styles.sortOptionLandscape]} onPress={() => setSortMode('territoryByLift')}>
               
              <Image
                source={sortMode === 'territoryByLift'
                  ? require('../../assets/images/TopsalesIcons/TerSalesLift_sel.png')
                  : require('../../assets/images/TopsalesIcons/TerSalesLift.png')}
                style={isLandscape ? styles.radioImageLandscape : styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'territoryByLift' && styles.sortTextActive, sortMode === 'territoryByLift' && { color: theme.colors.textPrimary }]}>Top by %</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.sortRowPortrait] }>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerTopRight]}>
              <View style={styles.cornerTopRightHorizontalShort} />
              <View style={styles.cornerTopRightVerticalLong} />
            </View>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerTopLeft]}>
              <View style={styles.cornerTopLeftHorizontalLong} />
              <View style={styles.cornerTopLeftVerticalShort} />
            </View>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerBottomLeft]}>
              <View style={styles.cornerBottomLeftHorizontalShort} />
              <View style={styles.cornerBottomLeftVerticalLong} />
            </View>
            <View pointerEvents="none" style={[styles.subTabCardCorner, styles.subTabCardCornerBottomRight]}>
              <View style={styles.cornerBottomRightHorizontalLong} />
              <View style={styles.cornerBottomRightVerticalShort} />
            </View>
            <TouchableOpacity style={styles.sortOption} onPress={() => setSortMode('storesBySales')}>
              <Image
                source={sortMode === 'storesBySales'
                  ? require('../../assets/images/TopsalesIcons/TopSales_sel.png')
                  : require('../../assets/images/TopsalesIcons/TopSales.png')}
                style={styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'storesBySales' && styles.sortTextActive, sortMode === 'storesBySales' && { color: theme.colors.textPrimary }]}>Top 10 by $</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortOption} onPress={() => setSortMode('storesByLift')}>
              <Image
                source={sortMode === 'storesByLift'
                  ? require('../../assets/images/TopsalesIcons/TopSalesLift_sel.png')
                  : require('../../assets/images/TopsalesIcons/TopSalesLift.png')}
                style={styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'storesByLift' && styles.sortTextActive, sortMode === 'storesByLift' && { color: theme.colors.textPrimary }]}>Top 10 by %</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortOption} onPress={() => setSortMode('territoryBySales')}>
              <Image
                source={sortMode === 'territoryBySales'
                  ? require('../../assets/images/TopsalesIcons/TerSales_sel.png.png')
                  : require('../../assets/images/TopsalesIcons/TerSales.png')}
                style={styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'territoryBySales' && styles.sortTextActive, sortMode === 'territoryBySales' && { color: theme.colors.textPrimary }]}>Lift by $</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortOption} onPress={() => setSortMode('territoryByLift')}>
              <Image
                source={sortMode === 'territoryByLift'
                  ? require('../../assets/images/TopsalesIcons/TerSalesLift_sel.png')
                  : require('../../assets/images/TopsalesIcons/TerSalesLift.png')}
                style={styles.radioImage}
              />
              <Text style={[styles.sortText, { color: theme.colors.textMuted }, sortMode === 'territoryByLift' && styles.sortTextActive, sortMode === 'territoryByLift' && { color: theme.colors.textPrimary }]}>Lift by %</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Cards */}
      <ScrollView contentContainerStyle={[styles.cardsContainer, isLandscape && styles.cardsContainerLandscape]}>
        {rankedData.map(({ row, rank, color }) => {
          const bgColor = color;
          const ly = row[m.ly] ?? 0;
          const cy = row[m.cy] ?? 0;
          const sTotal = ly + cy || 1;
          const lyPct = (ly / sTotal) * 100;
          const cyPct = (cy / sTotal) * 100;
          const lift = getNormalizedLift(row);
          const liftColor = lift >= 0 ? '#fdfdfd' : '#ffffff';
          const liftTextColor = lift >= 0 ? '#077531' : '#e71111';

          return (
            <View key={`${row.STORE_ID || row.TERRITORY}-${rank}`} style={[styles.card, isLandscape && styles.cardLandscape, { backgroundColor: bgColor }]}>
              {/* Rank badge */}
                  <View style={[styles.cardHeader, isLandscape && styles.cardHeaderLandscape]}>
                    <Text style={[styles.rank, isLandscape && styles.rankLandscape]}>{rank}</Text>

                {rank <= 4 ? (
                  <View style={[styles.trophyBadge, isLandscape && styles.trophyBadgeLandscape, { backgroundColor: TROPHY_COLORS[rank - 1] || '#71717a' }]}>
                    <FontAwesome5 name="trophy" size={isLandscape ? 12 : 16} color="black" />
                    <Text style={[styles.trophyLabel, isLandscape && styles.trophyLabelLandscape]}>{TROPHY_LABELS[rank - 1]}</Text>
                  </View>
                ) : null}

              </View>

              {/* Store Info */}
              <Text style={[styles.cardStoreName, isLandscape && styles.cardStoreNameLandscape]}>
                {sortMode.includes('territory') ? <Text >Location: <Text>{row.REGION_ID ? `${row.REGION_ID} ` : ''}{row.TERRITORY}</Text></Text>: `${row.STORE_ID} ${row.STORE_NAME}`}
                
                
              </Text>
              {!sortMode.includes('territory') && row.TERRITORY ? (
                <Text style={[styles.cardTerritory, isLandscape && styles.cardTerritoryLandscape]}>Location: <Text style={styles.territoryValue}>{row.REGION_ID ? `${row.REGION_ID} ` : ''}{row.TERRITORY}</Text></Text>
              ) : null}

              {/* Progress Bars */}
              <View style={[styles.barsContainer, isLandscape && styles.barsContainerLandscape]}>
                <View style={[styles.barRow, isLandscape && styles.barRowLandscape]}>
                  <Text style={[styles.barLabel, isLandscape && styles.barLabelLandscape]}>{boxDayLY}</Text>
                    <View style={[styles.barBg, isLandscape && styles.barBgLandscape]}>
                      <View style={[styles.barFill, isLandscape && styles.barFillLandscape, { width: `${Math.min(lyPct, 100)}%`, backgroundColor: 'rgba(250, 250, 250, 0.6)' }]} />
                    </View>
                </View>
                <View style={[styles.barRow, isLandscape && styles.barRowLandscape]}>
                  <Text style={[styles.barLabel, isLandscape && styles.barLabelLandscape]}>{boxDayCY}</Text>
                  <View style={[styles.barBg, isLandscape && styles.barBgLandscape]}>
                    <View style={[styles.barFill, isLandscape && styles.barFillLandscape, { width: `${Math.min(cyPct, 100)}%`, backgroundColor: 'rgba(255,255,255,0.8)' }]} />
                  </View>
                </View>
              </View>

              {/* Stats */}
              <View style={[styles.cardStats, isLandscape && styles.cardStatsLandscape]}>
                <Text style={[styles.statsValue, isLandscape && styles.statsValueLandscape]}>
                  ${formatNumber(row[m.ly])} <Text style={styles.thousands1}></Text>/ ${formatNumber(row[m.cy])} <Text style={styles.thousands1}></Text>
                </Text>
                <View style={[styles.liftBadge, { backgroundColor: liftColor }]}>
                  <Text style={[styles.liftText, isLandscape && styles.liftTextLandscape, { color: !sortMode.includes('Lift') ? liftTextColor : '#000000' }]}>
                    {!sortMode.includes("Lift") && lift >= 0 ? '+' : ''}
                    {!sortMode.includes("Lift")? `${formatPercent(lift) }`:`Sales $${formatNumber(row[m.cy])} `}
                     {!sortMode.includes("Lift")? ``:<Text style={styles.thousands2}></Text>}
                     
                  </Text>
                </View>
              </View>

              {/* Bottom Sales */}
              <View style={[styles.cardBottom, isLandscape && styles.cardBottomLandscape]}>
                <Text style={[styles.salesLabel, isLandscape && styles.salesLabelLandscape]}>{sortMode.includes("Lift")? "Lift":"Sales"}</Text>
                <Text style={[styles.salesValue, isLandscape && styles.salesValueLandscape]}>{sortMode.includes("Lift")? `${formatPercent(lift) }`:`$${formatNumber(row[m.cy])}`} <Text style={[styles.thousands, isLandscape && styles.thousandsLandscape]}>{sortMode.includes("Lift")? "":""}</Text></Text>
              </View>
            </View>
          );
        })}
        {/* Placeholder to centre the last card when the final row has 2 items in landscape */}
        {isLandscape && rankedData.length % 3 === 2 && (
          <View style={[styles.cardLandscape, { opacity: 0, minHeight: 0, padding: 0, marginBottom: 0 }]} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sortOptionLandscape: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchRowLandscape: {
    position: 'absolute',
    left: 350,
    right: 0,
    top: -33,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    marginRight: 0,
    marginLeft: 0,
    paddingHorizontal: 0,
    width: '40%',
  },
  subTabCardCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    zIndex: 2,
  },
  subTabCardCornerTopRight: {
    top: 1,
    right: 9,
  },
  subTabCardCornerTopLeft: {
    top: 1,
    left: 1,
  },
  subTabCardCornerBottomLeft: {
    bottom: 1,
    left: 1,
  },
  subTabCardCornerBottomRight: {
    bottom: 1,
    right: 9,
  },
  cornerTopRightHorizontalShort: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 25,
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopColor: '#215dd4',
    borderRightColor: '#215dd4',
    borderTopRightRadius: 10,
  },
  cornerTopRightVerticalLong: {
    position: 'absolute',
    top: 17,
    right: 0,
    width: 0,
    height: 22,
    backgroundColor: '#215dd4',
    borderRadius: 20,
  },
  cornerTopLeftHorizontalLong: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 150,
    height: 15,
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: '#215dd4',
    borderLeftColor: '#215dd4',
    borderTopLeftRadius: 9,
  },
  cornerTopLeftVerticalShort: {
    position: 'absolute',
    top: 8,
    left: 0,
    width: 0,
    height: 12,
    backgroundColor: '#215dd4',
    borderRadius: 20,
  },
  cornerBottomLeftHorizontalShort: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 12,
    height: 25,
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomColor: '#215dd4',
    borderLeftColor: '#215dd4',
    borderBottomLeftRadius: 9,
  },
  cornerBottomLeftVerticalLong: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    width: 0,
    height: 12,
    backgroundColor: '#215dd4',
    borderRadius: 20,
  },
  cornerBottomRightHorizontalLong: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 150,
    height: 15,
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomColor: '#215dd4',
    borderRightColor: '#215dd4',
    borderBottomRightRadius: 9,
  },
  cornerBottomRightVerticalShort: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 0,
    height: 12,
    backgroundColor: '#215dd4',
    borderRadius: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    marginBottom: 0,
    marginRight: '0%',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#a8d5ff',
    paddingHorizontal: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    color: '#000000',
    paddingVertical: 7,
  },
  sortContainer: {
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingTop: 12,
    marginLeft: 15,
  },
  sortContainerLandscape: {
    paddingVertical: 6,
    marginLeft: 0,
    paddingHorizontal: 12,
  },
  sortRow: {
    flexDirection: 'row',
    display: 'flex',    justifyContent: 'flex-start',
    marginBottom: 8,
    width: '100%',
  },
  sortRowSingle: {
    flexDirection: 'row',
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: 0,
    width: '50%',
  },
  sortRowPortrait: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 13,
    paddingRight: 12,
    width: '100%',
  },
  sortOption: {
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  cardsContainerLandscape: {
    marginHorizontal: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cardLandscape: {
    width: '30%',
    padding: 6,
    minHeight: 100,
    marginBottom: 20,
  },
  radioImage: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
    marginBottom: 3,
    backgroundColor: '#e1f1ff',
    borderRadius: 3,
  },
  radioImageLandscape: {
    width: 28,
    height: 34,
    resizeMode: 'contain',
    marginBottom: 3,
    backgroundColor:'#e1f1ff',
    borderRadius: 3,
  },
  sortText: {
    fontSize: 9,
    color: '#64748b',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  sortTextActive: {
    color: '#1e293b',
    fontWeight: '600',
    fontSize: 9,
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    justifyContent: 'space-between',
  },
  card: {
    width: '100%',
    borderRadius: 12,
    padding: 14,
    minHeight: 200,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  rank: {
    fontSize: 40,
    fontWeight: '600',
    color: 'rgb(255, 255, 255)',
  },
  trophyBadge: {
    width: 40,
    height: 40,
    borderRadius: 99,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
  },
  trophyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 0,
    letterSpacing: 0.5,
  },
  cardStoreName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  cardTerritory: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  territoryValue: {
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  barsContainer: {
    marginBottom: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  barLabel: {
    fontSize:12,
    fontWeight: '700',
    color: 'rgb(255, 255, 255)',
    width: 88,
  },
  barBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 12,
    color: 'rgb(255, 255, 255)',
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgb(255, 255, 255)',
    marginRight: 8,
  },
  liftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liftText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  salesLabel: {
    fontSize: 22,
    fontWeight: '400',
    color: 'rgb(255, 255, 255)',
  },
  salesValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  thousands: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgb(255, 255, 255)',
  },
  thousands1: {
    fontSize: 10,
    fontWeight: '400',
    color: 'rgb(255, 255, 255)',
  },
  thousands2: {
    fontSize: 11,
    fontWeight: '600',
    paddingLeft: 2,
    color: 'rgb(0, 0, 0)',
  },
  /* Landscape-only reductions for store cards */
  cardHeaderLandscape: {
    marginBottom: 2,
    alignItems: 'flex-start',
  },
  rankLandscape: {
    fontSize: 20,
  },
  trophyLabelLandscape: {
    fontSize: 4,
  },
  cardStoreNameLandscape: {
    fontSize: 12,
    marginBottom: 1,
  },
  cardTerritoryLandscape: {
    fontSize: 9,
    marginBottom: 0,
  },
  barsContainerLandscape: {
    marginBottom: 4,
  },
  barRowLandscape: {
    marginBottom: 1,
  },
  barLabelLandscape: {
    fontSize: 8,
    width: 60,
  },
  cardStatsLandscape: {
    marginBottom: 4,
  },
  statsValueLandscape: {
    fontSize: 6,
    marginRight: 2,
  },
  liftTextLandscape: {
    fontSize: 9,
  },
  cardBottomLandscape: {
    paddingTop: 0,
    marginTop: 1,
  },
  salesLabelLandscape: {
    fontSize: 13,
  },
  salesValueLandscape: {
    fontSize: 13,
  },
  thousandsLandscape: {
    fontSize: 9,
  },
  thousands1Landscape: {
    fontSize: 6,
  },
  thousands2Landscape: {
    fontSize: 6,
  },
  trophyBadgeLandscape: {
    width: 25,
    height: 25,
    borderRadius: 99,
    paddingVertical: 1,
  },
  barBgLandscape: {
    height: 6,
  },
  barFillLandscape: {
    height: 6,
  },
});
