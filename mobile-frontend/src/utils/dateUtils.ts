/**
 * Date utility helpers for generating the API date parameters.
 * Supports both ISO calendar (fallback) and Fiscal Calendar (preferred).
 */

import { FiscalItem } from '../types/sales';

// ─── Fiscal Calendar lookup types ────────────────────────────────────────────

export interface FiscalCalendarEntry {
  FiscalYear: number;
  WeekInYear: number;
  DayInWeek: number;
  DayInYear: number;
  QuarterInYear: number;
}

/** Full lookup: date string → FiscalCalendarEntry */
export type FiscalCalendarMap = Record<string, FiscalCalendarEntry>;
/** DayInYear index: "YEAR_DAY" → date string */
export type FiscalDayIndex = Record<string, string>;
/** Week/day index: "YEAR_WEEK_DOW" → date string */
export type FiscalWeekIndex = Record<string, string>;

export interface FiscalIndexes {
  calendar: FiscalCalendarMap;
  dayIndex: FiscalDayIndex;
  weekIndex: FiscalWeekIndex;
}

function parseIsoDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(dateStr);
  }
  return new Date(y, m - 1, d);
}

/** Build lookup indexes from the FiscalCalendar array returned by /api/sales/dds */
export function buildFiscalIndexes(items: FiscalItem[]): FiscalIndexes {
  const calendar: FiscalCalendarMap = {};
  const dayIndex: FiscalDayIndex = {};
  const weekIndex: FiscalWeekIndex = {};

  for (const x of items) {
    const date     = x.FiscalDate.trim();
    const year     = parseInt(x.FiscalYear);
    const week     = parseInt(x.WeekInYear);
    const dayWeek  = parseInt(x.DayInWeek);
    const dayYear  = parseInt(x.DayInYear);
    const quarter  = parseInt(x.CalQuarter);

    calendar[date] = { FiscalYear: year, WeekInYear: week, DayInWeek: dayWeek, DayInYear: dayYear, QuarterInYear: quarter };

    // DayInYear index for cross-year match
    dayIndex[`${year}_${dayYear}`] = date;

    // Week+DOW index for WTD start
    weekIndex[`${year}_${week}_${dayWeek}`] = date;

    // Fiscal year start (day 1)
    if (dayYear === 1) {
      dayIndex[`${year}_1`] = date;
    }
  }

  return { calendar, dayIndex, weekIndex };
}

// ─── Shared DateParams interface ─────────────────────────────────────────────

export interface DateParams {
  displayDate: string;
  DT_1: string;
  DT_2: string;
  P_WTD_1_S: string;
  P_WTD_1_E: string;
  P_WTD_2_S: string;
  P_WTD_2_E: string;
  P_QTD_1_S: string;
  P_QTD_1_E: string;
  P_QTD_2_S: string;
  P_QTD_2_E: string;
  P_YTD_1_S: string;
  P_YTD_1_E: string;
  P_YTD_2_S: string;
  P_YTD_2_E: string;
  weekNumber: number;
  dayNumber: number;
  quarterNumber: number;
  /** Calendar day of month (1-31) — used for Calendar-mode Day column header */
  calendarDayOfMonth: number;
  /** Calendar month number (1-12) — used for Calendar-mode MTD column header */
  calendarMonthNumber: number;
  /** Label for current-year day box  (e.g. "2026 Day 41") */
  boxDayCY: string;
  /** Label for prior-year day box    (e.g. "2025 Day 41") */
  boxDayLY: string;
}

// ─── Fiscal Calendar–based computation (mirrors web buildFiscalRanges) ───────

function getQuarterStart(dateStr: string): string {
  const d = parseIsoDateLocal(dateStr);
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  const qStart = new Date(d.getFullYear(), qStartMonth, 1);
  return fmt(qStart);
}

function getQuarterStartPrevYear(dateStr: string): string {
  const d = parseIsoDateLocal(dateStr);
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  const qStart = new Date(d.getFullYear() - 1, qStartMonth, 1);
  return fmt(qStart);
}

