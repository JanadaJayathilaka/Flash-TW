import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { fetchSalesChartByDateRange } from '../services/api';

// Import local icons for the segment cards
import TrendsIcon from '../assets/Trends.png';
import TrendsSelIcon from '../assets/Trends_sel.png';
import ExtrapolateIcon from '../assets/Extrapolate.png';
import LbpIcon from '../assets/LBP.png';

// Register all Chart.js modules
Chart.register(...registerables);

const SMA_PERIOD = 7;

/**
 * Self-contained Chart Component using HTML5 canvas & Chart.js
 */
function AnalyticsChart({ id, year, title, labels, salesData, smaData, smaVisible, yMin, yMax, salesColor }) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    // Compute SMA trend color: green if last point >= first point, red otherwise
    const validSma = (smaData || []).filter(v => v !== null);
    let smaColor = '#00a651'; // default green
    if (validSma.length >= 2) {
      const lastVal = validSma[validSma.length - 1];
      const firstVal = validSma[0];
      if (lastVal < firstVal) {
        smaColor = '#d32f2f'; // trending down (red)
      }
    }

    const datasets = [
      {
        label: 'Sales',
        data: salesData || [],
        borderColor: salesColor,
        backgroundColor: salesColor + '1A', // transparent fill color for hover/legend
        borderWidth: 2,
        pointRadius: 1.5,
        pointHoverRadius: 4,
        tension: 0.15,
        fill: false,
      }
    ];

    if (smaVisible && smaData && smaData.length > 0) {
      datasets.push({
        label: `SMA (${SMA_PERIOD} Day)`,
        data: smaData,
        borderColor: smaColor,
        backgroundColor: smaColor,
        borderWidth: 1.0,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.2,
        fill: false,
      });
    }

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels || [],
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 20,
              boxHeight: 4,
              font: {
                family: 'Montserrat',
                size: 10,
                weight: '600'
              }
            }
          },
          tooltip: {
            enabled: true,
            titleFont: { family: 'Montserrat', size: 12, weight: 'bold' },
            bodyFont: { family: 'Montserrat', size: 11 },
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              font: {
                family: 'Montserrat',
                size: 9
              },
              maxTicksLimit: 12,
            }
          },
          y: {
            min: yMin,
            max: yMax,
            ticks: {
              font: {
                family: 'Montserrat',
                size: 10
              },
              callback: function(value) {
                if (value >= 1e6) {
                  return '$' + (value / 1e6).toFixed(1) + 'M';
                } else if (value >= 1e3) {
                  return '$' + (value / 1e3).toFixed(0) + 'k';
                }
                return '$' + value;
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [labels, salesData, smaData, smaVisible, yMin, yMax, salesColor]);

  return (
    <div className="chart-container" style={{ height: '380px', position: 'relative' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#475569', textAlign: 'center', marginBottom: '10px' }}>
        {title}
      </h4>
      <div style={{ position: 'relative', width: '100%', height: '310px' }}>
        <canvas ref={canvasRef} id={id} />
      </div>
    </div>
  );
}

export default function AnalyticsTab({
  calendarMode = 'fiscal',
  dateParams,
  fiscalIndexes,
  onBindExportActions,
}) {
  const [activeSubTab, setActiveSubTab] = useState('trends'); // trends | extrapolate | lifts
  const [compareMode, setCompareMode] = useState(calendarMode); // fiscal | calendar
  const [compareYearLeft, setCompareYearLeft] = useState('Nothing'); // Nothing | 2022 | 2023 | 2024 | 2025 | 2026
  const [compareYearRight, setCompareYearRight] = useState('2026'); // 2026
  const [viewMode, setViewMode] = useState('D'); // D (Daily) | W (Weekly) | M (Quarterly) | Y (Yearly)
  const [smaVisible, setSmaVisible] = useState(false);

  const [chartDataByYear, setChartDataByYear] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Years options available
  const availableYears = [2022, 2023, 2024, 2025, 2026];

  // Map calendarMode prop to internal compareMode state when it changes
  useEffect(() => {
    setCompareMode(calendarMode);
  }, [calendarMode]);

  // Compute selected comparative years
  const selectedYears = useMemo(() => {
    const out = [];
    if (compareYearLeft !== 'Nothing') out.push(parseInt(compareYearLeft, 10));
    if (compareYearRight !== 'Nothing') {
      const yr = parseInt(compareYearRight, 10);
      if (!out.includes(yr)) out.push(yr);
    }
    return out;
  }, [compareYearLeft, compareYearRight]);

  // Dynamically compute exact start/end dates for each comparative year based on selected report date and mode
  const yearRanges = useMemo(() => {
    if (!dateParams) return {};

    const activeDateStr = dateParams.DT_1;
    const [, actM, actD] = activeDateStr.split('-').map(Number);
    const out = {};

    // Fiscal year ranges using database calendar mappings
    if (compareMode === 'fiscal' && fiscalIndexes) {
      const { calendar, dayIndex } = fiscalIndexes;
      const activeDetails = calendar[activeDateStr];

      if (activeDetails) {
        const activeDayInYear = activeDetails.DayInYear;

        availableYears.forEach(year => {
          const start = dayIndex[`${year}_1`] || `${year}-01-01`;
          const end = dayIndex[`${year}_${activeDayInYear}`] || `${year}-12-31`;
          out[year] = { startDate: start, endDate: end };
        });
        return out;
      }
    }

    // Calendar fallback calculations
    availableYears.forEach(year => {
      let endD = new Date(year, actM - 1, actD);
      if (endD.getMonth() !== (actM - 1)) {
        endD = new Date(year, actM, 0); // Leap-safe fallback
      }
      const start = `${year}-01-01`;
      const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
      out[year] = { startDate: start, endDate: end };
    });

    return out;
  }, [compareMode, dateParams, fiscalIndexes]);

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
    loadChart(selectedYears, viewMode);
  }, [selectedYears, viewMode, loadChart]);

  const visibleCharts = useMemo(() => {
    const rows = [];
    if (compareYearLeft !== 'Nothing') {
      const year = parseInt(compareYearLeft, 10);
      const data = chartDataByYear[year];
      if (data) rows.push({ year, data, isLeft: true });
    }
    if (compareYearRight !== 'Nothing') {
      const year = parseInt(compareYearRight, 10);
      const data = chartDataByYear[year];
      if (data) {
        // Prevent duplicate rows if both side selects point to the same year (though dropdown disables it)
        if (!rows.some(x => x.year === year)) {
          rows.push({ year, data, isLeft: false });
        }
      }
    }
    return rows;
  }, [chartDataByYear, compareYearLeft, compareYearRight]);

  // Synchronize Y-axis scales: calculate minimum and maximum values across all visible datasets
  const { yMin, yMax } = useMemo(() => {
    if (visibleCharts.length === 0) {
      return { yMin: undefined, yMax: undefined };
    }

    const allVals = [];
    visibleCharts.forEach(({ data }) => {
      if (data.Sales) allVals.push(...data.Sales);
      if (smaVisible && data.Sma) {
        allVals.push(...data.Sma.filter(v => v !== null));
      }
    });

    if (allVals.length === 0) {
      return { yMin: undefined, yMax: undefined };
    }

    const dataMin = Math.min(...allVals);
    const dataMax = Math.max(...allVals);

    const range = dataMax - dataMin;
    const padding = range * 0.05 || 10;
    const yMinVal = Math.max(0, dataMin - padding);
    const yMaxVal = dataMax + padding;

    return { yMin: yMinVal, yMax: yMaxVal };
  }, [visibleCharts, smaVisible]);

  // Match live site colors
  const getSalesColor = (year) => {
    if (year === 2025) return '#606266'; // grey/muted
    if (year === 2026) return '#3984c6'; // light blue/cyan
    if (year === 2024) return '#ff9f43';
    if (year === 2023) return '#10b981';
    return '#ee4444'; // fallback red
  };

  // Swap dropdown selections Year 1 and Year 2
  const handleSwap = () => {
    const leftVal = compareYearLeft;
    const rightVal = compareYearRight;
    setCompareYearLeft(rightVal);
    setCompareYearRight(leftVal);
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

  const showBoth = compareYearLeft !== 'Nothing' && compareYearRight !== 'Nothing';

  return (
    <div>
      {/* Filters & Control bar matching .chart-containerTop .chart-filtersMain */}
      <div className="chart-containerTop">
        <div className="chart-filtersMain">
          {/* Compare dropdown selection */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '70px', position: 'relative', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Compare</span>
            <span className="small-select">
              <select
                id="selCalTypeFiscalorCal"
                value={compareMode === 'fiscal' ? '1' : '2'}
                onChange={(e) => setCompareMode(e.target.value === '1' ? 'fiscal' : 'calendar')}
              >
                <option value="1">Fiscal</option>
                <option value="2">Calendar</option>
              </select>
            </span>
          </span>

          {/* Comparative Year 1 dropdown */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span className="small-select">
              <select
                id="selCalType2"
                value={compareYearLeft}
                onChange={(e) => setCompareYearLeft(e.target.value)}
              >
                <option value="Nothing">Nothing</option>
                {availableYears.map(year => (
                  <option
                    key={year}
                    value={year.toString()}
                    disabled={compareYearRight === year.toString()}
                  >
                    {year}
                  </option>
                ))}
              </select>
            </span>
          </span>

          {/* Separator "with" text */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '40px', position: 'relative', textAlign: 'center', marginRight: '5px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>with</span>
            <span className="small-select">
              <select
                id="selCalType1"
                value={compareYearRight}
                onChange={(e) => setCompareYearRight(e.target.value)}
              >
                <option value="Nothing">Nothing</option>
                {availableYears.map(year => (
                  <option
                    key={year}
                    value={year.toString()}
                    disabled={compareYearLeft === year.toString()}
                  >
                    {year}
                  </option>
                ))}
              </select>
            </span>
          </span>

          {/* Mode/Granularity dropdown */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span className="small-select">
              <select
                id="selCalTypeDWMQY"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
              >
                <option value="D">Daily</option>
                <option value="W">Weekly</option>
                <option value="Q">Quarterly</option>
                <option value="Y">Yearly</option>
              </select>
            </span>
          </span>

          {/* SMA toggler */}
          <label id="lblchkSma" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', userSelect: 'none' }}>
            <input
              type="checkbox"
              id="chkSma"
              checked={smaVisible}
              onChange={() => setSmaVisible(!smaVisible)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>SMA</span>
          </label>
        </div>
      </div>

      {/* Styled Selector segments */}
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', top: '-10px', marginBottom: '15px' }}>
        <div className="img-radio-group">
          {/* Trends subtab */}
          <label className="img-radio">
            <input
              id="rad_AnlT_01"
              type="radio"
              name="top_analytics_group"
              checked={activeSubTab === 'trends'}
              onChange={() => setActiveSubTab('trends')}
            />
            <div className="radio-card">
              {activeSubTab === 'trends' && (
                <>
                  <div className="borderbar top-left" />
                  <div className="borderbar top-right" />
                  <div className="borderbar bottom-left" />
                  <div className="borderbar bottom-right" />
                </>
              )}
              <img className="radio-icon" src={activeSubTab === 'trends' ? TrendsSelIcon : TrendsIcon} alt="Trends" />
              <span>Trends</span>
            </div>
          </label>

          {/* Extrapolate (disabled) */}
          <label className="img-radio">
            <input
              type="radio"
              name="top_analytics_group"
              disabled
            />
            <div className="radio-card disabled-card">
              <img className="radio-icon" src={ExtrapolateIcon} alt="Extrapolate" />
              <span>Extrapolate</span>
            </div>
          </label>

          {/* Lift by Promotion (disabled) */}
          <label className="img-radio">
            <input
              type="radio"
              name="top_analytics_group"
              disabled
            />
            <div className="radio-card disabled-card">
              <img className="radio-icon" src={LbpIcon} alt="Lift by Promotion" />
              <span>Lift by Promotion</span>
            </div>
          </label>
        </div>
      </div>

      {/* Main Charts card */}
      <div className="allAnltcCharts">
        {loading ? (
          <div className="loading-view" style={{ width: '100%' }}>Loading chart data...</div>
        ) : error ? (
          <div className="error-view" style={{ color: 'var(--danger-color)', width: '100%' }}>{error}</div>
        ) : visibleCharts.length === 0 ? (
          <div className="error-view" style={{ width: '100%' }}>Select a year to generate the sales trend chart.</div>
        ) : (
          <>
            {visibleCharts.map(({ year, data }) => {
              const colClass = showBoth ? 'col s12 m12 l6 chart-wrapper-left' : 'col s12 m12 l12 chart-wrapper-left';
              const chartId = `salesChart_${year}`;
              const title = `Year ${year} Sales Data (${viewMode === 'D' ? 'Daily' : viewMode === 'W' ? 'Weekly' : viewMode === 'Q' ? 'Quarterly' : 'Yearly'})`;
              const color = getSalesColor(year);

              return (
                <div key={year} className={colClass} style={{ flexGrow: 1 }}>
                  <AnalyticsChart
                    id={chartId}
                    year={year}
                    title={title}
                    labels={data.Labels}
                    salesData={data.Sales}
                    smaData={data.Sma}
                    smaVisible={smaVisible}
                    yMin={yMin}
                    yMax={yMax}
                    salesColor={color}
                  />
                </div>
              );
            })}

            {/* Float centered swap button displayed when 2 charts are visible */}
            {showBoth && (
              <span id="spnSwap" className="swap-btn" onClick={handleSwap} title="Swap comparative years">
                <i className="material-icons">swap_horiz</i>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
