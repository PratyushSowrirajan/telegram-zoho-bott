#!/usr/bin/env node

// Manual test script for debugging database issues
// Usage: node test-db.js

const { saveTokens, getTokens } = require('./tokenRepo');

async function testDatabase() {
  console.log('🧪 Starting database tests...\n');
  
  const testChatId = 123456789; // Test chat ID
  
  try {
    // Test 1: Save test tokens
    console.log('📝 Test 1: Saving test tokens...');
    const testTokens = {
      chatId: testChatId,
      accessToken: 'test_access_' + Date.now(),
      refreshToken: 'test_refresh_' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret'
    };
    
    const saveResult = await saveTokens(testTokens);
    console.log('✅ Save tokens result:', saveResult.rowCount, 'rows affected');
    
    // Test 2: Retrieve tokens
    console.log('\n🔍 Test 2: Retrieving tokens...');
    const retrieved = await getTokens(testChatId);
    
    if (retrieved) {
      console.log('✅ Retrieved tokens:');
      console.log('  - Access Token:', retrieved.access_token.substring(0, 20) + '...');
      console.log('  - Refresh Token:', retrieved.refresh_token.substring(0, 20) + '...');
      console.log('  - Client ID:', retrieved.client_id);
      console.log('  - Expires At:', retrieved.expires_at);
      console.log('  - Created At:', retrieved.created_at);
    } else {
      console.log('❌ No tokens retrieved');
    }
    
    // Test 3: Check table structure
    console.log('\n📋 Test 3: Checking table structure...');
    const { pool } = require('./db');
    
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'oauth_tokens' 
      ORDER BY ordinal_position;
    `);
    
    console.log('✅ Table columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Test 4: Count rows
    const count = await pool.query('SELECT COUNT(*) FROM oauth_tokens');
    console.log('\n📊 Total rows in table:', count.rows[0].count);
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Full error:', error);
  }
  
  process.exit(0);
}

if (require.main === module) {
  testDatabase();
}

module.exports = { testDatabase };
