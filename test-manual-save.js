const { saveTokens } = require('./tokenRepo');

// Test with the actual tokens from your message
async function testSaveTokens() {
    console.log('🧪 Testing manual token save...');
    
    try {
        const result = await saveTokens({
            chatId: '123456789', // Replace with your actual chat ID
            accessToken: '1000.0f0fec2b9891130b98cd5b1bb9c59e1f.cc17cdd2cdd9070a203e99162d2b3cad',
            refreshToken: '1000.687952ef80afe34270d9a63844c47e88.50b8badd3b1ae0b36a260d5c371a073a',
            expiresAt: new Date(Date.now() + (60 * 60 * 1000)), // 60 minutes from now
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret'
        });
        
        console.log('✅ Manual save successful:', result);
    } catch (error) {
        console.error('❌ Manual save failed:', error.message);
        console.error('Error details:', {
            code: error.code,
            detail: error.detail,
            hint: error.hint
        });
    }
}

// Wait a bit for database to initialize then test
setTimeout(testSaveTokens, 3000);
