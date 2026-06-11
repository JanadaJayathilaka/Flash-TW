import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SalesPivotRow } from '../types/sales';
import { formatNumber, formatPercent, getBestMetric } from '../utils/dateUtils';

interface SalesByOriginTabProps {
  data: SalesPivotRow[];
  loading: boolean;
}

const TERRITORY_COLORS: { [key: string]: string } = {
  'New South Wales': '#2563eb',
  'Victoria': '#7c3aed',
  'Queensland': '#0891b2',
  'South Australia': '#ca8a04',
  'Western Australia': '#dc2626',
  'Tasmania': '#059669',
  'Northern Territory': '#ea580c',
  'ACT': '#4f46e5',
};

export default function SalesByOriginTab({ data, loading }: SalesByOriginTabProps) {
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

  const territoryRows = data.filter((r) => r.IS_TERRITORY_TOTAL);
  const grandTotal = data.find((r) => r.IS_GRAND_TOTAL);
  const m = getBestMetric(data);
  const totalSales = grandTotal?.[m.cy] || 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Sales Distribution by Territory ({m.label})</Text>
        {grandTotal && (
          <Text style={styles.totalSales}>
            Total: ${formatNumber(grandTotal[m.cy])}
          </Text>
        )}

        {/* Stacked bar */}
        <View style={styles.stackedBar}>
          {territoryRows.map((t) => {
            const pct = ((t[m.cy] ?? 0) / totalSales) * 100;
            const color = TERRITORY_COLORS[t.TERRITORY] || '#64748b';
            return (
              <View
                key={t.TERRITORY}
                style={[styles.stackedSegment, { width: `${pct}%`, backgroundColor: color }]}
              />
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legendContainer}>
          {territoryRows.map((t) => {
            const pct = (((t[m.cy] ?? 0) / totalSales) * 100).toFixed(1);
            const color = TERRITORY_COLORS[t.TERRITORY] || '#64748b';
            return (
              <View key={t.TERRITORY} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{t.TERRITORY} ({pct}%)</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Territory Cards */}
      {territoryRows.map((t) => {
        const color = TERRITORY_COLORS[t.TERRITORY] || '#64748b';
        const storesInTerritory = data.filter(
          (r) => r.TERRITORY === t.TERRITORY && !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL
        );

        return (
          <View key={t.TERRITORY} style={styles.territoryCard}>
            <View style={[styles.territoryHeader, { backgroundColor: color }]}>
              <Text style={styles.territoryName}>{t.TERRITORY}</Text>
              <Text style={styles.territoryTotal}>${formatNumber(t[m.cy])}</Text>
            </View>

            <View style={styles.territoryMetrics}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Day Comp</Text>
                <Text style={[styles.metricValue, { color: (t.DAY_SALES_COMP ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {formatPercent(t.DAY_SALES_COMP)}
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>WTD Comp</Text>
                <Text style={[styles.metricValue, { color: (t.WTD_SALES_COMP ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {formatPercent(t.WTD_SALES_COMP)}
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>YTD Comp</Text>
                <Text style={[styles.metricValue, { color: (t.YTD_SALES_COMP ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {formatPercent(t.YTD_SALES_COMP)}
                </Text>
              </View>
            </View>

            {storesInTerritory.map((store) => (
              <View key={store.STORE_ID} style={styles.storeRow}>
                <View style={styles.storeInfo}>
                  <Text style={styles.storeId}>{store.STORE_ID}</Text>
                  <Text style={styles.storeName}>{store.STORE_NAME}</Text>
                </View>
                <View style={styles.storeStats}>
                  <Text style={styles.storeSales}>${formatNumber(store[m.cy])}</Text>
                  <Text style={[styles.storeComp, { color: (store[m.comp] ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                    {formatPercent(store[m.comp])}
                  </Text>
                </View>
              </View>
            ))}
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
    marginBottom: 4,
  },
  totalSales: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  stackedSegment: {
    height: 20,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#475569',
  },
  territoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  territoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  territoryName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  territoryTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  territoryMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: '#94a3b8',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginRight: 6,
  },
  storeName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  storeStats: {
    alignItems: 'flex-end',
  },
  storeSales: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  storeComp: {
    fontSize: 11,
    fontWeight: '600',
  },
});
