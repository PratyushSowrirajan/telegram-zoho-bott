const axios = require('axios');
const { getTokens, saveTokens } = require('./tokenRepo');

/**
 * Refresh access token using refresh token
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<Object>} - Refresh result
 */
async function refreshAccessToken(chatId) {
  try {
    console.log(`🔄 Starting token refresh for chat ${chatId}...`);
    
    // Get existing tokens from database
    const existingTokens = await getTokens(chatId);
    if (!existingTokens) {
      throw new Error('No tokens found for this chat ID');
    }
    
    const { refresh_token, client_id, client_secret } = existingTokens;
    
    if (!refresh_token || !client_id || !client_secret) {
      throw new Error('Missing required refresh credentials');
    }
    
    console.log(`🔄 Refreshing token for chat ${chatId} using refresh token...`);
    
    // Call Zoho OAuth refresh endpoint
    const refreshResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        grant_type: 'refresh_token',
        client_id: client_id,
        client_secret: client_secret,
        refresh_token: refresh_token
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log(`✅ Token refresh successful for chat ${chatId}`);
    console.log('Refresh response:', {
      access_token: refreshResponse.data.access_token ? 'received' : 'missing',
      expires_in: refreshResponse.data.expires_in
    });
    
    const newTokens = refreshResponse.data;
    
    // Calculate new expiration time
    const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000));
    
    // Update tokens in database (keep same refresh_token, client_id, client_secret)
    const saveResult = await saveTokens({
      chatId: chatId,
      accessToken: newTokens.access_token,
      refreshToken: refresh_token, // Keep existing refresh token
      expiresAt: newExpiresAt,
      clientId: client_id,
      clientSecret: client_secret
    });
    
    console.log(`💾 Updated tokens saved for chat ${chatId}`);
    
    return {
      success: true,
      newAccessToken: newTokens.access_token,
      expiresAt: newExpiresAt,
      expiresIn: newTokens.expires_in
    };
    
  } catch (error) {
    console.error(`❌ Token refresh failed for chat ${chatId}:`, error.message);
    
    if (error.response?.data) {
      console.error('Zoho API Error:', error.response.data);
    }
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data
    };
  }
}

/**
 * Check if token is expired or will expire soon (within 5 minutes)
 * @param {Object} tokens - Token object from database
 * @returns {boolean} - True if token needs refresh
 */
function needsRefresh(tokens) {
  if (!tokens || !tokens.expires_at) {
    return true;
  }
  
  const now = new Date();
  const expiresAt = new Date(tokens.expires_at);
  const timeDiff = expiresAt.getTime() - now.getTime();
  const minutesUntilExpiry = timeDiff / (1000 * 60);
  
  // Refresh if expires within 5 minutes
  return minutesUntilExpiry <= 5;
}

/**
 * Get valid access token - refresh automatically if needed
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<Object>} - Token result
 */
async function getValidAccessToken(chatId) {
  try {
    console.log(`🔍 Getting valid access token for chat ${chatId}...`);
    
    // Get current tokens
    const tokens = await getTokens(chatId);
    if (!tokens) {
      return {
        success: false,
        error: 'No tokens found for this chat ID',
        needsReconnect: true
      };
    }
    
    // Check if token needs refresh
    if (needsRefresh(tokens)) {
      console.log(`⏰ Token expires soon for chat ${chatId}, refreshing...`);
      
      const refreshResult = await refreshAccessToken(chatId);
      if (refreshResult.success) {
        return {
          success: true,
          accessToken: refreshResult.newAccessToken,
          expiresAt: refreshResult.expiresAt,
          wasRefreshed: true
        };
      } else {
        return {
          success: false,
          error: 'Token refresh failed',
          details: refreshResult,
          needsReconnect: true
        };
      }
    } else {
      console.log(`✅ Token still valid for chat ${chatId}`);
      return {
        success: true,
        accessToken: tokens.access_token,
        expiresAt: tokens.expires_at,
        wasRefreshed: false
      };
    }
    
  } catch (error) {
    console.error(`❌ Error getting valid token for chat ${chatId}:`, error.message);
    return {
      success: false,
      error: error.message,
      needsReconnect: true
    };
  }
}

/**
 * Background token refresh service - checks all tokens periodically
 */
async function backgroundTokenRefresh() {
  try {
    console.log('🕐 Running background token refresh check...');
    
    // Get all tokens from database
    const { pool } = require('./db');
    if (!pool) {
      console.log('⚠️ Database pool not available, skipping background refresh');
      return;
    }
    
    const result = await pool.query(`
      SELECT telegram_user_id, expires_at 
      FROM oauth_tokens 
      WHERE expires_at IS NOT NULL
    `);
    
    console.log(`📊 Found ${result.rows.length} token records to check`);
    
    let refreshCount = 0;
    for (const row of result.rows) {
      const { telegram_user_id, expires_at } = row;
      
      if (needsRefresh({ expires_at })) {
        console.log(`🔄 Auto-refreshing token for chat ${telegram_user_id}...`);
        
        const refreshResult = await refreshAccessToken(telegram_user_id.toString());
        if (refreshResult.success) {
          refreshCount++;
          console.log(`✅ Auto-refresh successful for chat ${telegram_user_id}`);
        } else {
          console.error(`❌ Auto-refresh failed for chat ${telegram_user_id}:`, refreshResult.error);
        }
        
        // Small delay between refreshes
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (refreshCount > 0) {
      console.log(`✅ Background refresh completed: ${refreshCount} tokens refreshed`);
    } else {
      console.log('ℹ️ Background refresh completed: No tokens needed refreshing');
    }
    
  } catch (error) {
    console.error('❌ Background token refresh error:', error.message);
  }
}

/**
 * Start background token refresh service
 * Runs every 10 minutes to check for expiring tokens
 */
function startBackgroundRefresh() {
  console.log('🚀 Starting background token refresh service...');
  
  // Run immediately
  setTimeout(backgroundTokenRefresh, 5000); // 5 second delay on startup
  
  // Then run every 10 minutes
  setInterval(backgroundTokenRefresh, 10 * 60 * 1000); // 10 minutes
  
  console.log('✅ Background token refresh service started (runs every 10 minutes)');
}

module.exports = {
  refreshAccessToken,
  getValidAccessToken,
  needsRefresh,
  backgroundTokenRefresh,
  startBackgroundRefresh
};
