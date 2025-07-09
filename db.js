const { Pool } = require('pg');
const dns = require('dns');

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

// Function to resolve hostname to IPv4
async function resolveToIPv4(hostname) {
  return new Promise((resolve, reject) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        console.log(`⚠️ Failed to resolve ${hostname} to IPv4:`, err.message);
        resolve(hostname); // Fallback to original hostname
      } else {
        console.log(`✅ Resolved ${hostname} to IPv4:`, addresses[0]);
        resolve(addresses[0]);
      }
    });
  });
}

// Render injects DATABASE_URL automatically
const connectionString = process.env.DATABASE_URL;

// Parse the URL to get components
const dbUrl = new URL(connectionString);
console.log('Original DB host:', dbUrl.hostname);

// Initialize pool variable
let pool;

// Async function to create pool with IPv4 resolution
async function createPool() {
  try {
    // Try to resolve hostname to IPv4 first
    const resolvedHost = await resolveToIPv4(dbUrl.hostname);
    
    console.log(`🔗 Creating pool with host: ${resolvedHost}`);
    
    // Create pool configuration with explicit parameters (no connectionString)
    pool = new Pool({
      // Don't use connectionString, use individual parameters for better control
      host: resolvedHost,
      port: parseInt(dbUrl.port) || 5432,
      database: dbUrl.pathname.substring(1), // Remove leading slash
      user: dbUrl.username,
      password: dbUrl.password,
      // Enhanced SSL configuration for Supabase/PostgreSQL
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      // Connection timeout and retry settings
      connectionTimeoutMillis: 15000,
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
          host: resolvedHost,
          port: parseInt(dbUrl.port) || 5432,
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

  } catch (error) {
    console.error('❌ Failed to create database pool:', error.message);
    
    // Fallback: create pool with original connectionString
    console.log('🔄 Falling back to original connection string...');
    pool = new Pool({
      connectionString: connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 10,
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
    });
  }
}

// Create the pool
createPool();

// Test database connection function for debugging
async function testDatabaseConnection() {
  try {
    console.log('🧪 Testing database connection...');
    
    // Wait a bit for pool to be created if it's still initializing
    if (!pool) {
      console.log('⏳ Waiting for pool initialization...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
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

// Export both pool and test function
// Note: pool might be undefined initially due to async creation
module.exports = { 
  get pool() { return pool; }, 
  testDatabaseConnection 
};
