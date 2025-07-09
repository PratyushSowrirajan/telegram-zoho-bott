const { Pool } = require('pg');

console.log('🔌 Initializing database connection...');
console.log('DATABASE_URL format check:', {
  hasUrl: !!process.env.DATABASE_URL,
  urlLength: process.env.DATABASE_URL?.length,
  startsWithPostgres: process.env.DATABASE_URL?.startsWith('postgres'),
  // Show first 50 chars for debugging (hide credentials)
  urlPreview: process.env.DATABASE_URL ? 
    `${process.env.DATABASE_URL.substring(0, 30)}...${process.env.DATABASE_URL.substring(process.env.DATABASE_URL.length - 20)}` : 
    'None'
});

// Render injects DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Force IPv4 and enhanced SSL configuration for Supabase/PostgreSQL
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Connection timeout and retry settings
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 10, // Maximum number of clients in the pool
  // Enable keep-alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
  // Try to force IPv4
  host: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : undefined,
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

// Test database connection function for debugging
async function testDatabaseConnection() {
  try {
    console.log('🧪 Testing database connection...');
    
    const client = await pool.connect();
    console.log('✅ Database client connection successful');
    
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    console.log('✅ Database query successful:', result.rows[0]);
    
    client.release();
    
    return {
      success: true,
      message: 'Database connection successful',
      details: {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].db_version.substring(0, 50) + '...'
      }
    };
  } catch (error) {
    console.error('❌ Database test failed:', error);
    
    return {
      success: false,
      message: 'Database connection failed',
      error: error.message,
      code: error.code,
      details: {
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port
      }
    };
  }
}

module.exports = { pool, testDatabaseConnection };
