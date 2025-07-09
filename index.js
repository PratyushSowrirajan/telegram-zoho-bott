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

// Store user states for multi-step process
const userStates = new Map();

app.post("/telegram-webhook", async (req, res) => {
  const message = req.body.message;
  const chatId = message.chat.id;
  const text = message.text;

  if (text === "/leads") {
    try {
      // Fetch leads from Zoho CRM
      const response = await axios.get("https://www.zohoapis.in/crm/v2/Leads?sort_by=Created_Time&sort_order=desc&per_page=5", {
        headers: { Authorization: `Zoho-oauthtoken ${ZOHO_TOKEN}` }
      });

      const leads = response.data.data;
      let reply = "📋 *Latest Leads:*\n\n";

      leads.forEach((lead, i) => {
        reply += `${i + 1}. 👤 ${lead.First_Name || ""} ${lead.Last_Name || ""} | 📞 ${lead.Phone || "-"} | ✉️ ${lead.Email || "-"} | 🏢 ${lead.Company || "-"}\n`;
      });

      // Send reply back to Telegram
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown"
      });

      res.send("Message sent");
    } catch (e) {
      console.error(e.response?.data || e.message);
      res.status(500).send("Error");
    }
  } else if (text === "/connect") {
    try {
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

      res.send("Connect instructions sent");
    } catch (e) {
      console.error(e.response?.data || e.message);
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
      const { client_id, client_secret, code } = clientData;
      
      if (!client_id || !client_secret || !code) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "❌ Missing required fields in JSON. Make sure the file contains client_id, client_secret, and code.",
          parse_mode: "Markdown"
        });
        res.send("Missing fields");
        return;
      }

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

      const tokens = tokenResponse.data;
      
      // Calculate expiration time (current time + expires_in seconds)
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));
      
      // Store tokens in database
      await saveTokens({
        chatId: chatId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: expiresAt,
        clientId: client_id,
        clientSecret: client_secret
      });

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ *Connection Successful!*\n\n` +
              `🔑 Access token received and stored\n` +
              `🔄 Refresh token received and stored\n` +
              `⏰ Expires in: ${Math.floor(tokens.expires_in / 60)} minutes\n\n` +
              `📊 You can now use /leads to fetch your CRM data!`,
        parse_mode: "Markdown"
      });

      // Clear user state
      userStates.delete(chatId);
      res.send("Connection completed");

    } catch (e) {
      console.error('Token exchange error:', e.response?.data || e.message);
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "❌ Failed to connect to Zoho. Please check your JSON data and try again with /connect",
        parse_mode: "Markdown"
      });
      
      // Clear user state on error
      userStates.delete(chatId);
      res.status(500).send("Token exchange failed");
    }
  } else {
    res.send("Unknown command");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook running on port ${PORT}`));
