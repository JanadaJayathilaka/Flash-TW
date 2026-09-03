const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'sync_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[SyncStore] Warning: Could not create data directory:', err.message);
  }
}

// Default initial state
const defaultStore = {
  latestDate: '2026-02-10',
  availableDates: ['2026-02-09', '2026-02-10'],
  pivotsumRows: [],
  pivotsumCache: {}, // keyed by date parameters if multiple ranges synced
  dailySales: [
    { SALES_ON_DATE: '2026-02-01', TOTAL_SALES: 145230.50 },
    { SALES_ON_DATE: '2026-02-02', TOTAL_SALES: 158920.00 },
    { SALES_ON_DATE: '2026-02-03', TOTAL_SALES: 162100.25 },
    { SALES_ON_DATE: '2026-02-04', TOTAL_SALES: 139800.00 },
    { SALES_ON_DATE: '2026-02-05', TOTAL_SALES: 171450.75 },
    { SALES_ON_DATE: '2026-02-06', TOTAL_SALES: 189300.00 },
    { SALES_ON_DATE: '2026-02-07', TOTAL_SALES: 210400.50 },
    { SALES_ON_DATE: '2026-02-08', TOTAL_SALES: 195600.00 },
    { SALES_ON_DATE: '2026-02-09', TOTAL_SALES: 184500.25 },
    { SALES_ON_DATE: '2026-02-10', TOTAL_SALES: 204320.00 },
  ],
  lastSyncTimestamp: null,
  totalSyncCount: 0,
};

let memoryStore = { ...defaultStore };

// Load persisted state if exists
function loadFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      memoryStore = { ...defaultStore, ...parsed };
      console.log(`[SyncStore] Loaded persistent sync cache from ${STORE_FILE}`);
    }
  } catch (err) {
    console.warn('[SyncStore] Failed to load disk cache, using defaults:', err.message);
  }
}

// Save to disk
function saveToDisk() {
  if (process.env.AUTO_SAVE_SYNC_DATA !== 'false') {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(memoryStore, null, 2), 'utf8');
    } catch (err) {
      console.warn('[SyncStore] Failed to persist sync data:', err.message);
    }
  }
}

// Initialize on boot
loadFromDisk();

const ibmSyncStore = {
  getLatestDate: () => memoryStore.latestDate,
  
  setLatestDate: (dateStr) => {
    if (!dateStr) return;
    memoryStore.latestDate = dateStr.trim();
    if (!memoryStore.availableDates.includes(memoryStore.latestDate)) {
      memoryStore.availableDates.push(memoryStore.latestDate);
      memoryStore.availableDates.sort();
      if (memoryStore.availableDates.length > 2) {
        memoryStore.availableDates = memoryStore.availableDates.slice(-2);
      }
    }
    memoryStore.lastSyncTimestamp = new Date().toISOString();
    memoryStore.totalSyncCount++;
    saveToDisk();
  },

  getAvailableDates: () => memoryStore.availableDates,

  setAvailableDates: (dates) => {
    if (Array.isArray(dates) && dates.length > 0) {
      memoryStore.availableDates = dates.slice(-2); // keep top 2
      memoryStore.latestDate = dates[dates.length - 1];
      memoryStore.lastSyncTimestamp = new Date().toISOString();
      memoryStore.totalSyncCount++;
      saveToDisk();
    }
  },

  getPivotsumRows: (cacheKey) => {
    if (cacheKey && memoryStore.pivotsumCache[cacheKey]) {
      return memoryStore.pivotsumCache[cacheKey];
    }
    return memoryStore.pivotsumRows;
  },

  setPivotsumRows: (rows, cacheKey = null) => {
    if (Array.isArray(rows)) {
      memoryStore.pivotsumRows = rows;
      if (cacheKey) {
        memoryStore.pivotsumCache[cacheKey] = rows;
      }
      memoryStore.lastSyncTimestamp = new Date().toISOString();
      memoryStore.totalSyncCount++;
      saveToDisk();
    }
  },

  getDailySales: (startDate, endDate) => {
    let list = memoryStore.dailySales || [];
    if (startDate) {
      list = list.filter(r => r.SALES_ON_DATE >= startDate);
    }
    if (endDate) {
      list = list.filter(r => r.SALES_ON_DATE <= endDate);
    }
    return list;
  },

  setDailySales: (rows) => {
    if (Array.isArray(rows)) {
      // Merge unique by SALES_ON_DATE
      const map = new Map();
      (memoryStore.dailySales || []).forEach(r => map.set(r.SALES_ON_DATE, r));
      rows.forEach(r => {
        if (r.SALES_ON_DATE) {
          map.set(r.SALES_ON_DATE, {
            SALES_ON_DATE: r.SALES_ON_DATE,
            TOTAL_SALES: parseFloat(r.TOTAL_SALES) || 0,
          });
        }
      });
      memoryStore.dailySales = Array.from(map.values()).sort((a, b) => 
        a.SALES_ON_DATE.localeCompare(b.SALES_ON_DATE)
      );
      memoryStore.lastSyncTimestamp = new Date().toISOString();
      memoryStore.totalSyncCount++;
      saveToDisk();
    }
  },

  getStatus: () => ({
    latestDate: memoryStore.latestDate,
    availableDates: memoryStore.availableDates,
    pivotsumRowCount: memoryStore.pivotsumRows.length,
    dailySalesCount: memoryStore.dailySales.length,
    lastSyncTimestamp: memoryStore.lastSyncTimestamp,
    totalSyncCount: memoryStore.totalSyncCount,
  }),
};

module.exports = ibmSyncStore;
