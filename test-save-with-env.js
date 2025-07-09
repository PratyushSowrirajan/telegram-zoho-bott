// You need to set your DATABASE_URL manually for local testing
process.env.DATABASE_URL = 'postgresql://postgres.uvanuwaiyotsfxewjrge:Pratyushsec077%40@aws-0-us-west-1.pooler.supabase.com:5432/postgres';

const { saveTokens } = require('./tokenRepo');

async function testSaveTokens() {
    console.log('🧪 Testing token save with environment...');
    
    try {
        // Wait for database to initialize
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const result = await saveTokens({
            chatId: '123456789',
            accessToken: '1000.0f0fec2b9891130b98cd5b1bb9c59e1f.cc17cdd2cdd9070a203e99162d2b3cad',
            refreshToken: '1000.687952ef80afe34270d9a63844c47e88.50b8badd3b1ae0b36a260d5c371a073a',
            expiresAt: new Date(Date.now() + (60 * 60 * 1000)),
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret'
        });
        
        console.log('✅ Test save successful:', result);
    } catch (error) {
        console.error('❌ Test save failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

testSaveTokens();
