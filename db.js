const { Pool } = require('pg');

console.log('🔌 Initializing database connection...');

// Render injects DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enhanced SSL configuration for Supabase/PostgreSQL
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Connection timeout and retry settings
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10, // Maximum number of clients in the pool
  // Enable keep-alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed on startup:', err.message);
    console.error('Connection details:', {
      host: process.env.DATABASE_URL ? 'URL provided' : 'No DATABASE_URL',
      ssl: process.env.NODE_ENV === 'production' ? 'enabled' : 'disabled'
    });
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
});

module.exports = pool;
