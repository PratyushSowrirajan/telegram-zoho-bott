const express = require("express");
const axios = require("axios");
const { saveTokens, getTokens, areTokensExpired } = require('./tokenRepo');
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

app.post("/telegram-webhook", async (req, res) => {
  console.log('Received webhook:', JSON.stringify(req.body, null, 2));
  
  // Validate request structure
  if (!req.body || !req.body.message) {
    console.log('Invalid request - no message found');
    return res.send("OK");
  }
  
  const message = req.body.message;
  const chatId = message.chat.id;
  const text = message.text;
  
  console.log(`Message from ${chatId}: "${text}" (length: ${text?.length})`);
  console.log('Message type:', typeof text);
  console.log('Text comparison - /connect:', text === "/connect");

  if (text === "/connect") {
    try {
      console.log(`✅ /connect command received from ${chatId}`);
      
      // Store user's chat ID and initiate connection process
      userStates.set(chatId, { step: 'waiting_for_json', chatId: chatId });
      
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

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: instructions,
        parse_mode: "Markdown"
      });

      console.log("✅ Connect instructions sent successfully");
      res.send("Connect instructions sent");
    } catch (e) {
      console.error("❌ Error sending connect instructions:", e.response?.data || e.message);
      res.status(500).send("Error");
    }
  } else if (userStates.has(chatId) && userStates.get(chatId).step === 'waiting_for_json') {
    try {
      // User has sent JSON content
      const jsonContent = text;
      
      // Parse the JSON content
      let clientData;
      try {
        clientData = JSON.parse(jsonContent);
      } catch (parseError) {
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
      
      // Store tokens in database
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

      // Clear user state
      userStates.delete(chatId);
      res.send("Connection completed");

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
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: errorMessage,
        parse_mode: "Markdown"
      });
      
      // Clear user state on error
      userStates.delete(chatId);
      res.status(500).send("Token exchange failed");
    }
  } else {
    console.log(`❓ Unknown command received: "${text}"`);
    
    // Send helpful response for unknown commands
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `❓ Unknown command: "${text}"\n\n` +
            `Available commands:\n` +
            `• /connect - Set up Zoho CRM integration\n\n` +
            `Please use /connect to get started.`,
      parse_mode: "Markdown"
    });
    
    res.send("Unknown command");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook running on port ${PORT}`));
