import API_BASE_URL from '../config/api';
import { SalesDdsResponse, SalesPivotRow, SalesPivotSumResponse, SalesHistRow, SalesChartResponse } from '../types/sales';

/**
 * Fetch the latest transaction date from the IBM i database.
 * Returns a YYYY-MM-DD string or null if unavailable.
 */
export async function fetchLatestDate(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sales/latest-date`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.latestDate ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch store details AND fiscal calendar from SQL Server.
 * Returns { SubClass: [...], FiscalCalendar: [...] }
 */
export async function fetchStoreDetails(): Promise<SalesDdsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/sales/dds`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface PivotParams {
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
}

/**
 * Fetch sales pivot summary using the new AHLIBR.GET_SALES_PVT_SUMRY SP.
 * Returns { PivotData: SalesPivotRow[], TotalCount: number }
 * This is the main data source for the All Sales table (mirrors web /api/sales/pivotsum).
 */
export async function fetchSalesPivotSum(params: PivotParams): Promise<SalesPivotSumResponse> {
  const qs = new URLSearchParams(params as unknown as Record<string, string>).toString();
  const url = `${API_BASE_URL}/api/sales/pivotsum?${qs}`;
  console.log('[salesApi] Fetching pivotsum:', url);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error('[salesApi] Pivotsum error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const data = await res.json();
  console.log('[salesApi] Pivotsum response: rows=', data.PivotData?.length, 'totalCount=', data.TotalCount);

  return {
    PivotData: Array.isArray(data.PivotData) ? data.PivotData : [],
    TotalCount: data.TotalCount ?? 0,
  };
}

/**
 * Fetch all distinct dates that have sales data in the IBM i database.
 * Returns a sorted array of YYYY-MM-DD strings.
 */
export async function fetchAvailableDates(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sales/available-dates`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.dates) ? data.dates : [];
  } catch {
    return [];
  }
}

/** @deprecated Use fetchSalesPivotSum instead. Kept for backward compatibility. */
export async function fetchSalesPivot(params: Omit<PivotParams, 'P_QTD_1_S' | 'P_QTD_1_E' | 'P_QTD_2_S' | 'P_QTD_2_E'>): Promise<SalesPivotRow[]> {
  const qs = new URLSearchParams(params as unknown as Record<string, string>).toString();
  const url = `${API_BASE_URL}/api/sales/pivot?${qs}`;
  console.log('[salesApi] Fetching pivot (legacy):', url);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error('[salesApi] Pivot error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}

export async function fetchSalesHist(date1: string, date2: string): Promise<SalesHistRow[]> {
  const qs = new URLSearchParams({ date1, date2 }).toString();
  const res = await fetch(`${API_BASE_URL}/api/sales/hist?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch chart data for Analytics tab.
 * Returns { Labels: string[], Sales: number[], Sma: (number|null)[] }
 */
export async function fetchSalesChart(
  yearFrom: number,
  yearTo: number,
  mode: 'D' | 'W' | 'M' | 'Y',
  smaPeriod: number = 7
): Promise<SalesChartResponse> {
  const qs = new URLSearchParams({
    yearFrom: yearFrom.toString(),
    yearTo: yearTo.toString(),
    mode,
    smaPeriod: smaPeriod.toString(),
  }).toString();
  const url = `${API_BASE_URL}/api/sales/chart?${qs}`;
  console.log('[salesApi] Fetching chart:', url);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error('[salesApi] Chart error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Fetch chart data for Analytics tab by explicit date range.
 * Mirrors FlashSaleC# web call: /api/sales/analytics?startDate=...&endDate=...&mode=...
 */
export async function fetchSalesChartByDateRange(
  startDate: string,
  endDate: string,
  mode: 'D' | 'W' | 'M' | 'Y',
  smaPeriod: number = 7
): Promise<SalesChartResponse> {
  const qs = new URLSearchParams({
    startDate,
    endDate,
    mode,
    smaPeriod: smaPeriod.toString(),
  }).toString();
  const url = `${API_BASE_URL}/api/sales/analytics?${qs}`;
  console.log('[salesApi] Fetching analytics range chart:', url);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error('[salesApi] Analytics range chart error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  return res.json();
}
