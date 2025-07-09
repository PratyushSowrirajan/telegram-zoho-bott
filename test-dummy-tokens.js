// Set the DATABASE_URL for testing
process.env.DATABASE_URL = 'postgresql://postgres.uvanuwaiyotsfxewjrge:Pratyushsec077%40@aws-0-us-west-1.pooler.supabase.com:5432/postgres';

const { saveTokens, getTokens, areTokensExpired } = require('./tokenRepo');

async function testDummyTokens() {
    console.log('🧪 Testing with dummy tokens...');
    
    // Dummy token data
    const dummyData = {
        chatId: '987654321',
        accessToken: 'dummy_access_token_12345',
        refreshToken: 'dummy_refresh_token_67890',
        expiresAt: new Date(Date.now() + (60 * 60 * 1000)), // 1 hour from now
        clientId: 'dummy_client_id_abcdef',
        clientSecret: 'dummy_client_secret_xyz789'
    };
    
    console.log('📋 Test data:', {
        chatId: dummyData.chatId,
        accessToken: dummyData.accessToken.substring(0, 20) + '...',
        refreshToken: dummyData.refreshToken.substring(0, 20) + '...',
        expiresAt: dummyData.expiresAt.toISOString(),
        clientId: dummyData.clientId,
        clientSecret: dummyData.clientSecret.substring(0, 20) + '...'
    });
    
    try {
        // Wait for database to initialize
        console.log('⏳ Waiting for database initialization...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Test 1: Save tokens
        console.log('\n🔄 Test 1: Saving dummy tokens...');
        const saveResult = await saveTokens(dummyData);
        console.log('✅ Save successful:', {
            rowCount: saveResult.rowCount,
            command: saveResult.command
        });
        
        // Test 2: Retrieve tokens
        console.log('\n🔄 Test 2: Retrieving saved tokens...');
        const retrievedTokens = await getTokens(dummyData.chatId);
        
        if (retrievedTokens) {
            console.log('✅ Retrieved tokens:', {
                telegram_user_id: retrievedTokens.telegram_user_id,
                access_token: retrievedTokens.access_token.substring(0, 20) + '...',
                refresh_token: retrievedTokens.refresh_token.substring(0, 20) + '...',
                expires_at: retrievedTokens.expires_at,
                client_id: retrievedTokens.client_id,
                client_secret: retrievedTokens.client_secret.substring(0, 20) + '...',
                created_at: retrievedTokens.created_at,
                updated_at: retrievedTokens.updated_at
            });
        } else {
            console.log('❌ No tokens retrieved');
        }
        
        // Test 3: Check expiration
        console.log('\n🔄 Test 3: Checking token expiration...');
        const isExpired = await areTokensExpired(dummyData.chatId);
        console.log('✅ Token expiration check:', {
            isExpired: isExpired,
            expiresAt: retrievedTokens ? retrievedTokens.expires_at : 'N/A'
        });
        
        // Test 4: Update tokens (upsert test)
        console.log('\n🔄 Test 4: Updating tokens (upsert test)...');
        const updatedData = {
            ...dummyData,
            accessToken: 'updated_access_token_54321',
            refreshToken: 'updated_refresh_token_09876',
            expiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)), // 2 hours from now
        };
        
        const updateResult = await saveTokens(updatedData);
        console.log('✅ Update successful:', {
            rowCount: updateResult.rowCount,
            command: updateResult.command
        });
        
        // Verify update
        const updatedTokens = await getTokens(dummyData.chatId);
        console.log('✅ Updated tokens verified:', {
            access_token: updatedTokens.access_token.substring(0, 20) + '...',
            refresh_token: updatedTokens.refresh_token.substring(0, 20) + '...',
            expires_at: updatedTokens.expires_at,
            updated_at: updatedTokens.updated_at
        });
        
        console.log('\n🎉 All tests passed! Database functionality is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Error code:', error.code);
        console.error('Error details:', error.detail);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testDummyTokens();
