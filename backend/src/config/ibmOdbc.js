// DEPRECATED: IBM ODBC Driver connection is no longer required.
// The backend now uses a driverless HTTP REST API + IBM i 7.1 QSYS DataQueue architecture.
// See /backend/src/config/ibmSyncStore.js and /backend/src/routes/sync.js

module.exports = {
  getIbmPool: async () => {
    throw new Error('IBM ODBC Driver is deprecated. Use ibmSyncStore and /api/sync routes.');
  },
  resetIbmPool: async () => {},
};
