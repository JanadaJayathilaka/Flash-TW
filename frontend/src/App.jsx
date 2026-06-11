import { useState, useEffect, useMemo, useCallback } from 'react';
import Login from './components/Login';
import AllSalesTab from './components/AllSalesTab';
import LeadersTab from './components/LeadersTab';
import LaggardsTab from './components/LaggardsTab';
import AnalyticsTab from './components/AnalyticsTab';
import { fetchLatestDate, fetchStoreDetails, fetchSalesPivotSum, fetchAvailableDates } from './services/api';
import { buildFiscalIndexes, computeDateParamsFromFiscal, computeCalendarDateParams } from './utils/dateUtils';
import { MdOutlineArrowDropDown } from "react-icons/md";

export default function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('login_timestamp');
  });

  // Global states
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarMode, setCalendarMode] = useState('fiscal'); // fiscal | calendar
  const [activeTab, setActiveTab] = useState('allSales'); // allSales | topSales | laggards | analytics
  const [search, setSearch] = useState('');

  // Loaded metadata
  const [availableDates, setAvailableDates] = useState([]);

  // Primary pivot data
  const [pivotData, setPivotData] = useState([]);
  const [pivotLoading, setPivotLoading] = useState(false);

  // Calendar indexes
  const [fiscalIndexes, setFiscalIndexes] = useState(null);

  // Custom calendar picker popup state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(1); // 0-based

  // Benchmark timing metrics
  const [timingMetrics, setTimingMetrics] = useState({
    rowCount: 0,
    started: '',
    ended: '',
    duration: '0.00 sec'
  });

  // Generated time label (frozen on load/refresh)
  const generatedTimeStr = useMemo(() => {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const h = now.getHours();
    const h12 = h % 12 || 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `Generated: ${now.getFullYear()} ${months[now.getMonth()]} ${String(now.getDate()).padStart(2, '0')} ${days[now.getDay()]} | ${h12}:${mm} ${ampm} USA, Pacific`;
  }, []);

  // Export action triggers bound from child
  const [exportActions, setExportActions] = useState(null);

  const handleLoginSuccess = () => {
    sessionStorage.setItem('login_timestamp', Date.now().toString());
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

        const selected = latestDateVal || (datesVal.length > 0 ? datesVal[datesVal.length - 1] : '2026-02-10');
        setSelectedDate(selected);
        setAvailableDates(datesVal || []);

        const indexes = buildFiscalIndexes(ddsVal.FiscalCalendar || []);
        setFiscalIndexes(indexes);

        // Seed calendar picker initial month/year
        const [y, m] = selected.split('-').map(Number);
        setCalYear(y);
        setCalMonth(m - 1);
      } catch (err) {
        console.error('[App] Failed to load metadata:', err);
      }
    }

    loadInitialMetadata();
  }, [isAuthenticated]);

  // Compute computed date parameters based on selectedDate and calendarMode
  const dateParams = useMemo(() => {
    if (!selectedDate) return null;
    if (calendarMode === 'fiscal' && fiscalIndexes) {
      return computeDateParamsFromFiscal(selectedDate, fiscalIndexes) || computeCalendarDateParams(selectedDate);
    }
    return computeCalendarDateParams(selectedDate);
  }, [selectedDate, calendarMode, fiscalIndexes]);

  // Fetch sales records based on date parameters
  useEffect(() => {
    if (!isAuthenticated || !dateParams) return;

    async function loadSalesPivot() {
      const formatTime = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
        const durationSec = ((endTime - startTime) / 1000).toFixed(2);

        setTimingMetrics({
          rowCount: res.TotalCount || res.PivotData?.length || 0,
          started: startedStr,
          ended: formatTime(endTime),
          duration: `${durationSec} sec`
        });
      } catch (err) {
        console.error('[App] Failed to load pivotsum:', err);
      } finally {
        setPivotLoading(false);
      }
    }

    loadSalesPivot();
  }, [isAuthenticated, dateParams]);

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
    setCalMonth(nextMonth);
    setCalYear(nextYear);
  };

  const handleDateSelect = (day) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setShowDatePicker(false);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const handleBindActions = useCallback((actions) => {
    setExportActions(actions);
  }, []);

  return (
    <div>
      {/* Top Header Pill Bar */}
      <header className="header-bar">
        <div className="header-pill">
          Tailwind Frontend, NodeJS Backend
        </div>
        <div className="header-pill">
          Servers: AWS Cloud and IBM iSeries
        </div>
      </header>

      {/* Generated Stamp */}
      <div className="gen-time">{generatedTimeStr}</div>

      <div className="main-container">
        {/* Unified toolbar: Title | Tabs | Search | Actions */}
        <div className="toolbar-row">
          {/* Left: Title + Mode dropdown */}
          <div className="toolbar-left">
            <h1 className="page-title" onClick={() => setShowDatePicker(!showDatePicker)}>
              {activeTab === 'analytics' ? 'Sales - Analytics' : `Flash Sales on ${dateParams?.displayDate || selectedDate}`}
              <MdOutlineArrowDropDown className="title-arrow-icon" />
            </h1>

            {showDatePicker && (
              <div className="custom-calendar-overlay" onClick={() => setShowDatePicker(false)}>
                <div className="custom-calendar-card" onClick={(e) => e.stopPropagation()}>
                  <div className="cal-nav">
                    <div className="cal-arrow" onClick={() => changeMonth(-1)}>‹</div>
                    <div className="cal-month-title">
                      {new Date(calYear, calMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <div className="cal-arrow" onClick={() => changeMonth(1)}>›</div>
                  </div>
                  <div className="cal-days-grid">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="cal-grid">
                    {calendarRows.map((row, ri) =>
                      row.map((day, ci) => {
                        const dateStr = day ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
                        const isAvailable = day && availableDates.includes(dateStr);
                        const isSel = dateStr === selectedDate;
                        const isDisabled = !day || !isAvailable;
                        return (
                          <div
                            key={`${ri}-${ci}`}
                            className={`cal-cell ${isSel ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                            onClick={() => !isDisabled && handleDateSelect(day)}
                          >
                            {day || ''}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mode selection dropdown - below title */}
            {activeTab !== 'analytics' && (
              <div className="custom-select-wrapper">
                <select
                  className="mode-select"
                  value={calendarMode}
                  onChange={(e) => setCalendarMode(e.target.value)}
                >
                  <option value="fiscal">Fiscal</option>
                  <option value="calendar">Calendar</option>
                </select>
                <MdOutlineArrowDropDown className="select-arrow-icon" />
              </div>
            )}
          </div>

          {/* Center: Navigation tabs */}
          <div className="toolbar-center">
            <div className="tab-btn-group">
              <button
                className={`tab-btn ${activeTab === 'allSales' ? 'active' : ''}`}
                onClick={() => setActiveTab('allSales')}
              >
                All Sales
              </button>
              <button
                className={`tab-btn ${activeTab === 'topSales' ? 'active' : ''}`}
                onClick={() => setActiveTab('topSales')}
              >
                Top Sales
              </button>
              <button
                className={`tab-btn ${activeTab === 'laggards' ? 'active' : ''}`}
                onClick={() => setActiveTab('laggards')}
              >
                Laggards
              </button>
              <button
                className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                Analytics
              </button>
            </div>
          </div>

          {/* Right: Search + Action icons */}
          <div className="toolbar-right">
            {activeTab !== 'analytics' && (
              <div className="search-container">
                <span className="search-icon"><i className="material-icons" style={{ fontSize: '20px', color: '#9e9e9e' }}>search</i></span>
                <input
                  type="text"
                  className="search-input-field"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Separate multiple arguments with ++"
                />
                {search && (
                  <span className="search-clear" onClick={() => setSearch('')}>
                    <i className="material-icons" style={{ fontSize: '18px', color: '#9e9e9e', cursor: 'pointer' }}>cleaning_services</i>
                  </span>
                )}
              </div>
            )}

            {/* Export Actions buttons */}
            <div className="action-buttons">
              {activeTab === 'allSales' && (
                <>
                  <button
                    className="icon-btn"
                    title="Export to Excel"
                    onClick={() => exportActions?.exportExcel?.()}
                  >
                    <i className="material-icons" style={{ fontSize: '20px', color: '#4caf50' }}>grid_on</i>
                  </button>
                  <button
                    className="icon-btn"
                    title="Export to CSV"
                    onClick={() => exportActions?.exportCSV?.()}
                  >
                    <i className="material-icons" style={{ fontSize: '20px' }}>description</i>
                  </button>
                </>
              )}
              <button
                className="icon-btn"
                title="Download PDF"
                onClick={() => exportActions?.exportPDF ? exportActions.exportPDF() : window.print()}
              >
                <i className="material-icons" style={{ fontSize: '20px' }}>file_download</i>
              </button>
              <button
                className="icon-btn"
                title="Print Page"
                onClick={() => exportActions?.printPDF ? exportActions.printPDF() : window.print()}
              >
                <i className="material-icons" style={{ fontSize: '20px' }}>print</i>
              </button>
            </div>
          </div>
        </div>

        {/* Active Tab rendering */}
        <main>
          {activeTab === 'allSales' && (
            <AllSalesTab
              data={pivotData}
              loading={pivotLoading}
              weekNumber={dateParams?.weekNumber ?? 1}
              dayNumber={dateParams?.dayNumber ?? 1}
              quarterNumber={dateParams?.quarterNumber ?? 1}
              calendarDayOfMonth={dateParams?.calendarDayOfMonth ?? 1}
              calendarMonthNumber={dateParams?.calendarMonthNumber ?? 1}
              calendarMode={calendarMode}
              search={search}
              onBindExportActions={handleBindActions}
            />
          )}

          {activeTab === 'topSales' && (
            <LeadersTab
              data={pivotData}
              loading={pivotLoading}
              boxDayCY={dateParams?.boxDayCY ?? ''}
              boxDayLY={dateParams?.boxDayLY ?? ''}
              search={search}
            />
          )}

          {activeTab === 'laggards' && (
            <LaggardsTab
              data={pivotData}
              loading={pivotLoading}
              boxDayCY={dateParams?.boxDayCY ?? ''}
              boxDayLY={dateParams?.boxDayLY ?? ''}
              search={search}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab
              calendarMode={calendarMode}
              dateParams={dateParams}
              fiscalIndexes={fiscalIndexes}
              onBindExportActions={handleBindActions}
            />
          )}
        </main>
      </div>

      {/* Footer Timing benchmarks bar */}
      <footer className="footer-bar">
        Row count after sign in: {timingMetrics.rowCount} | Started: {timingMetrics.started} | Ended: {timingMetrics.ended} | Duration: {timingMetrics.duration}
      </footer>
    </div>
  );
}
