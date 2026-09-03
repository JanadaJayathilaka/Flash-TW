const express = require('express');
const router = express.Router();
const { getPool } = require('../config/sqlServer');
const ibmSyncStore = require('../config/ibmSyncStore');

// ----- Helpers -----

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return {};
  const out = {};
  for (const key of Object.keys(row)) {
    out[key.toUpperCase()] = row[key];
  }
  return out;
}

async function getStoreDetails() {
  try {
    const pool = await getPool();
    // Use GetRegionStoreDetailAndCalendarAndRates from SQL Server
    const result = await pool.request().execute('GetRegionStoreDetailAndCalendarAndRates');
    const map = {};
    for (const row of result.recordsets[0] || []) {
      const id = (row.A ?? '').toString().trim();
      map[id] = {
        STORE_NAME: (row.C ?? '').toString().trim(),
        TERRITORY: (row.B ?? '').toString().trim(),
        DATE_OPENED: (row.D ?? '').toString().trim(),
        REGION_ID: (row.E ?? '').toString().trim(),
      };
    }
    return map;
  } catch (err) {
    console.error('[sales.js] Error fetching store details from SQL Server:', err.message);
    return {};
  }
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
  const qtdCY = sumField(storeRows, 'QTD_SALES_CY');
  const qtdLY = sumField(storeRows, 'QTD_SALES_LY');
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
    QTD_SALES_CY: qtdCY,
    QTD_SALES_LY: qtdLY,
    QTD_SALES_COMP: calcComp(qtdCY, qtdLY),
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
    return value.toISOString().split('T')[0];
  }

  const str = value.toString().trim();
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return str.substring(0, 10);
}

// ---------------- Routes ----------------

