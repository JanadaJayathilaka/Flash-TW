const API_BASE_URL = '';

/**
 * Helper to execute GraphQL POST requests with standard JSON payload
 */
async function graphqlRequest(query, variables = {}) {
  const url = `${API_BASE_URL}/graphql`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[api] GraphQL request error:', res.status, body);
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const result = await res.json();
  if (result.errors && result.errors.length > 0) {
    console.error('[api] GraphQL returned errors:', result.errors);
    throw new Error(result.errors[0].message || 'GraphQL Query Error');
  }

  return result.data;
}

/**
 * Fetch the latest transaction date from the IBM i database via GraphQL.
 * Returns a YYYY-MM-DD string or null if unavailable.
 */
export async function fetchLatestDate() {
  try {
    const query = `
      query GetLatestDate {
        latestDate
      }
    `;
    const data = await graphqlRequest(query);
    return data.latestDate ?? null;
  } catch (err) {
    console.error('[api] fetchLatestDate error:', err);
    return null;
  }
}

/**
 * Fetch store details AND fiscal calendar from SQL Server via GraphQL.
 * Returns { SubClass: [...], FiscalCalendar: [...], Currency_Cal: [...] }
 */
export async function fetchStoreDetails() {
  const query = `
    query GetStoreDetails {
      storeDetails {
        SubClass {
          Store_ID
          ASGS_NAME
          Store_Name
          Date_Opened
          Region_ID
        }
        FiscalCalendar {
          FiscalDate
          FiscalYear
          WeekInYear
          DayInWeek
          DayInYear
          CalQuarter
        }
        Currency_Cal {
          CDate
          AuDEquiv
        }
      }
    }
  `;
  const data = await graphqlRequest(query);
  return data.storeDetails;
}

/**
 * Fetch sales pivot summary using the GET_SALES_PVT_SUMRY SP via GraphQL.
 * Returns { PivotData: SalesPivotRow[], TotalCount: number }
 */
export async function fetchSalesPivotSum(params) {
  const query = `
    query GetSalesPivotSum(
      $DT_1: String!
      $DT_2: String!
      $P_WTD_1_S: String!
      $P_WTD_1_E: String!
      $P_WTD_2_S: String!
      $P_WTD_2_E: String!
      $P_QTD_1_S: String!
      $P_QTD_1_E: String!
      $P_QTD_2_S: String!
      $P_QTD_2_E: String!
      $P_YTD_1_S: String!
      $P_YTD_1_E: String!
      $P_YTD_2_S: String!
      $P_YTD_2_E: String!
    ) {
      salesPivotSum(
        DT_1: $DT_1
        DT_2: $DT_2
        P_WTD_1_S: $P_WTD_1_S
        P_WTD_1_E: $P_WTD_1_E
        P_WTD_2_S: $P_WTD_2_S
        P_WTD_2_E: $P_WTD_2_E
        P_QTD_1_S: $P_QTD_1_S
        P_QTD_1_E: $P_QTD_1_E
        P_QTD_2_S: $P_QTD_2_S
        P_QTD_2_E: $P_QTD_2_E
        P_YTD_1_S: $P_YTD_1_S
        P_YTD_1_E: $P_YTD_1_E
        P_YTD_2_S: $P_YTD_2_S
        P_YTD_2_E: $P_YTD_2_E
      ) {
        PivotData {
          STORE_ID
          STORE_NAME
          TERRITORY
          REGION_ID
          DATE_OPENED
          DAY_SALES_CY
          DAY_SALES_LY
          DAY_SALES_COMP
          WTD_SALES_CY
          WTD_SALES_LY
          WTD_SALES_COMP
          QTD_SALES_CY
          QTD_SALES_LY
          QTD_SALES_COMP
          YTD_SALES_CY
          YTD_SALES_LY
          YTD_SALES_COMP
          IS_TERRITORY_TOTAL
          IS_GRAND_TOTAL
        }
        TotalCount
      }
    }
  `;
  console.log('[api] Fetching salesPivotSum via GraphQL');
  const data = await graphqlRequest(query, params);
  return {
    PivotData: Array.isArray(data.salesPivotSum?.PivotData) ? data.salesPivotSum.PivotData : [],
    TotalCount: data.salesPivotSum?.TotalCount ?? 0,
  };
}

/**
 * Fetch all distinct dates that have sales data in the database via GraphQL.
 * Returns a sorted array of YYYY-MM-DD strings.
 */
export async function fetchAvailableDates() {
  try {
    const query = `
      query GetAvailableDates {
        availableDates
      }
    `;
    const data = await graphqlRequest(query);
    return Array.isArray(data.availableDates) ? data.availableDates : [];
  } catch (err) {
    console.error('[api] fetchAvailableDates error:', err);
    return [];
  }
}

/**
 * Fetch chart data for Analytics tab by explicit date range via GraphQL.
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

  console.log('[api] Fetching salesAnalytics via GraphQL');
  const data = await graphqlRequest(query, {
    startDate,
    endDate,
    mode,
    smaPeriod: parseInt(smaPeriod) || 7,
  });

  return data.salesAnalytics;
}
