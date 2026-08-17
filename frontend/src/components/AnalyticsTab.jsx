import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Chart, registerables } from "chart.js";
import { fetchSalesChartByDateRange } from "../services/api";
import { generateAnalyticsPDF } from "../utils/pdfExportUtils";

// Import local icons for the segment cards
import TrendsIcon from "../assets/Trends.png";
import TrendsSelIcon from "../assets/Trends_sel.png";
import ExtrapolateIcon from "../assets/Extrapolate.png";
import LbpIcon from "../assets/LBP.png";

// Register all Chart.js modules
Chart.register(...registerables);

const SMA_PERIOD = 7;

function generate10YAxisTicks(minVal, maxVal) {
  if (
    !Number.isFinite(minVal) ||
    !Number.isFinite(maxVal) ||
    minVal >= maxVal
  ) {
    return [];
  }
  const rawStep = (maxVal - minVal) / 9;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / Math.pow(10, exponent);
  let niceFraction;
  if (fraction <= 1.5) niceFraction = 1;
  else if (fraction <= 3) niceFraction = 2;
  else if (fraction <= 7) niceFraction = 5;
  else niceFraction = 10;
  let step = niceFraction * Math.pow(10, exponent);

  let startTick = Math.ceil(minVal / step) * step;
  // If startTick is too close to minVal (e.g. 357000 vs 356839.6), skip to next round step (358000)
  if (startTick - minVal < 0.35 * step) {
    startTick += step;
  }

  const midTicks = [];
  for (let val = startTick; val < maxVal; val += step) {
    // If val is too close to maxVal (e.g. within 0.35 * step of 365582.4), skip it
    if (maxVal - val < 0.35 * step) {
      continue;
    }
    midTicks.push(val);
  }

  if (midTicks.length === 0) {
    const fallbackStep = (maxVal - minVal) / 9;
    for (let i = 1; i <= 8; i++) {
      midTicks.push(Math.round((minVal + i * fallbackStep) / 100) * 100);
    }
  }

  const allTicks = [minVal, ...midTicks, maxVal];
  const uniqueTicks = Array.from(new Set(allTicks)).sort((a, b) => a - b);
  return uniqueTicks.map((v) => ({ value: v }));
}

/**
 * Self-contained Chart Component using HTML5 canvas & Chart.js
 */
function AnalyticsChart({
  id,
  year,
  title,
  labels,
  salesData,
  smaData,
  smaVisible,
  yMin,
  yMax,
  salesColor,
  currencyMode = "1",
}) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");

    // Compute SMA trend color: green if last point >= first point, red otherwise
    const validSma = (smaData || []).filter((v) => v !== null);
    let smaColor = "#00a651"; // default green
    if (validSma.length >= 2) {
      const lastVal = validSma[validSma.length - 1];
      const firstVal = validSma[0];
      if (lastVal < firstVal) {
        smaColor = "#d32f2f"; // trending down (red)
      }
    }

    const curLabel = currencyMode === "2" ? "Sales NZ$" : "Sales AU$";

    const datasets = [
      {
        label: curLabel,
        data: salesData || [],
        borderColor: salesColor,
        backgroundColor: salesColor,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0,
        fill: false,
      },
    ];

    if (smaData && smaData.length > 0) {
      datasets.push({
        label: "7 Day SMA",
        data: smaData,
        borderColor: smaColor,
        backgroundColor: smaColor,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0,
        fill: false,
        hidden: !smaVisible,
      });
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    chartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels || [],
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              boxWidth: 30,
              boxHeight: 12,
              font: {
                family: "Montserrat",
                size: 14,
                weight: "600",
              },
              generateLabels: function (chart) {
                const original =
                  Chart.defaults.plugins.legend.labels.generateLabels;
                const legendItems = original.call(this, chart);
                legendItems.forEach((item) => {
                  item.hidden = false;
                });
                return legendItems;
              },
            },
          },
          tooltip: {
            enabled: true,
            titleFont: { family: "Montserrat", size: 14, weight: "bold" },
            bodyFont: { family: "Montserrat", size: 13 },
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || "";
                if (label) {
                  label += ": ";
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(context.parsed.y);
                }
                return label;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            border: {
              display: false,
            },
            ticks: {
              autoSkip: true,
              maxTicksLimit: 5,
              maxRotation: 0,
              minRotation: 0,
              color: "#000000",
              font: {
                family: "Montserrat",
                size: 11,
              },
            },
          },
          y: {
            grid: {
              color: "#f1f5f9", // soft grid lines
            },
            border: {
              display: false,
            },
            title: {
              display: true,
              text: curLabel,
              font: {
                family: "Montserrat",
                size: 12,
                weight: "bold",
              },
            },
            min: yMin,
            max: yMax,
            afterBuildTicks: function (axis) {
              const customTicks = generate10YAxisTicks(axis.min, axis.max);
              if (customTicks.length > 0) {
                axis.ticks = customTicks;
              }
            },
            ticks: {
              includeBounds: true,
              color: "#000",
              font: {
                family: "Montserrat",
                size: 11,
              },
              callback: function (value, index, ticks) {
                const isBoundary = index === 0 || index === ticks.length - 1;
                if (isBoundary) {
                  return Number(value).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  });
                }
                return Math.round(value).toLocaleString();
              },
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [labels, salesData, smaData, yMin, yMax, salesColor, currencyMode]);

  // Smoothly show/hide SMA line without recreating or re-animating the whole chart
  useEffect(() => {
    if (
      chartInstanceRef.current &&
      chartInstanceRef.current.data.datasets.length > 1
    ) {
      chartInstanceRef.current.setDatasetVisibility(1, smaVisible);
      chartInstanceRef.current.update("none");
    }
  }, [smaVisible]);

  return (
    <div
      className="chart-container"
      style={{ height: "520px", position: "relative" }}
    >
      <h4
        style={{
          fontSize: "16px",
          fontWeight: 500,
          color: "#475569",
          textAlign: "left",
          marginBottom: "10px",
          marginLeft: "28px",
        }}
      >
        {title}
      </h4>
      <div style={{ position: "relative", width: "100%", height: "450px" }}>
        <canvas ref={canvasRef} id={id} />
      </div>
    </div>
  );
}

