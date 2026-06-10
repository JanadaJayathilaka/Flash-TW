const mssql = require('mssql');

const sqlConfig = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await mssql.connect(sqlConfig);
  }
  return pool;
}

module.exports = { getPool, mssql };
