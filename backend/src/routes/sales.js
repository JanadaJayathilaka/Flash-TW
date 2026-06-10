const express = require('express');
const router = express.Router();
const { getPool, mssql } = require('../config/sqlServer');
const { getIbmPool, resetIbmPool } = require('../config/ibmOdbc');

// ----- helpers -----

// IBM i ODBC driver often returns lowercase column names — normalise to UPPER so
// the rest of our code can reference e.g. row.STORE_ID, row.TOTAL_DATE_1, etc.
function normalizeRow(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    out[key.toUpperCase()] = row[key];
  }
  return out;
}

// Retry wrapper for ODBC calls — resets pool on connection failure
async function odbcQuery(sql, params) {
  const QUERY_TIMEOUT = 60000; // 60 second timeout
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[ODBC] Attempt ${attempt}: getting pool...`);
      const pool = await getIbmPool();
      console.log(`[ODBC] Attempt ${attempt}: executing query...`);
      
      // Race query against timeout
      const result = await Promise.race([
        pool.query(sql, params),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ODBC query timeout after 60s')), QUERY_TIMEOUT)
        ),
      ]);
      
      console.log(`[ODBC] Attempt ${attempt}: query returned ${result?.length ?? 0} rows`);

      // Log first row keys for debugging column-name casing
      if (result && result.length > 0) {
        console.log('[ODBC] Raw first-row keys:', Object.keys(result[0]));
      }

      // Normalise every row's keys to UPPERCASE
      return (result || []).map(normalizeRow);
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const odbcMsg = (err.odbcErrors?.[0]?.message || '').toLowerCase();
      const odbcState = (err.odbcErrors?.[0]?.state || '');
      const isConnErr = msg.includes('communication link') || msg.includes('connection') || msg.includes('timeout')
        || odbcMsg.includes('communication link') || odbcMsg.includes('disconnect')
        || odbcState === '08S01' || odbcState === '08003';
      console.log(`[ODBC] Attempt ${attempt} failed: ${err.message} | odbc: ${odbcMsg} | state: ${odbcState} | isConnErr: ${isConnErr}`);
      if (isConnErr && attempt === 1) {
        console.log('[ODBC] Resetting pool and retrying...');
        await resetIbmPool();
        continue;
      }
      throw err;
    }
  }
}

// Cache store details so we don't hit SQL Server on every pivot call
let storeDetailsCache = null;
let storeCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getStoreDetails() {
  const now = Date.now();
  if (storeDetailsCache && now - storeCacheTime < CACHE_TTL) {
    return storeDetailsCache;
  }
  const pool = await getPool();
  // Use GetRegionStoreDetailAndCalendar so store cache is populated from the same SP
  const result = await pool.request().execute('GetRegionStoreDetailAndCalendar');
  const map = {};
  for (const row of result.recordsets[0]) {
    const id = (row.A ?? '').toString().trim();
    map[id] = {
      STORE_NAME: (row.C ?? '').toString().trim(),
      TERRITORY: (row.B ?? '').toString().trim(),
      DATE_OPENED: (row.D ?? '').toString().trim(),
      REGION_ID: (row.E ?? '').toString().trim(),
    };
  }
  storeDetailsCache = map;
  storeCacheTime = now;
  return map;
}

function calcComp(cy, ly) {
  const cyNum = Number(cy) || 0;
  const lyNum = Number(ly) || 0;

  // Match FlashSaleC# web behavior: if either side is zero, comp is forced to 0.00%.
  if (cyNum === 0 || lyNum === 0) return 0;

  return parseFloat((((cyNum - lyNum) / lyNum) * 100).toFixed(2));
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + (r[field] || 0), 0);
}

function buildTerritoryTotal(territory, storeRows, regionId = '') {
  const dayCY = sumField(storeRows, 'DAY_SALES_CY');
  const dayLY = sumField(storeRows, 'DAY_SALES_LY');
  const wtdCY = sumField(storeRows, 'WTD_SALES_CY');
  const wtdLY = sumField(storeRows, 'WTD_SALES_LY');
  const ytdCY = sumField(storeRows, 'YTD_SALES_CY');
  const ytdLY = sumField(storeRows, 'YTD_SALES_LY');
  return {
    STORE_ID: '',
    STORE_NAME: territory + ' Total',
    TERRITORY: territory,
    REGION_ID: regionId,
    DATE_OPENED: '',
    DAY_SALES_CY: dayCY,
    DAY_SALES_LY: dayLY,
    DAY_SALES_COMP: calcComp(dayCY, dayLY),
    WTD_SALES_CY: wtdCY,
    WTD_SALES_LY: wtdLY,
    WTD_SALES_COMP: calcComp(wtdCY, wtdLY),
    YTD_SALES_CY: ytdCY,
    YTD_SALES_LY: ytdLY,
    YTD_SALES_COMP: calcComp(ytdCY, ytdLY),
    IS_TERRITORY_TOTAL: true,
    IS_GRAND_TOTAL: false,
  };
}

function formatDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = value.toString().trim();
  const ymd = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str.substring(0, 10);
}

// GET /api/sales/latest-date — Latest sales date from AHLIBR.STRSLSSMRY (the same table the pivot SP queries)
router.get('/latest-date', async (req, res) => {
  try {
    console.log('[latest-date] Querying MAX SALES_ON_DATE from AHLIBR.STRSLSSMRY...');
    const result = await odbcQuery(
      `SELECT MAX(SALES_ON_DATE) AS LATEST_DATE FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1`,
      []
    );
    const raw = result?.[0]?.LATEST_DATE;
    console.log('[latest-date] Raw value:', raw, '| type:', typeof raw);
    // Keep date-only semantics (no UTC conversion)
    const latestDate = formatDateOnly(raw);
    console.log('[latest-date] Result:', latestDate);
    res.json({ latestDate });
  } catch (err) {
    console.error('GET /api/sales/latest-date error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/dds — Store list + Fiscal Calendar from SQL Server
router.get('/dds', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .execute('GetRegionStoreDetailAndCalendar');

    // Result set 0 — stores: A=Store_ID, B=ASGS_NAME, C=Store_Name, D=Date_Opened, E=Region_ID
    const subClass = (result.recordsets[0] || []).map((row) => ({
      Store_ID: (row.A ?? '').toString().trim(),
      ASGS_NAME: (row.B ?? '').toString().trim(),
      Store_Name: (row.C ?? '').toString().trim(),
      Date_Opened: (row.D ?? '').toString().trim(),
      Region_ID: (row.E ?? '').toString().trim(),
    }));

    // Result set 1 — fiscal calendar: A=FiscalDate, B=FiscalYear, C=WeekInYear, D=DayInWeek, E=DayInYear, F=CalQuarter
    const fiscalCalendar = (result.recordsets[1] || []).map((row) => ({
      FiscalDate: (row.A ?? '').toString().trim(),
      FiscalYear: (row.B ?? '').toString().trim(),
      WeekInYear: (row.C ?? '').toString().trim(),
      DayInWeek: (row.D ?? '').toString().trim(),
      DayInYear: (row.E ?? '').toString().trim(),
      CalQuarter: (row.F ?? '').toString().trim(),
    }));

    res.json({ SubClass: subClass, FiscalCalendar: fiscalCalendar });
  } catch (err) {
    console.error('GET /api/sales/dds error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/pivot — Pivot sales from IBM i, enriched with store details
router.get('/pivot', async (req, res) => {
  try {
    const {
      DT_1, DT_2,
      P_WTD_1_S, P_WTD_1_E,
      P_WTD_2_S, P_WTD_2_E,
      P_YTD_1_S, P_YTD_1_E,
      P_YTD_2_S, P_YTD_2_E,
    } = req.query;

    // Fetch ODBC pivot data and store details in parallel
    console.log('[pivot] Starting parallel fetch: ODBC + SQL Server...');
    const [odbcResult, storeMap] = await Promise.all([
      odbcQuery(
        `{ CALL KANDY.GET_STORE_SALES_BY_DATES_PIVOT(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }`,
        [DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E, P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E]
      ),
      getStoreDetails(),
    ]);
    console.log(`[pivot] Got ${odbcResult?.length ?? 0} ODBC rows, ${Object.keys(storeMap).length} store entries`);

    // Map ODBC columns to frontend column names and enrich with store metadata
    const storeRows = odbcResult.map((row) => {
      const storeId = (row.STORE_ID ?? '').toString().trim();
      const info = storeMap[storeId] || { STORE_NAME: storeId, TERRITORY: 'Unknown', DATE_OPENED: '' };

      const dayCY = parseFloat(row.TOTAL_DATE_1) || 0;
      const dayLY = parseFloat(row.TOTAL_DATE_2) || 0;
      const dayComp = calcComp(dayCY, dayLY);

      const wtdCY = parseFloat(row.TOTAL_WTD_1) || 0;
      const wtdLY = parseFloat(row.TOTAL_WTD_2) || 0;
      const wtdComp = calcComp(wtdCY, wtdLY);

      const ytdCY = parseFloat(row.TOTAL_YTD_1) || 0;
      const ytdLY = parseFloat(row.TOTAL_YTD_2) || 0;
      const ytdComp = calcComp(ytdCY, ytdLY);

      return {
        STORE_ID: storeId,
        STORE_NAME: info.STORE_NAME,
        TERRITORY: info.TERRITORY,
        REGION_ID: info.REGION_ID || '',
        DATE_OPENED: info.DATE_OPENED,
        DAY_SALES_CY: dayCY,
        DAY_SALES_LY: dayLY,
        DAY_SALES_COMP: dayComp,
        WTD_SALES_CY: wtdCY,
        WTD_SALES_LY: wtdLY,
        WTD_SALES_COMP: wtdComp,
        YTD_SALES_CY: ytdCY,
        YTD_SALES_LY: ytdLY,
        YTD_SALES_COMP: ytdComp,
        IS_TERRITORY_TOTAL: false,
        IS_GRAND_TOTAL: false,
      };
    });

    // Group by Territory and add territory-total rows
    const territories = {};
    for (const row of storeRows) {
      if (!territories[row.TERRITORY]) territories[row.TERRITORY] = [];
      territories[row.TERRITORY].push(row);
    }

    const enriched = [];
    for (const [territory, rows] of Object.entries(territories).sort(([a], [b]) => a.localeCompare(b))) {
      rows.sort((a, b) => a.STORE_NAME.localeCompare(b.STORE_NAME));
      enriched.push(...rows);
      const regionId = rows[0]?.REGION_ID || '';
      enriched.push(buildTerritoryTotal(territory, rows, regionId));
    }

    // Grand total row
    const grandDayCY = sumField(storeRows, 'DAY_SALES_CY');
    const grandDayLY = sumField(storeRows, 'DAY_SALES_LY');
    const grandWtdCY = sumField(storeRows, 'WTD_SALES_CY');
    const grandWtdLY = sumField(storeRows, 'WTD_SALES_LY');
    const grandYtdCY = sumField(storeRows, 'YTD_SALES_CY');
    const grandYtdLY = sumField(storeRows, 'YTD_SALES_LY');

    enriched.push({
      STORE_ID: '',
      STORE_NAME: 'Grand Total',
      TERRITORY: '',
      REGION_ID: '',
      DATE_OPENED: '',
      DAY_SALES_CY: grandDayCY,
      DAY_SALES_LY: grandDayLY,
      DAY_SALES_COMP: calcComp(grandDayCY, grandDayLY),
      WTD_SALES_CY: grandWtdCY,
      WTD_SALES_LY: grandWtdLY,
      WTD_SALES_COMP: calcComp(grandWtdCY, grandWtdLY),
      YTD_SALES_CY: grandYtdCY,
      YTD_SALES_LY: grandYtdLY,
      YTD_SALES_COMP: calcComp(grandYtdCY, grandYtdLY),
      IS_TERRITORY_TOTAL: false,
      IS_GRAND_TOTAL: true,
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/sales/pivot error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/hist — Historical sales from IBM i
router.get('/hist', async (req, res) => {
  try {
    const { date1, date2 } = req.query;

    const result = await odbcQuery(
      `{ CALL KANDY.GET_STORE_SALES_BY_DATES(?, ?) }`,
      [date1, date2]
    );

    // result is an array of rows - send directly
    res.json(Array.from(result));
  } catch (err) {
    console.error('GET /api/sales/hist error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/pivotsum — New primary summary endpoint using AHLIBR.GET_SALES_PVT_SUMRY (14 params, includes QTD)
router.get('/pivotsum', async (req, res) => {
  try {
    const {
      DT_1, DT_2,
      P_WTD_1_S, P_WTD_1_E,
      P_WTD_2_S, P_WTD_2_E,
      P_QTD_1_S, P_QTD_1_E,
      P_QTD_2_S, P_QTD_2_E,
      P_YTD_1_S, P_YTD_1_E,
      P_YTD_2_S, P_YTD_2_E,
    } = req.query;

    // ── Heavy debug: dump every param so we can see exactly what the SP receives ──
    const spParams = { DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
                        P_QTD_1_S, P_QTD_1_E, P_QTD_2_S, P_QTD_2_E,
                        P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E };
    console.log('[pivotsum] ───── Received params ─────');
    console.log(JSON.stringify(spParams, null, 2));
    // Check for any undefined / empty params
    for (const [k, v] of Object.entries(spParams)) {
      if (v === undefined || v === null || v === '') {
        console.warn(`[pivotsum] ⚠️  Param ${k} is EMPTY / undefined!`);
      }
    }

    console.log('[pivotsum] Starting parallel fetch: ODBC + SQL Server...');
    const [odbcResult, storeMap] = await Promise.all([
      odbcQuery(
        `{ CALL AHLIBR.GET_SALES_PVT_SUMRY(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }`,
        [DT_1, DT_2,
         P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
         P_QTD_1_S, P_QTD_1_E, P_QTD_2_S, P_QTD_2_E,
         P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E]
      ),
      getStoreDetails(),
    ]);
    console.log(`[pivotsum] Got ${odbcResult?.length ?? 0} ODBC rows, ${Object.keys(storeMap).length} store entries`);

    // ── Dump first normalised row so we can see actual column names & values ──
    if (odbcResult && odbcResult.length > 0) {
      console.log('[pivotsum] First normalised row:', JSON.stringify(odbcResult[0]));
    } else {
      console.warn('[pivotsum] ⚠️  0 rows returned from SP — check params above');
    }

    // Extract TOTAL_ROWS from first row (same value for all rows per SP design)
    let totalRows = 0;
    if (odbcResult && odbcResult.length > 0 && odbcResult[0].TOTAL_ROWS != null) {
      totalRows = parseInt(odbcResult[0].TOTAL_ROWS) || 0;
    }

    // Map ODBC columns to frontend column names and enrich with store metadata
    const storeRows = odbcResult.map((row) => {
      const storeId = (row.STORE_ID ?? '').toString().trim();
      const info = storeMap[storeId] || { STORE_NAME: storeId, TERRITORY: 'Unknown', DATE_OPENED: '' };

      const dayCY  = parseFloat(row.TOTAL_DATE_1) || 0;
      const dayLY  = parseFloat(row.TOTAL_DATE_2) || 0;
      const wtdCY  = parseFloat(row.TOTAL_WTD_1)  || 0;
      const wtdLY  = parseFloat(row.TOTAL_WTD_2)  || 0;
      const qtdCY  = parseFloat(row.TOTAL_QTD_1)  || 0;
      const qtdLY  = parseFloat(row.TOTAL_QTD_2)  || 0;
      const ytdCY  = parseFloat(row.TOTAL_YTD_1)  || 0;
      const ytdLY  = parseFloat(row.TOTAL_YTD_2)  || 0;

      return {
        STORE_ID:        storeId,
        STORE_NAME:      info.STORE_NAME,
        TERRITORY:       info.TERRITORY,
        REGION_ID:       info.REGION_ID || '',
        DATE_OPENED:     info.DATE_OPENED,
        DAY_SALES_CY:    dayCY,
        DAY_SALES_LY:    dayLY,
        DAY_SALES_COMP:  calcComp(dayCY, dayLY),
        WTD_SALES_CY:    wtdCY,
        WTD_SALES_LY:    wtdLY,
        WTD_SALES_COMP:  calcComp(wtdCY, wtdLY),
        QTD_SALES_CY:    qtdCY,
        QTD_SALES_LY:    qtdLY,
        QTD_SALES_COMP:  calcComp(qtdCY, qtdLY),
        YTD_SALES_CY:    ytdCY,
        YTD_SALES_LY:    ytdLY,
        YTD_SALES_COMP:  calcComp(ytdCY, ytdLY),
        IS_TERRITORY_TOTAL: false,
        IS_GRAND_TOTAL:     false,
      };
    });

    // Group by Territory and add territory-total rows
    const territories = {};
    for (const row of storeRows) {
      if (!territories[row.TERRITORY]) territories[row.TERRITORY] = [];
      territories[row.TERRITORY].push(row);
    }

    const enriched = [];
    for (const [territory, rows] of Object.entries(territories).sort(([a], [b]) => a.localeCompare(b))) {
      rows.sort((a, b) => a.STORE_NAME.localeCompare(b.STORE_NAME));
      enriched.push(...rows);
      // Territory total
      const regionId = rows[0]?.REGION_ID || '';
      const dayCY  = sumField(rows, 'DAY_SALES_CY');
      const dayLY  = sumField(rows, 'DAY_SALES_LY');
      const wtdCY  = sumField(rows, 'WTD_SALES_CY');
      const wtdLY  = sumField(rows, 'WTD_SALES_LY');
      const qtdCY  = sumField(rows, 'QTD_SALES_CY');
      const qtdLY  = sumField(rows, 'QTD_SALES_LY');
      const ytdCY  = sumField(rows, 'YTD_SALES_CY');
      const ytdLY  = sumField(rows, 'YTD_SALES_LY');
      enriched.push({
        STORE_ID: '', STORE_NAME: territory + ' Total', TERRITORY: territory, REGION_ID: regionId, DATE_OPENED: '',
        DAY_SALES_CY: dayCY, DAY_SALES_LY: dayLY, DAY_SALES_COMP: calcComp(dayCY, dayLY),
        WTD_SALES_CY: wtdCY, WTD_SALES_LY: wtdLY, WTD_SALES_COMP: calcComp(wtdCY, wtdLY),
        QTD_SALES_CY: qtdCY, QTD_SALES_LY: qtdLY, QTD_SALES_COMP: calcComp(qtdCY, qtdLY),
        YTD_SALES_CY: ytdCY, YTD_SALES_LY: ytdLY, YTD_SALES_COMP: calcComp(ytdCY, ytdLY),
        IS_TERRITORY_TOTAL: true, IS_GRAND_TOTAL: false,
      });
    }

    // Grand total row
    const gDayCY  = sumField(storeRows, 'DAY_SALES_CY');
    const gDayLY  = sumField(storeRows, 'DAY_SALES_LY');
    const gWtdCY  = sumField(storeRows, 'WTD_SALES_CY');
    const gWtdLY  = sumField(storeRows, 'WTD_SALES_LY');
    const gQtdCY  = sumField(storeRows, 'QTD_SALES_CY');
    const gQtdLY  = sumField(storeRows, 'QTD_SALES_LY');
    const gYtdCY  = sumField(storeRows, 'YTD_SALES_CY');
    const gYtdLY  = sumField(storeRows, 'YTD_SALES_LY');
    enriched.push({
      STORE_ID: '', STORE_NAME: 'Grand Total', TERRITORY: '', REGION_ID: '', DATE_OPENED: '',
      DAY_SALES_CY: gDayCY, DAY_SALES_LY: gDayLY, DAY_SALES_COMP: calcComp(gDayCY, gDayLY),
      WTD_SALES_CY: gWtdCY, WTD_SALES_LY: gWtdLY, WTD_SALES_COMP: calcComp(gWtdCY, gWtdLY),
      QTD_SALES_CY: gQtdCY, QTD_SALES_LY: gQtdLY, QTD_SALES_COMP: calcComp(gQtdCY, gQtdLY),
      YTD_SALES_CY: gYtdCY, YTD_SALES_LY: gYtdLY, YTD_SALES_COMP: calcComp(gYtdCY, gYtdLY),
      IS_TERRITORY_TOTAL: false, IS_GRAND_TOTAL: true,
    });

    res.json({ PivotData: enriched, TotalCount: totalRows });
  } catch (err) {
    console.error('GET /api/sales/pivotsum error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/debug-pivotsum — Self-contained quick-test with hardcoded dates OR query params.
// Hit http://localhost:3001/api/sales/debug-pivotsum  (no params needed)
router.get('/debug-pivotsum', async (req, res) => {
  try {
    // Use query params if supplied, otherwise use the same date the web app hardcodes
    const DT_1        = req.query.DT_1        || '2026-02-10';
    const DT_2        = req.query.DT_2        || '2025-02-11';
    const P_WTD_1_S   = req.query.P_WTD_1_S   || '2026-02-08';
    const P_WTD_1_E   = req.query.P_WTD_1_E   || '2026-02-10';
    const P_WTD_2_S   = req.query.P_WTD_2_S   || '2025-02-09';
    const P_WTD_2_E   = req.query.P_WTD_2_E   || '2025-02-11';
    const P_QTD_1_S   = req.query.P_QTD_1_S   || '2026-01-01';
    const P_QTD_1_E   = req.query.P_QTD_1_E   || '2026-02-10';
    const P_QTD_2_S   = req.query.P_QTD_2_S   || '2025-01-01';
    const P_QTD_2_E   = req.query.P_QTD_2_E   || '2025-02-11';
    const P_YTD_1_S   = req.query.P_YTD_1_S   || '2025-02-02';
    const P_YTD_1_E   = req.query.P_YTD_1_E   || '2026-02-10';
    const P_YTD_2_S   = req.query.P_YTD_2_S   || '2024-02-04';
    const P_YTD_2_E   = req.query.P_YTD_2_E   || '2025-02-11';

    const params = [DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
                    P_QTD_1_S, P_QTD_1_E, P_QTD_2_S, P_QTD_2_E,
                    P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E];

    console.log('[debug-pivotsum] Calling SP with params:', params);

    // ── Step 1: raw ODBC result (before normalizeRow) ──
    const pool = await getIbmPool();
    const rawResult = await pool.query(
      `{ CALL AHLIBR.GET_SALES_PVT_SUMRY(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }`,
      params
    );

    const rawKeys   = rawResult && rawResult.length > 0 ? Object.keys(rawResult[0]) : [];
    const rawSample = rawResult ? rawResult.slice(0, 2) : [];

    // ── Step 2: normalised result ──
    const normalised = (rawResult || []).map(normalizeRow);
    const normKeys   = normalised.length > 0 ? Object.keys(normalised[0]) : [];
    const normSample = normalised.slice(0, 2);

    const out = {
      paramsUsed: { DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
                    P_QTD_1_S, P_QTD_1_E, P_QTD_2_S, P_QTD_2_E,
                    P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E },
      totalRows: rawResult?.length ?? 0,
      rawColumnKeys: rawKeys,
      rawSampleRows: rawSample,
      normalisedColumnKeys: normKeys,
      normalisedSampleRows: normSample,
    };

    console.log('[debug-pivotsum] Response:', JSON.stringify(out, null, 2));
    res.json(out);
  } catch (err) {
    console.error('GET /api/sales/debug-pivotsum error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /api/sales/available-dates — Most recent distinct dates with sales data.
// The web app (FlashSaleC#) hardcodes only the latest 2 dates (e.g. ["2026-02-09","2026-02-10"]).
// We replicate that by fetching only the TOP 2 most recent distinct dates from the DB.
router.get('/available-dates', async (req, res) => {
  try {
    // Step 1: Get the latest date
    const maxResult = await odbcQuery(
      `SELECT MAX(SALES_ON_DATE) AS LATEST_DATE FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1`,
      []
    );
    const maxRaw = maxResult?.[0]?.LATEST_DATE;
    if (!maxRaw) {
      console.log('[available-dates] No dates found');
      return res.json({ dates: [] });
    }
    const latestDate = formatDateOnly(maxRaw);

    // Step 2: Get the second-latest distinct date (the one just before the max)
    const prevResult = await odbcQuery(
      `SELECT MAX(SALES_ON_DATE) AS PREV_DATE FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1 AND SALES_ON_DATE < ?`,
      [latestDate]
    );
    const prevRaw = prevResult?.[0]?.PREV_DATE;
    const dates = [latestDate];
    if (prevRaw) {
      const prev = formatDateOnly(prevRaw);
      dates.unshift(prev); // put earlier date first → sorted ascending
    }

    console.log(`[available-dates] Returning ${dates.length} dates:`, dates);
    res.json({ dates });
  } catch (err) {
    console.error('GET /api/sales/available-dates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/chart-columns — Debug: discover STRSLSSMRY column names
router.get('/chart-columns', async (req, res) => {
  try {
    const result = await odbcQuery(
      `SELECT * FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1 FETCH FIRST 1 ROWS ONLY`,
      []
    );
    const columns = result && result.length > 0 ? Object.keys(result[0]) : [];
    const sampleRow = result && result.length > 0 ? result[0] : null;
    res.json({ columns, sampleRow });
  } catch (err) {
    console.error('GET /api/sales/chart-columns error:', err);
    res.status(500).json({ error: err.message });
  }
});

function toIsoDay(value) {
  const raw = (value || '').toString().trim();
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return raw.substring(0, 10);
}

function buildChartPayload(rawRows, mode, smaPeriod) {
  if (!rawRows || rawRows.length === 0) {
    return { Labels: [], Sales: [], Sma: [] };
  }

  const dailyData = rawRows.map(r => ({
    date: toIsoDay(r.SALES_ON_DATE),
    sales: parseFloat(r.TOTAL_SALES) || 0,
  }));

  const dailySales = dailyData.map(d => d.sales);
  const dailySma = dailySales.map((_, i) => {
    if (i < smaPeriod - 1) return null;
    let sum = 0;
    for (let j = i - smaPeriod + 1; j <= i; j++) sum += dailySales[j];
    return parseFloat((sum / smaPeriod).toFixed(2));
  });

  let labels;
  let sales;
  let sma;

  if (mode === 'D') {
    labels = dailyData.map(d => d.date);
    sales = dailySales;
    sma = dailySma;
  } else if (mode === 'W') {
    const weekMap = new Map();
    for (let i = 0; i < dailyData.length; i++) {
      const d = dailyData[i];
      const dt = new Date(d.date);
      const year = dt.getFullYear();
      const jan4 = new Date(year, 0, 4);
      const dayOfYear = Math.floor((dt - new Date(year, 0, 1)) / 86400000) + 1;
      let weekNum = Math.ceil((dayOfYear + jan4.getDay() - 1) / 7);
      if (weekNum <= 0) weekNum = 53;
      if (weekNum > 53) weekNum = 53;
      const key = `W${String(weekNum).padStart(2, '0')}`;
      if (!weekMap.has(key)) weekMap.set(key, { sales: 0, smaSum: 0, smaCount: 0 });
      const bucket = weekMap.get(key);
      bucket.sales += d.sales;
      if (dailySma[i] !== null) {
        bucket.smaSum += dailySma[i];
        bucket.smaCount++;
      }
    }
    const sorted = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    labels = sorted.map(([k]) => k);
    sales = sorted.map(([, v]) => v.sales);
    sma = sorted.map(([, v]) => (v.smaCount > 0 ? parseFloat((v.smaSum / v.smaCount).toFixed(2)) : null));
  } else if (mode === 'M') {
    const monthMap = new Map();
    for (let i = 0; i < dailyData.length; i++) {
      const key = dailyData[i].date.substring(0, 7);
      if (!monthMap.has(key)) monthMap.set(key, { sales: 0, smaSum: 0, smaCount: 0 });
      const bucket = monthMap.get(key);
      bucket.sales += dailyData[i].sales;
      if (dailySma[i] !== null) {
        bucket.smaSum += dailySma[i];
        bucket.smaCount++;
      }
    }
    const sorted = Array.from(monthMap.entries());
    labels = sorted.map(([k]) => k);
    sales = sorted.map(([, v]) => v.sales);
    sma = sorted.map(([, v]) => (v.smaCount > 0 ? parseFloat((v.smaSum / v.smaCount).toFixed(2)) : null));
  } else {
    const yearMap = new Map();
    for (let i = 0; i < dailyData.length; i++) {
      const key = dailyData[i].date.substring(0, 4);
      if (!yearMap.has(key)) yearMap.set(key, { sales: 0, smaSum: 0, smaCount: 0 });
      const bucket = yearMap.get(key);
      bucket.sales += dailyData[i].sales;
      if (dailySma[i] !== null) {
        bucket.smaSum += dailySma[i];
        bucket.smaCount++;
      }
    }
    const sorted = Array.from(yearMap.entries());
    labels = sorted.map(([k]) => k);
    sales = sorted.map(([, v]) => v.sales);
    sma = sorted.map(([, v]) => (v.smaCount > 0 ? parseFloat((v.smaSum / v.smaCount).toFixed(2)) : null));
  }

  return { Labels: labels, Sales: sales, Sma: sma };
}

// GET /api/sales/analytics — Date-range analytics endpoint (matches web app call shape)
router.get('/analytics', async (req, res) => {
  try {
    const startDate = (req.query.startDate || '').toString();
    const endDate = (req.query.endDate || '').toString();
    const modeRaw = (req.query.mode || 'D').toString().toUpperCase();
    const mode = modeRaw === 'Q' ? 'M' : modeRaw;
    const smaPeriod = parseInt(req.query.smaPeriod) || 7;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    console.log(`[analytics] startDate=${startDate}, endDate=${endDate}, mode=${mode}, smaPeriod=${smaPeriod}`);

    const sql = `
      SELECT SALES_ON_DATE, SUM(NET_SALES) AS TOTAL_SALES
      FROM AHLIBR.STRSLSSMRY
      WHERE STATUS = 1
        AND SALES_ON_DATE >= ?
        AND SALES_ON_DATE <= ?
      GROUP BY SALES_ON_DATE
      ORDER BY SALES_ON_DATE
    `;

    const rawRows = await odbcQuery(sql, [startDate, endDate]);
    console.log(`[analytics] Got ${rawRows.length} raw daily rows`);

    const payload = buildChartPayload(rawRows, mode, smaPeriod);
    console.log(`[analytics] Returning ${payload.Labels.length} data points`);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/sales/analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/chart — Sales chart data for Analytics tab (year range wrapper)
router.get('/chart', async (req, res) => {
  try {
    const yearFrom = parseInt(req.query.yearFrom) || new Date().getFullYear();
    const yearTo = parseInt(req.query.yearTo) || new Date().getFullYear();
    const modeRaw = (req.query.mode || 'D').toString().toUpperCase();
    const mode = modeRaw === 'Q' ? 'M' : modeRaw;
    const smaPeriod = parseInt(req.query.smaPeriod) || 7;

    const dateFrom = `${yearFrom}-01-01`;
    const dateTo = `${yearTo}-12-31`;
    console.log(`[chart] yearFrom=${yearFrom}, yearTo=${yearTo}, mode=${mode}, smaPeriod=${smaPeriod}`);

    const sql = `
      SELECT SALES_ON_DATE, SUM(NET_SALES) AS TOTAL_SALES
      FROM AHLIBR.STRSLSSMRY
      WHERE STATUS = 1
        AND SALES_ON_DATE >= ?
        AND SALES_ON_DATE <= ?
      GROUP BY SALES_ON_DATE
      ORDER BY SALES_ON_DATE
    `;

    const rawRows = await odbcQuery(sql, [dateFrom, dateTo]);
    console.log(`[chart] Got ${rawRows.length} raw daily rows`);

    const payload = buildChartPayload(rawRows, mode, smaPeriod);
    console.log(`[chart] Returning ${payload.Labels.length} data points`);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/sales/chart error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
