#!/usr/bin/env node

// Test script to simulate the /connect flow and debug token storage
// Usage: node test-connect.js

require('dotenv').config();

async function testConnectFlow() {
  console.log('🔗 Testing /connect flow...\n');
  
  // Test environment variables
  console.log('📋 Environment check:');
  console.log('  - BOT_TOKEN:', process.env.BOT_TOKEN ? 'Set' : 'Missing');
  console.log('  - DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');
  console.log('  - WEBHOOK_URL:', process.env.WEBHOOK_URL || 'Not set');
  
  // Test database connection
  console.log('\n🔌 Testing database connection...');
  try {
    const { pool } = require('./db');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connected:', result.rows[0].current_time);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return;
  }
  
  // Test token storage with realistic data
  console.log('\n💾 Testing token storage with realistic data...');
  try {
    const { saveTokens, getTokens } = require('./tokenRepo');
    
    const testChatId = 987654321;
    const testTokens = {
      chatId: testChatId,
      accessToken: '1000.3b8f9c42e11b8b1234567890abcdef12.1234567890abcdef1234567890abcdef',
      refreshToken: '1000.1234567890abcdef1234567890abcdef.3b8f9c42e11b8b1234567890abcdef12',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      clientId: '1000.ABC123XYZ789',
      clientSecret: 'abcdef1234567890abcdef1234567890abcdef12'
    };
    
    console.log('📝 Saving realistic test tokens...');
    const saveResult = await saveTokens(testTokens);
    console.log('✅ Save result:', saveResult.rowCount, 'rows affected');
    
    console.log('🔍 Retrieving tokens...');
    const retrieved = await getTokens(testChatId);
    
    if (retrieved) {
      console.log('✅ Tokens successfully stored and retrieved!');
      console.log('  - Access Token matches:', retrieved.access_token === testTokens.accessToken);
      console.log('  - Refresh Token matches:', retrieved.refresh_token === testTokens.refreshToken);
      console.log('  - Client ID matches:', retrieved.client_id === testTokens.clientId);
      console.log('  - Client Secret matches:', retrieved.client_secret === testTokens.clientSecret);
    } else {
      console.log('❌ Tokens not found after storage');
    }
    
  } catch (error) {
    console.error('❌ Token storage test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
  }
  
  // Check all tokens in database
  console.log('\n📊 Checking all tokens in database...');
  try {
    const { pool } = require('./db');
    const allTokens = await pool.query('SELECT telegram_user_id, client_id, created_at FROM oauth_tokens ORDER BY created_at DESC LIMIT 10');
    
    console.log(`Found ${allTokens.rows.length} token records:`);
    allTokens.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. Chat ID: ${row.telegram_user_id}, Client: ${row.client_id}, Created: ${row.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to check all tokens:', error.message);
  }
  
  console.log('\n🎉 Connect flow test completed!');
  process.exit(0);
}

if (require.main === module) {
  testConnectFlow();
}

module.exports = { testConnectFlow };
