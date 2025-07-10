const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const BOT_TOKEN = "7803103960:AAHfeyMoir-bUGTO7LldOEHUf-DLnW46pMA";
// Hardcoded valid Zoho access token for testing
const ZOHO_TOKEN = "1000.caea110dcf13032965c5f65befcd3e8c.d0e10072e774474fb592f454626730da";
const TEST_CHAT_ID = 6541363201;

// Function to fetch leads - extracted for reuse
async function fetchAndSendLeads(chatId, respond = true) {
  try {
    console.log(`📋 Processing /leadstesting command for chat ${chatId}`);
    
    // Send initial message if this is a real request
    if (respond) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "📋 *Fetching Latest Leads with Test Token...*\n\nRetrieving CRM leads, please wait...",
        parse_mode: "Markdown"
      });
    }
    
    console.log(`📡 Fetching leads from Zoho CRM using test token`);
    console.log(`🔑 Using test token: ${ZOHO_TOKEN.substring(0, 20)}...`);
    
    // Fetch leads from Zoho CRM using the hardcoded token
    const response = await axios.get("https://www.zohoapis.in/crm/v2/Leads", {
      headers: { Authorization: `Zoho-oauthtoken ${ZOHO_TOKEN}` },
      params: {
        sort_by: 'Created_Time',
        sort_order: 'desc',
        per_page: 5
      }
    });

    console.log(`✅ Successfully fetched leads using test token`);
    console.log(`📊 Lead count: ${response.data.data?.length || 0}`);
    
    const leads = response.data.data;
    
    if (!leads || leads.length === 0) {
      if (respond) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `📋 *Latest Leads*\n\n` +
                `📭 No leads found in your CRM.\n\n` +
                `💡 Add some leads to your Zoho CRM to see them here!`,
          parse_mode: "Markdown"
        });
      }
      
      return { success: true, leadCount: 0, leads: [] };
    }
    
    // Format leads message
    let reply = "📋 *Latest Leads:*\n\n";
    
    leads.forEach((lead, i) => {
      const firstName = lead.First_Name || "";
      const lastName = lead.Last_Name || "";
      const fullName = `${firstName} ${lastName}`.trim() || "Unnamed Lead";
      const phone = lead.Phone || "-";
      const email = lead.Email || "-";
      const company = lead.Company || "-";
      
      reply += `${i + 1}. 👤 ${fullName} | 📞 ${phone} | ✉️ ${email} | 🏢 ${company}\n`;
    });
    
    reply += `\n🔄 Last updated: ${new Date().toLocaleTimeString()}`;
    reply += `\n🧪 Using test token`;

    // Send reply back to Telegram if this is a real request
    if (respond) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown"
      });
    }

    console.log(`✅ Test leads sent successfully to chat ${chatId}`);
    return { success: true, leadCount: leads.length, leads };
  } catch (error) {
    console.error(`❌ Error in /leadstesting command:`, error.message);
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code
    });
    
    let errorMessage = "❌ *Error Fetching Leads*\n\n";
    
    if (error.response?.status === 401) {
      errorMessage += `🔐 Authentication failed with Zoho CRM.\n\n` +
                     `Your test token is invalid.\n\n`;
    } else if (error.response?.status === 403) {
      errorMessage += `🚫 Access denied to Zoho CRM.\n\n` +
                     `Check your test token permissions.`;
    } else if (error.response?.status === 429) {
      errorMessage += `⏳ Rate limit exceeded.\n\n` +
                     `Please wait a moment and try again.`;
    } else {
      errorMessage += `📝 ${error.message}\n\n`;
      if (error.response?.data?.message) {
        errorMessage += `Details: ${error.response.data.message}\n\n`;
      }
    }
    
    if (respond) {
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: errorMessage,
          parse_mode: "Markdown"
        });
      } catch (sendError) {
        console.error(`❌ Failed to send error message:`, sendError.message);
      }
    }
    
    return { success: false, error: error.message, statusCode: error.response?.status };
  }
}

// Webhook endpoint for Telegram
app.post("/telegram-webhook", async (req, res) => {
  if (!req.body || !req.body.message) {
    console.log('⚠️ Invalid request - no message found');
    return res.status(200).json({ status: "ok", message: "no message" });
  }
  
  const message = req.body.message;
  const chatId = message.chat.id;
  const text = message.text;
  
  console.log(`📱 Message from ${chatId}: "${text}"`);

  if (text === "/leadstesting") {
    try {
      await fetchAndSendLeads(chatId);
      return res.status(200).json({ status: "success", action: "leads_testing_completed" });
    } catch (error) {
      console.error("❌ Error in leads testing command:", error.message);
      return res.status(500).json({ status: "error", message: "leads_testing_failed" });
    }
  } else {
    // Send helpful response for unknown commands
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `💡 This is a test server. Use /leadstesting to test with a hardcoded token.`,
        parse_mode: "Markdown"
      });
    } catch (msgError) {
      console.error('Failed to send message:', msgError.message);
    }
    return res.status(200).json({ status: "ok", action: "unknown_command_handled" });
  }
});

// Direct test endpoint for checking token validity without Telegram
app.get("/test-token", async (req, res) => {
  try {
    console.log(`🧪 Testing Zoho token directly...`);
    const result = await fetchAndSendLeads(TEST_CHAT_ID, false); // Don't send Telegram messages
    res.json({
      status: "success",
      message: "Token test completed",
      result
    });
  } catch (error) {
    console.error("❌ Token test failed:", error.message);
    res.status(500).json({
      status: "error",
      message: error.message,
      details: error.response?.data
    });
  }
});

app.listen(3000, () => console.log("Test webhook running on port 3000"));
