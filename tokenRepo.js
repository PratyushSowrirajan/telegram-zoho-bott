const { pool, waitForPool, poolReady } = require('./db.js');

/**
 * Upsert a user's Zoho tokens
 */
async function saveTokens({
  chatId,
  accessToken,
  refreshToken,
  expiresAt,
  clientId,
  clientSecret
}) {
  console.log(`💾 Attempting to save tokens for chat ${chatId}...`);
  
  // More robust query with explicit column names
  const query = `
    INSERT INTO oauth_tokens
      (telegram_user_id, access_token, refresh_token, expires_at,
       client_id, client_secret, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (telegram_user_id) DO UPDATE
      SET access_token  = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at    = EXCLUDED.expires_at,
          client_id     = EXCLUDED.client_id,
          client_secret = EXCLUDED.client_secret,
          updated_at    = NOW()
    RETURNING id, telegram_user_id, created_at, updated_at;
  `;
  
  console.log('📝 SQL Query:', query);
  console.log('📝 Parameters:', [
    chatId,
    accessToken ? 'present' : 'missing',
    refreshToken ? 'present' : 'missing',
    expiresAt?.toISOString(),
    clientId ? 'present' : 'missing',
    clientSecret ? 'present' : 'missing'
  ]);
  
  try {
    // Wait for database pool to be ready with comprehensive checks
    console.log('🔄 Checking database pool readiness...');
    
    // First check if we have a pool object
    if (!pool) {
      console.log('⏳ Database pool not initialized, waiting...');
      await waitForPool(60000); // Wait up to 60 seconds
    }
    
    // Double-check pool readiness
    if (!poolReady) {
      console.log('⏳ Database pool not ready, waiting...');
      await waitForPool(60000); // Wait up to 60 seconds
    }
    
    // Get fresh reference to pool after waiting
    const { pool: currentPool } = require('./db.js');
    
    // Final check with current pool reference
    if (!currentPool) {
      throw new Error('Database pool is not available after waiting');
    }
    
    // Test the pool connection before using it
    console.log('🧪 Testing pool connection before saving tokens...');
    let testClient;
    try {
      testClient = await currentPool.connect();
      console.log('✅ Pool connection test successful');
      testClient.release();
    } catch (testError) {
      console.error('❌ Pool connection test failed:', testError.message);
      throw new Error(`Database pool connection test failed: ${testError.message}`);
    }
    
    console.log('✅ Database pool ready, executing query...');
    
    const result = await currentPool.query(query, [
      chatId,
      accessToken,
      refreshToken,
      expiresAt,
      clientId,
      clientSecret
    ]);
    
    console.log(`✅ Tokens saved successfully for chat ${chatId}`);
    console.log(`📊 Query result:`, {
      rowCount: result.rowCount,
      command: result.command
    });
    
    return result;
  } catch (error) {
    console.error(`❌ Failed to save tokens for chat ${chatId}:`, error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', error.detail);
    console.error('Error stack:', error.stack);
    
    // Provide more detailed error information
    if (error.code === 'ECONNREFUSED') {
      console.error('🚫 Database connection refused - check if database is running');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔍 Database host not found - check hostname and DNS');
    } else if (error.code === 'ECONNRESET') {
      console.error('🔄 Database connection reset - network issue');
    } else if (error.code === '42P01') {
      console.error('📋 Table not found - run setup.sql to create oauth_tokens table');
      console.error('💡 You can use POST /create-table endpoint to create the table');
    } else if (error.code === '42703') {
      console.error('🔧 Column not found - table structure mismatch');
      console.error('💡 Check table structure with GET /test-table-structure endpoint');
      console.error('💡 You might need to recreate the table with POST /create-table');
    }
    
    throw error;
  }
}

/**
 * Fetch tokens for a chat; returns null if none.
 */
async function getTokens(chatId) {
  console.log(`🔍 Fetching tokens for chat ${chatId}...`);
  
  try {
    // Wait for database pool to be ready
    if (!poolReady) {
      console.log('⏳ Database pool not ready, waiting...');
      await waitForPool(60000); // Wait up to 60 seconds
    }
    
    // Get fresh reference to pool after waiting
    const { pool: currentPool } = require('./db.js');
    
    if (!currentPool) {
      throw new Error('Database pool is not available after waiting');
    }
    
    const { rows } = await currentPool.query(
      'SELECT * FROM oauth_tokens WHERE telegram_user_id = $1 LIMIT 1',
      [chatId]
    );
    
    if (rows[0]) {
      console.log(`✅ Found tokens for chat ${chatId}`);
    } else {
      console.log(`ℹ️ No tokens found for chat ${chatId}`);
    }
    
    return rows[0] || null;
  } catch (error) {
    console.error(`❌ Failed to fetch tokens for chat ${chatId}:`, error.message);
    console.error('Error code:', error.code);
    
    // Provide more detailed error information
    if (error.code === 'ECONNREFUSED') {
      console.error('🚫 Database connection refused - check if database is running');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔍 Database host not found - check hostname and DNS');
    } else if (error.code === 'ECONNRESET') {
      console.error('🔄 Database connection reset - network issue');
    } else if (error.code === '42P01') {
      console.error('📋 Table not found - run setup.sql to create oauth_tokens table');
    }
    
    throw error;
  }
}

/**
 * Check if tokens are expired and need refresh
 */
async function areTokensExpired(chatId) {
  const tokens = await getTokens(chatId);
  if (!tokens) return true;
  
  const now = new Date();
  const expiresAt = new Date(tokens.expires_at);
  
  // Consider expired if less than 5 minutes remaining
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}

module.exports = {
  saveTokens,
  getTokens,
  areTokensExpired
};