/**
 * Build DateParams using fiscal calendar data.
 * Mirrors the web app's buildFiscalRanges() + updateSalesTitles() logic.
 */
export function computeDateParamsFromFiscal(
  selectedDate: string,
  indexes: FiscalIndexes
): DateParams | null {
  const { calendar, dayIndex, weekIndex } = indexes;
  const current = calendar[selectedDate];
  if (!current) return null;

  const allValues = Object.entries(calendar).map(([CalDate, value]) => ({ CalDate, ...value }));
  const byDateAsc = (a: { CalDate: string }, b: { CalDate: string }) => a.CalDate.localeCompare(b.CalDate);

  const currentYear = current.FiscalYear;
  const prevYear    = currentYear - 1;
  const week        = current.WeekInYear;
  const dayWeek     = current.DayInWeek;
  const dayInYear   = current.DayInYear;
  const quarter     = current.QuarterInYear;

  // Same fiscal day last year (mirrors web prepareDateRanges_Fiscal)
  const prevYearSameDay = allValues.find((x) => x.DayInYear === dayInYear && x.FiscalYear === prevYear);
  if (!prevYearSameDay) return null;
  const DT_2 = prevYearSameDay.CalDate;

  // WTD — use current week and the matching week bucket from same fiscal day last year
  const weekThisYear = allValues
    .filter((x) => x.FiscalYear === currentYear && x.WeekInYear === week)
    .sort(byDateAsc);
  const weekLastYear = allValues
    .filter((x) => x.FiscalYear === prevYear && x.WeekInYear === prevYearSameDay.WeekInYear)
    .sort(byDateAsc);

  const P_WTD_1_S = weekThisYear[0]?.CalDate ?? weekIndex[`${currentYear}_${week}_1`] ?? '';
  const P_WTD_1_E = selectedDate;
  const P_WTD_2_S = weekLastYear[0]?.CalDate ?? weekIndex[`${prevYear}_${prevYearSameDay.WeekInYear}_1`] ?? '';
  const P_WTD_2_E = DT_2;

  // QTD — fiscal quarter start (matches web prepareDateRanges_Fiscal)
  const quarterStartThisYear = allValues
    .filter((x) => x.FiscalYear === currentYear && x.QuarterInYear === quarter)
    .sort(byDateAsc)[0];
  const quarterStartLastYear = allValues
    .filter((x) => x.FiscalYear === prevYear && x.QuarterInYear === quarter)
    .sort(byDateAsc)[0];

  const P_QTD_1_S = quarterStartThisYear?.CalDate ?? '';
  const P_QTD_1_E = selectedDate;
  const P_QTD_2_S = quarterStartLastYear?.CalDate ?? '';
  const P_QTD_2_E = DT_2;

  // YTD — first fiscal date in each year
  const yearStartThisYear = allValues
    .filter((x) => x.FiscalYear === currentYear)
    .sort(byDateAsc)[0];
  const yearStartLastYear = allValues
    .filter((x) => x.FiscalYear === prevYear)
    .sort(byDateAsc)[0];

  const P_YTD_1_S = yearStartThisYear?.CalDate ?? dayIndex[`${currentYear}_1`] ?? '';
  const P_YTD_1_E = selectedDate;
  const P_YTD_2_S = yearStartLastYear?.CalDate ?? dayIndex[`${prevYear}_1`] ?? '';
  const P_YTD_2_E = DT_2;

  // Box day labels
  const boxDayCY   = `${currentYear} Day ${dayInYear}`;
  const prevDay    = prevYearSameDay.DayInYear;
  const boxDayLY   = `${prevYear} Day ${prevDay}`;

  // Display date
  const dateObj = parseIsoDateLocal(selectedDate);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const displayDate = `${dateObj.getFullYear()} ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dayNames[dateObj.getDay()]}`;

  return {
    displayDate,
    DT_1: selectedDate,
    DT_2,
    P_WTD_1_S, P_WTD_1_E,
    P_WTD_2_S, P_WTD_2_E,
    P_QTD_1_S, P_QTD_1_E,
    P_QTD_2_S, P_QTD_2_E,
    P_YTD_1_S, P_YTD_1_E,
    P_YTD_2_S, P_YTD_2_E,
    weekNumber:    week,
    dayNumber:     dayWeek,
    quarterNumber: quarter,
    calendarDayOfMonth:  0,
    calendarMonthNumber: 0,
    boxDayCY,
    boxDayLY,
  };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function isoDow(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
}

// ─── Calendar mode (mirrors web buildCalendarRanges) ──────────────────────────

/**
 * Calendar-based date params matching the web app's buildCalendarRanges().
 * Uses same calendar date last year (leap-safe), Sunday-start weeks, standard quarters.
 */
export function computeCalendarDateParams(selectedDate: string): DateParams {
  const [year, month, day] = selectedDate.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);

  const currentYear = currentDate.getFullYear();
  const prevYear = currentYear - 1;

  // Same calendar day last year — leap safe (Feb 29 → Feb 28)
  let prevYearSameDay = new Date(prevYear, month - 1, day);
  if (prevYearSameDay.getMonth() !== (month - 1)) {
    prevYearSameDay = new Date(prevYear, month, 0); // last day of prev month
  }

  const DT_1 = fmt(currentDate);
  const DT_2 = fmt(prevYearSameDay);

  // WTD — Sunday start
  const currentDayOfWeek = currentDate.getDay(); // 0=Sun
  const prevDayOfWeek = prevYearSameDay.getDay();

  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDayOfWeek);
  const prevWeekStart = new Date(prevYearSameDay);
  prevWeekStart.setDate(prevYearSameDay.getDate() - prevDayOfWeek);

  const P_WTD_1_S = fmt(weekStart);
  const P_WTD_1_E = DT_1;
  const P_WTD_2_S = fmt(prevWeekStart);
  const P_WTD_2_E = DT_2;

  // QTD — standard calendar quarters
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3;
  const P_QTD_1_S = fmt(new Date(currentYear, quarterStartMonth, 1));
  const P_QTD_1_E = DT_1;
  const P_QTD_2_S = fmt(new Date(prevYear, quarterStartMonth, 1));
  const P_QTD_2_E = DT_2;

  // YTD — Jan 1
  const P_YTD_1_S = fmt(new Date(currentYear, 0, 1));
  const P_YTD_1_E = DT_1;
  const P_YTD_2_S = fmt(new Date(prevYear, 0, 1));
  const P_YTD_2_E = DT_2;

  // Box labels: "YEAR Day N" (day-of-year)
  const boxDayCY = `${currentYear} Day ${getDayOfYear(currentDate)}`;
  const boxDayLY = `${prevYear} Day ${getDayOfYear(prevYearSameDay)}`;

  // Week number (calendar week, Sunday=start, week 1 starts Jan 1)
  const weekNum = Math.ceil(getDayOfYear(currentDate) / 7);
  const quarter = Math.ceil(month / 3);

  // Display date
  const dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const displayDate = `${currentYear} ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${dayNames[currentDate.getDay()]}`;

  return {
    displayDate,
    DT_1, DT_2,
    P_WTD_1_S, P_WTD_1_E,
    P_WTD_2_S, P_WTD_2_E,
    P_QTD_1_S, P_QTD_1_E,
    P_QTD_2_S, P_QTD_2_E,
    P_YTD_1_S, P_YTD_1_E,
    P_YTD_2_S, P_YTD_2_E,
    weekNumber:    weekNum,
    dayNumber:     currentDayOfWeek === 0 ? 7 : currentDayOfWeek, // 1-based for display
    quarterNumber: quarter,
    calendarDayOfMonth:  currentDate.getDate(),
    calendarMonthNumber: month,
    boxDayCY,
    boxDayLY,
  };
}

