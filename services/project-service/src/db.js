const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('CREATE SCHEMA IF NOT EXISTS projects');
      await pool.query(`CREATE TABLE IF NOT EXISTS projects.projects (
        id SERIAL PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS projects.files (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'javascript',
        content TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (project_id, name)
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
