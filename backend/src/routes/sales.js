const express = require('express');
const router = express.Router();
const { getPool, mssql } = require('../config/sqlServer');
const ibmiApi = require('../config/ibmiApi');

// ----- helpers -----

async function getStoreDetails() {
  const pool = await getPool();
  // Use GetStoreDetailsOnly for fast store details fetch (only store master rows, zero calendar/currency overhead)
  const result = await pool.request().execute('GetStoreDetailsOnly');
  const rows = result.recordsets?.[0] || result.recordset || [];
  const map = {};
  for (const row of rows) {
    const id = (row.A ?? '').toString().trim();
    map[id] = {
      STORE_NAME: (row.C ?? '').toString().trim(),
      TERRITORY: (row.B ?? '').toString().trim(),
      DATE_OPENED: (row.D ?? '').toString().trim(),
      REGION_ID: (row.E ?? '').toString().trim(),
    };
  }
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
  return rows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0);
}

function buildTerritoryTotal(territory, rows, regionId) {
  const dayCY = sumField(rows, 'DAY_SALES_CY');
  const dayLY = sumField(rows, 'DAY_SALES_LY');
  const wtdCY = sumField(rows, 'WTD_SALES_CY');
  const wtdLY = sumField(rows, 'WTD_SALES_LY');
  const ytdCY = sumField(rows, 'YTD_SALES_CY');
  const ytdLY = sumField(rows, 'YTD_SALES_LY');

  return {
    STORE_ID: '',
    STORE_NAME: `${territory} Total`,
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

// GET /api/sales/latest-date — Latest sales date from IBM i REST API
router.get('/latest-date', async (req, res) => {
  try {
    const latestDate = await ibmiApi.getLatestDate();
    res.json({ latestDate });
  } catch (err) {
    console.error('GET /api/sales/latest-date error:', err);
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

    console.log('[pivot] Fetching pivot data via IBM i REST API + SQL Server...');
    const [rawRows, storeMap] = await Promise.all([
      ibmiApi.getPivot({
        DT_1, DT_2,
        P_WTD_1_S, P_WTD_1_E,
        P_WTD_2_S, P_WTD_2_E,
        P_YTD_1_S, P_YTD_1_E,
        P_YTD_2_S, P_YTD_2_E,
      }),
      getStoreDetails(),
    ]);

    const storeRows = (rawRows || []).map((row) => {
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

// GET /api/sales/hist — Historical sales from IBM i REST API
router.get('/hist', async (req, res) => {
  try {
    const { date1, date2 } = req.query;
    const result = await ibmiApi.getHist(date1, date2);
    res.json(Array.from(result || []));
  } catch (err) {
    console.error('GET /api/sales/hist error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/pivotsum — Primary summary endpoint using IBM i REST API (GET_SALES_PVT_SUMRY)
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

    const spParams = { DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
                        P_QTD_1_S, P_QTD_1_E, P_QTD_2_S, P_QTD_2_E,
                        P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E };

    console.log('[pivotsum] Fetching summary via IBM i REST API + SQL Server...');
    const [rawRows, storeMap] = await Promise.all([
      ibmiApi.getPivotSum(spParams),
      getStoreDetails(),
    ]);
    console.log(`[pivotsum] Done! Got ${rawRows?.length || 0} DB2 rows, ${Object.keys(storeMap).length} stores from SQL Server`);

    let totalRows = 0;
    if (rawRows && rawRows.length > 0 && rawRows[0].TOTAL_ROWS != null) {
      totalRows = parseInt(rawRows[0].TOTAL_ROWS) || 0;
    }

    const storeRows = (rawRows || []).map((row) => {
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
      const regionId = rows[0]?.REGION_ID || '';

      const dayCY = sumField(rows, 'DAY_SALES_CY');
      const dayLY = sumField(rows, 'DAY_SALES_LY');
      const wtdCY = sumField(rows, 'WTD_SALES_CY');
      const wtdLY = sumField(rows, 'WTD_SALES_LY');
      const qtdCY = sumField(rows, 'QTD_SALES_CY');
      const qtdLY = sumField(rows, 'QTD_SALES_LY');
      const ytdCY = sumField(rows, 'YTD_SALES_CY');
      const ytdLY = sumField(rows, 'YTD_SALES_LY');

      enriched.push({
        STORE_ID:           '',
        STORE_NAME:         `${territory} Total`,
        TERRITORY:          territory,
        REGION_ID:          regionId,
        DATE_OPENED:        '',
        DAY_SALES_CY:       dayCY,
        DAY_SALES_LY:       dayLY,
        DAY_SALES_COMP:     calcComp(dayCY, dayLY),
        WTD_SALES_CY:       wtdCY,
        WTD_SALES_LY:       wtdLY,
        WTD_SALES_COMP:     calcComp(wtdCY, wtdLY),
        QTD_SALES_CY:       qtdCY,
        QTD_SALES_LY:       qtdLY,
        QTD_SALES_COMP:     calcComp(qtdCY, qtdLY),
        YTD_SALES_CY:       ytdCY,
        YTD_SALES_LY:       ytdLY,
        YTD_SALES_COMP:     calcComp(ytdCY, ytdLY),
        IS_TERRITORY_TOTAL: true,
        IS_GRAND_TOTAL:     false,
      });
    }

    // Grand total row
    const grandDayCY = sumField(storeRows, 'DAY_SALES_CY');
    const grandDayLY = sumField(storeRows, 'DAY_SALES_LY');
    const grandWtdCY = sumField(storeRows, 'WTD_SALES_CY');
    const grandWtdLY = sumField(storeRows, 'WTD_SALES_LY');
    const grandQtdCY = sumField(storeRows, 'QTD_SALES_CY');
    const grandQtdLY = sumField(storeRows, 'QTD_SALES_LY');
    const grandYtdCY = sumField(storeRows, 'YTD_SALES_CY');
    const grandYtdLY = sumField(storeRows, 'YTD_SALES_LY');

    enriched.push({
      STORE_ID:           '',
      STORE_NAME:         'Grand Total',
      TERRITORY:          '',
      REGION_ID:          '',
      DATE_OPENED:        '',
      DAY_SALES_CY:       grandDayCY,
      DAY_SALES_LY:       grandDayLY,
      DAY_SALES_COMP:     calcComp(grandDayCY, grandDayLY),
      WTD_SALES_CY:       grandWtdCY,
      WTD_SALES_LY:       grandWtdLY,
      WTD_SALES_COMP:     calcComp(grandWtdCY, grandWtdLY),
      QTD_SALES_CY:       grandQtdCY,
      QTD_SALES_LY:       grandQtdLY,
      QTD_SALES_COMP:     calcComp(grandQtdCY, grandQtdLY),
      YTD_SALES_CY:       grandYtdCY,
      YTD_SALES_LY:       grandYtdLY,
      YTD_SALES_COMP:     calcComp(grandYtdCY, grandYtdLY),
      IS_TERRITORY_TOTAL: false,
      IS_GRAND_TOTAL:     true,
    });

    res.json({
      PivotData: enriched,
      Rows: enriched,
      TotalCount: totalRows
    });
  } catch (err) {
    console.error('GET /api/sales/pivotsum error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/available-dates — Most recent distinct dates with sales data.
router.get('/available-dates', async (req, res) => {
  try {
    const latestDate = await ibmiApi.getLatestDate();
    if (!latestDate) return res.json({ dates: [] });
    const prevDate = await ibmiApi.getPrevDate(latestDate);
    const dates = [latestDate];
    if (prevDate) dates.unshift(prevDate);
    res.json({ dates });
  } catch (err) {
    console.error('GET /api/sales/available-dates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sales/chart-columns — Discover STRSLSSMRY column names
router.get('/chart-columns', async (req, res) => {
  try {
    const columns = await ibmiApi.getChartColumns();
    res.json({ columns, sampleRow: null });
  } catch (err) {
    console.error('GET /api/sales/chart-columns error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper for analytics
function buildChartPayload(rows, mode, period) {
  const map = {};
  for (const r of rows) {
    const dStr = formatDateOnly(r.SALES_ON_DATE);
    const net = parseFloat(r.TOTAL_SALES) || 0;
    if (dStr) map[dStr] = net;
  }

  const sortedDates = Object.keys(map).sort();
  const labels = [];
  const sales = [];

  if (mode === 'M') {
    const monthMap = {};
    for (const d of sortedDates) {
      const ym = d.substring(0, 7);
      monthMap[ym] = (monthMap[ym] || 0) + map[d];
    }
    for (const [ym, val] of Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))) {
      labels.push(ym);
      sales.push(Math.round(val * 100) / 100);
    }
  } else {
    for (const d of sortedDates) {
      labels.push(d);
      sales.push(Math.round(map[d] * 100) / 100);
    }
  }

  const sma = [];
  for (let i = 0; i < sales.length; i++) {
    if (i + 1 < period) {
      sma.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += sales[j];
      }
      sma.push(Math.round((sum / period) * 100) / 100);
    }
  }

  return { Labels: labels, Sales: sales, Sma: sma };
}

async function getAnalyticsData(startDate, endDate, modeRaw, smaPeriod) {
  const mode = (modeRaw || 'D').toString().toUpperCase() === 'Q' ? 'M' : (modeRaw || 'D').toString().toUpperCase();
  const period = parseInt(smaPeriod) || 7;

  console.log('[getAnalyticsData] Fetching analytics via IBM i REST API...');
  const rawRows = await ibmiApi.getAnalytics(startDate, endDate);
  console.log(`[getAnalyticsData] Got ${rawRows.length} raw daily rows`);

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
