import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchSalesChartByDateRange } from '../services/api';

const SMA_PERIOD = 7;

// --- Chart Nice Ticks algorithms ---
function niceNum(range, round) {
  if (range === 0) return 0;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
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

function computeNiceTicks(dataMin, dataMax, maxTicks = 11) {
  let minVal = dataMin;
  let maxVal = dataMax;
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }

  // Include 0 if range ratio is large
  if (minVal > 0 && maxVal > 0 && minVal / maxVal < 0.5) {
    minVal = 0;
  }

  const range = niceNum(maxVal - minVal, false);
  const step = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(minVal / step) * step;
  const niceMax = Math.ceil(maxVal / step) * step;

  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(parseFloat(v.toFixed(10)));
  }
  return { niceMin, niceMax, ticks, step };
}

// --- Bezier Curve Spline Smoothing ---
const TENSION = 0.3;

function splineControlPoints(prev, cur, next) {
  const d01 = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
  const d12 = Math.sqrt((next.x - cur.x) ** 2 + (next.y - cur.y) ** 2);
  const denom = d01 + d12 || 1;
  const fa = (TENSION * d01) / denom;
  const fb = (TENSION * d12) / denom;
  return {
    cp1: { x: cur.x - fa * (next.x - prev.x), y: cur.y - fa * (next.y - prev.y) },
    cp2: { x: cur.x + fb * (next.x - prev.x), y: cur.y + fb * (next.y - prev.y) },
  };
}

function buildSmoothedPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  const cps = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] || points[i];
    const cur = points[i];
    const next = points[i + 1] || points[i];
    cps.push(splineControlPoints(prev, cur, next));
  }

  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const cp1 = cps[i - 1].cp2;
    const cp2 = cps[i].cp1;
    const p = points[i];
    d += ` C${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)},${cp2.y.toFixed(2)} ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return d;
}

export default function AnalyticsTab({
  calendarMode = 'fiscal',
  dateParams,
  onBindExportActions,
}) {
  const [activeSubTab, setActiveSubTab] = useState('trends'); // trends | extrapolate | lifts
  const [compareMode, setCompareMode] = useState(calendarMode); // fiscal | calendar
  const [compareYearLeft, setCompareYearLeft] = useState('Nothing'); // Nothing | 2025
  const [compareYearRight, setCompareYearRight] = useState('2026'); // 2026
  const [viewMode, setViewMode] = useState('D'); // D | W | M | Y
  const [smaVisible, setSmaVisible] = useState(false);

  const [chartDataByYear, setChartDataByYear] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Measure container width for chart responsiveness
  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.getBoundingClientRect().width || 800);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width || 800);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const selectedYears = useMemo(() => {
    const out = [];
    if (compareYearLeft !== 'Nothing') out.push(parseInt(compareYearLeft, 10));
    if (compareYearRight !== 'Nothing') {
      const yr = parseInt(compareYearRight, 10);
      if (!out.includes(yr)) out.push(yr);
    }
    return out;
  }, [compareYearLeft, compareYearRight]);

  const yearRanges = useMemo(() => {
    if (!dateParams) return {};
    const cyYear = parseInt(dateParams.boxDayCY.split(' ')[0], 10);
    const lyYear = parseInt(dateParams.boxDayLY.split(' ')[0], 10);

    const out = {};
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

  // Fetch chart data when selected years, date ranges or viewMode change
  const loadChart = useCallback(async (years, mode) => {
    if (years.length === 0) {
      setChartDataByYear({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pairs = await Promise.all(
        years.map(async (year) => {
          const range = yearRanges[year] || {
            startDate: `${year}-01-01`,
            endDate: `${year}-12-31`,
          };
          const data = await fetchSalesChartByDateRange(range.startDate, range.endDate, mode, SMA_PERIOD);
          return [year, data];
        })
      );
      const next = {};
      pairs.forEach(([year, data]) => {
        next[year] = data;
      });
      setChartDataByYear(next);
    } catch (err) {
      console.error('[AnalyticsTab] Load chart error:', err);
      setError(err.message || 'Failed to load chart data');
      setChartDataByYear({});
    } finally {
      setLoading(false);
    }
  }, [yearRanges]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChart(selectedYears, viewMode);
  }, [compareMode, selectedYears, viewMode, loadChart]);

  const visibleCharts = useMemo(() => {
    const rows = [];
    if (compareYearLeft !== 'Nothing') {
      const year = parseInt(compareYearLeft, 10);
      const data = chartDataByYear[year];
      if (data) rows.push({ year, data });
    }
    if (compareYearRight !== 'Nothing') {
      const year = parseInt(compareYearRight, 10);
      const data = chartDataByYear[year];
      if (data && !rows.some((x) => x.year === year)) rows.push({ year, data });
    }
    return rows;
  }, [chartDataByYear, compareYearLeft, compareYearRight]);

  // Y-axis Nice Ticks calculations across all visible datasets
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (visibleCharts.length === 0) {
      return { yMin: 0, yMax: 1, yTicks: [0] };
    }

    const allVals = [];
    visibleCharts.forEach(({ data }) => {
      allVals.push(...data.Sales);
      if (smaVisible) {
        allVals.push(...data.Sma.filter((v) => v !== null));
      }
    });

    if (allVals.length === 0) {
      return { yMin: 0, yMax: 1, yTicks: [0] };
    }

    const dataMin = Math.min(...allVals);
    const dataMax = Math.max(...allVals);

    const { niceMin, niceMax, ticks } = computeNiceTicks(dataMin, dataMax, 8);
    return { yMin: niceMin, yMax: niceMax, yTicks: ticks };
  }, [visibleCharts, smaVisible]);

  const getSmaColor = (sma) => {
    const valid = sma.filter((v) => v !== null);
    if (valid.length < 2) return '#999999';
    return valid[valid.length - 1] >= valid[0] ? '#00a651' : '#D32F2F';
  };

  const getSalesColor = (year) => {
    if (year === 2025) return '#606266';
    if (year === 2026) return '#3984c6';
    return '#3984c6';
  };

  // Render SVG Line Graph
  const renderSvgChart = (year, chartData) => {
    if (!chartData || !chartData.Labels || chartData.Labels.length === 0) {
      return <div style={{ textAlign: 'center', padding: '24px' }}>No chart data.</div>;
    }

    const padLeft = 64;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 48;

    const chartW = containerWidth;
    const plotW = chartW - padLeft - padRight;
    const plotH = 300 - padTop - padBottom;

    const toX = (i, total) => padLeft + (total > 1 ? (i / (total - 1)) * plotW : plotW / 2);
    const toY = (val) => padTop + plotH - ((val - yMin) / (yMax - yMin || 1)) * plotH;

    const salesPts = chartData.Sales.map((v, i) => ({ x: toX(i, chartData.Sales.length), y: toY(v) }));
    const salesPath = buildSmoothedPath(salesPts);

    const smaPts = chartData.Sma
      .map((v, i) => (v !== null ? { x: toX(i, chartData.Sma.length), y: toY(v) } : null))
      .filter(Boolean);
    const smaPath = smaVisible ? buildSmoothedPath(smaPts) : '';

    // Standard labels on X axis
    const maxLabels = 8;
    const step = Math.max(1, Math.ceil(chartData.Labels.length / maxLabels));
    const xLabels = [];
    for (let i = 0; i < chartData.Labels.length; i += step) {
      xLabels.push({ label: chartData.Labels[i], x: toX(i, chartData.Labels.length) });
    }

    const salesColor = getSalesColor(year);
    const smaColor = getSmaColor(chartData.Sma);

    return (
      <div key={year} style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
          Year {year} Sales Data
        </h4>
        <svg width={chartW} height={300} style={{ overflow: 'visible' }}>
          {/* Y Axis Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={toY(tick)}
                x2={chartW - padRight}
                y2={toY(tick)}
                stroke="#e2e8f0"
                strokeWidth={0.5}
              />
              <text
                x={padLeft - 8}
                y={toY(tick) + 3}
                fontSize={10}
                fill="#475569"
                textAnchor="end"
                fontFamily="Montserrat"
              >
                {Math.round(tick).toLocaleString()}
              </text>
            </g>
          ))}

          {/* Bottom boundary line */}
          <line
            x1={padLeft}
            y1={300 - padBottom}
            x2={chartW - padRight}
            y2={300 - padBottom}
            stroke="#1e293b"
            strokeWidth={1.5}
          />

          {/* X Axis Labels */}
          {xLabels.map((item, i) => (
            <text
              key={i}
              x={item.x}
              y={300 - padBottom + 16}
              fontSize={9}
              fill="#94a3b8"
              textAnchor="middle"
              fontFamily="Montserrat"
            >
              {item.label}
            </text>
          ))}

          {/* Sales path */}
          {salesPath && (
            <path
              d={salesPath}
              fill="none"
              stroke={salesColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* SMA path */}
          {smaVisible && smaPath && (
            <path
              d={smaPath}
              fill="none"
              stroke={smaColor}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* Legend */}
        <div className="chart-legends">
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: salesColor }} />
            <span>Sales</span>
          </div>
          {smaVisible && (
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: smaColor }} />
              <span>SMA ({SMA_PERIOD} Day)</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    if (onBindExportActions) {
      onBindExportActions({
        exportPDF: handlePrint,
        printPDF: handlePrint,
      });
    }
  }, [onBindExportActions, handlePrint]);

  return (
    <div ref={containerRef}>
      {/* Filters & Control bar */}
      <div className="analytics-controls">
        {/* Left Side Options */}
        <div className="analytics-control-group">
          <span>Compare</span>
          <select 
            className="mode-select"
            value={compareMode}
            onChange={(e) => setCompareMode(e.target.value)}
          >
            <option value="fiscal">Fiscal</option>
            <option value="calendar">Calendar</option>
          </select>
        </div>

        <div className="analytics-control-group">
          <select
            className="mode-select"
            value={compareYearLeft}
            onChange={(e) => setCompareYearLeft(e.target.value)}
          >
            <option value="Nothing">Nothing</option>
            <option value="2025" disabled={compareYearRight === '2025'}>2025</option>
            <option value="2026" disabled={compareYearRight === '2026'}>2026</option>
          </select>
          <span>with</span>
          <select
            className="mode-select"
            value={compareYearRight}
            onChange={(e) => setCompareYearRight(e.target.value)}
          >
            <option value="Nothing">Nothing</option>
            <option value="2025" disabled={compareYearLeft === '2025'}>2025</option>
            <option value="2026" disabled={compareYearLeft === '2026'}>2026</option>
          </select>
        </div>

        <div className="analytics-control-group">
          <select
            className="mode-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="D">Daily</option>
            <option value="W">Weekly</option>
            <option value="M">Monthly</option>
            <option value="Y">Yearly</option>
          </select>
        </div>

        <div className="analytics-control-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input 
              type="checkbox"
              checked={smaVisible}
              onChange={() => setSmaVisible(!smaVisible)}
              style={{ cursor: 'pointer' }}
            />
            <span>SMA</span>
          </label>
        </div>

        {/* Right Side radio layout */}
        <div style={{ marginLeft: 'auto' }} className="analytics-subtabs">
          <button 
            className={`analytics-subtab-btn ${activeSubTab === 'trends' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('trends')}
          >
            <i className="material-icons" style={{ fontSize: '18px', color: '#4caf50' }}>trending_up</i> Trends
          </button>
          <button 
            className="analytics-subtab-btn disabled"
            disabled
          >
            <i className="material-icons" style={{ fontSize: '18px', color: '#e53935' }}>close</i> Extrapolate
          </button>
          <button 
            className="analytics-subtab-btn disabled"
            disabled
          >
            <i className="material-icons" style={{ fontSize: '18px', color: '#e53935' }}>close</i> Lift by Promotion
          </button>
        </div>
      </div>

      {/* Main Charts card */}
      <div className="chart-card">
        <h3 className="chart-title">
          Sales Trend - {compareMode === 'fiscal' ? 'Fiscal' : 'Calendar'} {compareYearRight !== 'Nothing' ? compareYearRight : compareYearLeft !== 'Nothing' ? compareYearLeft : ''} ({viewMode === 'D' ? 'Daily' : viewMode === 'W' ? 'Weekly' : viewMode === 'M' ? 'Monthly' : 'Yearly'})
        </h3>

        {loading ? (
          <div className="loading-view">Loading chart data...</div>
        ) : error ? (
          <div className="error-view" style={{ color: 'var(--danger-color)' }}>{error}</div>
        ) : visibleCharts.length === 0 ? (
          <div className="error-view">Select a year to generate the sales trend chart.</div>
        ) : (
          visibleCharts.map(({ year, data }) => renderSvgChart(year, data))
        )}
      </div>
    </div>
  );
}