// ─── ISO Calendar fallback (used when fiscal calendar is unavailable) ─────────

/**
 * ISO calendar–based fallback when no fiscal calendar is available.
 */
export function computeDateParams(today?: Date): DateParams {
  const now = today ?? new Date();
  const d = now;

  const cyDate = fmt(d);
  const lyDate = fmt(addDays(d, -364));

  const monday    = getMonday(d);
  const wtd1s     = fmt(monday);
  const wtd1e     = fmt(d);
  const lyMonday  = addDays(monday, -364);
  const wtd2s     = fmt(lyMonday);
  const wtd2e     = fmt(addDays(d, -364));

  // QTD — calendar quarter
  const qtd1s     = getQuarterStart(cyDate);
  const qtd1e     = cyDate;
  const qtd2s     = getQuarterStartPrevYear(cyDate);
  const qtd2e     = lyDate;

  const ytd1s     = fmt(new Date(d.getFullYear(), 0, 1));
  const ytd1e     = fmt(d);
  const ytd2s     = fmt(new Date(d.getFullYear() - 1, 0, 1));
  const ytd2e     = fmt(addDays(d, -364));

  const dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const displayDate = `${d.getFullYear()} ${monthNames[d.getMonth()]} ${d.getDate()}, ${dayNames[d.getDay()]}`;

  const week    = getISOWeek(d);
  const quarter = Math.ceil((d.getMonth() + 1) / 3);

  return {
    displayDate,
    DT_1: cyDate,
    DT_2: lyDate,
    P_WTD_1_S: wtd1s, P_WTD_1_E: wtd1e,
    P_WTD_2_S: wtd2s, P_WTD_2_E: wtd2e,
    P_QTD_1_S: qtd1s, P_QTD_1_E: qtd1e,
    P_QTD_2_S: qtd2s, P_QTD_2_E: qtd2e,
    P_YTD_1_S: ytd1s, P_YTD_1_E: ytd1e,
    P_YTD_2_S: ytd2s, P_YTD_2_E: ytd2e,
    weekNumber:    week,
    dayNumber:     isoDow(d),
    quarterNumber: quarter,
    calendarDayOfMonth:  0,
    calendarMonthNumber: 0,
    boxDayCY: `Day ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    boxDayLY: `Day ${addDays(d, -364).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
}

/**
 * Determine the best available sales metric (Day > WTD > YTD).
 * Returns keys to use for CY, LY, and COMP fields.
 */
export type SalesMetric = 'DAY' | 'WTD' | 'QTD' | 'YTD';

export interface MetricFields {
  cy:    'DAY_SALES_CY' | 'WTD_SALES_CY' | 'QTD_SALES_CY' | 'YTD_SALES_CY';
  ly:    'DAY_SALES_LY' | 'WTD_SALES_LY' | 'QTD_SALES_LY' | 'YTD_SALES_LY';
  comp:  'DAY_SALES_COMP' | 'WTD_SALES_COMP' | 'QTD_SALES_COMP' | 'YTD_SALES_COMP';
  label: string;
}

export function getBestMetric(data: Array<{ DAY_SALES_CY?: number; WTD_SALES_CY?: number; YTD_SALES_CY?: number; IS_TERRITORY_TOTAL?: boolean; IS_GRAND_TOTAL?: boolean }>): MetricFields {
  const stores = data.filter((r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL);
  const hasDay = stores.some((r) => (r.DAY_SALES_CY ?? 0) !== 0);
  if (hasDay) return { cy: 'DAY_SALES_CY', ly: 'DAY_SALES_LY', comp: 'DAY_SALES_COMP', label: 'Day' };
  const hasWtd = stores.some((r) => (r.WTD_SALES_CY ?? 0) !== 0);
  if (hasWtd) return { cy: 'WTD_SALES_CY', ly: 'WTD_SALES_LY', comp: 'WTD_SALES_COMP', label: 'WTD' };
  return { cy: 'YTD_SALES_CY', ly: 'YTD_SALES_LY', comp: 'YTD_SALES_COMP', label: 'YTD' };
}
