const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://18.188.166.170:3001');

/**
 * Fetch the latest transaction date from the IBM i database.
 * Returns a YYYY-MM-DD string or null if unavailable.
 */
export async function fetchLatestDate() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sales/latest-date`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.latestDate ?? null;
  } catch (err) {
    console.error('[api] fetchLatestDate error:', err);
    return null;
  }
}

/**
 * Fetch store details AND fiscal calendar from SQL Server.
 * Returns { SubClass: [...], FiscalCalendar: [...] }
 */
export async function fetchStoreDetails() {
  const res = await fetch(`${API_BASE_URL}/api/sales/dds`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch sales pivot summary using the GET_SALES_PVT_SUMRY SP.
 * Returns { PivotData: SalesPivotRow[], TotalCount: number }
 */
export async function fetchSalesPivotSum(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/api/sales/pivotsum?${qs}`;
  console.log('[api] Fetching pivotsum:', url);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error('[api] Pivotsum error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    PivotData: Array.isArray(data.PivotData) ? data.PivotData : [],
    TotalCount: data.TotalCount ?? 0,
  };
}

/**
 * Fetch all distinct dates that have sales data in the database.
 * Returns a sorted array of YYYY-MM-DD strings.
 */
export async function fetchAvailableDates() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sales/available-dates`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.dates) ? data.dates : [];
  } catch (err) {
    console.error('[api] fetchAvailableDates error:', err);
    return [];
  }
}

/**
 * Fetch chart data for Analytics tab by explicit date range.
 */
export async function fetchSalesChartByDateRange(startDate, endDate, mode, smaPeriod = 7) {
  const query = `
    query GetSalesAnalytics($startDate: String!, $endDate: String!, $mode: String!, $smaPeriod: Int) {
      salesAnalytics(startDate: $startDate, endDate: $endDate, mode: $mode, smaPeriod: $smaPeriod) {
        Labels
        Sales
        Sma
      }
    }
  `;

  const url = `${API_BASE_URL}/graphql`;
  console.log('[api] Fetching analytics range chart via GraphQL:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        startDate,
        endDate,
        mode,
        smaPeriod: parseInt(smaPeriod) || 7,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[api] GraphQL analytics chart error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const result = await res.json();
  if (result.errors) {
    console.error('[api] GraphQL query returned errors:', result.errors);
    throw new Error(result.errors[0].message || 'GraphQL Query Error');
  }

  return result.data.salesAnalytics;
}
