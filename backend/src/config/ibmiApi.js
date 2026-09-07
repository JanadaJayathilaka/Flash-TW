/**
 * IBM i REST API Client
 * Calls the IBM i Bridge API running on PUB400 over Tunnelmole.
 * ZERO ODBC or native drivers needed on this machine!
 */

const API_BASE_URL = process.env.IBMI_API_URL || 'https://8mxi0r-ip-185-113-5-134.tunnelmole.net';
const SCHEMA = process.env.IBM_DB_SCHEMA || 'MEEGODA11';

function isApiEnabled() {
  return process.env.USE_IBMI_API === 'true';
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL.replace(/\/+$/, '')}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errDetail;
    try {
      errDetail = await response.json();
    } catch {
      errDetail = await response.text();
    }
    throw new Error(
      `IBM i API Error [${response.status} ${response.statusText}]: ${
        typeof errDetail === 'object' ? JSON.stringify(errDetail) : errDetail
      }`
    );
  }

  return await response.json();
}

async function query(sql, params = []) {
  return await request('/query', {
    method: 'POST',
    body: JSON.stringify({ sql, params })
  });
}

// ── API Methods ──

async function getLatestDate() {
  try {
    const data = await request('/latest-date');
    if (data && data.latestDate) return data.latestDate;
  } catch (err) {
    console.warn('[ibmiApi] /latest-date direct failed, falling back to /query...', err.message);
  }
  const rows = await query(`SELECT MAX(SALES_ON_DATE) AS LATEST_DATE FROM ${SCHEMA}.STRSLSSMRY WHERE STATUS = 1`, []);
  return rows?.[0]?.LATEST_DATE ?? null;
}

async function getPrevDate(latestDate) {
  const rows = await query(
    `SELECT MAX(SALES_ON_DATE) AS PREV_DATE FROM ${SCHEMA}.STRSLSSMRY WHERE STATUS = 1 AND SALES_ON_DATE < ?`,
    [latestDate]
  );
  return rows?.[0]?.PREV_DATE ?? null;
}

async function getPivotSum(params) {
  try {
    // 1. Try fast dedicated /pivotsum endpoint with query parameters
    const qs = new URLSearchParams(params).toString();
    const rows = await request(`/pivotsum?${qs}`);
    if (Array.isArray(rows) && rows.length > 0) return rows;
  } catch (err) {
    console.warn('[ibmiApi] /pivotsum direct failed, falling back to /query...', err.message);
  }

  // 2. Fallback via /query endpoint
  const spParams = [
    params.DT_1, params.DT_2,
    params.P_WTD_1_S, params.P_WTD_1_E,
    params.P_WTD_2_S, params.P_WTD_2_E,
    params.P_QTD_1_S, params.P_QTD_1_E,
    params.P_QTD_2_S, params.P_QTD_2_E,
    params.P_YTD_1_S, params.P_YTD_1_E,
    params.P_YTD_2_S, params.P_YTD_2_E
  ];
  return await query(`{ CALL ${SCHEMA}.GET_SALES_PVT_SUMRY(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }`, spParams);
}

async function getPivot(params) {
  const spParams = [
    params.DT_1, params.DT_2,
    params.P_WTD_1_S, params.P_WTD_1_E,
    params.P_WTD_2_S, params.P_WTD_2_E,
    params.P_YTD_1_S, params.P_YTD_1_E,
    params.P_YTD_2_S, params.P_YTD_2_E
  ];
  return await query(`{ CALL ${SCHEMA}.GET_STORE_SALES_BY_DATES_PIVOT(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }`, spParams);
}

async function getHist(date1, date2) {
  return await query(`{ CALL ${SCHEMA}.GET_STORE_SALES_BY_DATES(?, ?) }`, [date1, date2]);
}

async function getAnalytics(startDate, endDate) {
  return await query(
    `SELECT SALES_ON_DATE, SUM(NET_SALES) AS TOTAL_SALES
     FROM ${SCHEMA}.STRSLSSMRY
     WHERE STATUS = 1
       AND SALES_ON_DATE >= ?
       AND SALES_ON_DATE <= ?
     GROUP BY SALES_ON_DATE
     ORDER BY SALES_ON_DATE`,
    [startDate, endDate]
  );
}

async function getChartColumns() {
  const rows = await query(
    `SELECT COLUMN_NAME FROM QSYS2.SYSCOLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'STRSLSSMRY' ORDER BY ORDINAL_POSITION`,
    [SCHEMA]
  );
  return (rows || []).map(r => r.COLUMN_NAME);
}

module.exports = {
  isApiEnabled,
  query,
  getLatestDate,
  getPrevDate,
  getPivotSum,
  getPivot,
  getHist,
  getAnalytics,
  getChartColumns
};