/**
 * Custom styled dropdown that supports colored strikethrough on disabled items.
 * Native <select>/<option> elements cannot reliably render text-decoration cross-browser.
 */
function StyledSelect({
  id,
  value,
  onChange,
  options,
  noBorder,
  noStrike,
  caretSize = "16px",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div
      ref={ref}
      id={id}
      style={{
        position: "relative",
        display: noBorder ? "block" : "inline-block",
        width: noBorder ? "100%" : "auto",
      }}
    >
      {/* Trigger button — mimics small-select look */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: noBorder ? "space-between" : "center",
          gap: "3px",
          background: "transparent",
          border: noBorder ? "none" : "1px solid #cbd5e1",
          borderRadius: "4px",
          padding: noBorder ? "1px 0" : "1px 5px 1px 6px",
          fontFamily: "var(--font-family)",
          fontSize: "12px",
          fontWeight: 400,
          color: "var(--text-secondary)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          lineHeight: "18px",
          width: noBorder ? "100%" : "auto",
        }}
      >
        <span>{selected ? selected.label : value}</span>
        <span
          style={{
            fontSize: caretSize,
            color: "#1e293b",
            lineHeight: 1,
            marginLeft: noBorder ? "6px" : "0",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          ▾
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 3px)",
            left: 0,
            zIndex: 9999,
            background: "#fff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            minWidth: "90px",
            padding: "4px 0",
            fontSize: "12px",
            fontFamily: "var(--font-family)",
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const isDisabled = opt.disabled;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  position: "relative",
                  padding: "4px 12px",
                  cursor: isDisabled ? "default" : "pointer",
                  color: isDisabled
                    ? "#b0b8c9"
                    : isSelected
                      ? "var(--primary-color)"
                      : "var(--text-primary)",
                  fontWeight: 400,
                  background:
                    isSelected && !isDisabled ? "#f0f6ff" : "transparent",
                  userSelect: "none",
                  borderRadius: "2px",
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    isSelected && !isDisabled ? "#f0f6ff" : "transparent";
                }}
              >
                {opt.label}
                {/* Red strikethrough line overlay */}
                {isDisabled && !noStrike && (
                  <span
                    style={{
                      position: "absolute",
                      left: "8px",
                      right: "8px",
                      top: "50%",
                      height: "1px",
                      background: opt.strikeColor || "#ff2529",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsTab({
  calendarMode = "fiscal",
  currencyMode = "1",
  onCurrencyChange,
  dateParams,
  fiscalIndexes,
  onBindExportActions,
  onTimingMetrics,
}) {
  const [activeSubTab, setActiveSubTab] = useState("trends"); // trends | extrapolate | lifts
  const [activeDisabledCrossline, setActiveDisabledCrossline] = useState(null); // null | 'extrapolate' | 'lifts'
  const [compareMode, setCompareMode] = useState(calendarMode); // fiscal | calendar
  const [compareYearLeft, setCompareYearLeft] = useState("2025"); // 2025
  const [compareYearRight, setCompareYearRight] = useState("2026"); // 2026
  const [viewMode, setViewMode] = useState("D"); // D (Daily) | W (Weekly) | M (Quarterly) | Y (Yearly)
  const [smaVisible, setSmaVisible] = useState(false);

  const [chartDataByYear, setChartDataByYear] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cache of fetched chart data to prevent double loading
  const loadedMetadataRef = useRef({});

  // Years options available
  const availableYears = [2022, 2023, 2024, 2025, 2026];

  // Map calendarMode prop to internal compareMode state when it changes
  useEffect(() => {
    setCompareMode(calendarMode);
  }, [calendarMode]);

  // Hide red crosslines when clicking anywhere outside
  useEffect(() => {
    const handleDocumentClick = () => {
      setActiveDisabledCrossline(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  // Compute selected comparative years
  const selectedYears = useMemo(() => {
    const out = [];
    if (compareYearLeft !== "Nothing") out.push(parseInt(compareYearLeft, 10));
    if (compareYearRight !== "Nothing") {
      const yr = parseInt(compareYearRight, 10);
      if (!out.includes(yr)) out.push(yr);
    }
    return out;
  }, [compareYearLeft, compareYearRight]);

  // Dynamically compute exact start/end dates for each comparative year based on selected report date and mode
  const yearRanges = useMemo(() => {
    if (!dateParams) return {};

    const activeDateStr = dateParams.DT_1;
    const [, actM, actD] = activeDateStr.split("-").map(Number);
    const out = {};

    // Fiscal year ranges using database calendar mappings
    if (compareMode === "fiscal" && fiscalIndexes) {
      const { calendar, dayIndex } = fiscalIndexes;
      const activeDetails = calendar[activeDateStr];

      if (activeDetails) {
        const activeDayInYear = activeDetails.DayInYear;

        availableYears.forEach((year) => {
          const start = dayIndex[`${year}_1`] || `${year}-01-01`;
          const end = dayIndex[`${year}_${activeDayInYear}`] || `${year}-12-31`;
          out[year] = { startDate: start, endDate: end };
        });
        return out;
      }
    }

    // Calendar fallback calculations
    availableYears.forEach((year) => {
      let endD = new Date(year, actM - 1, actD);
      if (endD.getMonth() !== actM - 1) {
        endD = new Date(year, actM, 0); // Leap-safe fallback
      }
      const start = `${year}-01-01`;
      const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
      out[year] = { startDate: start, endDate: end };
    });

    return out;
  }, [compareMode, dateParams, fiscalIndexes]);

  // Fetch chart data when selected years, date ranges, viewMode, or currencyMode change
  const loadChart = useCallback(
    async (years, mode, curMode) => {
      if (years.length === 0) {
        setChartDataByYear({});
        return;
      }

      const formatTime = (d) => {
        const pad = (n, len = 2) => String(n).padStart(len, "0");
        const ms = pad(d.getMilliseconds(), 3);
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
      };

      const startTime = new Date();
      const startedStr = formatTime(startTime);

      // Determine which years need to be fetched
      const yearsToFetch = years.filter((year) => {
        const range = yearRanges[year] || {
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
        };
        const cached = loadedMetadataRef.current[year];
        if (
          cached &&
          cached.startDate === range.startDate &&
          cached.endDate === range.endDate &&
          cached.mode === mode &&
          cached.currencyMode === curMode
        ) {
          return false; // Already cached and matches criteria
        }
        return true;
      });

      if (yearsToFetch.length === 0) {
        // All requested years are already cached, update state from cache immediately
        const next = {};
        years.forEach((year) => {
          if (loadedMetadataRef.current[year]) {
            next[year] = loadedMetadataRef.current[year].data;
          }
        });
        setChartDataByYear(next);
        const endTime = new Date();
        const durationSec = ((endTime - startTime) / 1000).toFixed(3);
        if (onTimingMetrics) {
          onTimingMetrics({
            rowCount: 49654,
            started: startedStr,
            ended: formatTime(endTime),
            duration: `${durationSec} sec`,
          });
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const fetchedPairs = await Promise.all(
          yearsToFetch.map(async (year) => {
            const range = yearRanges[year] || {
              startDate: `${year}-01-01`,
              endDate: `${year}-12-31`,
            };
            const data = await fetchSalesChartByDateRange(
              range.startDate,
              range.endDate,
              mode,
              SMA_PERIOD,
            );
            return {
              year,
              data,
              startDate: range.startDate,
              endDate: range.endDate,
            };
          }),
        );

        // Save new results to cache
        fetchedPairs.forEach((item) => {
          loadedMetadataRef.current[item.year] = {
            startDate: item.startDate,
            endDate: item.endDate,
            mode: mode,
            currencyMode: curMode,
            data: item.data,
          };
        });

        // Construct output from cache for all selected years
        const next = {};
        years.forEach((year) => {
          if (loadedMetadataRef.current[year]) {
            next[year] = loadedMetadataRef.current[year].data;
          }
        });
        setChartDataByYear(next);

        const endTime = new Date();
        const durationSec = ((endTime - startTime) / 1000).toFixed(3);
        if (onTimingMetrics) {
          onTimingMetrics({
            rowCount: 49654,
            started: startedStr,
            ended: formatTime(endTime),
            duration: `${durationSec} sec`,
          });
        }
      } catch (err) {
        console.error("[AnalyticsTab] Load chart error:", err);
        setError(err.message || "Failed to load chart data");
        setChartDataByYear({});
      } finally {
        setLoading(false);
      }
    },
    [yearRanges, onTimingMetrics],
  );

  useEffect(() => {
    loadChart(selectedYears, viewMode, currencyMode);
  }, [selectedYears, viewMode, currencyMode, loadChart]);

  const visibleCharts = useMemo(() => {
    const rows = [];
    if (compareYearLeft !== "Nothing") {
      const year = parseInt(compareYearLeft, 10);
      const data = chartDataByYear[year];
      if (data) rows.push({ year, data, isLeft: true });
    }
    if (compareYearRight !== "Nothing") {
      const year = parseInt(compareYearRight, 10);
      const data = chartDataByYear[year];
      if (data) {
        // Prevent duplicate rows if both side selects point to the same year (though dropdown disables it)
        if (!rows.some((x) => x.year === year)) {
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
        allVals.push(...data.Sma.filter((v) => v !== null));
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
    if (year === 2025) return "#495057"; // dark grey / black
    if (year === 2026) return "#3984c6"; // light blue/cyan
    if (year === 2024) return "#ff9f43";
    if (year === 2023) return "#10b981";
    return "#ee4444"; // fallback red
  };

  // Swap dropdown selections Year 1 and Year 2
  const handleSwap = () => {
    const leftVal = compareYearLeft;
    const rightVal = compareYearRight;
    setCompareYearLeft(rightVal);
    setCompareYearRight(leftVal);
  };

  useEffect(() => {
    if (onBindExportActions) {
      onBindExportActions({
        exportPDF: () => generateAnalyticsPDF("dAnltcsCharts", false),
        printPDF: () => generateAnalyticsPDF("dAnltcsCharts", true),
      });
    }
  }, [onBindExportActions]);

  const showBoth =
    compareYearLeft !== "Nothing" && compareYearRight !== "Nothing";

  return (
    <div className="analytics-tab-wrapper">
      {/* Currency Dropdown matching Dotnet #hTopCurType2 / #selCurType2 */}
      <div style={{ padding: "0 0 6px 0", marginTop: "-22px" }}>
        <div style={{ display: "inline-block" }}>
          <StyledSelect
            id="selCurType2"
            value={currencyMode}
            onChange={(val) => onCurrencyChange && onCurrencyChange(val)}
            options={[
              { value: "1", label: "AU$" },
              { value: "2", label: "NZ$" },
            ]}
            noBorder={true}
            caretSize="20px"
          />
        </div>
      </div>

      {/* Filters & Control bar matching .chart-containerTop .chart-filtersMain */}
      <div className="chart-containerTop">
        <div
          className="chart-filtersMain"
          style={{
            display: "flex",
            alignItems: "flex-start",
            width: "100%",
            padding: "12px 0px",
            background: "none",
            border: "none",
            boxShadow: "none",
          }}
        >
          {/* Column 1 (Left Section): Filter Controls Group */}
          <div
            style={{
              flex: "1 1 0%",
              display: "flex",
              justifyContent: "flex-start",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "flex-start", gap: "22px" }}
            >
              {/* 1. Compare Label */}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 400,
                  color: "var(--text-secondary)",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Compare
              </span>

              {/* 2. Fiscal / Calendar select */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "24px",
                }}
              >
                <StyledSelect
                  id="selCalTypeFiscalorCal"
                  value={compareMode === "fiscal" ? "1" : "2"}
                  onChange={(val) =>
                    setCompareMode(val === "1" ? "fiscal" : "calendar")
                  }
                  options={[
                    { value: "1", label: "Fiscal" },
                    { value: "2", label: "Calendar" },
                  ]}
                  noBorder={true}
                />
              </span>

              {/* 3. Comparative Year 1 select (Left: 2026) */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "24px",
                }}
              >
                <StyledSelect
                  id="selCalType2"
                  value={compareYearLeft}
                  onChange={(val) => setCompareYearLeft(val)}
                  options={[
                    { value: "Nothing", label: "Nothing" },
                    ...availableYears.map((year) => ({
                      value: year.toString(),
                      label: year.toString(),
                      disabled:
                        year < 2025 || compareYearRight === year.toString(),
                    })),
                  ]}
                  noBorder={true}
                />
              </span>

              {/* 4. Separator "with" text */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "24px",
                  fontSize: "13px",
                  fontWeight: 400,
                  color: "var(--text-secondary)",
                }}
              >
                with
              </span>

              {/* Vertical Stack: Year 2 Select, Mode Select, SMA Checkbox */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  alignItems: "flex-start",
                }}
              >
                {/* Row 1: Year 2 Select (aligned caret arrow at 76px width) */}
                <div
                  style={{
                    height: "24px",
                    width: "76px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <StyledSelect
                    id="selCalType1"
                    value={compareYearRight}
                    onChange={(val) => setCompareYearRight(val)}
                    options={[
                      { value: "Nothing", label: "Nothing" },
                      ...availableYears.map((year) => ({
                        value: year.toString(),
                        label: year.toString(),
                        disabled:
                          year < 2025 || compareYearLeft === year.toString(),
                      })),
                    ]}
                    noBorder={true}
                  />
                </div>

                {/* Row 2: Mode/Granularity Select (aligned caret arrow at 76px width) */}
                <div
                  style={{
                    height: "24px",
                    width: "76px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <StyledSelect
                    id="selCalTypeDWMQY"
                    value={viewMode}
                    onChange={(val) => setViewMode(val)}
                    options={[
                      { value: "D", label: "Daily" },
                      {
                        value: "W",
                        label: "Weekly",
                        disabled: true,
                      },
                      {
                        value: "Q",
                        label: "Quarterly",
                        disabled: true,
                      },
                      {
                        value: "Y",
                        label: "Yearly",
                        disabled: true,
                      },
                    ]}
                    noBorder={true}
                  />
                </div>

                {/* Row 3: SMA Checkbox & SMA Period Select (aligned caret arrow at 76px width) */}
                <div
                  style={{
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <label
                    id="lblchkSma"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      userSelect: "none",
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      id="chkSma"
                      checked={smaVisible}
                      onChange={() => setSmaVisible(!smaVisible)}
                      style={{ cursor: "pointer", margin: 0 }}
                    />
                  </label>
                  <div style={{ width: "58px" }}>
                    <StyledSelect
                      id="selSmaPeriod"
                      value="7"
                      onChange={(val) => {
                        if (val === "7") {
                          setSmaVisible(true);
                        }
                      }}
                      options={[
                        { value: "7", label: "7 Day" },
                        {
                          value: "28",
                          label: "28 Day",
                          disabled: true,
                        },
                        {
                          value: "30",
                          label: "30 Day",
                          disabled: true,
                        },
                        {
                          value: "91",
                          label: "91 Day",
                          disabled: true,
                        },
                        {
                          value: "364",
                          label: "364 Day",
                          disabled: true,
                        },
                      ]}
                      noBorder={true}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                      marginLeft: "8px",
                      marginTop: "4px",
                    }}
                  >
                    SMA
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2 (Center Section): Segment Selectors (Trends, Extrapolate, LBP) */}
          <div
            style={{
              flex: "1 1 0%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              className="img-radio-group"
              style={{ display: "flex", gap: "10px" }}
            >
              <div className="borderbar top-left"></div>
              <div className="borderbar top-right"></div>
              <div className="borderbar bottom-left"></div>
              <div className="borderbar bottom-right"></div>

              {/* Trends subtab */}
              <label className="img-radio" style={{ margin: 0 }}>
                <input
                  id="rad_AnlT_01"
                  type="radio"
                  name="top_analytics_group"
                  checked={activeSubTab === "trends"}
                  onChange={() => setActiveSubTab("trends")}
                />
                <div className="radio-card">
                  <div className="icon-wrapper">
                    <img
                      className="radio-icon"
                      src={
                        activeSubTab === "trends" ? TrendsSelIcon : TrendsIcon
                      }
                      alt="Trends"
                    />
                  </div>
                  <span>Trends</span>
                </div>
              </label>

              {/* Extrapolate (disabled) */}
              <label
                className="img-radio"
                style={{ margin: 0, cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDisabledCrossline("extrapolate");
                }}
              >
                <input type="radio" name="top_analytics_group" disabled />
                <div className="radio-card" style={{ cursor: "pointer" }}>
                  <div className="icon-wrapper">
                    <img
                      className="radio-icon"
                      src={ExtrapolateIcon}
                      alt="Extrapolate"
                    />
                    {activeDisabledCrossline === "extrapolate" && (
                      <>
                        <div className="red-cross-line line1" />
                        <div className="red-cross-line line2" />
                      </>
                    )}
                  </div>
                  <span>Extrapolate</span>
                </div>
              </label>

              {/* Lift by Promotion (disabled) */}
              <label
                className="img-radio"
                style={{ margin: 0, cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDisabledCrossline("lifts");
                }}
              >
                <input type="radio" name="top_analytics_group" disabled />
                <div className="radio-card" style={{ cursor: "pointer" }}>
                  <div className="icon-wrapper">
                    <img
                      className="radio-icon"
                      src={LbpIcon}
                      alt="Lift by Promotion"
                    />
                    {activeDisabledCrossline === "lifts" && (
                      <>
                        <div className="red-cross-line line1" />
                        <div className="red-cross-line line2" />
                      </>
                    )}
                  </div>
                  <span>Lift by Promotion</span>
                </div>
              </label>
            </div>
          </div>

          {/* Column 3 (Right Section): Spacer to balance centering */}
          <div style={{ flex: "1 1 0%" }} />
        </div>
      </div>

      {/* Main Charts card */}
      <div
        id="dAnltcsCharts"
        className="allAnltcCharts"
        style={{
          display: "flex",
          flexDirection: showBoth ? "row" : "column",
          flexWrap: "wrap",
          gap: "30px",
          position: "relative",
          marginTop: "20px",
          width: "100%",
          boxShadow: "none",
          border: "none",
          background: "none",
          padding: "0",
        }}
      >
        {loading ? (
          <div className="loading-view" style={{ width: "100%" }}>
            Loading chart data...
          </div>
        ) : error ? (
          <div
            className="error-view"
            style={{ color: "var(--danger-color)", width: "100%" }}
          >
            {error}
          </div>
        ) : visibleCharts.length === 0 ? (
          <div className="error-view" style={{ width: "100%" }}>
            Select a year to generate the sales trend chart.
          </div>
        ) : (
          <>
            {visibleCharts.map(({ year, data }) => {
              const chartId = `salesChart_${year}`;
              const compareModeTitle =
                compareMode.charAt(0).toUpperCase() + compareMode.slice(1);
              const intervalLabel =
                viewMode === "D"
                  ? "Daily"
                  : viewMode === "W"
                    ? "Weekly"
                    : viewMode === "Q"
                      ? "Quarterly"
                      : "Yearly";
              const title = `Sales Trend - ${compareModeTitle} ${year} (${intervalLabel})`;
              const color = getSalesColor(year);

              return (
                <div
                  key={year}
                  style={{
                    flex: showBoth ? "1 1 calc(50% - 20px)" : "1 1 100%",
                    minWidth: showBoth ? "300px" : "100%",
                    position: "relative",
                  }}
                >
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
                    currencyMode={currencyMode}
                  />
                </div>
              );
            })}

            {/* Float centered swap button displayed when 2 charts are visible */}
            {showBoth && (
              <span
                id="spnSwap"
                className="swap-btn"
                onClick={handleSwap}
                title="Swap graphs"
              >
                <i className="material-icons">swap_horiz</i>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
