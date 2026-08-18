import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Login from "./components/Login";
import AllSalesTab from "./components/AllSalesTab";
import LeadersTab from "./components/LeadersTab";
import LaggardsTab from "./components/LaggardsTab";
import AnalyticsTab from "./components/AnalyticsTab";
import {
  fetchLatestDate,
  fetchStoreDetails,
  fetchSalesPivotSum,
  fetchAvailableDates,
} from "./services/api";
import {
  buildFiscalIndexes,
  computeDateParamsFromFiscal,
  computeCalendarDateParams,
} from "./utils/dateUtils";
import { MdOutlineArrowDropDown } from "react-icons/md";
import { LiaBroomSolid } from "react-icons/lia";
import excelImg from "./assets/excel.png";
import csvImg from "./assets/csv.png";
import clearSearchImg from "./assets/clearsearc4.png";
import loader3Img from "./assets/loader3.gif";
import { BsDownload, BsPrinter, BsSearch } from "react-icons/bs";

function CustomHeaderDropdown({ id, value, options, onChange, style }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <span
      id={id}
      ref={dropdownRef}
      className="clsAllTopics small-select"
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        cursor: "pointer",
        userSelect: "none",
        ...style,
      }}
      onClick={() => setIsOpen(!isOpen)}
    >
      <span
        style={{
          fontSize: "12px",
          color: "#475569",
          fontFamily: "var(--font-family)",
        }}
      >
        {selectedOption.label}
      </span>
      <i
        className="material-icons"
        style={{
          fontSize: "17px",
          marginLeft: "1px",
          color: "#475569",
          pointerEvents: "none",
          transition: "transform 0.2s ease",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        arrow_drop_down
      </i>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "2px",
            backgroundColor: "#ffffff",
            boxShadow:
              "0 2px 8px 0 rgba(0, 0, 0, 0.18), 0 1px 3px 0 rgba(0, 0, 0, 0.12)",
            borderRadius: "2px",
            zIndex: 9999,
            minWidth: "75px",
            overflow: "hidden",
            padding: "2px 0",
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  color: "#42a5f5",
                  backgroundColor: isSelected ? "#eeeeee" : "#ffffff",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    e.currentTarget.style.backgroundColor = "#f5f5f5";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    e.currentTarget.style.backgroundColor = "#ffffff";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

function formatTime(d) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const ms = pad(d.getMilliseconds(), 3);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

export default function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem("login_timestamp");
  });

  // Global states
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarMode, setCalendarMode] = useState("fiscal"); // fiscal | calendar
  const [activeTab, setActiveTab] = useState("allSales"); // allSales | topSales | laggards | analytics
  const [search, setSearch] = useState("");

  // Loaded metadata
  const [availableDates, setAvailableDates] = useState([]);

  // Primary pivot data
  const [pivotData, setPivotData] = useState([]);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Calendar indexes
  const [fiscalIndexes, setFiscalIndexes] = useState(null);

  // Custom calendar picker popup state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(1); // 0-based

  // Currency & Scaling states
  const [currencyMode, setCurrencyMode] = useState("1"); // '1' = AU$, '2' = NZ$
  const [currencyRates, setCurrencyRates] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Benchmark timing metrics
  const [timingMetrics, setTimingMetrics] = useState({
    rowCount: 0,
    started: "",
    ended: "",
    duration: "0.00 sec",
  });

  // Generated time label
  const generatedTimeStr = useMemo(() => {
    const now = new Date();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const h = now.getHours();
    const h12 = h % 12 || 12;
    const ampm = h >= 12 ? "PM" : "AM";
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${now.getFullYear()} ${months[now.getMonth()]} ${String(now.getDate()).padStart(2, "0")}| ${h12}:${mm} ${ampm}USA, Pacific`;
  }, []);

  // Export action triggers bound from child
  const [exportActions, setExportActions] = useState(null);

  const handleLoginSuccess = () => {
    sessionStorage.setItem("login_timestamp", Date.now().toString());
    setIsAuthenticated(true);
  };

  // Fetch initial setup data
  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadInitialMetadata() {
      try {
        const [latestDateVal, ddsVal, datesVal] = await Promise.all([
          fetchLatestDate(),
          fetchStoreDetails(),
          fetchAvailableDates(),
        ]);

        const selected =
          latestDateVal ||
          (datesVal.length > 0 ? datesVal[datesVal.length - 1] : "2026-02-10");
        setSelectedDate(selected);
        setAvailableDates(datesVal || []);

        const indexes = buildFiscalIndexes(ddsVal.FiscalCalendar || []);
        setFiscalIndexes(indexes);
        setCurrencyRates(ddsVal.Currency_Cal || []);

        const [y, m] = selected.split("-").map(Number);
        setCalYear(y);
        setCalMonth(m - 1);
      } catch (err) {
        console.error("[App] Failed to load metadata:", err);
      }
    }

    loadInitialMetadata();
  }, [isAuthenticated]);

  // Compute date parameters
  const dateParams = useMemo(() => {
    if (!selectedDate) return null;
    if (calendarMode === "fiscal" && fiscalIndexes) {
      return (
        computeDateParamsFromFiscal(selectedDate, fiscalIndexes) ||
        computeCalendarDateParams(selectedDate, fiscalIndexes)
      );
    }
    return computeCalendarDateParams(selectedDate, fiscalIndexes);
  }, [selectedDate, calendarMode, fiscalIndexes]);

  // Currency conversion mapping when NZ$ is active matching Dotnet GetFlashData.js lines 709-736
  const processedPivotData = useMemo(() => {
    if (!pivotData || pivotData.length === 0) return [];
    if (
      currencyMode !== "2" ||
      !currencyRates ||
      currencyRates.length === 0 ||
      !dateParams
    ) {
      return pivotData;
    }

    const normalizeDate = (dStr) => {
      if (!dStr) return "";
      const s = String(dStr).trim();
      const match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (match) {
        const yyyy = match[1];
        const mm = String(match[2]).padStart(2, "0");
        const dd = String(match[3]).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
      return s;
    };

    const rateMap = {};
    currencyRates.forEach((r) => {
      if (r.CDate) {
        const key = normalizeDate(r.CDate);
        rateMap[key] = parseFloat(r.AuDEquiv) || 1;
      }
    });

    const dt1Key = normalizeDate(dateParams.DT_1);
    const dt2Key = normalizeDate(dateParams.DT_2);

    const defaultRate =
      parseFloat(currencyRates[currencyRates.length - 1]?.AuDEquiv) || 1.0825;
    const auEqStart = rateMap[dt1Key] || defaultRate;
    const auEqEnd = rateMap[dt2Key] || defaultRate;

    const calcComp = (cy, ly) => {
      const cyNum = Number(cy) || 0;
      const lyNum = Number(ly) || 0;
      if (cyNum === 0 || lyNum === 0) return 0;
      return parseFloat((((cyNum - lyNum) / lyNum) * 100).toFixed(2));
    };

    return pivotData.map((row) => {
      if (row.IS_TERRITORY_TOTAL || row.IS_GRAND_TOTAL) return row;

      const dayCY =
        row.DAY_SALES_CY > 0
          ? Number((row.DAY_SALES_CY * auEqStart).toFixed(0))
          : row.DAY_SALES_CY;
      const dayLY =
        row.DAY_SALES_LY > 0
          ? Number((row.DAY_SALES_LY * auEqEnd).toFixed(0))
          : row.DAY_SALES_LY;

      const wtdCY =
        row.WTD_SALES_CY > 0
          ? Number((row.WTD_SALES_CY * auEqStart).toFixed(0))
          : row.WTD_SALES_CY;
      const wtdLY =
        row.WTD_SALES_LY > 0
          ? Number((row.WTD_SALES_LY * auEqEnd).toFixed(0))
          : row.WTD_SALES_LY;

      const qtdCY =
        row.QTD_SALES_CY > 0
          ? Number((row.QTD_SALES_CY * auEqStart).toFixed(0))
          : row.QTD_SALES_CY;
      const qtdLY =
        row.QTD_SALES_LY > 0
          ? Number((row.QTD_SALES_LY * auEqEnd).toFixed(0))
          : row.QTD_SALES_LY;

      const ytdCY =
        row.YTD_SALES_CY > 0
          ? Number((row.YTD_SALES_CY * auEqStart).toFixed(0))
          : row.YTD_SALES_CY;
      const ytdLY =
        row.YTD_SALES_LY > 0
          ? Number((row.YTD_SALES_LY * auEqEnd).toFixed(0))
          : row.YTD_SALES_LY;

      return {
        ...row,
        DAY_SALES_CY: dayCY,
        DAY_SALES_LY: dayLY,
        DAY_SALES_COMP: calcComp(dayCY, dayLY),
        WTD_SALES_CY: wtdCY,
        WTD_SALES_LY: wtdLY,
        WTD_SALES_COMP: calcComp(wtdCY, wtdLY),
        QTD_SALES_CY: qtdCY,
        QTD_SALES_LY: qtdLY,
        QTD_SALES_COMP: calcComp(qtdCY, qtdLY),
        YTD_SALES_CY: ytdCY,
        YTD_SALES_LY: ytdLY,
        YTD_SALES_COMP: calcComp(ytdCY, ytdLY),
      };
    });
  }, [pivotData, currencyMode, currencyRates, dateParams]);

  // Fetch sales records based on date parameters
  useEffect(() => {
    if (!isAuthenticated || !dateParams) return;

    async function loadSalesPivot() {
      const formatTime = (d) => {
        const pad = (n, len = 2) => String(n).padStart(len, "0");
        const ms = pad(d.getMilliseconds(), 3);
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
      };

      const startTime = new Date();
      const startedStr = formatTime(startTime);
      setPivotLoading(true);

      try {
        const params = {
          DT_1: dateParams.DT_1,
          DT_2: dateParams.DT_2,
          P_WTD_1_S: dateParams.P_WTD_1_S,
          P_WTD_1_E: dateParams.P_WTD_1_E,
          P_WTD_2_S: dateParams.P_WTD_2_S,
          P_WTD_2_E: dateParams.P_WTD_2_E,
          P_QTD_1_S: dateParams.P_QTD_1_S,
          P_QTD_1_E: dateParams.P_QTD_1_E,
          P_QTD_2_S: dateParams.P_QTD_2_S,
          P_QTD_2_E: dateParams.P_QTD_2_E,
          P_YTD_1_S: dateParams.P_YTD_1_S,
          P_YTD_1_E: dateParams.P_YTD_1_E,
          P_YTD_2_S: dateParams.P_YTD_2_S,
          P_YTD_2_E: dateParams.P_YTD_2_E,
        };

        const res = await fetchSalesPivotSum(params);
        setPivotData(res.PivotData || []);

        const endTime = new Date();
        const durationSec = ((endTime - startTime) / 1000).toFixed(3);

        setTimingMetrics({
          rowCount: res.TotalCount || res.PivotData?.length || 0,
          started: startedStr,
          ended: formatTime(endTime),
          duration: `${durationSec} sec`,
        });
      } catch (err) {
        console.error("[App] Failed to load pivotsum:", err);
      } finally {
        setPivotLoading(false);
      }
    }

    loadSalesPivot();
  }, [isAuthenticated, dateParams, refreshTrigger]);

  // Calendar picker grid helpers
  const calendarRows = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [calYear, calMonth]);

  const changeMonth = (offset) => {
    let nextMonth = calMonth + offset;
    let nextYear = calYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setCalYear(nextYear);
    setCalMonth(nextMonth);
  };

  const handleCurrencyChange = (val) => {
    if (val === currencyMode) return;
    const startTime = new Date();
    const startedStr = formatTime(startTime);
    setPivotLoading(true);
    setCurrencyMode(val);
    setTimeout(() => {
      const endTime = new Date();
      const durationSec = ((endTime - startTime) / 1000).toFixed(3);
      setTimingMetrics((prev) => ({
        ...prev,
        started: startedStr,
        ended: formatTime(endTime),
        duration: `${durationSec} sec`,
      }));
      setPivotLoading(false);
    }, 350);
  };

  const handleCalendarModeChange = (val) => {
    const mode = val === "1" ? "fiscal" : "calendar";
    if (mode === calendarMode) return;
    setCalendarMode(mode);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleTabChange = (tab) => {
    if (tab === activeTab) return;
    const startTime = new Date();
    const startedStr = formatTime(startTime);
    setPivotLoading(true);
    setActiveTab(tab);
    setTimeout(() => {
      const endTime = new Date();
      const durationSec = ((endTime - startTime) / 1000).toFixed(3);
      setTimingMetrics((prev) => ({
        ...prev,
        started: startedStr,
        ended: formatTime(endTime),
        duration: `${durationSec} sec`,
      }));
      setPivotLoading(false);
    }, 250);
  };

  const handleDateSelect = (day) => {
    const formatted = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setShowDatePicker(false);
    setSelectedDate(formatted);
    setRefreshTrigger((prev) => prev + 1);
  };

  const toggleDatePicker = () => {
    if (activeTab === "analytics") return;
    if (!showDatePicker && selectedDate) {
      const [y, m] = selectedDate.split("-").map(Number);
      if (y && m) {
        setCalYear(y);
        setCalMonth(m - 1);
      }
    }
    setShowDatePicker((prev) => !prev);
  };

  const handleBindActions = useCallback((actions) => {
    setExportActions(actions);
  }, []);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-layout">
      {/* Top Header Bar */}
      <header className="header-bar">
        <div className="header-pill">React / Tailwind Frontend</div>
        <div className="header-pill">
          {activeTab === "analytics"
            ? "NodeJS GraphQL / IBM ODBC"
            : "NodeJS REST API / IBM ODBC"}
        </div>
        <div className="header-pill">Servers: AWS Cloud and IBM iSeries</div>
      </header>

      <div className="main-container">
        {/* Generated Timestamp Row matching Dotnet index.aspx line 413 */}
        <div
          style={{ textAlign: "right", marginTop: "20px", marginBottom: "0px" }}
        >
          <span style={{ fontSize: "10px", fontWeight: 100, color: "#666" }}>
            Generated: {generatedTimeStr}
          </span>
        </div>

        {/* Unified toolbar matching Dotnet #dHeader */}
        <div id="dHeader" className="header-bar-main">
          {/* Left: Title + Currency & Mode dropdowns */}
          <div className="header-left">
            <div
              className="clsAllTopics"
              id="hTopSalesTopicAndOther"
              style={{ margin: 0 }}
            >
              {/* Row 1: Title */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "23px",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                <span
                  style={{
                    cursor: activeTab !== "analytics" ? "pointer" : "default",
                    fontWeight: 400,
                    fontStyle: "normal",
                  }}
                  onClick={toggleDatePicker}
                >
                  {activeTab === "analytics"
                    ? "SALES - ANALYTICS"
                    : `FLASH SALES ON ${dateParams?.displayDate || selectedDate}`}
                </span>
                {activeTab !== "analytics" && (
                  <i
                    onClick={toggleDatePicker}
                    className="material-icons"
                    style={{
                      fontSize: "25px",
                      marginLeft: "12px",
                      cursor: "pointer",
                      position: "relative",
                      top: "-5px",
                    }}
                  >
                    arrow_drop_down
                  </i>
                )}
              </div>

              {/* Row 2: AU$ & Fiscal dropdowns */}
              {activeTab !== "analytics" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "32px",
                    marginTop: "4px",
                    fontSize: "0.65rem",
                  }}
                >
                  <CustomHeaderDropdown
                    id="hTopCurType"
                    value={currencyMode}
                    options={[
                      { value: "1", label: "AU$" },
                      { value: "2", label: "NZ$" },
                    ]}
                    onChange={(val) => handleCurrencyChange(val)}
                    style={{ marginLeft: "84px" }}
                  />

                  <CustomHeaderDropdown
                    id="hTopSalesCalandar"
                    value={calendarMode === "fiscal" ? "1" : "2"}
                    options={[
                      { value: "1", label: "Fiscal" },
                      { value: "2", label: "Calendar" },
                    ]}
                    onChange={(val) => handleCalendarModeChange(val)}
                    style={{ marginLeft: "48px" }}
                  />
                </div>
              )}
            </div>

            {showDatePicker && (
              <div
                className="custom-calendar-overlay"
                onClick={() => setShowDatePicker(false)}
              >
                <div
                  className="custom-calendar-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="cal-nav">
                    <div className="cal-arrow" onClick={() => changeMonth(-1)}>
                      ‹
                    </div>
                    <div className="cal-month-title">
                      {new Date(calYear, calMonth).toLocaleString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                    <div className="cal-arrow" onClick={() => changeMonth(1)}>
                      ›
                    </div>
                  </div>
                  <div className="cal-days-grid">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="cal-grid">
                    {calendarRows.map((row, ri) =>
                      row.map((day, ci) => {
                        const dateStr = day
                          ? `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                          : "";
                        const isAvailable =
                          day && availableDates.includes(dateStr);
                        const isSel = dateStr === selectedDate;
                        const isDisabled = !day || !isAvailable;
                        return (
                          <div
                            key={`${ri}-${ci}`}
                            className={`cal-cell ${isSel ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
                            onClick={() => !isDisabled && handleDateSelect(day)}
                          >
                            {day || ""}
                          </div>
                        );
                      }),
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TRUE page center: Navigation tabs matching Dotnet btnBar_Sales */}
          <div className="header-center">
            <div id="btnBar_Sales" className="btn-bar">
              <input
                data-sel="A"
                type="button"
                value="All Sales"
                className={activeTab === "allSales" ? "active" : ""}
                onClick={() => handleTabChange("allSales")}
              />
              <input
                data-sel="T"
                type="button"
                value="Top Sales"
                className={activeTab === "topSales" ? "active" : ""}
                onClick={() => handleTabChange("topSales")}
              />
              <input
                data-sel="L"
                type="button"
                value="Laggards"
                className={activeTab === "laggards" ? "active" : ""}
                onClick={() => handleTabChange("laggards")}
              />
              <input
                data-sel="N"
                type="button"
                value="Analytics"
                className={activeTab === "analytics" ? "active" : ""}
                onClick={() => handleTabChange("analytics")}
              />
            </div>
          </div>

          {/* Right section: Search & Actions - matching Dotnet clsHideWhenNotInAllSales header-right */}
          <div
            className="header-right"
            style={{
              opacity: 0.7,
              marginLeft: "auto",
              width: "calc(50% - 170px)",
              minWidth: "fit-content",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            {activeTab === "allSales" && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minWidth: "365px",
                }}
              >
                <div
                  id="spSearchSales"
                  style={{
                    position: "relative",
                    top: "-7px",
                    left: "9px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {/* Window Scaling Control matching Dotnet #sZoomPanel - position: absolute; top: -40px; left: 0; margin-left: 21px */}
                  <div
                    id="sZoomPanel"
                    style={{
                      position: "absolute",
                      top: "-40px",
                      left: 0,
                      marginLeft: "21px",
                      background: "#ccd9ec40",
                    }}
                  >
                    <div className="wc-card">
                      <div className="wc-control">
                        <span className="wc-label">Window</span>
                        <fieldset className="wc-fieldset">
                          <div className="wc-steps" id="wc-steps-window">
                            {[75, 80, 90, 100].map((val) => (
                              <label key={val} className="wc-step">
                                <input
                                  className="wc-step-input"
                                  type="radio"
                                  name="wc-window"
                                  id={`wc-window-${val}`}
                                  value={val}
                                  checked={zoomLevel === val}
                                  onChange={() => setZoomLevel(val)}
                                />
                                <span className="wc-dot"></span>
                                <span className="wc-step-text">{val}%</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                    </div>
                  </div>

                  <i
                    className="material-icons"
                    style={{
                      left: "21px",
                      position: "relative",
                      top: "2px",
                      marginBottom: "4px",
                      fontSize: "18px",
                      color: "#000",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    search
                  </i>
                  <input
                    id="iSearchSales"
                    type="text"
                    className="search-input-field"
                    style={{
                      width: "350px",
                      paddingLeft: "22px",
                      paddingRight: "25px",
                      fontSize: "10.5px",
                    }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Separate multiple arguments with ++"
                    autoComplete="off"
                  />
                  <img
                    src={clearSearchImg}
                    alt="Clear"
                    title="Clear"
                    className={`srchBox ${!search ? "disabledSrch" : ""}`}
                    style={{
                      position: "relative",
                      right: "20px",
                      width: "13px",
                      top: "3px",
                      cursor: search ? "pointer" : "default",
                      opacity: search ? 1 : 0.75,
                    }}
                    onClick={() => search && setSearch("")}
                  />
                </div>
              </div>
            )}

            {/* Loading Effect matching Dotnet #dLoader */}
            {pivotLoading && (
              <div
                id="dLoader"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "absolute",
                  right: "160px",
                  top: "10px",
                  zIndex: 99999,
                  pointerEvents: "none",
                }}
              >
                <img
                  src={loader3Img}
                  alt="Loading..."
                  style={{ width: "65px", height: "65px" }}
                />
              </div>
            )}

            {/* Export Actions buttons */}
            <div
              className="action-buttons"
              style={{
                display: "flex",
                alignItems: "center",
                marginLeft: "auto",
                justifyContent: "flex-end",
                marginRight: "-16px",
                flexShrink: 0,
              }}
            >
              {activeTab === "allSales" && (
                <>
                  <img
                    id="imgExpToExcel"
                    className="action-btn"
                    title="Export to Excel"
                    style={{
                      cursor: "pointer",
                      padding: "2px",
                      marginRight: "8px",
                      marginLeft: "6px",
                      marginBottom: "7px",
                      width: "32px",
                      height: "32px",
                    }}
                    src={excelImg}
                    onClick={() => exportActions?.exportExcel?.()}
                    alt="Export to Excel"
                  />
                  <img
                    className="action-btn"
                    title="Export to CSV"
                    style={{
                      cursor: "pointer",
                      padding: "2px",
                      marginRight: "8px",
                      marginLeft: "0px",
                      marginBottom: "7px",
                      width: "32px",
                      height: "32px",
                    }}
                    src={csvImg}
                    onClick={() => exportActions?.exportCSV?.()}
                    alt="Export to CSV"
                  />
                </>
              )}
              <button
                className="icon-btn"
                title="Download PDF"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "3px",
                  marginRight: "6px",
                  marginBottom: "7px",
                }}
                onClick={() =>
                  exportActions?.exportPDF
                    ? exportActions.exportPDF()
                    : window.print()
                }
              >
                <BsDownload size={20} />
              </button>
              <button
                className="icon-btn"
                title="Print Page"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "3px",
                  marginRight: "10px",
                  marginBottom: "7px",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                onClick={() =>
                  exportActions?.printPDF
                    ? exportActions.printPDF()
                    : window.print()
                }
              >
                <BsPrinter size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Active Tab rendering */}
        <main style={zoomLevel !== 100 ? { zoom: `${zoomLevel}%` } : undefined}>
          {activeTab === "allSales" && (
            <AllSalesTab
              data={processedPivotData}
              loading={pivotLoading}
              selectedDate={selectedDate}
              weekNumber={dateParams?.weekNumber ?? 1}
              dayNumber={dateParams?.dayNumber ?? 1}
              quarterNumber={dateParams?.quarterNumber ?? 1}
              calendarDayOfMonth={dateParams?.calendarDayOfMonth ?? 1}
              calendarMonthNumber={dateParams?.calendarMonthNumber ?? 1}
              calendarMode={calendarMode}
              currencyMode={currencyMode}
              search={search}
              zoomLevel={zoomLevel}
              onBindExportActions={handleBindActions}
            />
          )}

          {activeTab === "topSales" && (
            <LeadersTab
              data={processedPivotData}
              loading={pivotLoading}
              boxDayCY={dateParams?.boxDayCY ?? ""}
              boxDayLY={dateParams?.boxDayLY ?? ""}
              search={search}
              currencyMode={currencyMode}
              calendarMode={calendarMode}
              selectedDate={selectedDate}
              onBindExportActions={handleBindActions}
            />
          )}

          {activeTab === "laggards" && (
            <LaggardsTab
              data={processedPivotData}
              loading={pivotLoading}
              boxDayCY={dateParams?.boxDayCY ?? ""}
              boxDayLY={dateParams?.boxDayLY ?? ""}
              search={search}
              currencyMode={currencyMode}
              calendarMode={calendarMode}
              selectedDate={selectedDate}
              onBindExportActions={handleBindActions}
            />
          )}

          {activeTab === "analytics" && (
            <AnalyticsTab
              calendarMode={calendarMode}
              currencyMode={currencyMode}
              onCurrencyChange={handleCurrencyChange}
              onCalendarModeChange={handleCalendarModeChange}
              dateParams={dateParams}
              fiscalIndexes={fiscalIndexes}
              onBindExportActions={handleBindActions}
              onTimingMetrics={setTimingMetrics}
            />
          )}
        </main>
      </div>

      {/* Footer Timing benchmarks bar */}
      <footer className="footer-bar">
        Row count after sign in: {timingMetrics.rowCount} | Started:{" "}
        {timingMetrics.started} | Ended: {timingMetrics.ended} | Duration:{" "}
        {timingMetrics.duration}
      </footer>
    </div>
  );
}
