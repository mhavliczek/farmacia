require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'farmacia',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

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
