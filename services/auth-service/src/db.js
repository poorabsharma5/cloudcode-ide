const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('CREATE SCHEMA IF NOT EXISTS auth');
      await pool.query(`CREATE TABLE IF NOT EXISTS auth.users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      return;
    } catch (err) {
      console.log(`db not ready (${err.code || err.message}), retrying...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('database unavailable');
}

module.exports = { pool, init };
