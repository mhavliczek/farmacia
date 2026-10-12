require('dotenv').config();
const mysql = require('mysql2/promise');

// Soporta MYSQL_URL (Railway/Render/PlanetScale/Aiven la entregan así)
// y también las variables separadas DB_HOST, DB_PORT, etc.
function buildConfig() {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;
  const cfg = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'farmacia',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  };
  // PlanetScale / Aiven exigen SSL. Actívalo con DB_SSL=true
  if (process.env.DB_SSL === 'true') {
    cfg.ssl = { rejectUnauthorized: true };
  }
  return cfg;
}

const pool = mysql.createPool(buildConfig());

async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    console.log('✅ MySQL conectado');
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };
