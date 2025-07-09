const { Pool } = require('pg');

// Direct connection test
async function testDirectConnection() {
    console.log('🔌 Testing direct database connection...');
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres.uvanuwaiyotsfxewjrge:Pratyushsec077%40@aws-0-us-west-1.pooler.supabase.com:5432/postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        max: 5
    });
    
    try {
        // Test connection
        const client = await pool.connect();
        console.log('✅ Direct connection successful');
        
        // Test query
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ Query successful:', result.rows[0]);
        
        // Test save tokens directly
        const saveQuery = `
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
                  updated_at    = NOW();
        `;
        
        const saveResult = await client.query(saveQuery, [
            '6541363201', // Your actual chat ID
            '1000.0f0fec2b9891130b98cd5b1bb9c59e1f.cc17cdd2cdd9070a203e99162d2b3cad',
            '1000.687952ef80afe34270d9a63844c47e88.50b8badd3b1ae0b36a260d5c371a073a',
            new Date(Date.now() + (60 * 60 * 1000)), // 1 hour from now
            'test_client_id',
            'test_client_secret'
        ]);
        
        console.log('✅ Token save successful:', {
            rowCount: saveResult.rowCount,
            command: saveResult.command
        });
        
        // Verify the save
        const verifyResult = await client.query('SELECT * FROM oauth_tokens WHERE telegram_user_id = $1', ['6541363201']);
        console.log('✅ Token verification:', {
            found: verifyResult.rows.length > 0,
            telegram_user_id: verifyResult.rows[0]?.telegram_user_id,
            access_token: verifyResult.rows[0]?.access_token?.substring(0, 20) + '...',
            expires_at: verifyResult.rows[0]?.expires_at
        });
        
        client.release();
        
    } catch (error) {
        console.error('❌ Direct connection failed:', error.message);
        console.error('Error code:', error.code);
        console.error('Error details:', error.detail);
    } finally {
        await pool.end();
    }
}

// Set environment if not already set
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres.uvanuwaiyotsfxewjrge:Pratyushsec077%40@aws-0-us-west-1.pooler.supabase.com:5432/postgres';
}

testDirectConnection();
