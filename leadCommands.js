const axios = require("axios");
const { getValidAccessToken } = require('./tokenRefresh');

/**
 * Handle /leads command - fetch latest leads from Zoho CRM
 */
async function handleLeadsCommand(chatId, BOT_TOKEN) {
  try {
    console.log(`📋 Processing /leads command from chat ${chatId}`);
    
    // Send initial message
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: "📋 *Fetching Latest Leads...*\n\nRetrieving your latest CRM leads, please wait...",
      parse_mode: "Markdown"
    });
    
    // Get valid access token for the user
    const tokenResult = await getValidAccessToken(chatId);
    
    if (!tokenResult.success) {
      let errorMessage = "❌ *Unable to Access Zoho CRM*\n\n";
      
      if (tokenResult.needsReconnect) {
        errorMessage += `🔗 Your Zoho connection has expired or is invalid.\n\n` +
                      `Please use /connect to reconnect your account.`;
      } else {
        errorMessage += `❗ Error: ${tokenResult.error}\n\n` +
                       `Please try /connect to set up your connection.`;
      }
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: errorMessage,
        parse_mode: "Markdown"
      });
      
      return {
        success: false,
        error: tokenResult.error,
        needsReconnect: tokenResult.needsReconnect
      };
    }
    
    console.log(`🔑 Valid access token obtained for chat ${chatId}`);
    if (tokenResult.wasRefreshed) {
      console.log(`🔄 Token was refreshed for chat ${chatId}`);
    }
    
    // Fetch leads from Zoho CRM
    console.log(`📡 Fetching leads from Zoho CRM for chat ${chatId}`);
    console.log(`🔑 Using access token: ${tokenResult.accessToken.substring(0, 20)}...`);
    
    const response = await axios.get("https://www.zohoapis.in/crm/v2/Leads", {
      headers: { 
        Authorization: `Zoho-oauthtoken ${tokenResult.accessToken.trim()}`
      },
      params: {
        sort_by: 'Created_Time',
        sort_order: 'desc',
        per_page: 5
      }
    });

    console.log(`✅ Successfully fetched leads for chat ${chatId}`);
    console.log(`📊 Lead count: ${response.data.data?.length || 0}`);
    
    const leads = response.data.data;
    
    if (!leads || leads.length === 0) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `📋 *Latest Leads*\n\n` +
              `📭 No leads found in your CRM.\n\n` +
              `💡 Add some leads to your Zoho CRM to see them here!`,
        parse_mode: "Markdown"
      });
      
      return { success: true, leadCount: 0 };
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
    
    // Add footer
    reply += `\n🔄 Last updated: ${new Date().toLocaleTimeString()}`;
    if (tokenResult.wasRefreshed) {
      reply += `\n🆕 Token refreshed automatically`;
    }

    // Send leads to user
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown"
    });

    console.log(`✅ Leads sent successfully to chat ${chatId}`);
    
    return {
      success: true,
      leadCount: leads.length,
      wasTokenRefreshed: tokenResult.wasRefreshed
    };

  } catch (error) {
    console.error(`❌ Error in /leads command for chat ${chatId}:`, error.message);
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code
    });
    
    let errorMessage = "❌ *Error Fetching Leads*\n\n";
    
    if (error.response?.status === 401) {
      errorMessage += `🔐 Authentication failed with Zoho CRM.\n\n` +
                     `Your token may have expired or become invalid.\n\n` +
                     `Please use /connect to reconnect your account.`;
    } else if (error.response?.status === 403) {
      errorMessage += `🚫 Access denied to Zoho CRM.\n\n` +
                     `Please check your Zoho CRM permissions or use /connect to reconnect.`;
    } else if (error.response?.status === 429) {
      errorMessage += `⏳ Rate limit exceeded.\n\n` +
                     `Please wait a moment and try again.`;
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage += `🌐 Network connection error.\n\n` +
                     `Please check your internet connection and try again.`;
    } else {
      errorMessage += `📝 ${error.message}\n\n`;
      if (error.response?.data?.message) {
        errorMessage += `Details: ${error.response.data.message}\n\n`;
      }
      errorMessage += `Please try again or use /connect if the issue persists.`;
    }
    
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: errorMessage,
        parse_mode: "Markdown"
      });
    } catch (sendError) {
      console.error(`❌ Failed to send error message to chat ${chatId}:`, sendError.message);
    }
    
    return {
      success: false,
      error: error.message,
      statusCode: error.response?.status
    };
  }
}



module.exports = {
  handleLeadsCommand
};
