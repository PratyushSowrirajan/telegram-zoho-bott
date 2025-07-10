const express = require("express");
const axios = require("axios");
const { saveTokens, getTokens, areTokensExpired } = require('./tokenRepo');
const { testDatabaseConnection } = require('./db');
const { startBackgroundRefresh, getValidAccessToken, refreshAccessToken } = require('./tokenRefresh');
const { handleLeadsCommand } = require('./leadCommands');
const { setupPingRoutes, logServerStart } = require('./uptimeMonitor');
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

// Start automatic token refresh service
startBackgroundRefresh();

// Setup UptimeRobot monitoring routes
setupPingRoutes(app);

// Log server startup for monitoring
logServerStart();

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
  // Handle lead creation command
  else if (text.startsWith("/leadcreation_")) {
    try {
      console.log(`📝 Processing /leadcreation command from chat ${chatId}`);
      const { handleLeadCreationCommand } = require('./leadCommands');
      await handleLeadCreationCommand(chatId, BOT_TOKEN, text);
      return res.status(200).json({ status: "success", action: "lead_creation_completed" });
    } catch (error) {
      console.error("❌ Error in lead creation command:", error.message);
      return res.status(500).json({ status: "error", message: "lead_creation_failed" });
    }
  }
  // Handle lead info command
  else if (text.startsWith("/leadinfo_")) {
    try {
      console.log(`📘 Processing /leadinfo command from chat ${chatId}`);
      const { handleLeadInfoCommand } = require('./leadCommands');
      await handleLeadInfoCommand(chatId, BOT_TOKEN, text);
      return res.status(200).json({ status: "success", action: "lead_info_completed" });
    } catch (error) {
      console.error("❌ Error in lead info command:", error.message);
      return res.status(500).json({ status: "error", message: "lead_info_failed" });
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
  }
  // Status command to check token status
  else if (text === "/status") {
    try {
      console.log(`📊 Processing /status command from chat ${chatId}`);
      
      const { getValidAccessToken } = require('./tokenRefresh');
      const tokenResult = await getValidAccessToken(chatId);
      
      if (tokenResult.success) {
        const expiresAt = new Date(tokenResult.expiresAt);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
        const hoursUntilExpiry = Math.floor(minutesUntilExpiry / 60);
        
        let timeString;
        if (hoursUntilExpiry > 0) {
          timeString = `${hoursUntilExpiry}h ${minutesUntilExpiry % 60}m`;
        } else if (minutesUntilExpiry > 0) {
          timeString = `${minutesUntilExpiry}m`;
        } else {
          timeString = "Less than 1 minute";
        }
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `📊 *Zoho CRM Connection Status*\n\n` +
                `✅ Status: Connected\n` +
                `🔑 Access Token: Valid\n` +
                `⏰ Expires in: ${timeString}\n` +
                `🔄 Auto-refresh: Enabled\n` +
                `${tokenResult.wasRefreshed ? '🆕 Token was just refreshed\n' : ''}` +
                `\n📅 Expires at: ${expiresAt.toLocaleString()}\n\n` +
                `💡 Your tokens are automatically refreshed when needed!`,
          parse_mode: "Markdown"
        });
      } else if (tokenResult.needsReconnect) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `📊 *Zoho CRM Connection Status*\n\n` +
                `❌ Status: Disconnected\n` +
                `🔑 Access Token: Invalid/Expired\n` +
                `❗ Issue: ${tokenResult.error}\n\n` +
                `🔗 Please use /connect to reconnect your Zoho CRM account.`,
          parse_mode: "Markdown"
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `📊 *Zoho CRM Connection Status*\n\n` +
                `⚠️ Status: Error\n` +
                `❗ Issue: ${tokenResult.error}\n\n` +
                `🔗 Try /connect to reconnect or contact support if the issue persists.`,
          parse_mode: "Markdown"
        });
      }
      
      return res.status(200).json({ status: "success", action: "status_completed" });
      
    } catch (error) {
      console.error("❌ Error in status command:", error.message);
      
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❌ *Status Check Error*\n\nFailed to check connection status: ${error.message}`
        });
      } catch (fallbackError) {
        console.error("❌ Failed to send status error message:", fallbackError.message);
      }
      
      return res.status(500).json({ status: "error", message: "status_failed" });
    }
  }
  // Debug command to check token status
  else if (text === "/debug") {
    try {
      console.log(`🔍 Processing /debug command from chat ${chatId}`);
      
      // Send loading message
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "🔍 *Debug Info*\n\nChecking your token status...",
        parse_mode: "Markdown"
      });
      
      // Get token info
      const tokens = await getTokens(chatId);
      if (!tokens) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ *No tokens found*\n\nPlease use /connect to set up your account.",
          parse_mode: "Markdown"
        });
        return res.status(200).json({ status: "success", action: "debug_no_tokens" });
      }
      
      // Check token expiry
      const now = new Date();
      const expiresAt = new Date(tokens.expires_at);
      const isExpired = now >= expiresAt;
      const minutesUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60));
      
      // Test token validity
      let tokenValid = false;
      let apiError = null;
      
      try {
        const testResponse = await axios.get('https://www.zohoapis.com/crm/v2/org', {
          headers: { 
            Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        tokenValid = testResponse.status === 200;
      } catch (testError) {
        apiError = testError.response?.data?.message || testError.message;
      }
      
      // Send debug info
      let debugMessage = `🔍 *Debug Information*\n\n`;
      debugMessage += `📊 *Token Status:*\n`;
      debugMessage += `• Access Token: ${tokens.access_token ? 'Present' : 'Missing'}\n`;
      debugMessage += `• Refresh Token: ${tokens.refresh_token ? 'Present' : 'Missing'}\n`;
      debugMessage += `• Client ID: ${tokens.client_id ? 'Present' : 'Missing'}\n`;
      debugMessage += `• Client Secret: ${tokens.client_secret ? 'Present' : 'Missing'}\n\n`;
      
      debugMessage += `⏰ *Expiry Info:*\n`;
      debugMessage += `• Expires At: ${expiresAt.toLocaleString()}\n`;
      debugMessage += `• Is Expired: ${isExpired ? '❌ Yes' : '✅ No'}\n`;
      debugMessage += `• Minutes Until Expiry: ${minutesUntilExpiry}\n\n`;
      
      debugMessage += `🧪 *API Test:*\n`;
      debugMessage += `• Token Valid: ${tokenValid ? '✅ Yes' : '❌ No'}\n`;
      if (apiError) {
        debugMessage += `• API Error: ${apiError}\n`;
      }
      
      debugMessage += `\n📝 *Chat ID:* \`${chatId}\``;
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: debugMessage,
        parse_mode: "Markdown"
      });
      
      return res.status(200).json({ status: "success", action: "debug_completed" });
      
    } catch (error) {
      console.error("❌ Error in debug command:", error.message);
      
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ *Debug Error*\n\nFailed to get debug information. Please try again.",
          parse_mode: "Markdown"
        });
      } catch (fallbackError) {
        console.error("❌ Failed to send debug error message:", fallbackError.message);
      }
      
      return res.status(500).json({ status: "error", message: "debug_failed" });
    }
  }
  // Leads command to fetch latest leads from Zoho CRM
  else if (text === "/leads") {
    try {
      const result = await handleLeadsCommand(chatId, BOT_TOKEN);
      return res.status(200).json({ 
        status: "success", 
        action: "leads_completed",
        leadCount: result.leadCount,
        wasTokenRefreshed: result.wasTokenRefreshed
      });
    } catch (error) {
      console.error("❌ Error in leads command:", error.message);
      return res.status(500).json({ status: "error", message: "leads_failed" });
    }
  }
  // Test leads command with hardcoded token for debugging
  else if (text === "/testleads") {
    try {
      const { handleTestLeadsCommand } = require('./leadCommands');
      const result = await handleTestLeadsCommand(chatId, BOT_TOKEN);
      return res.status(200).json({ 
        status: "success", 
        action: "testleads_completed",
        leadCount: result.leadCount,
        testMode: true
      });
    } catch (error) {
      console.error("❌ Error in testleads command:", error.message);
      return res.status(500).json({ status: "error", message: "testleads_failed" });
    }
  }
  // Test access command to fetch token from database for debugging
  else if (text === "/testaccess") {
    try {
      const { handleTestAccessCommand } = require('./leadCommands');
      const result = await handleTestAccessCommand(chatId, BOT_TOKEN);
      return res.status(200).json({ 
        status: "success", 
        action: "testaccess_completed",
        tokenFound: result.tokenFound,
        isExpired: result.isExpired,
        testMode: true
      });
    } catch (error) {
      console.error("❌ Error in testaccess command:", error.message);
      return res.status(500).json({ status: "error", message: "testaccess_failed" });
    }
  }
  // Manual token exchange command for testing
  else if (text === "/manualtoken") {
    try {
      console.log(`🔧 Processing /manualtoken command from chat ${chatId}`);
      
      // Send instructions for manual token entry
      const instructions = `🔧 *Manual Token Exchange Test*\n\n` +
        `Please reply with a message in this exact format:\n\n` +
        `\`✅ Token Exchange Successful!|🔑 Access Token: YOUR_ACCESS_TOKEN|♻️ Refresh Token: YOUR_REFRESH_TOKEN|⏰ Expires At: TIMESTAMP|🧠 Client ID: YOUR_CLIENT_ID|🔐 Client Secret: YOUR_CLIENT_SECRET\`\n\n` +
        `📝 *Example:*\n` +
        `✅ Token Exchange Successful!|🔑 Access Token: 1000.abc123...|♻️ Refresh Token: 1000.def456...|⏰ Expires At: 1752174756600|🧠 Client ID: 1000.XYZ789|🔐 Client Secret: abc123def456\n\n` +
        `⚠️ Make sure there are no extra spaces and the timestamp is in milliseconds format.\n\n` +
        `💡 This command helps test the token exchange workflow manually.`;

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: instructions,
        parse_mode: "Markdown"
      });
      
      return res.status(200).json({ status: "success", action: "manualtoken_instructions_sent" });
      
    } catch (error) {
      console.error("❌ Error in manualtoken command:", error.message);
      return res.status(500).json({ status: "error", message: "manualtoken_failed" });
    }
  }
  // Check if user is in the waiting state for JSON (only when they sent /connect first)
  else if (userStates.has(chatId) && userStates.get(chatId).step === 'waiting_for_json') {
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
        console.log('💾 Attempting to store tokens in database...');
        console.log('Token details:', {
          chatId: chatId,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresAt: expiresAt.toISOString(),
          clientId: client_id ? 'present' : 'missing',
          clientSecret: client_secret ? 'present' : 'missing'
        });
        
        // Add a small delay to ensure database is ready
        console.log('⏳ Waiting a moment for database pool to be ready...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const saveResult = await saveTokens({
          chatId: chatId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt,
          clientId: client_id,
          clientSecret: client_secret
        });

        console.log('✅ Tokens stored successfully!');
        console.log('Save result:', saveResult);

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `✅ *Connection Successful!*\n\n` +
                `🔑 Access token received and stored\n` +
                `🔄 Refresh token received and stored\n` +
                `⏰ Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                `🎉 Your Zoho CRM is now connected!\n\n` +
                `💾 Database storage: ✅ Success`,
          parse_mode: "Markdown"
        });
      } catch (dbError) {
        console.error('❌ Database storage error:', dbError.message);
        console.error('Error details:', {
          code: dbError.code,
          detail: dbError.detail,
          hint: dbError.hint,
          position: dbError.position,
          stack: dbError.stack
        });
        
        // Still inform user about successful token exchange but DB issue
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `⚠️ *Partial Success*\n\n` +
                `✅ Successfully got tokens from Zoho\n` +
                `❌ Failed to store in database\n\n` +
                `🔑 *Your tokens (save these):*\n` +
                `Access Token:\n\`${tokens.access_token}\`\n\n` +
                `Refresh Token:\n\`${tokens.refresh_token}\`\n\n` +
                `Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                `🔧 Error code: ${dbError.code || 'Unknown'}\n` +
                `📝 Error: ${dbError.message}\n\n` +
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
            console.log('💾 Attempting to store tokens in database (fallback)...');
            
            // Add a small delay to ensure database is ready
            console.log('⏳ Waiting a moment for database pool to be ready...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const saveResult = await saveTokens({
              chatId: chatId,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: expiresAt,
              clientId: client_id,
              clientSecret: client_secret
            });

            console.log('✅ Tokens stored successfully!');
            console.log('Save result:', saveResult);

            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: chatId,
              text: `✅ *Connection Successful!*\n\n` +
                    `🔑 Access token received and stored\n` +
                    `🔄 Refresh token received and stored\n` +
                    `⏰ Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                    `🎉 Your Zoho CRM is now connected!\n\n` +
                    `💾 Database storage: ✅ Success`,
              parse_mode: "Markdown"
            });
          } catch (dbError) {
            console.error('❌ Database storage error (fallback):', dbError.message);
            console.error('Error details:', {
              code: dbError.code,
              detail: dbError.detail,
              hint: dbError.hint,
              position: dbError.position
            });
            
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: chatId,
              text: `⚠️ *Partial Success*\n\n` +
                    `✅ Successfully got tokens from Zoho\n` +
                    `❌ Failed to store in database\n\n` +
                    `🔑 *Your tokens (save these):*\n` +
                    `Access Token:\n\`${tokens.access_token}\`\n\n` +
                    `Refresh Token:\n\`${tokens.refresh_token}\`\n\n` +
                    `Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
                    `🔧 Error code: ${dbError.code || 'Unknown'}\n` +
                    `📝 Error: ${dbError.message}`,
              parse_mode: "Markdown"
            });
          }

          return res.status(200).json({ status: "success", action: "json_processed_fallback" });
        }
      } catch (e) {
        console.error('❌ JSON processing error:', e.message);
      }
    }
    // Check if the message is in the "Token Exchange Successful!" format
    else if (text && text.startsWith('✅ Token Exchange Successful!')) {
      try {
        console.log(`🔍 Processing Token Exchange Successful format from ${chatId}`);
        console.log('Message content:', text.substring(0, 200) + '...');
        
        // Parse the "Token Exchange Successful!" message format
        // Expected format: "✅ Token Exchange Successful!|🔑 Access Token: ...|♻️ Refresh Token: ...|⏰ Expires At: ...|🧠 Client ID: ...|🔐 Client Secret: ..."
        
        const parts = text.split('|');
        console.log(`Found ${parts.length} parts in message`);
        
        let accessToken = null;
        let refreshToken = null;
        let expiresAtStr = null;
        let clientId = null;
        let clientSecret = null;
        
        // Parse each part to extract the values
        for (const part of parts) {
          const trimmedPart = part.trim();
          
          if (trimmedPart.startsWith('🔑 Access Token:')) {
            accessToken = trimmedPart.replace('🔑 Access Token:', '').trim();
          } else if (trimmedPart.startsWith('♻️ Refresh Token:')) {
            refreshToken = trimmedPart.replace('♻️ Refresh Token:', '').trim();
          } else if (trimmedPart.startsWith('⏰ Expires At:')) {
            expiresAtStr = trimmedPart.replace('⏰ Expires At:', '').trim();
          } else if (trimmedPart.startsWith('🧠 Client ID:')) {
            clientId = trimmedPart.replace('🧠 Client ID:', '').trim();
          } else if (trimmedPart.startsWith('🔐 Client Secret:')) {
            clientSecret = trimmedPart.replace('🔐 Client Secret:', '').trim();
          }
        }
        
        console.log('Extracted values:', {
          accessToken: accessToken ? 'present' : 'missing',
          refreshToken: refreshToken ? 'present' : 'missing',
          expiresAtStr: expiresAtStr ? 'present' : 'missing',
          clientId: clientId ? 'present' : 'missing',
          clientSecret: clientSecret ? 'present' : 'missing'
        });
        
        // Validate required fields
        if (!accessToken || !refreshToken || !expiresAtStr || !clientId || !clientSecret) {
          const missingFields = [];
          if (!accessToken) missingFields.push('Access Token');
          if (!refreshToken) missingFields.push('Refresh Token');
          if (!expiresAtStr) missingFields.push('Expires At');
          if (!clientId) missingFields.push('Client ID');
          if (!clientSecret) missingFields.push('Client Secret');
          
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `❌ *Parse Error*\n\nMissing required fields: ${missingFields.join(', ')}\n\n` +
                  `Please ensure your message contains all required token information in the correct format.`,
            parse_mode: "Markdown"
          });
          return res.status(400).json({ status: "error", action: "token_format_parse_failed" });
        }
        
        // Parse the expires at timestamp
        let expiresAt;
        try {
          // Handle different timestamp formats
          let timestamp = expiresAtStr;
          
          // If it's a pure number string (milliseconds), convert to number
          if (/^\d+$/.test(timestamp)) {
            timestamp = parseInt(timestamp);
            
            // If timestamp is in milliseconds (13+ digits), use as is
            // If timestamp is in seconds (10 digits), convert to milliseconds
            if (timestamp.toString().length <= 10) {
              timestamp = timestamp * 1000;
            }
          }
          
          expiresAt = new Date(timestamp);
          
          if (isNaN(expiresAt.getTime())) {
            throw new Error('Invalid date format after conversion');
          }
          
          console.log('✅ Timestamp parsed successfully:', {
            original: expiresAtStr,
            converted: timestamp,
            parsedDate: expiresAt.toISOString()
          });
          
        } catch (dateError) {
          console.error('❌ Failed to parse expires at timestamp:', dateError.message);
          console.error('Original timestamp string:', expiresAtStr);
          
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `❌ *Date Parse Error*\n\nInvalid expiration timestamp: "${expiresAtStr}"\n\n` +
                  `Debug info:\n` +
                  `• Original: ${expiresAtStr}\n` +
                  `• Type: ${typeof expiresAtStr}\n` +
                  `• Length: ${expiresAtStr.length}\n\n` +
                  `Please ensure the timestamp is in a valid format.`,
            parse_mode: "Markdown"
          });
          return res.status(400).json({ status: "error", action: "token_format_date_parse_failed" });
        }
        
        console.log('✅ Token Exchange format parsed successfully');
        console.log('Parsed token details:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          expiresAt: expiresAt.toISOString(),
          clientId: clientId ? 'present' : 'missing',
          clientSecret: clientSecret ? 'present' : 'missing'
        });
        
        // Store tokens in database (same logic as JSON workflow, but without Zoho API call)
        try {
          console.log('💾 Storing tokens from Token Exchange format...');
          
          // Add a small delay to ensure database is ready
          console.log('⏳ Waiting a moment for database pool to be ready...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const saveResult = await saveTokens({
            chatId: chatId,
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            clientId: clientId,
            clientSecret: clientSecret
          });

          console.log('✅ Tokens from Token Exchange format stored successfully!');
          console.log('Save result:', saveResult);
          
          // Calculate time until expiry for display
          const now = new Date();
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));

          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `✅ *Token Storage Successful!*\n\n` +
                  `🔑 Access token stored successfully\n` +
                  `🔄 Refresh token stored successfully\n` +
                  `⏰ Expires in: ${minutesUntilExpiry} minutes\n` +
                  `📅 Expires at: ${expiresAt.toLocaleString()}\n\n` +
                  `🎉 Your Zoho CRM tokens are now stored and ready to use!\n\n` +
                  `💾 Database storage: ✅ Success`,
            parse_mode: "Markdown"
          });
          
          return res.status(200).json({ status: "success", action: "token_exchange_format_processed" });
          
        } catch (dbError) {
          console.error('❌ Database storage error for Token Exchange format:', dbError.message);
          console.error('Error details:', {
            code: dbError.code,
            detail: dbError.detail,
            hint: dbError.hint,
            position: dbError.position
          });
          
          // Calculate time until expiry for display
          const now = new Date();
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
          
          // Still inform user about the tokens but DB issue
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `⚠️ *Partial Success*\n\n` +
                  `✅ Successfully parsed token information\n` +
                  `❌ Failed to store in database\n\n` +
                  `🔑 *Your token info:*\n` +
                  `Access Token: Received\n` +
                  `Refresh Token: Received\n` +
                  `Expires in: ${minutesUntilExpiry} minutes\n` +
                  `Expires at: ${expiresAt.toLocaleString()}\n\n` +
                  `🔧 Error code: ${dbError.code || 'Unknown'}\n` +
                  `📝 Error: ${dbError.message}\n\n` +
                  `⚠️ Please contact support about database issues.`,
            parse_mode: "Markdown"
          });
          
          return res.status(500).json({ status: "error", action: "token_exchange_format_db_failed" });
        }
        
      } catch (error) {
        console.error('❌ Token Exchange format processing error:', error.message);
        
        try {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `❌ *Processing Error*\n\nFailed to process Token Exchange format: ${error.message}\n\n` +
                  `Please ensure your message is in the correct format and try again.`,
            parse_mode: "Markdown"
          });
        } catch (msgError) {
          console.error('❌ Failed to send Token Exchange format error message:', msgError.message);
        }
        
        return res.status(500).json({ status: "error", action: "token_exchange_format_processing_failed" });
      }
    }
    // Only process commands that start with /
    else if (text && text.startsWith('/')) {
      console.log(`❓ Processing unknown command: "${text}"`);
      
      // Send helpful response for unknown commands
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❓ Unknown command: "${text}"\n\n` +
                `Available commands:\n` +
                `• /connect - Set up Zoho CRM integration\n` +
                `• /status - Check connection and token status\n` +
                `• /leads - Get latest leads from your CRM\n` +
                `• /dbtest - Test database connection\n` +
                `• /manualtoken - Manual token exchange test\n\n` +
                `💡 *Alternative setup methods:*\n` +
                `• Send JSON from self_client.json file\n` +
                `• Send "Token Exchange Successful!" format message\n\n` +
                `Please use /connect to get started.`,
          parse_mode: "Markdown"
        });
      } catch (msgError) {
        console.error('Failed to send unknown command response:', msgError.message);
      }
      
      return res.status(200).json({ status: "ok", action: "unknown_command_handled" });
    } else {
      // Ignore regular text messages (like "kd")
      console.log(`📝 Ignoring regular text message: "${text}"`);
      return res.status(200).json({ status: "ok", action: "text_message_ignored" });
    }
  }
});

