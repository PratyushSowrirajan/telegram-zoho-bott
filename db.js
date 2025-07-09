const { Pool } = require('pg');

// Render injects DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase forces SSL; this option skips certificate validation for ease
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
