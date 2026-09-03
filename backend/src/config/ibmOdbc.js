const odbc = require('odbc');

const ibmConnStr = process.env.IBM_ODBC_DSN;

let connectionPool = null;

async function getIbmPool() {
  if (!connectionPool) {
    console.log('[IBM ODBC] Creating new pool...');
    connectionPool = await odbc.pool({
      connectionString: ibmConnStr,
      initialSize: 1,
      incrementSize: 1,
      maxSize: 5,
      shrink: true,
      connectionTimeout: 30,
      loginTimeout: 30,
    });
    console.log('[IBM ODBC] Pool created successfully');
  }
  return connectionPool;
}

// Reset pool when a stale connection error occurs
async function resetIbmPool() {
  if (connectionPool) {
    try { await connectionPool.close(); } catch (e) { /* ignore */ }
    connectionPool = null;
  }
}

module.exports = { getIbmPool, resetIbmPool };
