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
    // First try IPv4 resolution
    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        console.log(`⚠️ Failed to resolve ${hostname} to IPv4:`, err.message);
        
        // Try alternative approaches for Supabase
        if (hostname.includes('supabase.co')) {
          console.log('🔧 Trying alternative Supabase connection methods...');
          
          // Method 1: Try with different subdomain
          const altHostname = hostname.replace('db.', 'aws-0-');
          dns.resolve4(altHostname, (err2, addresses2) => {
            if (err2) {
              console.log(`⚠️ Alternative hostname ${altHostname} also failed:`, err2.message);
              
              // Method 2: Try direct connection with pooler
              const poolerHostname = hostname.replace('db.', 'pooler.');
              dns.resolve4(poolerHostname, (err3, addresses3) => {
                if (err3) {
                  console.log(`⚠️ Pooler hostname ${poolerHostname} also failed:`, err3.message);
                  resolve(hostname); // Fallback to original
                } else {
                  console.log(`✅ Resolved pooler ${poolerHostname} to IPv4:`, addresses3[0]);
                  resolve(addresses3[0]);
                }
              });
            } else {
              console.log(`✅ Resolved alternative ${altHostname} to IPv4:`, addresses2[0]);
              resolve(addresses2[0]);
            }
          });
        } else {
          resolve(hostname); // Fallback to original hostname for non-Supabase
        }
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

// Try to use Supabase connection pooler (may have IPv4 support)
let modifiedConnectionString = connectionString;
if (connectionString.includes('supabase.co') && connectionString.includes('db.')) {
  // Replace 'db.' with 'pooler.' and add pooling mode
  modifiedConnectionString = connectionString
    .replace('db.', 'pooler.')
    .replace('postgres', 'postgres')
    .replace('5432/postgres', '6543/postgres?pgbouncer=true');
  
  console.log('🔄 Modified connection string to use pooler with port 6543');
  console.log('Pooler preview:', modifiedConnectionString.substring(0, 50) + '...');
}

// Initialize pool variable
let pool;
let poolReady = false;

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
          ssl: process.env.NODE_ENV === 'production' ? 'enabled' : 'disabled',
          error_code: err.code
        });
        
        // If still failing, try the Node.js DNS family override approach
        console.log('🔄 Trying Node.js DNS family override...');
        tryNodeJSDnsOverride();
        
      } else {
        console.log('✅ Database connected successfully');
        poolReady = true;
        release();
      }
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('❌ Database pool error:', err.message);
      poolReady = false;
    });

  } catch (error) {
    console.error('❌ Failed to create database pool:', error.message);
    
    // Fallback: try Node.js DNS override
    tryNodeJSDnsOverride();
  }
}

// Function to try Node.js DNS family override
function tryNodeJSDnsOverride() {
  console.log('🔧 Attempting Supabase pooler connection...');
  
  // Try the pooler connection first
  console.log('🔄 Creating pool with Supabase pooler...');
  pool = new Pool({
    connectionString: modifiedConnectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
  });
  
  // Test the pooler connection
  pool.connect((err, client, release) => {
    if (err) {
      console.error('❌ Pooler connection also failed:', err.message);
      console.log('🔧 Attempting final DNS override...');
      
      // Final attempt: DNS override with original connection
      const originalLookup = dns.lookup;
      dns.lookup = function(hostname, options, callback) {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        options = options || {};
        options.family = 4; // Force IPv4
        return originalLookup.call(this, hostname, options, callback);
      };
      
      pool = new Pool({
        connectionString: connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
        max: 10,
        keepAlive: true,
        keepAliveInitialDelayMillis: 0,
      });
      
      pool.connect((err2, client2, release2) => {
        if (err2) {
          console.error('❌ All connection methods exhausted:', err2.message);
          console.error('💡 Consider using a different database provider or IPv4-compatible service');
          poolReady = false;
        } else {
          console.log('✅ DNS override connection successful!');
          poolReady = true;
          release2();
        }
      });
    } else {
      console.log('✅ Supabase pooler connection successful!');
      poolReady = true;
      release();
    }
  });
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

// Function to wait for pool to be ready
async function waitForPool(maxWaitTime = 10000) {
  const startTime = Date.now();
  
  while (!poolReady && !pool) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('Database pool initialization timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (!pool) {
    throw new Error('Database pool is not available');
  }
  
  return pool;
}

// Export both pool and test function
// Note: pool might be undefined initially due to async creation
module.exports = { 
  get pool() { return pool; }, 
  testDatabaseConnection,
  waitForPool,
  get poolReady() { return poolReady; }
};