// GET /api/sales/latest-date — Latest sales date synced from IBM i
router.get('/latest-date', async (req, res) => {
  try {
    const latestDate = ibmSyncStore.getLatestDate();
    console.log('[latest-date] Returning synced latest date:', latestDate);
    res.json({ latestDate });
  } catch (err) {
    console.error('GET /api/sales/latest-date error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/available-dates — Top 2 most recent distinct dates synced from IBM i
router.get('/available-dates', async (req, res) => {
  try {
    const dates = ibmSyncStore.getAvailableDates();
    console.log(`[available-dates] Returning ${dates.length} synced dates:`, dates);
    res.json({ dates });
  } catch (err) {
    console.error('GET /api/sales/available-dates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/dds — Store list + Fiscal Calendar + Currency Rates from SQL Server
router.get('/dds', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .execute('GetRegionStoreDetailAndCalendarAndRates');

    // Result set 0 — stores: A=Store_ID, B=ASGS_NAME, C=Store_Name, D=Date_Opened, E=Region_ID
    const subClass = (result.recordsets[0] || []).map((row) => ({
      Store_ID: (row.A ?? '').toString().trim(),
      ASGS_NAME: (row.B ?? '').toString().trim(),
      Store_Name: (row.C ?? '').toString().trim(),
      Date_Opened: formatDateOnly(row.D) || (row.D ?? '').toString().trim(),
      Region_ID: (row.E ?? '').toString().trim(),
    }));

    // Result set 1 — fiscal calendar: A=FiscalDate, B=FiscalYear, C=WeekInYear, D=DayInWeek, E=DayInYear, F=CalQuarter
    const fiscalCalendar = (result.recordsets[1] || []).map((row) => ({
      FiscalDate: formatDateOnly(row.A) || (row.A ?? '').toString().trim(),
      FiscalYear: (row.B ?? '').toString().trim(),
      WeekInYear: (row.C ?? '').toString().trim(),
      DayInWeek: (row.D ?? '').toString().trim(),
      DayInYear: (row.E ?? '').toString().trim(),
      CalQuarter: (row.F ?? '').toString().trim(),
    }));

    // Result set 2 — currency rates: B=CDate, C=AuDEquiv
    const currencyCal = (result.recordsets[2] || []).map((row) => ({
      CDate: formatDateOnly(row.B) || (row.B ?? '').toString().trim(),
      AuDEquiv: (row.C ?? '').toString().trim(),
    }));

    res.json({ SubClass: subClass, FiscalCalendar: fiscalCalendar, Currency_Cal: currencyCal });
  } catch (err) {
    console.error('GET /api/sales/dds error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/pivotsum — Primary summary endpoint (14 params) served via DataQueue sync store & SQL Server
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

    const cacheKey = DT_1 && DT_2 ? `${DT_1}_${DT_2}` : null;
    let syncRows = ibmSyncStore.getPivotsumRows(cacheKey);
    const storeMap = await getStoreDetails();

    console.log(`[pivotsum] Serving ${syncRows.length} rows from IBM Sync Store (${Object.keys(storeMap).length} store metadata entries)`);

    // If sync store is currently empty, build rows from store metadata so frontend shows complete layout
    if (syncRows.length === 0 && Object.keys(storeMap).length > 0) {
      console.log('[pivotsum] Sync store empty, generating skeleton rows from store master');
      syncRows = Object.keys(storeMap).map((storeId) => ({
        STORE_ID: storeId,
        TOTAL_DATE_1: 0,
        TOTAL_DATE_2: 0,
        TOTAL_WTD_1: 0,
        TOTAL_WTD_2: 0,
        TOTAL_QTD_1: 0,
        TOTAL_QTD_2: 0,
        TOTAL_YTD_1: 0,
        TOTAL_YTD_2: 0,
        TOTAL_ROWS: Object.keys(storeMap).length,
      }));
    }

    let totalRows = syncRows.length;
    if (syncRows.length > 0 && syncRows[0].TOTAL_ROWS != null) {
      totalRows = parseInt(syncRows[0].TOTAL_ROWS) || syncRows.length;
    }

    // Map columns and enrich with store metadata
    const storeRows = syncRows.map((row) => {
      const storeId = (row.STORE_ID ?? '').toString().trim();
      const info = storeMap[storeId] || { STORE_NAME: storeId, TERRITORY: 'Unknown', DATE_OPENED: '', REGION_ID: '' };

      const dayCY = parseFloat(row.TOTAL_DATE_1) || 0;
      const dayLY = parseFloat(row.TOTAL_DATE_2) || 0;
      const wtdCY = parseFloat(row.TOTAL_WTD_1) || 0;
      const wtdLY = parseFloat(row.TOTAL_WTD_2) || 0;
      const qtdCY = parseFloat(row.TOTAL_QTD_1) || 0;
      const qtdLY = parseFloat(row.TOTAL_QTD_2) || 0;
      const ytdCY = parseFloat(row.TOTAL_YTD_1) || 0;
      const ytdLY = parseFloat(row.TOTAL_YTD_2) || 0;

      return {
        STORE_ID: storeId,
        STORE_NAME: info.STORE_NAME,
        TERRITORY: info.TERRITORY,
        REGION_ID: info.REGION_ID || '',
        DATE_OPENED: info.DATE_OPENED,
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
    const gDayCY = sumField(storeRows, 'DAY_SALES_CY');
    const gDayLY = sumField(storeRows, 'DAY_SALES_LY');
    const gWtdCY = sumField(storeRows, 'WTD_SALES_CY');
    const gWtdLY = sumField(storeRows, 'WTD_SALES_LY');
    const gQtdCY = sumField(storeRows, 'QTD_SALES_CY');
    const gQtdLY = sumField(storeRows, 'QTD_SALES_LY');
    const gYtdCY = sumField(storeRows, 'YTD_SALES_CY');
    const gYtdLY = sumField(storeRows, 'YTD_SALES_LY');

    enriched.push({
      STORE_ID: '',
      STORE_NAME: 'Grand Total',
      TERRITORY: '',
      REGION_ID: '',
      DATE_OPENED: '',
      DAY_SALES_CY: gDayCY,
      DAY_SALES_LY: gDayLY,
      DAY_SALES_COMP: calcComp(gDayCY, gDayLY),
      WTD_SALES_CY: gWtdCY,
      WTD_SALES_LY: gWtdLY,
      WTD_SALES_COMP: calcComp(gWtdCY, gWtdLY),
      QTD_SALES_CY: gQtdCY,
      QTD_SALES_LY: gQtdLY,
      QTD_SALES_COMP: calcComp(gQtdCY, gQtdLY),
      YTD_SALES_CY: gYtdCY,
      YTD_SALES_LY: gYtdLY,
      YTD_SALES_COMP: calcComp(gYtdCY, gYtdLY),
      IS_TERRITORY_TOTAL: false,
      IS_GRAND_TOTAL: true,
    });

    res.json({ PivotData: enriched, TotalCount: totalRows });
  } catch (err) {
    console.error('GET /api/sales/pivotsum error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/pivot — Legacy 10-param pivot compatibility endpoint
router.get('/pivot', async (req, res) => {
  try {
    const syncRows = ibmSyncStore.getPivotsumRows();
    const storeMap = await getStoreDetails();

    const storeRows = syncRows.map((row) => {
      const storeId = (row.STORE_ID ?? '').toString().trim();
      const info = storeMap[storeId] || { STORE_NAME: storeId, TERRITORY: 'Unknown', DATE_OPENED: '', REGION_ID: '' };

      const dayCY = parseFloat(row.TOTAL_DATE_1) || 0;
      const dayLY = parseFloat(row.TOTAL_DATE_2) || 0;
      const wtdCY = parseFloat(row.TOTAL_WTD_1) || 0;
      const wtdLY = parseFloat(row.TOTAL_WTD_2) || 0;
      const ytdCY = parseFloat(row.TOTAL_YTD_1) || 0;
      const ytdLY = parseFloat(row.TOTAL_YTD_2) || 0;

      return {
        STORE_ID: storeId,
        STORE_NAME: info.STORE_NAME,
        TERRITORY: info.TERRITORY,
        REGION_ID: info.REGION_ID || '',
        DATE_OPENED: info.DATE_OPENED,
        DAY_SALES_CY: dayCY,
        DAY_SALES_LY: dayLY,
        DAY_SALES_COMP: calcComp(dayCY, dayLY),
        WTD_SALES_CY: wtdCY,
        WTD_SALES_LY: wtdLY,
        WTD_SALES_COMP: calcComp(wtdCY, wtdLY),
        YTD_SALES_CY: ytdCY,
        YTD_SALES_LY: ytdLY,
        YTD_SALES_COMP: calcComp(ytdCY, ytdLY),
        IS_TERRITORY_TOTAL: false,
        IS_GRAND_TOTAL: false,
      };
    });

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

// GET /api/sales/debug-pivotsum — Diagnostic status endpoint
router.get('/debug-pivotsum', async (req, res) => {
  try {
    const storeMap = await getStoreDetails();
    const rows = ibmSyncStore.getPivotsumRows();
    res.json({
      status: 'ok',
      architecture: 'Driverless IBM i 7.1 QSYS DataQueue + HTTP REST Sync',
      syncStoreStatus: ibmSyncStore.getStatus(),
      totalStoreMapCount: Object.keys(storeMap).length,
      sampleStoreRows: rows.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Analytics and Charts ----------------

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

async function getAnalyticsData(startDate, endDate, modeRaw, smaPeriod) {
  const mode = (modeRaw || 'D').toString().toUpperCase() === 'Q' ? 'M' : (modeRaw || 'D').toString().toUpperCase();
  const period = parseInt(smaPeriod) || 7;

  const rawRows = ibmSyncStore.getDailySales(startDate, endDate);
  console.log(`[getAnalyticsData] Got ${rawRows.length} synced daily rows`);

  return buildChartPayload(rawRows, mode, period);
}

// GET /api/sales/analytics — Date-range analytics endpoint
router.get('/analytics', async (req, res) => {
  try {
    const startDate = (req.query.startDate || '').toString();
    const endDate = (req.query.endDate || '').toString();
    const modeRaw = (req.query.mode || 'D').toString();
    const smaPeriod = parseInt(req.query.smaPeriod) || 7;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const payload = await getAnalyticsData(startDate, endDate, modeRaw, smaPeriod);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/sales/analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/chart — Sales chart data for Analytics tab
router.get('/chart', async (req, res) => {
  try {
    const yearFrom = parseInt(req.query.yearFrom) || new Date().getFullYear();
    const yearTo = parseInt(req.query.yearTo) || new Date().getFullYear();
    const modeRaw = (req.query.mode || 'D').toString().toUpperCase();
    const mode = modeRaw === 'Q' ? 'M' : modeRaw;
    const smaPeriod = parseInt(req.query.smaPeriod) || 7;

    const dateFrom = `${yearFrom}-01-01`;
    const dateTo = `${yearTo}-12-31`;

    const payload = await getAnalyticsData(dateFrom, dateTo, mode, smaPeriod);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/sales/chart error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.getAnalyticsData = getAnalyticsData;
