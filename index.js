const express = require("express");
const axios = require("axios");
const { saveTokens, getTokens, areTokensExpired } = require('./tokenRepo');
const { testDatabaseConnection } = require('./db');
const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const ZOHO_TOKEN = "your_zoho_oauth_token_here";

// Validate required environment variables
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN environment variable is required');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully');

// Auto-setup webhook on startup
async function setupWebhook() {
  try {
    // Get the deployment URL from environment variables
    const baseUrl = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || 'https://telegram-zoho-bott.onrender.com';
    const webhookUrl = `${baseUrl}/telegram-webhook`;
    
    console.log('🔗 Setting up webhook:', webhookUrl);
    
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: webhookUrl
    });
    
    if (response.data.ok) {
      console.log('✅ Webhook set successfully:', webhookUrl);
    } else {
      console.error('❌ Failed to set webhook:', response.data);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message);
  }
}

// Set up webhook when server starts
setupWebhook();

// Store user states for multi-step process
const userStates = new Map();

// Health check endpoint
app.get("/", (req, res) => {
  const PORT = process.env.PORT || 3000;
  res.json({ 
    status: "Bot is running!", 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// Health check for webhook
app.get("/health", (req, res) => {
  res.json({ status: "healthy", bot: "telegram-zoho-bot" });
});

// Database health check endpoint
app.get("/db-health", async (req, res) => {
  try {
    const { pool } = require('./db');
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({ 
      status: "database_healthy", 
      current_time: result.rows[0].current_time,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(500).json({ 
      status: "database_error", 
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
});

// Database debug endpoint - detailed testing
app.get("/db-debug", async (req, res) => {
  const testResult = await testDatabaseConnection();
  
  if (testResult.success) {
    res.json({
      status: "database_debug_success",
      ...testResult,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).json({
      status: "database_debug_failed",
      ...testResult,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug environment variables (safe version)
app.get("/debug-env", (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    has_TELEGRAM_TOKEN: !!process.env.TELEGRAM_TOKEN,
    DATABASE_URL_preview: process.env.DATABASE_URL ? 
      `${process.env.DATABASE_URL.substring(0, 30)}...${process.env.DATABASE_URL.substring(process.env.DATABASE_URL.length - 20)}` : 
      'Not set',
    timestamp: new Date().toISOString()
  });
});

app.post("/telegram-webhook", async (req, res) => {
  console.log('📨 Webhook received at:', new Date().toISOString());
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  // Validate request structure
  if (!req.body || !req.body.message) {
    console.log('⚠️ Invalid request - no message found');
    return res.status(200).json({ status: "ok", message: "no message" });
  }
  
  const message = req.body.message;
  const chatId = message.chat.id;
  const text = message.text;
  
  console.log(`📱 Message from ${chatId}: "${text}" (length: ${text?.length})`);
  console.log('Message details:', {
    type: typeof text,
    isConnect: text === "/connect",
    startsWithSlash: text?.startsWith('/'),
    chatType: message.chat.type
  });

  // Always respond to /connect command
  if (text === "/connect") {
    try {
      console.log(`✅ Processing /connect command from chat ${chatId}`);
      
      // Store user's chat ID and initiate connection process
      userStates.set(chatId, { step: 'waiting_for_json', chatId: chatId });
      console.log(`📝 User state set for ${chatId}:`, userStates.get(chatId));
      
      const instructions = `🔗 *Connect Your Zoho CRM*\n\n` +
        `📋 *Step-by-step instructions:*\n\n` +
        `1️⃣ Go to Zoho API Console: https://api-console.zoho.com/\n\n` +
        `2️⃣ Create a *Self Client*:\n` +
        `   • Click "Self Client"\n` +
        `   • Enter any client name\n` +
        `   • Click "Create"\n\n` +
        `3️⃣ Generate Authorization Code:\n` +
        `   • Click "Generate Code"\n` +
        `   • In scope field, paste: \`ZohoCRM.modules.ALL\`\n` +
        `   • Set time duration to *10 minutes*\n` +
        `   • Add description (optional)\n` +
        `   • Click "Create"\n\n` +
        `4️⃣ Download the JSON file\n\n` +
        `5️⃣ Copy the entire content of \`self_client.json\` and paste it here\n\n` +
        `⚡ *Your Chat ID:* \`${chatId}\`\n\n` +
        `📝 Once you paste the JSON content, I'll automatically set up your Zoho CRM connection!`;

      console.log('📤 Sending connect instructions...');
      
      const telegramResponse = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: instructions,
        parse_mode: "Markdown"
      });

      console.log("✅ Connect instructions sent successfully");
      console.log("Telegram API response:", telegramResponse.data);
      
      return res.status(200).json({ status: "success", action: "connect_instructions_sent" });
      
    } catch (error) {
      console.error("❌ Error sending connect instructions:", error.response?.data || error.message);
      
      // Try to send a simple error message
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ Sorry, there was an error processing your /connect command. Please try again."
        });
      } catch (fallbackError) {
        console.error("❌ Failed to send error message:", fallbackError.message);
      }
      
      return res.status(500).json({ status: "error", message: "failed to send instructions" });
    }
  } 
  // Database test command for debugging
  else if (text === "/dbtest") {
    try {
      console.log(`🧪 Processing /dbtest command from chat ${chatId}`);
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "🧪 *Testing Database Connection...*\n\nPlease wait while I diagnose the database issue.",
        parse_mode: "Markdown"
      });
      
      const testResult = await testDatabaseConnection();
      
      let message;
      if (testResult.success) {
        message = `✅ *Database Test Successful!*\n\n` +
                 `🗄️ Database is working properly\n` +
                 `⏰ Current time: ${testResult.details.currentTime}\n` +
                 `🔧 Version: ${testResult.details.version}\n\n` +
                 `Your tokens will be stored successfully! 🎉`;
      } else {
        message = `❌ *Database Test Failed*\n\n` +
                 `🚫 Error: ${testResult.message}\n` +
                 `📝 Details: ${testResult.error}\n` +
                 `🔧 Code: ${testResult.code || 'Unknown'}\n\n` +
                 `**Technical Info:**\n`;
        
        if (testResult.details) {
          if (testResult.details.address) message += `• Address: ${testResult.details.address}\n`;
          if (testResult.details.port) message += `• Port: ${testResult.details.port}\n`;
          if (testResult.details.syscall) message += `• System call: ${testResult.details.syscall}\n`;
        }
        
        message += `\n⚠️ Tokens cannot be stored but can still be displayed.`;
      }
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown"
      });
      
      return res.status(200).json({ status: "success", action: "dbtest_completed" });
      
    } catch (error) {
      console.error("❌ Error in dbtest command:", error.message);
      
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❌ *Database Test Error*\n\nFailed to run database test: ${error.message}`
        });
      } catch (fallbackError) {
        console.error("❌ Failed to send dbtest error message:", fallbackError.message);
      }
      
      return res.status(500).json({ status: "error", message: "dbtest_failed" });
    }
  } else if (text === '/db-query') {
    // Test direct token storage and retrieval
    try {
      console.log(`🧪 Testing token storage for chat ${chatId}...`);
      
      // First try to store test tokens
      const testTokens = {
        chatId: chatId,
        accessToken: 'test_access_' + Date.now(),
        refreshToken: 'test_refresh_' + Date.now(),
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret'
      };
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "🧪 Testing token storage...",
        parse_mode: "Markdown"
      });
      
      // Try to save test tokens
      console.log('💾 Attempting to save test tokens...');
      await saveTokens(testTokens);
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "✅ Test tokens saved successfully!",
        parse_mode: "Markdown"
      });
      
      // Try to retrieve them
      console.log('🔍 Attempting to retrieve test tokens...');
      const retrieved = await getTokens(chatId);
      
      if (retrieved) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `✅ Test tokens retrieved successfully!\n\n` +
                `Stored: ${retrieved.access_token}\n` +
                `Client ID: ${retrieved.client_id}\n` +
                `Expires: ${retrieved.expires_at}`,
          parse_mode: "Markdown"
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ Test tokens not found after storage",
          parse_mode: "Markdown"
        });
      }
      
    } catch (error) {
      console.error('❌ DB query test failed:', error);
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `❌ Database test failed:\n\n` +
              `Error: ${error.message}\n` +
              `Code: ${error.code || 'N/A'}\n` +
              `Details: ${error.detail || 'N/A'}`,
        parse_mode: "Markdown"
      });
    }

  } else if (userStates.has(chatId) && userStates.get(chatId).step === 'waiting_for_json') {
    try {
      console.log(`📝 JSON content received from ${chatId}`);
      
      // User has sent JSON content
      const jsonContent = text;
      
      // Parse the JSON content
      let clientData;
      try {
        clientData = JSON.parse(jsonContent);
        console.log('✅ JSON parsed successfully');
      } catch (parseError) {
        console.log('❌ JSON parse error:', parseError.message);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ Invalid JSON format. Please paste the exact content from self_client.json file.",
          parse_mode: "Markdown"
        });
        res.send("Invalid JSON");
        return;
      }

      // Extract required data
      const { client_id, client_secret, code, grant_type } = clientData;
      
      console.log('Extracted data:', { 
        client_id: client_id ? 'present' : 'missing',
        client_secret: client_secret ? 'present' : 'missing', 
        code: code ? 'present' : 'missing',
        grant_type: grant_type
      });
      
      if (!client_id || !client_secret || !code) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ Missing required fields in JSON. Make sure the file contains client_id, client_secret, and code.",
          parse_mode: "Markdown"
        });
        res.send("Missing fields");
        return;
      }

      console.log('🔄 Attempting token exchange...');
      
      // Exchange code for tokens
      const tokenResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
        params: {
          grant_type: 'authorization_code',
          client_id: client_id,
          client_secret: client_secret,
          redirect_uri: 'https://www.zoho.com/crm',
          code: code
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log('✅ Token exchange successful!');
      console.log('Token response:', { 
        access_token: tokenResponse.data.access_token ? 'received' : 'missing',
        refresh_token: tokenResponse.data.refresh_token ? 'received' : 'missing',
        expires_in: tokenResponse.data.expires_in 
      });

      const tokens = tokenResponse.data;
      
      // Calculate expiration time (current time + expires_in seconds)
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
      
      console.log('💾 Storing tokens in database...');
      
      // Store tokens in database with better error handling
      try {
        await saveTokens({
          chatId: chatId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt,
          clientId: client_id,
          clientSecret: client_secret
        });

        console.log('✅ Tokens stored successfully!');

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `✅ *Connection Successful!*\n\n` +
                `🔑 Access token received and stored\n` +
                `🔄 Refresh token received and stored\n` +
                `⏰ Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                `🎉 Your Zoho CRM is now connected!`,
          parse_mode: "Markdown"
        });
      } catch (dbError) {
        console.error('❌ Database storage error:', dbError.message);
        
        // Still inform user about successful token exchange but DB issue
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `⚠️ *Partial Success*\n\n` +
                `✅ Successfully got tokens from Zoho\n` +
                `❌ Failed to store in database\n\n` +
                `🔑 *Your tokens (save these):*\n` +
                `Access Token: \`${tokens.access_token}\`\n` +
                `Refresh Token: \`${tokens.refresh_token}\`\n` +
                `Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                `⚠️ Please contact support about database issues.`,
          parse_mode: "Markdown"
        });
      }

      // Clear user state
      userStates.delete(chatId);
      return res.status(200).json({ status: "success", action: "connection_completed" });

    } catch (e) {
      console.error('❌ Token exchange error:');
      console.error('Error details:', e.response?.data || e.message);
      console.error('Status:', e.response?.status);
      console.error('Headers:', e.response?.headers);
      
      let errorMessage = "❌ Failed to connect to Zoho.";
      
      if (e.response?.data?.error) {
        errorMessage += `\n\n**Error:** ${e.response.data.error}`;
        if (e.response.data.error_description) {
          errorMessage += `\n**Details:** ${e.response.data.error_description}`;
        }
      }
      
      errorMessage += "\n\nPlease try /connect again with a fresh authorization code.";
      
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: errorMessage,
          parse_mode: "Markdown"
        });
      } catch (msgError) {
        console.error('Failed to send error message:', msgError.message);
      }
      
      // Clear user state on error
      userStates.delete(chatId);
      return res.status(500).json({ status: "error", action: "token_exchange_failed" });
    }
  } else if (text === '/check-tokens') {
    // Check if user has tokens stored
    try {
      console.log(`🔍 Checking stored tokens for chat ${chatId}...`);
      
      const tokens = await getTokens(chatId);
      
      if (tokens) {
        // Mask sensitive data
        const maskedAccess = tokens.access_token ? 
          tokens.access_token.substring(0, 10) + '...' : 'N/A';
        const maskedRefresh = tokens.refresh_token ? 
          tokens.refresh_token.substring(0, 10) + '...' : 'N/A';
          
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `✅ *Tokens Found!*\n\n` +
                `🔑 Access Token: \`${maskedAccess}\`\n` +
                `🔄 Refresh Token: \`${maskedRefresh}\`\n` +
                `⏰ Expires: ${tokens.expires_at}\n` +
                `🆔 Client ID: ${tokens.client_id || 'N/A'}\n` +
                `📅 Updated: ${tokens.updated_at}`, 
          parse_mode: 'Markdown'
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ No tokens found for your account.\n\n' +
                'Use /connect to link your Zoho CRM account.'
        });
      }
      
    } catch (error) {
      console.error('❌ Check tokens failed:', error);
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `❌ Failed to check tokens:\n\n${error.message}`
      });
    }
  } else if (text === '/table-info') {
    // Check table structure and basic info
    try {
      console.log(`📋 Checking table structure...`);
      
      const { pool } = require('./db.js');
      
      // Check if table exists
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'oauth_tokens'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        await bot.sendMessage(chatId, '❌ Table `oauth_tokens` does not exist!\n\n' +
          'Please run the setup.sql script to create the table.');
        return;
      }
      
      // Get table structure
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'oauth_tokens' 
        ORDER BY ordinal_position;
      `);
      
      // Count existing rows
      const count = await pool.query('SELECT COUNT(*) FROM oauth_tokens');
      
      let response = `📋 *Table Information*\n\n`;
      response += `✅ Table exists: oauth_tokens\n`;
      response += `📊 Row count: ${count.rows[0].count}\n\n`;
      response += `*Columns:*\n`;
      
      columns.rows.forEach(col => {
        response += `• ${col.column_name} (${col.data_type})\n`;
      });
      
      await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Table info check failed:', error);
      await bot.sendMessage(chatId, `❌ Failed to check table info:\n\n${error.message}`);
    }
  } else {
    console.log(`❓ Processing non-connect message: "${text?.substring(0, 50)}..."`);
    
    // Check if this might be JSON content (fallback for lost user state)
    if (text && text.startsWith('{') && text.includes('client_id') && text.includes('client_secret')) {
      console.log('🔍 Detected potential JSON content, attempting to process...');
      
      try {
        const clientData = JSON.parse(text);
        const { client_id, client_secret, code } = clientData;
        
        if (client_id && client_secret && code) {
          console.log('✅ Valid JSON detected, processing as token exchange...');
          
          // Process as JSON (same logic as above)
          console.log('🔄 Attempting token exchange...');
          
          const tokenResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
            params: {
              grant_type: 'authorization_code',
              client_id: client_id,
              client_secret: client_secret,
              redirect_uri: 'https://www.zoho.com/crm',
              code: code
            },
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });

          console.log('✅ Token exchange successful!');
          const tokens = tokenResponse.data;
          const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
          
          console.log('💾 Storing tokens in database...');
          
          try {
            await saveTokens({
              chatId: chatId,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: expiresAt,
              clientId: client_id,
              clientSecret: client_secret
            });

            console.log('✅ Tokens stored successfully!');

            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: chatId,
              text: `✅ *Connection Successful!*\n\n` +
                    `🔑 Access token received and stored\n` +
                    `🔄 Refresh token received and stored\n` +
                    `⏰ Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                    `🎉 Your Zoho CRM is now connected!`,
              parse_mode: "Markdown"
            });
          } catch (dbError) {
            console.error('❌ Database storage error:', dbError.message);
            
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: chatId,
              text: `⚠️ *Partial Success*\n\n` +
                    `✅ Successfully got tokens from Zoho\n` +
                    `❌ Failed to store in database\n\n` +
                    `🔑 *Your tokens (save these):*\n` +
                    `Access Token: \`${tokens.access_token}\`\n` +
                    `Refresh Token: \`${tokens.refresh_token}\`\n` +
                    `Expires in: ${Math.floor(tokens.expires_in / 60)} minutes`,
              parse_mode: "Markdown"
            });
          }

          return res.status(200).json({ status: "success", action: "json_processed_fallback" });
        }
      } catch (e) {
        console.error('❌ JSON processing error:', e.message);
      }
    }
    
    // Send helpful response for unknown commands
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `❓ Unknown command: "${text?.substring(0, 50)}..."\n\n` +
              `Available commands:\n` +
              `• /connect - Set up Zoho CRM integration\n` +
              `• /dbtest - Test database connection\n` +
              `• /check-tokens - Check stored tokens\n` +
              `• /db-query - Test token storage\n` +
              `• /table-info - Check database table info\n\n` +
              `Please use /connect to get started.`,
        parse_mode: "Markdown"
      });
    } catch (msgError) {
      console.error('Failed to send unknown command response:', msgError.message);
    }
    
    return res.status(200).json({ status: "ok", action: "unknown_command_handled" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook running on port ${PORT}`));
