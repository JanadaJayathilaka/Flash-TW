import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Image,
  Modal,

  Pressable,
  Alert,
  Platform,

} from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import Entypo from '@expo/vector-icons/Entypo';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fetchSalesChartByDateRange } from '../services/salesApi';
import { SalesChartResponse } from '../types/sales';
import type { DateParams } from '../utils/dateUtils';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppTheme } from '../theme/ThemeContext';

// ── Analytics chart controls ──
type ViewMode = 'D' | 'W' | 'M' | 'Y';
type SubTab = 'trends' | 'extrapolate' | 'lifts';

// SMA window size — hardcoded to 7, same as web app
const SMA_PERIOD = 7;

// Chart layout constants
const CHART_PADDING_RIGHT = 12;
const CHART_PADDING_TOP = 12;
const CHART_PADDING_BOTTOM = 42;

// ─────────────────────────────────────────────────────────────────────────────
// Chart.js "nice number" algorithm — produces identical Y-axis ticks
// ─────────────────────────────────────────────────────────────────────────────
function niceNum(range: number, round: boolean): number {
  if (range === 0) return 0;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

function computeNiceTicks(
  dataMin: number,
  dataMax: number,
  maxTicks: number = 11,
): { niceMin: number; niceMax: number; ticks: number[]; step: number } {
  if (dataMin === dataMax) {
    dataMin -= 1;
    dataMax += 1;
  }

  // Include zero when all values are positive and min is small relative to max
  // (matches Chart.js behaviour for weekly/monthly/yearly views).
  // For tight-range daily data (ratio > 0.5) we keep the zoomed-in view.
  if (dataMin > 0 && dataMax > 0 && dataMin / dataMax < 0.5) {
    dataMin = 0;
  }

  const range = niceNum(dataMax - dataMin, false);
  const step = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(dataMin / step) * step;
  const niceMax = Math.ceil(dataMax / step) * step;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(parseFloat(v.toFixed(10)));
  }
  return { niceMin, niceMax, ticks, step };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart.js splineCurve — cubic bezier control-point calculation (tension=0.3)
// https://github.com/chartjs/Chart.js/blob/master/src/helpers/helpers.curve.ts
// ─────────────────────────────────────────────────────────────────────────────
const TENSION = 0.3; // same as web app Chart.js dataset tension

interface Pt { x: number; y: number }

function splineControlPoints(prev: Pt, cur: Pt, next: Pt): { cp1: Pt; cp2: Pt } {
  const d01 = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
  const d12 = Math.sqrt((next.x - cur.x) ** 2 + (next.y - cur.y) ** 2);
  const denom = d01 + d12 || 1;
  const fa = TENSION * d01 / denom;
  const fb = TENSION * d12 / denom;
  return {
    cp1: { x: cur.x - fa * (next.x - prev.x), y: cur.y - fa * (next.y - prev.y) },
    cp2: { x: cur.x + fb * (next.x - prev.x), y: cur.y + fb * (next.y - prev.y) },
  };
}

/**
 * Build an SVG <Path> `d` attribute from data points using Chart.js-style
 * cubic-bezier smoothing (tension = 0.3, pointRadius = 0).
 */
function buildSmoothedPath(points: Pt[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  // Compute control points for every point
  const cps: { cp1: Pt; cp2: Pt }[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] || points[i];
    const cur = points[i];
    const next = points[i + 1] || points[i];
    cps.push(splineControlPoints(prev, cur, next));
  }

  // Build SVG path: M start, then C for each segment
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const cp1 = cps[i - 1].cp2; // outgoing control of previous point
    const cp2 = cps[i].cp1;     // incoming control of current point
    const p = points[i];
    d += ` C${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)},${cp2.y.toFixed(2)} ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// DropdownPicker — native-select-style dropdown (modal-based)
// ─────────────────────────────────────────────────────────────────────────────
interface DDOption {
  label: string;
  value: string;
  disabled?: boolean;
}
interface DropdownPickerProps {
  value: string;
  options: DDOption[];
  onChange?: (value: string) => void;
}

const dropStyle = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    marginRight: 0,
  },
  pillText: {
    fontSize: 10,
    fontFamily: 'Montserrat_700Bold',
    color: '#333333',
    marginRight: 0,
  },
  caret: { marginLeft: 1 },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  menuItemActive: { backgroundColor: '#e3f0ff' },
  menuText: {
    fontSize: 13,
    fontFamily: 'Montserrat_700Bold',
    color: '#333333',
  },
  menuTextActive: {
    color: '#1976d2',
    fontFamily: 'Montserrat_700Bold',
  },
  menuTextDisabled: {
    color: '#7a7a7a',
    textDecorationLine: 'line-through',
    textDecorationColor: '#d32f2f',
  },
});

function DropdownPicker({ value, options, onChange }: DropdownPickerProps) {
  const { theme } = useAppTheme();
  const labelOf = (v: string) => options.find(o => o.value === v)?.label ?? v;
  const triggerRef = useRef<any>(null);
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 120 });

  const setMenuAnchor = useCallback((x: number, y: number, w: number, h: number) => {
    const menuWidth = Math.max(w || 120, 110);
    const estimatedMenuHeight = Math.min(Math.max(options.length * 38 + 12, 120), 260);
    const left = Math.max(8, Math.min(x, windowW - menuWidth - 8));
    const maxTop = Math.max(8, windowH - estimatedMenuHeight - 8);
    const top = Math.max(8, Math.min(y + h + 2, maxTop));
    setAnchor({ x: left, y: top, w: menuWidth });
    setOpen(true);
  }, [options.length, windowW, windowH]);

  const openMenu = (e: any) => {
    const fallbackX = e?.nativeEvent?.pageX ?? 8;
    const fallbackY = e?.nativeEvent?.pageY ?? 8;

    if (triggerRef.current?.measureInWindow) {
      triggerRef.current.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (Number.isFinite(x) && Number.isFinite(y) && w > 0 && h > 0) {
          setMenuAnchor(x, y, w, h);
          return;
        }
        setMenuAnchor(Math.max(8, fallbackX - 12), Math.max(8, fallbackY), 120, 0);
      });
      return;
    }

    setMenuAnchor(Math.max(8, fallbackX - 12), Math.max(8, fallbackY), 120, 0);
  };

  const handleSelect = (opt: DDOption) => {
    if (opt.disabled) return;
    setOpen(false);
    onChange?.(opt.value);
  };

  return (
    <>
      <TouchableOpacity ref={triggerRef} style={dropStyle.pill} onPress={openMenu} activeOpacity={0.75}>
        <Text style={[dropStyle.pillText, { color: theme.colors.textSecondary }]}>{labelOf(value)}</Text>
        <Entypo name="chevron-down" size={14} color={theme.colors.icon} style={dropStyle.caret} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={dropStyle.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              dropStyle.menu,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
              { top: anchor.y, left: anchor.x, minWidth: Math.max(anchor.w, 110) },
            ]}
          >
            {options.map(opt => {
              const isActive = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[dropStyle.menuItem, isActive && dropStyle.menuItemActive, isActive && { backgroundColor: theme.colors.surfaceMuted }]}
                  activeOpacity={opt.disabled ? 1 : 0.8}
                  onPress={() => handleSelect(opt)}
                  disabled={opt.disabled}
                >
                  <Text
                    style={[
                      dropStyle.menuText,
                      { color: theme.colors.textPrimary },
                      isActive && dropStyle.menuTextActive,
                      isActive && { color: theme.colors.primary },
                      opt.disabled && dropStyle.menuTextDisabled,
                      opt.disabled && { color: theme.colors.textMuted, textDecorationColor: theme.colors.danger },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
interface AnalyticsTabProps {
  smaVisible?: boolean;
  onToggleSma?: () => void;
  calendarMode?: 'fiscal' | 'calendar';
  onCalendarModeChange?: (mode: 'fiscal' | 'calendar') => void;

  dateParams?: DateParams;
  onBindExportActions?: (actions: { exportPDF: () => void; printPDF: () => void }) => void;

}
export default function AnalyticsTab({
  smaVisible: propSmaVisible,
  onToggleSma: propToggleSma,
  calendarMode,
  onCalendarModeChange,
  dateParams,
  onBindExportActions,
}: AnalyticsTabProps = {}) {
  // ── State ──
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const { theme } = useAppTheme();
  const [smaVisibleInternal, setSmaVisibleInternal] = useState(true);
  const smaVisible = propSmaVisible ?? smaVisibleInternal;
  const toggleSma = propToggleSma ?? (() => setSmaVisibleInternal(v => !v));
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('trends');

  const [calendarModeInternal, setCalendarModeInternal] = useState<'fiscal' | 'calendar'>('fiscal');
  const activeCalendarMode = calendarMode ?? calendarModeInternal;

  const [compareYearLeft, setCompareYearLeft] = useState<'Nothing' | '2025' | '2026'>('Nothing');
  const [compareYearRight, setCompareYearRight] = useState<'Nothing' | '2025' | '2026'>('2026');

  const viewMode: ViewMode = 'D';
  const [chartDataByYear, setChartDataByYear] = useState<Record<number, SalesChartResponse>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const fetchIdRef = useRef(0);

  const selectedYears = useMemo(() => {
    const out: number[] = [];
    if (compareYearLeft !== 'Nothing') out.push(parseInt(compareYearLeft, 10));
    if (compareYearRight !== 'Nothing') {
      const yr = parseInt(compareYearRight, 10);
      if (!out.includes(yr)) out.push(yr);
    }
    return out;
  }, [compareYearLeft, compareYearRight]);

  const yearRanges = useMemo(() => {
    if (!dateParams) return {} as Record<number, { startDate: string; endDate: string }>;
    const cyYear = parseInt(dateParams.boxDayCY.split(' ')[0], 10);
    const lyYear = parseInt(dateParams.boxDayLY.split(' ')[0], 10);

    const out: Record<number, { startDate: string; endDate: string }> = {};
    if (Number.isFinite(cyYear)) {
      out[cyYear] = {
        startDate: dateParams.P_YTD_1_S,
        endDate: dateParams.P_YTD_1_E,
      };
    }
    if (Number.isFinite(lyYear)) {
      out[lyYear] = {
        startDate: dateParams.P_YTD_2_S,
        endDate: dateParams.P_YTD_2_E,
      };
    }
    return out;
  }, [dateParams]);

  // ── Fetch chart data when years or viewMode change ──
  const loadChart = useCallback(async (years: number[], mode: ViewMode) => {
    if (years.length === 0) {
      setChartDataByYear({});
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const pairs = await Promise.all(
        years.map(async (year) => {
          const range = yearRanges[year] ?? {
            startDate: `${year}-01-01`,
            endDate: `${year}-12-31`,
          };
          const data = await fetchSalesChartByDateRange(range.startDate, range.endDate, mode, SMA_PERIOD);
          return [year, data] as const;
        })
      );
      if (id === fetchIdRef.current) {
        const next: Record<number, SalesChartResponse> = {};
        pairs.forEach(([year, data]) => {
          next[year] = data;
        });
        setChartDataByYear(next);
      }
    } catch (err: any) {
      if (id === fetchIdRef.current) {
        setError(err.message || 'Failed to load chart data');
        setChartDataByYear({});
      }
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [yearRanges]);

  useEffect(() => {
    loadChart(selectedYears, viewMode);
  }, [activeCalendarMode, loadChart, selectedYears, viewMode]);

  const yearOptionsLeft: DDOption[] = [
    { label: 'Nothing', value: 'Nothing' },
    { label: '2025', value: '2025', disabled: compareYearRight === '2025' },
    { label: '2026', value: '2026', disabled: compareYearRight === '2026' },
  ];
  const yearOptionsRight: DDOption[] = [
    { label: 'Nothing', value: 'Nothing' },
    { label: '2025', value: '2025', disabled: compareYearLeft === '2025' },
    { label: '2026', value: '2026', disabled: compareYearLeft === '2026' },
  ];

  // ── Chart dimensions ──
  const screenWidth = winW - 48;
  // landscape: containerHeight minus toolbar (~37px) + chartContainer margins/padding (~24px)
  const chartHeight = isLandscape
    ? (containerHeight > 0 ? containerHeight - 61 : Math.floor(winH * 0.62))
    : 190;

  const visibleCharts = useMemo(() => {
    const rows: Array<{ year: number; data: SalesChartResponse }> = [];
    if (compareYearLeft !== 'Nothing') {
      const year = parseInt(compareYearLeft, 10);
      const data = chartDataByYear[year];
      if (data) rows.push({ year, data });
    }
    if (compareYearRight !== 'Nothing') {
      const year = parseInt(compareYearRight, 10);
      const data = chartDataByYear[year];
      if (data && !rows.some(x => x.year === year)) rows.push({ year, data });
    }
    return rows;
  }, [chartDataByYear, compareYearLeft, compareYearRight]);

  // ── Dynamic left padding: title (14px) + gap + widest Y-axis label ──
  const paddingLeft = useMemo(() => {
    if (visibleCharts.length === 0) return 64;
    const allVals: number[] = [];
    visibleCharts.forEach(({ data }) => {
      allVals.push(...data.Sales);
      if (smaVisible) allVals.push(...(data.Sma.filter(v => v !== null) as number[]));
    });
    if (allVals.length === 0) return 64;
    const maxAbs = Math.max(Math.abs(Math.min(...allVals)), Math.abs(Math.max(...allVals)));
    const maxLabelLen = Math.round(maxAbs || 0).toLocaleString().length;
    return Math.max(50, maxLabelLen * 6 + 18);
  }, [visibleCharts, smaVisible]);

  // ── Y-axis nice ticks (Chart.js niceNum algorithm) ──
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (visibleCharts.length === 0)
      return { yMin: 0, yMax: 1, yTicks: [0] };

    const allVals: number[] = [];
    visibleCharts.forEach(({ data }) => {
      allVals.push(...data.Sales);
      if (smaVisible) allVals.push(...(data.Sma.filter(v => v !== null) as number[]));
    });
    if (allVals.length === 0) return { yMin: 0, yMax: 1, yTicks: [0] };

    const dataMin = Math.min(...allVals);
    const dataMax = Math.max(...allVals);

    const { niceMin, niceMax, ticks } = computeNiceTicks(dataMin, dataMax, 11);
    return { yMin: niceMin, yMax: niceMax, yTicks: ticks };
  }, [visibleCharts, smaVisible]);

  const sharedChartW = useMemo(() => {
    const maxLen = visibleCharts.reduce((m, x) => Math.max(m, x.data.Sales.length), 0);
    const chartCount = Math.max(visibleCharts.length, 1);
    const landscapePerChartWidth = Math.floor((winW - 96) / chartCount);
    const targetWidth = isLandscape ? landscapePerChartWidth : screenWidth;
    return Math.max(targetWidth, maxLen * 3 + paddingLeft + CHART_PADDING_RIGHT);
  }, [visibleCharts, screenWidth, paddingLeft, isLandscape, winW]);

  const getSmaColor = useCallback((sma: (number | null)[]) => {
    const valid = sma.filter(v => v !== null) as number[];
    if (valid.length < 2) return '#999999';
    return valid[valid.length - 1] >= valid[0] ? '#00a651' : '#D32F2F';
  }, []);

  const getSalesColor = useCallback((year: number) => {
    if (year === 2025) return '#606266';
    if (year === 2026) return '#3984c6';
    return '#3984c6';
  }, []);

  // ── Render the SVG chart ──
  const renderChart = (year: number, chartData: SalesChartResponse) => {
    if (!chartData || chartData.Labels.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{'No data available'}</Text>
        </View>
      );
    }

    const chartW = sharedChartW;
    const plotW = chartW - paddingLeft - CHART_PADDING_RIGHT;
    const plotH = chartHeight - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

    const toX = (i: number, total: number) =>
      paddingLeft + (total > 1 ? (i / (total - 1)) * plotW : plotW / 2);
    const toY = (val: number) =>
      CHART_PADDING_TOP + plotH - ((val - yMin) / (yMax - yMin || 1)) * plotH;

    const salesPath = buildSmoothedPath(
      chartData.Sales.map((v, i) => ({ x: toX(i, chartData.Sales.length), y: toY(v) }))
    );
    const smaPath = smaVisible
      ? buildSmoothedPath(
          chartData.Sma
            .map((v, i) => (v !== null ? { x: toX(i, chartData.Sma.length), y: toY(v) } : null))
            .filter(Boolean) as Pt[]
        )
      : '';
    const maxLabels = 15;
    const step = Math.max(1, Math.ceil(chartData.Labels.length / maxLabels));
    const xLabels: { label: string; x: number }[] = [];
    for (let i = 0; i < chartData.Labels.length; i += step) {
      xLabels.push({ label: chartData.Labels[i], x: toX(i, chartData.Labels.length) });
    }

    const salesColor = getSalesColor(year);
    const smaColor = getSmaColor(chartData.Sma);
    const yTickLabels = yTicks.map((tick, i) => {
      const last = yTicks.length - 1;
      if (i < 3 || i === last) {
        return { tick, text: Math.round(tick).toLocaleString() };
      }
      if (i === 3) {
        return { tick, text: '...' };
      }
      return { tick, text: '' };
    });

    return (
      <View>
        <Text style={[styles.chartYearTitle, { color: theme.colors.textSecondary }]}>{year}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
          <Svg width={chartW} height={chartHeight}>
            <SvgText
              x={14}
              y={CHART_PADDING_TOP + plotH / 2}
              fontSize={10}
              fill={theme.colors.textMuted}
              fontWeight="600"
              textAnchor="middle"
              transform={`rotate(-90, 14, ${CHART_PADDING_TOP + plotH / 2})`}
            >
              Sales $
            </SvgText>

            {yTicks.map((tick, i) => (
              <Line
                key={`grid-${year}-${i}`}
                x1={paddingLeft}
                y1={toY(tick)}
                x2={chartW - CHART_PADDING_RIGHT}
                y2={toY(tick)}
                stroke={theme.colors.divider}
                strokeWidth={0.5}
              />
            ))}

            <Line
              x1={paddingLeft}
              y1={chartHeight - CHART_PADDING_BOTTOM}
              x2={chartW - CHART_PADDING_RIGHT}
              y2={chartHeight - CHART_PADDING_BOTTOM}
              stroke={theme.colors.textPrimary}
              strokeWidth={1}
            />

            {yTickLabels.map((item, i) => (
              <SvgText
                key={`y-${year}-${i}`}
                x={paddingLeft - 4}
                y={toY(item.tick) + 3}
                fontSize={8}
                fill={theme.colors.textSecondary}
                textAnchor="end"
              >
                {item.text}
              </SvgText>
            ))}

            {xLabels.map((item, i) => (
              <SvgText
                key={`x-${year}-${i}`}
                x={item.x}
                y={chartHeight - CHART_PADDING_BOTTOM + 14}
                fontSize={8}
                fill={theme.colors.textMuted}
                textAnchor="end"
                transform={`rotate(-45, ${item.x}, ${chartHeight - CHART_PADDING_BOTTOM + 14})`}
              >
                {item.label}
              </SvgText>
            ))}

            {salesPath.length > 0 && (
              <Path
                d={salesPath}
                fill="none"
                stroke={salesColor}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {smaVisible && smaPath.length > 0 && (
              <Path
                d={smaPath}
                fill="none"
                stroke={smaColor}
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </Svg>
        </ScrollView>
        <View style={styles.legendRowBottom}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: salesColor }]} />
            <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>Sales</Text>
          </View>
          {smaVisible && (
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: smaColor }]} />
              <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>SMA</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const handleCalendarModeSelect = (value: string) => {
    const mode = value === 'calendar' ? 'calendar' : 'fiscal';
    setCalendarModeInternal(mode);
    onCalendarModeChange?.(mode);
  };

  // ── Analytics PDF / Print export (matches DownloadSalesAnalytics in web) ──
  const generateAnalyticsHtml = useCallback(() => {
    const now = new Date().toLocaleString('en-US', { hour12: true });
    const dateLabel = dateParams?.boxDayCY ?? '';

    // chart dimensions fixed for PDF output
    const CW = 900;
    const CH = 280;
    const PAD_LEFT = Math.max(50, paddingLeft);
    const PAD_RIGHT = 12;
    const PAD_TOP = 12;
    const PAD_BOTTOM = 60;
    const plotW = CW - PAD_LEFT - PAD_RIGHT;
    const plotH = CH - PAD_TOP - PAD_BOTTOM;

    const toX = (i: number, total: number) =>
      PAD_LEFT + (total > 1 ? (i / (total - 1)) * plotW : plotW / 2);
    const toY = (val: number) =>
      PAD_TOP + plotH - ((val - yMin) / (yMax - yMin || 1)) * plotH;

    let chartsHtml = '';

    for (const { year, data } of visibleCharts) {
      const salesColor = getSalesColor(year);
      const smaColor = getSmaColor(data.Sma);

      const salesPts: Pt[] = data.Sales.map((v, i) => ({ x: toX(i, data.Sales.length), y: toY(v) }));
      const salesPath = buildSmoothedPath(salesPts);

      const smaPts: Pt[] = data.Sma
        .map((v, i) => (v !== null ? { x: toX(i, data.Sma.length), y: toY(v) } : null))
        .filter(Boolean) as Pt[];
      const smaPath = smaVisible && smaPts.length > 0 ? buildSmoothedPath(smaPts) : '';

      const maxLabels = 15;
      const step = Math.max(1, Math.ceil(data.Labels.length / maxLabels));
      const xLabelsSvg: string[] = [];
      for (let i = 0; i < data.Labels.length; i += step) {
        const x = toX(i, data.Labels.length).toFixed(2);
        const y = CH - PAD_BOTTOM + 14;
        xLabelsSvg.push(
          `<text x="${x}" y="${y}" font-size="8" text-anchor="end" fill="#666666" transform="rotate(-45,${x},${y})">${data.Labels[i]}</text>`,
        );
      }

      const yTicksSvg = yTicks.map((tick, i) => {
        const y = toY(tick).toFixed(2);
        const label = (i < 3 || i === yTicks.length - 1)
          ? Math.round(tick).toLocaleString()
          : i === 3 ? '...' : '';
        const grid = `<line x1="${PAD_LEFT}" y1="${y}" x2="${CW - PAD_RIGHT}" y2="${y}" stroke="#e8e8e8" stroke-width="0.5"/>`;
        const lbl = label
          ? `<text x="${PAD_LEFT - 4}" y="${(parseFloat(y) + 3).toFixed(2)}" font-size="8" text-anchor="end" fill="#333333">${label}</text>`
          : '';
        return grid + lbl;
      }).join('');

      const smaPathHtml = smaPath
        ? `<path d="${smaPath}" fill="none" stroke="${smaColor}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>`
        : '';
      const smaLegend = smaVisible
        ? `<span style="display:inline-flex;align-items:center;margin-left:12px;"><span style="display:inline-block;width:12px;height:3px;background:${smaColor};margin-right:4px;"></span>SMA</span>`
        : '';

      chartsHtml += `
      <div style="margin-bottom:24px;">
        <h3 style="font-size:13px;margin:0 0 4px 0;color:#1e293b;">${year}</h3>
        <svg width="${CW}" height="${CH}" xmlns="http://www.w3.org/2000/svg">
          ${yTicksSvg}
          <line x1="${PAD_LEFT}" y1="${CH - PAD_BOTTOM}" x2="${CW - PAD_RIGHT}" y2="${CH - PAD_BOTTOM}" stroke="#000000" stroke-width="1"/>
          <text x="14" y="${(PAD_TOP + plotH / 2).toFixed(2)}" font-size="10" fill="#555555" text-anchor="middle" transform="rotate(-90,14,${(PAD_TOP + plotH / 2).toFixed(2)})">Sales $</text>
          ${xLabelsSvg.join('')}
          ${salesPath ? `<path d="${salesPath}" fill="none" stroke="${salesColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
          ${smaPathHtml}
        </svg>
        <div style="font-size:10px;margin-top:2px;">
          <span style="display:inline-flex;align-items:center;"><span style="display:inline-block;width:12px;height:3px;background:${salesColor};margin-right:4px;"></span>Sales</span>
          ${smaLegend}
        </div>
      </div>`;
    }

    if (!chartsHtml) {
      chartsHtml = '<p style="color:#64748b;">No chart data available.</p>';
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; }
  h2 { font-size: 14px; margin: 0 0 8px 0; color: #1e293b; }
</style>
</head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
  <h2>Sales Analytics${dateLabel ? ' - ' + dateLabel : ''}</h2>
  <span style="font-size:8px;color:#64748b;">Generated: ${now}</span>
</div>
${chartsHtml}
</body></html>`;
  }, [visibleCharts, smaVisible, yMin, yMax, yTicks, paddingLeft, getSalesColor, getSmaColor, dateParams]);

  const handleExportPDF = useCallback(async () => {
    try {
      if (visibleCharts.length === 0) {
        Alert.alert('No Data', 'Select a year to generate the chart first.');
        return;
      }
      const html = generateAnalyticsHtml();
      const { uri: tempUri } = await Print.printToFileAsync({ html });
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri, 'SalesAnalytics', 'application/pdf',
          );
          await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
          Alert.alert('Success', 'PDF saved successfully!');
        }
      } else {
        await Sharing.shareAsync(tempUri, { mimeType: 'application/pdf' });
      }
    } catch (error: any) {
      Alert.alert('Error', `PDF export failed: ${error.message}`);
    }
  }, [generateAnalyticsHtml, visibleCharts]);

  const handlePrint = useCallback(async () => {
    try {
      if (visibleCharts.length === 0) {
        Alert.alert('No Data', 'Select a year to generate the chart first.');
        return;
      }
      const html = generateAnalyticsHtml();
      await Print.printAsync({ html });
    } catch (error: any) {
      Alert.alert('Error', `Print failed: ${error.message}`);
    }
  }, [generateAnalyticsHtml, visibleCharts]);

  useEffect(() => {
    onBindExportActions?.({ exportPDF: handleExportPDF, printPDF: handlePrint });
  }, [onBindExportActions, handleExportPDF, handlePrint]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.surface }]}
      contentContainerStyle={[styles.contentContainer, isLandscape && styles.contentContainerLandscape]}
      scrollEnabled={true}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {/* ── Sub-tab selector: Trends / Extrapolate / Lift by Promotions ── */}
      {isLandscape ? (
        // Landscape: sub-tab card + toolbar in horizontal row
        <View style={[styles.subTabRowCentered, styles.subTabRowLandscape]}>
          <View style={styles.subTabCardLandscapeFrame}>
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
            <View style={[styles.subTabCard2, { backgroundColor: theme.colors.surface }]}>
              <TouchableOpacity style={styles.subTabItem1} onPress={() => setActiveSubTab('trends')} activeOpacity={0.8}>
                <View style={[styles.subTabIconBox, activeSubTab === 'trends' && styles.subTabIconBoxActive]}>
                  <Image source={activeSubTab === 'trends' ? require('../../assets/images/Trends_sel.png') : require('../../assets/images/Trends.png')} style={styles.subTabIconImg} resizeMode="contain" />
                </View>
                <Text style={[styles.subTabLabel, styles.subTabLabelTrends, { color: theme.colors.textPrimary }]}>Trends</Text>
              </TouchableOpacity>
              <View style={styles.subTabItemDisabledWrap}>
                <TouchableOpacity style={styles.subTabItem2} disabled activeOpacity={1}>
                  <View style={styles.subTabIconBox}>
                    <Image source={require('../../assets/images/Extrapolate.png')} style={styles.subTabIconImg} resizeMode="contain" />
                    <View style={styles.disabledOverlay} pointerEvents="none">
                      <View style={styles.disabledLine1} />
                      <View style={styles.disabledLine2} />
                    </View>
                  </View>
                  <Text style={[styles.subTabLabel, styles.subTabLabelDisabled, { color: theme.colors.textMuted }]}>Extrapolate</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.subTabItemDisabledWrap}>
                <TouchableOpacity style={styles.subTabItem3} disabled activeOpacity={1}>
                  <View style={styles.subTabIconBox}>
                    <Image source={require('../../assets/images/LBP.png')} style={styles.subTabIconImg} resizeMode="contain" />
                    <View style={styles.disabledOverlay} pointerEvents="none">
                      <View style={styles.disabledLine1} />
                      <View style={styles.disabledLine2} />
                    </View>
                  </View>
                  <Text style={[styles.subTabLabel, styles.subTabLabelDisabled, { color: theme.colors.textMuted }]}>Lift by Promo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {/* Landscape toolbar to the right */}
          <View style={[styles.toolbarRowLandscape, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.toolbarLabel, { color: theme.colors.textSecondary }]}>Compare</Text>
            <DropdownPicker
              value={activeCalendarMode}
              options={[
                { label: 'Fiscal', value: 'fiscal' },
                { label: 'Calendar', value: 'calendar' },
              ]}
              onChange={handleCalendarModeSelect}
            />
            <DropdownPicker value={compareYearLeft} options={yearOptionsLeft} onChange={(v) => setCompareYearLeft(v as 'Nothing' | '2025' | '2026')} />
            <Text style={[styles.toolbarWith, { color: theme.colors.textSecondary }]}>with</Text>
            <View style={styles.toolbarStack}>
              <DropdownPicker value={compareYearRight} options={yearOptionsRight} onChange={(v) => setCompareYearRight(v as 'Nothing' | '2025' | '2026')} />
              <DropdownPicker
                value="D"
                options={[
                  { label: 'Daily', value: 'D' },
                  { label: 'Weekly', value: 'W', disabled: true },
                  { label: 'Quarterly', value: 'Q', disabled: true },
                  { label: 'Yearly', value: 'Y', disabled: true },
                ]}
              />
              <TouchableOpacity style={styles.smaRow} onPress={toggleSma} activeOpacity={0.7}>
                <View
                  style={[
                    styles.smaBox,
                    { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
                    smaVisible && styles.smaBoxChecked,
                    smaVisible && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                  ]}
                >
                  {smaVisible && <Text style={styles.smaCheck}>✓</Text>}
                </View>
                <Text style={[styles.smaLabel, { color: theme.colors.textSecondary }]}>SMA</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        // Portrait: matches landscape appearance
        <>
          {/* Sub-tab card, centered, wider */}
          <View style={styles.subTabRowCenteredLandscape}>
            <View style={styles.subTabCardPortraitFrame}>
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
              <View style={[styles.subTabCard, styles.subTabCardPortrait, { backgroundColor: theme.colors.surface }]}>
              <TouchableOpacity style={styles.subTabItem3pot} onPress={() => setActiveSubTab('trends')} activeOpacity={0.8}>
                <View style={[styles.subTabIconBox, activeSubTab === 'trends' && styles.subTabIconBoxActive]}>
                  <Image source={activeSubTab === 'trends' ? require('../../assets/images/Trends_sel.png') : require('../../assets/images/Trends.png')} style={styles.subTabIconImg} resizeMode="contain" />
                </View>
                <Text style={[styles.subTabLabel, styles.subTabLabelTrends, { color: theme.colors.textPrimary }]}>Trends</Text>
              </TouchableOpacity>
              <View style={styles.subTabItemDisabledWrap}>
                <TouchableOpacity style={styles.subTabItempot} disabled activeOpacity={1}>
                  <View style={styles.subTabIconBox}>
                    <Image source={require('../../assets/images/Extrapolate.png')} style={styles.subTabIconImg} resizeMode="contain" />
                    <View style={styles.disabledOverlay} pointerEvents="none">
                      <View style={styles.disabledLine1} />
                      <View style={styles.disabledLine2} />
                    </View>
                  </View>
                  <Text style={[styles.subTabLabel, styles.subTabLabelDisabled, { color: theme.colors.textMuted }]}>Extrapolate</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.subTabItemDisabledWrap2}>
                <TouchableOpacity style={styles.subTabItem2pot} disabled activeOpacity={1}>
                  <View style={styles.subTabIconBox}>
                    <Image source={require('../../assets/images/LBP.png')} style={styles.subTabIconImg} resizeMode="contain" />
                    <View style={styles.disabledOverlay} pointerEvents="none">
                      <View style={styles.disabledLine1} />
                      <View style={styles.disabledLine2} />
                    </View>
                  </View>
                  <Text style={[styles.subTabLabel, styles.subTabLabelDisabled, { color: theme.colors.textMuted }]}>Lift by Promo</Text>
                </TouchableOpacity>
              </View>
              </View>
            </View>
          </View>
          {/* Portrait toolbar below */}
          <View style={[styles.toolbarRow, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.toolbarLabel, { color: theme.colors.textSecondary }]}>Compare</Text>
            <DropdownPicker
              value={activeCalendarMode}
              options={[
                { label: 'Fiscal', value: 'fiscal' },
                { label: 'Calendar', value: 'calendar' },
              ]}
              onChange={handleCalendarModeSelect}
            />
            <DropdownPicker value={compareYearLeft} options={yearOptionsLeft} onChange={(v) => setCompareYearLeft(v as 'Nothing' | '2025' | '2026')} />
            <Text style={[styles.toolbarWith, { color: theme.colors.textSecondary }]}>with</Text>
            <View style={styles.toolbarStack}>
              <DropdownPicker value={compareYearRight} options={yearOptionsRight} onChange={(v) => setCompareYearRight(v as 'Nothing' | '2025' | '2026')} />
              <DropdownPicker
                value="D"
                options={[
                  { label: 'Daily', value: 'D' },
                  { label: 'Weekly', value: 'W', disabled: true },
                  { label: 'Quarterly', value: 'Q', disabled: true },
                  { label: 'Yearly', value: 'Y', disabled: true },
                ]}
              />
              <TouchableOpacity style={styles.smaRow} onPress={toggleSma} activeOpacity={0.7}>
                <View
                  style={[
                    styles.smaBox,
                    { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
                    smaVisible && styles.smaBoxChecked,
                    smaVisible && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                  ]}
                >
                  {smaVisible && <Text style={styles.smaCheck}>✓</Text>}
                </View>
                <Text style={[styles.smaLabel, { color: theme.colors.textSecondary }]}>SMA</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* ── Sub-tab content ── */}
      {activeSubTab === 'trends' ? (
      <View style={[styles.chartContainer, { backgroundColor: theme.colors.surface }, isLandscape && { paddingHorizontal: 8, flexDirection: 'row', justifyContent: visibleCharts.length === 1 ? 'center' : 'space-between', alignItems: 'flex-start', gap: 8 }]}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading chart...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => loadChart(selectedYears, viewMode)}>
              <Text style={[styles.retryText, { color: theme.colors.primary }]}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        ) : visibleCharts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Select a year to compare</Text>
          </View>
        ) : (
          <>
            {visibleCharts.map((item) => (
              <View key={item.year} style={isLandscape ? { flex: visibleCharts.length === 1 ? 0 : 1, maxWidth: visibleCharts.length === 1 ? '62%' : '50%', alignSelf: visibleCharts.length === 1 ? 'center' : 'auto' } : { marginBottom: 12 }}>
                {renderChart(item.year, item.data)}
              </View>
            ))}
          </>
        )}

      </View>
      ) : (
        <View style={styles.subTabPlaceholder}>
          <MaterialCommunityIcons
            name={activeSubTab === 'extrapolate' ? 'chart-timeline-variant' : 'currency-usd'}
            size={52}
            color={theme.colors.textMuted}
          />
          <Text style={[styles.subTabPlaceholderText, { color: theme.colors.textMuted }] }>
            {activeSubTab === 'extrapolate' ? 'Extrapolate' : 'Lift by Promotions'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    paddingBottom: 20,
  },
  contentContainerLandscape: {
    paddingBottom: 20,
    flexGrow: 0,
  },

  // ── Analytics toolbar ──
  // Portrait: dropdowns row
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    marginVertical: 8,
    paddingVertical: 7,
    marginLeft: 0,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  // Landscape: toolbar to the right of card
  toolbarRowLandscape: {
    marginLeft: 'auto',
    marginRight: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  toolbarDropdownGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  toolbarLabel: {
    fontSize: 10,
    fontFamily: 'Montserrat_500Medium',
    color: '#333333',
    marginRight: 6,
  },
  toolbarWith: {
    fontSize: 10,
    fontFamily: 'Montserrat_500Medium',
    color: '#333333',
    marginRight: 4,
  },
  toolbarStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: -1,
  },
  smaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smaBox: {
    width: 17,
    height: 17,
    borderWidth: 2,
    borderColor: '#1976d2',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
    backgroundColor: '#ffffff',
  },
  smaBoxChecked: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  smaCheck: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: -1,
  },
  smaLabel: {
    fontSize: 10,
    fontFamily: 'Montserrat_500Medium',
    color: '#333333',
    marginRight: "3%",
  },

  // ── Chart container ──
  chartYearTitle: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Montserrat_700Bold',
    color: '#374151',
  },
  chartContainer: {
    marginHorizontal: 0,
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 0,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // ── Legend ──
  legendColumn: {
    width: 72,
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingTop: 20,
    paddingLeft: 6,
    gap: 10,
  },
  legendRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 20,
    height: 10,
    borderRadius: 2,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: 'Montserrat_500Medium',
    color: '#333333',
  },

  // ── Loading / Error / Empty ──
  loadingContainer: {
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontFamily: 'Montserrat_500',
    color: '#64748b',
  },
  emptyContainer: {
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Montserrat_500',
    color: '#94a3b8',
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Montserrat_600',
    color: '#dc2626',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Montserrat_500',
    color: '#2563eb',
    textDecorationLine: 'underline',
  },

  // ── Sub-tab selector ──
  landscapeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  subTabRowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 0,
    marginLeft: 0,
    minHeight: 56,
    gap: 12,
    marginTop: 0,
  },
  subTabRowCenteredLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 0,
    marginLeft: 0,
    minHeight: 56,
    gap: 12,
    marginTop: 8,
  },
  subTabRowLandscape: {
    justifyContent: 'flex-start',
    marginLeft: "-1.8%",
  },
  landscapeToolbarSide: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 4,
  },
  subTabCard: {
    marginLeft:"-0.6%",
    flexDirection: 'row',
    width: '28%',
    justifyContent: 'space-evenly',
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderLeftColor: '#064cd8',
    borderRightColor: '#064cd8',
    borderBottomColor: '#e5e7eb',
    paddingVertical: 0,
    paddingHorizontal: 0,
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  subTabCard2: {
    marginLeft:"1.5%",
    marginTop:"1%",
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-evenly',
    marginBottom: 1,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 0,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  subTabCardPortraitFrame: {
    width: '95%',
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    paddingVertical:10,
    marginHorizontal: 10,
    
  },
  subTabCardLandscapeFrame: {
    marginTop:'0%',
    marginLeft:"3%",
    width: '40%',
    position: 'relative',
    borderRadius: 8,
    overflow: 'visible',
    paddingVertical: 4,
    marginHorizontal: 5,
  },
  subTabCardPortrait: {
    width: '100%',
    marginTop:'2.5%',
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  subTabCardCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    zIndex: 2,
  },
  subTabCardCornerLine: {
    position: 'absolute',
    backgroundColor: '#064cd8',
    borderRadius: 2,
  },
  subTabCardCornerTopRight: {
    top: 0,
    right: 0,
  },
  subTabCardCornerTopLeft: {
    top: 0,
    left: 0,
  },
  subTabCardCornerBottomLeft: {
    bottom: 0,
    left: 0,
  },
  subTabCardCornerBottomRight: {
    bottom: 0,
    right: 0,
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
  subTabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    
    gap: 1,
  },
  subTabItempot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 1,
    marginLeft:"28%"

  },
  subTabItem3pot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 1,
    marginLeft:"8%"
  },
  subTabItem2pot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 1,
    marginLeft:"10%"
  },
  subTabItem1: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 0,
    marginLeft:"4%",
    
  },
  subTabItem2: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 1,
    marginLeft:"28%"
  },
  subTabItem3: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 1,
    marginLeft:"12%"
  },
  subTabIconBox: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  subTabIconBoxActive: {
    backgroundColor: '#4ade80',
  },
  subTabIconImg: {
    width: 30,
    height: 30,
  },
  subTabItemDisabledWrap: {
    position: 'relative',
    marginLeft:"3%"
  },
  subTabItemDisabledWrap2: {
    position: 'relative',
  },
  disabledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledLine1: {
    position: 'absolute',
    width: '100%',
    height: 1.5,
    backgroundColor: 'red',
    transform: [{ rotate: '45deg' }],
  },
  disabledLine2: {
    position: 'absolute',
    width: '100%',
    height: 1.5,
    backgroundColor: 'red',
    transform: [{ rotate: '-45deg' }],
  },
  subTabLabelDisabled: {
    color: '#9ca3af',
  },
  subTabLabel: {
    fontSize: 9,
    fontFamily: 'Montserrat_400Regular',
    color: '#000000',
    textAlign: 'center',
  },
  subTabLabelTrends: {
    fontFamily: 'Montserrat_500Medium',
  },
  subTabPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    gap: 0,
  },
  subTabPlaceholderText: {
    fontSize: 17,
    fontFamily: 'Montserrat_700Bold',
    color: '#9ca3af',
  },
});