// Debug pool state endpoint
app.get("/db-pool-state", async (req, res) => {
  try {
    const { pool, poolReady } = require('./db');
    
    let poolInfo = {
      poolExists: !!pool,
      poolReady: poolReady,
      timestamp: new Date().toISOString()
    };
    
    // If pool exists, get more details
    if (pool) {
      poolInfo = {
        ...poolInfo,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
      
      // Try a test query
      try {
        const testClient = await pool.connect();
        const testResult = await testClient.query('SELECT NOW() as test_time');
        testClient.release();
        
        poolInfo.connectionTest = {
          success: true,
          testTime: testResult.rows[0].test_time
        };
      } catch (testError) {
        poolInfo.connectionTest = {
          success: false,
          error: testError.message,
          code: testError.code
        };
      }
    }
    
    res.json({
      status: "pool_debug",
      ...poolInfo
    });
  } catch (error) {
    res.status(500).json({
      status: "pool_debug_error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test token save endpoint for debugging
app.post("/test-token-save", async (req, res) => {
  try {
    const { saveTokens } = require('./tokenRepo');
    
    console.log('🧪 Testing token save functionality...');
    
    // Use dummy data for testing
    const testData = {
      chatId: '999999999', // Test chat ID
      accessToken: 'test_access_token_' + Date.now(),
      refreshToken: 'test_refresh_token_' + Date.now(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret'
    };
    
    const result = await saveTokens(testData);
    
    res.json({
      status: "token_save_test_success",
      message: "Token save test completed successfully",
      testData: {
        chatId: testData.chatId,
        hasAccessToken: !!testData.accessToken,
        hasRefreshToken: !!testData.refreshToken,
        expiresAt: testData.expiresAt
      },
      result: {
        rowCount: result.rowCount,
        command: result.command
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Token save test failed:', error.message);
    res.status(500).json({
      status: "token_save_test_failed",
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
});

// Test table structure endpoint
app.get("/test-table-structure", async (req, res) => {
  try {
    const { pool } = require('./db');
    
    // Check if table exists and get its structure
    const tableCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'oauth_tokens' 
      ORDER BY ordinal_position;
    `);
    
    if (tableCheck.rows.length === 0) {
      return res.json({
        status: "table_missing",
        message: "oauth_tokens table does not exist",
        solution: "Run the setup.sql script in your Supabase database"
      });
    }
    
    res.json({
      status: "table_exists",
      columns: tableCheck.rows,
      column_count: tableCheck.rows.length
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
      code: error.code
    });
  }
});

// Create table endpoint (for debugging)
app.post("/create-table", async (req, res) => {
  try {
    const { pool } = require('./db');
    
    // Create the table with the correct structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
          id BIGSERIAL PRIMARY KEY,
          telegram_user_id BIGINT NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          client_id TEXT NOT NULL,
          client_secret TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Create unique index for telegram_user_id
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tokens_chat ON oauth_tokens (telegram_user_id);
    `);
    
    // Create index on expires_at
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON oauth_tokens (expires_at);
    `);
    
    res.json({
      status: "table_created",
      message: "oauth_tokens table created successfully"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
      code: error.code
    });
  }
});

// Test token refresh endpoint
app.post("/test-token-refresh/:chatId", async (req, res) => {
  try {
    const { refreshAccessToken, getValidAccessToken } = require('./tokenRefresh');
    const chatId = req.params.chatId;
    
    console.log(`🧪 Testing token refresh for chat ${chatId}...`);
    
    // Test getting valid token (auto-refresh if needed)
    const tokenResult = await getValidAccessToken(chatId);
    
    if (tokenResult.success) {
      res.json({
        status: "token_refresh_test_success",
        message: "Token refresh test completed successfully",
        tokenInfo: {
          chatId: chatId,
          hasAccessToken: !!tokenResult.accessToken,
          expiresAt: tokenResult.expiresAt,
          wasRefreshed: tokenResult.wasRefreshed
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        status: "token_refresh_test_failed",
        error: tokenResult.error,
        needsReconnect: tokenResult.needsReconnect,
        details: tokenResult.details,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Token refresh test failed:', error.message);
    res.status(500).json({
      status: "token_refresh_test_error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Manual token refresh endpoint
app.post("/manual-refresh/:chatId", async (req, res) => {
  try {
    const { refreshAccessToken } = require('./tokenRefresh');
    const chatId = req.params.chatId;
    
    console.log(`🔄 Manual token refresh for chat ${chatId}...`);
    
    const refreshResult = await refreshAccessToken(chatId);
    
    if (refreshResult.success) {
      res.json({
        status: "manual_refresh_success",
        message: "Token refreshed successfully",
        tokenInfo: {
          chatId: chatId,
          hasNewAccessToken: !!refreshResult.newAccessToken,
          expiresAt: refreshResult.expiresAt,
          expiresIn: refreshResult.expiresIn
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        status: "manual_refresh_failed",
        error: refreshResult.error,
        details: refreshResult.details,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Manual refresh failed:', error.message);
    res.status(500).json({
      status: "manual_refresh_error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add debug endpoints for troubleshooting
app.get('/debug-tokens/:chatId', async (req, res) => {
  const chatId = req.params.chatId;
  
  try {
    console.log(`🔍 Debug: Checking tokens for chat ${chatId}`);
    
    // Check if tokens exist
    const tokens = await getTokens(chatId);
    if (!tokens) {
      return res.json({
        success: false,
        error: 'No tokens found for this chat ID',
        chatId: chatId
      });
    }
    
    // Check token expiry
    const now = new Date();
    const expiresAt = new Date(tokens.expires_at);
    const isExpired = now >= expiresAt;
    const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
    
    // Test token validity with Zoho API
    let tokenValid = false;
    let zohoPongResponse = null;
    
    try {
      const testResponse = await axios.get('https://www.zohoapis.com/crm/v2/org', {
        headers: { 
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      tokenValid = testResponse.status === 200;
      zohoPongResponse = {
        status: testResponse.status,
        data: testResponse.data
      };
    } catch (testError) {
      zohoPongResponse = {
        error: testError.message,
        status: testError.response?.status,
        data: testError.response?.data
      };
    }
    
    return res.json({
      success: true,
      chatId: chatId,
      tokenInfo: {
        hasTokens: true,
        accessToken: tokens.access_token ? `${tokens.access_token.substring(0, 20)}...` : null,
        refreshToken: tokens.refresh_token ? `${tokens.refresh_token.substring(0, 20)}...` : null,
        clientId: tokens.client_id ? `${tokens.client_id.substring(0, 20)}...` : null,
        clientSecret: tokens.client_secret ? '***hidden***' : null,
        expiresAt: tokens.expires_at,
        isExpired: isExpired,
        minutesUntilExpiry: Math.round(minutesUntilExpiry),
        createdAt: tokens.created_at,
        updatedAt: tokens.updated_at
      },
      zohoApiTest: {
        tokenValid: tokenValid,
        response: zohoPongResponse
      }
    });
    
  } catch (error) {
    console.error('❌ Debug tokens error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      chatId: chatId
    });
  }
});

app.get('/debug-refresh/:chatId', async (req, res) => {
  const chatId = req.params.chatId;
  
  try {
    console.log(`🔄 Debug: Testing token refresh for chat ${chatId}`);
    
    const refreshResult = await refreshAccessToken(chatId);
    
    return res.json({
      success: true,
      chatId: chatId,
      refreshResult: refreshResult
    });
    
  } catch (error) {
    console.error('❌ Debug refresh error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      chatId: chatId
    });
  }
});

// Test endpoint for token exchange format (for testing purposes)
app.post("/test-token-exchange-format", async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({
        status: "error",
        message: "chatId and message are required"
      });
    }
    
    console.log(`🧪 Testing Token Exchange format for chat ${chatId}`);
    console.log('Test message:', message.substring(0, 200) + '...');
    
    // Simulate the same processing logic as in the webhook
    if (message.startsWith('✅ Token Exchange Successful!')) {
      const parts = message.split('|');
      console.log(`Found ${parts.length} parts in test message`);
      
      let accessToken = null;
      let refreshToken = null;
      let expiresAtStr = null;
      let clientId = null;
      let clientSecret = null;
      
      // Parse each part to extract the values
      for (const part of parts) {
        const trimmedPart = part.trim();
        
        if (trimmedPart.startsWith('🔑 Access Token:')) {
          accessToken = trimmedPart.replace('🔑 Access Token:', '').trim();
        } else if (trimmedPart.startsWith('♻️ Refresh Token:')) {
          refreshToken = trimmedPart.replace('♻️ Refresh Token:', '').trim();
        } else if (trimmedPart.startsWith('⏰ Expires At:')) {
          expiresAtStr = trimmedPart.replace('⏰ Expires At:', '').trim();
        } else if (trimmedPart.startsWith('🧠 Client ID:')) {
          clientId = trimmedPart.replace('🧠 Client ID:', '').trim();
        } else if (trimmedPart.startsWith('🔐 Client Secret:')) {
          clientSecret = trimmedPart.replace('🔐 Client Secret:', '').trim();
        }
      }
      
      console.log('Test extracted values:', {
        accessToken: accessToken ? 'present' : 'missing',
        refreshToken: refreshToken ? 'present' : 'missing',
        expiresAtStr: expiresAtStr ? 'present' : 'missing',
        clientId: clientId ? 'present' : 'missing',
        clientSecret: clientSecret ? 'present' : 'missing'
      });
      
      // Validate required fields
      if (!accessToken || !refreshToken || !expiresAtStr || !clientId || !clientSecret) {
        const missingFields = [];
        if (!accessToken) missingFields.push('Access Token');
        if (!refreshToken) missingFields.push('Refresh Token');
        if (!expiresAtStr) missingFields.push('Expires At');
        if (!clientId) missingFields.push('Client ID');
        if (!clientSecret) missingFields.push('Client Secret');
        
        return res.status(400).json({
          status: "error",
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }
      
      // Parse the expires at timestamp
      let expiresAt;
      try {
        // Handle different timestamp formats
        let timestamp = expiresAtStr;
        
        // If it's a pure number string (milliseconds), convert to number
        if (/^\d+$/.test(timestamp)) {
          timestamp = parseInt(timestamp);
          
          // If timestamp is in milliseconds (13+ digits), use as is
          // If timestamp is in seconds (10 digits), convert to milliseconds
          if (timestamp.toString().length <= 10) {
            timestamp = timestamp * 1000;
          }
        }
        
        expiresAt = new Date(timestamp);
        
        if (isNaN(expiresAt.getTime())) {
          throw new Error('Invalid date format after conversion');
        }
        
        console.log('✅ Test timestamp parsed successfully:', {
          original: expiresAtStr,
          converted: timestamp,
          parsedDate: expiresAt.toISOString()
        });
        
      } catch (dateError) {
        console.error('❌ Test date parse error:', dateError.message);
        return res.status(400).json({
          status: "error",
          message: `Date parse error: ${dateError.message}`,
          originalTimestamp: expiresAtStr
        });
      }
      
      // Store tokens in database
      try {
        console.log('💾 Test storing tokens...');
        
        const saveResult = await saveTokens({
          chatId: chatId,
          accessToken: accessToken,
          refreshToken: refreshToken,
          expiresAt: expiresAt,
          clientId: clientId,
          clientSecret: clientSecret
        });

        console.log('✅ Test tokens stored successfully!');
        
        // Calculate time until expiry for display
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));

        return res.json({
          status: "success",
          message: "Token Exchange format processed successfully",
          tokenInfo: {
            chatId: chatId,
            expiresAt: expiresAt.toISOString(),
            minutesUntilExpiry: minutesUntilExpiry,
            databaseStored: true
          }
        });
        
      } catch (dbError) {
        console.error('❌ Test database storage error:', dbError.message);
        return res.status(500).json({
          status: "error",
          message: `Database error: ${dbError.message}`,
          code: dbError.code
        });
      }
    } else {
      return res.status(400).json({
        status: "error",
        message: "Message does not start with '✅ Token Exchange Successful!'"
      });
    }
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error.message);
    return res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Telegram Zoho Bot running on port ${PORT}`);
  console.log(`🌐 Server URL: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}`);
  console.log(`🔄 UptimeRobot endpoint: /ping`);
  console.log(`📊 Ping statistics: /ping-stats`);
  console.log('✅ Ready to receive webhooks and ping requests!');
});
