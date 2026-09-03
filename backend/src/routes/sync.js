const express = require('express');
const router = express.Router();
const ibmSyncStore = require('../config/ibmSyncStore');

// Middleware: Authenticate incoming IBM i requests if SYNC_SECRET_KEY is configured
function authSyncRequest(req, res, next) {
  const configuredSecret = process.env.SYNC_SECRET_KEY;
  if (!configuredSecret) return next(); // No auth required if not configured

  const authHeader = req.headers['x-sync-api-key'] || req.headers['authorization'];
  const bodySecret = req.body?.apiKey || req.query?.apiKey;

  if (
    (authHeader && authHeader.replace(/^Bearer\s+/i, '') === configuredSecret) ||
    bodySecret === configuredSecret
  ) {
    return next();
  }

  console.warn(`[Sync API] ⚠️ Unauthorized sync attempt from ${req.ip}`);
  return res.status(401).json({ error: 'Unauthorized: Invalid or missing sync API key' });
}

// Normalise row keys to UPPERCASE
function normalizeRowKeys(row) {
  if (!row || typeof row !== 'object') return {};
  const out = {};
  for (const key of Object.keys(row)) {
    out[key.toUpperCase()] = row[key];
  }
  return out;
}

// POST /api/sync/pivotsum — Ingest Sales Pivot Summary from IBM i 7.1 RPGLE / SP
router.post('/pivotsum', authSyncRequest, (req, res) => {
  try {
    const { rows, latestDate, availableDates, cacheKey } = req.body;

    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'Invalid payload: "rows" array is required' });
    }

    const normalizedRows = rows.map(normalizeRowKeys);
    ibmSyncStore.setPivotsumRows(normalizedRows, cacheKey);

    if (latestDate) {
      ibmSyncStore.setLatestDate(latestDate);
    }
    if (Array.isArray(availableDates) && availableDates.length > 0) {
      ibmSyncStore.setAvailableDates(availableDates);
    }

    console.log(`[Sync API] ✅ Successfully ingested ${normalizedRows.length} pivot rows from IBM i (Latest Date: ${latestDate || ibmSyncStore.getLatestDate()})`);

    res.json({
      success: true,
      message: `Ingested ${normalizedRows.length} pivot rows successfully`,
      timestamp: new Date().toISOString(),
      rowCount: normalizedRows.length,
    });
  } catch (err) {
    console.error('[Sync API] Error ingesting pivotsum:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/latest-date — Ingest Latest Date and Available Dates
router.post('/latest-date', authSyncRequest, (req, res) => {
  try {
    const { latestDate, availableDates } = req.body;

    if (latestDate) {
      ibmSyncStore.setLatestDate(latestDate);
    }
    if (Array.isArray(availableDates) && availableDates.length > 0) {
      ibmSyncStore.setAvailableDates(availableDates);
    }

    console.log(`[Sync API] ✅ Updated latest date to: ${latestDate}`);
    res.json({
      success: true,
      latestDate: ibmSyncStore.getLatestDate(),
      availableDates: ibmSyncStore.getAvailableDates(),
    });
  } catch (err) {
    console.error('[Sync API] Error updating latest date:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/sales-daily — Ingest Daily Sales Time Series for Analytics / Charts
router.post('/sales-daily', authSyncRequest, (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'Invalid payload: "rows" array is required' });
    }

    const normalizedRows = rows.map(normalizeRowKeys);
    ibmSyncStore.setDailySales(normalizedRows);

    console.log(`[Sync API] ✅ Ingested ${normalizedRows.length} daily sales entries`);
    res.json({
      success: true,
      dailySalesCount: normalizedRows.length,
    });
  } catch (err) {
    console.error('[Sync API] Error updating daily sales:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/dtaq-event — Receive native Data Queue event from IBM i trigger / RPGLE
router.post('/dtaq-event', authSyncRequest, (req, res) => {
  try {
    const event = req.body;
    console.log(`[Sync API] 📬 Received DataQueue event:`, JSON.stringify(event));

    if (event.eventType === 'PIVOT_UPDATE' && Array.isArray(event.data)) {
      ibmSyncStore.setPivotsumRows(event.data.map(normalizeRowKeys));
    }
    if (event.latestDate) {
      ibmSyncStore.setLatestDate(event.latestDate);
    }

    res.json({ success: true, processedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[Sync API] Error handling dtaq-event:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/status — Monitoring endpoint for sync health
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    storeStatus: ibmSyncStore.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
