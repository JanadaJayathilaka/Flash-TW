import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SalesPivotRow } from '../types/sales';
import { formatNumber, formatPercent, getBestMetric } from '../utils/dateUtils';

interface TrendsTabProps {
  data: SalesPivotRow[];
  loading: boolean;
}

export default function TrendsTab({ data, loading }: TrendsTabProps) {
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>No data available</Text>
      </View>
    );
  }

  const storeRows = data.filter((r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL);
  const grandTotal = data.find((r) => r.IS_GRAND_TOTAL);
  const m = getBestMetric(data);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary Card */}
      {grandTotal && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Overall Performance</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Day Comp</Text>
              <Text style={[styles.summaryValue, { color: (grandTotal.DAY_SALES_COMP ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                {formatPercent(grandTotal.DAY_SALES_COMP)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>WTD Comp</Text>
              <Text style={[styles.summaryValue, { color: (grandTotal.WTD_SALES_COMP ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                {formatPercent(grandTotal.WTD_SALES_COMP)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>YTD Comp</Text>
              <Text style={[styles.summaryValue, { color: (grandTotal.YTD_SALES_COMP ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                {formatPercent(grandTotal.YTD_SALES_COMP)}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Today CY</Text>
              <Text style={styles.summaryAmount}>{formatNumber(grandTotal.DAY_SALES_CY)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>WTD CY</Text>
              <Text style={styles.summaryAmount}>{formatNumber(grandTotal.WTD_SALES_CY)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>YTD CY</Text>
              <Text style={styles.summaryAmount}>{formatNumber(grandTotal.YTD_SALES_CY)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Store Trend Bars */}
      <Text style={styles.sectionTitle}>Store-wise {m.label} Sales Comparison</Text>
      {storeRows.map((row, idx) => {
        const cyVal = row[m.cy] ?? 0;
        const lyVal = row[m.ly] ?? 0;
        const maxVal = Math.max(cyVal, lyVal, 1);
        const cyWidth = (cyVal / maxVal) * 100;
        const lyWidth = (lyVal / maxVal) * 100;
        const isPositive = (row[m.comp] ?? 0) >= 0;

        return (
          <View key={`${row.STORE_ID}-${idx}`} style={styles.trendCard}>
            <View style={styles.trendHeader}>
              <Text style={styles.trendStoreName}>{row.STORE_ID} {row.STORE_NAME}</Text>
              <View style={[styles.compBadge, { backgroundColor: isPositive ? '#dcfce7' : '#fee2e2' }]}>
                <Text style={[styles.compBadgeText, { color: isPositive ? '#166534' : '#991b1b' }]}>
                  {formatPercent(row[m.comp])}
                </Text>
              </View>
            </View>
            <View style={styles.trendBars}>
              <View style={styles.trendBarRow}>
                <Text style={styles.trendBarLabel}>LY</Text>
                <View style={styles.trendBarBg}>
                  <View style={[styles.trendBarFill, { width: `${lyWidth}%`, backgroundColor: '#93c5fd' }]} />
                </View>
                <Text style={styles.trendBarValue}>{formatNumber(row[m.ly])}</Text>
              </View>
              <View style={styles.trendBarRow}>
                <Text style={styles.trendBarLabel}>CY</Text>
                <View style={styles.trendBarBg}>
                  <View style={[styles.trendBarFill, { width: `${cyWidth}%`, backgroundColor: isPositive ? '#4ade80' : '#f87171' }]} />
                </View>
                <Text style={styles.trendBarValue}>{formatNumber(row[m.cy])}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 12,
    paddingBottom: 40,
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
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  summaryAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  trendCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trendStoreName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  compBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  compBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  trendBars: {},
  trendBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  trendBarLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    width: 20,
    marginRight: 6,
  },
  trendBarBg: {
    flex: 1,
    height: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  trendBarFill: {
    height: 16,
    borderRadius: 4,
  },
  trendBarValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    width: 65,
    textAlign: 'right',
    marginLeft: 6,
  },
});
