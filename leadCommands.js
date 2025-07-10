const axios = require("axios");
const { getTokens } = require('./tokenRepo');

/**
 * Handle /leadcreation command - Create a new lead in Zoho CRM
 */
async function handleLeadCreationCommand(chatId, BOT_TOKEN, text) {
  try {
    const matches = text.match(/\/leadcreation_(\w+)_(\S+@\S+\.\S+)/);
    if (!matches) {
      throw new Error('Invalid command format. Use /leadcreation_Name_email');
    }
    
    const name = matches[1];
    const email = matches[2];
    
    // Fetch access token
    const tokens = await getTokens(chatId);
    if (!tokens) {
      throw new Error('No access token found. Please connect your Zoho CRM using /connect');
    }
    
// Debug: Send access token to telegram before making API call
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `🔍 Attempting to create lead with access token: \n\`${tokens.access_token}\``,
      parse_mode: "Markdown"
    });

    // Make POST request to create a new lead
    console.log(`📡 Making API request to create lead for ${name} with email ${email}`);
    console.log(`🔑 Using access token: ${tokens.access_token.substring(0, 20)}...`);
    
    const response = await axios.post('https://www.zohoapis.com/crm/v2/Leads',
      {
        data: [
          {
            "First_Name": name,
            "Email": email,
            "Lead_Source": "Telegram"
          }
        ]
      },
      {
        headers: { 
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ API response status: ${response.status}`);
    console.log(`📊 API response data:`, response.data);

    if (response.status === 201) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ Lead created successfully!\nName: ${name}\nEmail: ${email}`,
        parse_mode: "Markdown"
      });
    } else {
      throw new Error('Failed to create lead. Please try again.');
    }
  } catch (error) {
    console.error(`❌ Error in lead creation: ${error.message}`);
    console.error('Full error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
      code: error.code
    });
    
    // Send detailed error info to telegram for debugging
    let debugMessage = `🐛 *Debug Info:*\n\n`;
    debugMessage += `• Status: ${error.response?.status || 'No status'}\n`;
    debugMessage += `• Error: ${error.response?.data?.message || error.message}\n`;
    debugMessage += `• Code: ${error.response?.data?.code || error.code || 'No code'}\n`;
    debugMessage += `• Details: ${JSON.stringify(error.response?.data || {}, null, 2)}\n`;
    
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: debugMessage,
      parse_mode: "Markdown"
    });
    
    let errorMessage = "❌ Failed to create lead. " + (error.response?.data?.message || error.message);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: errorMessage,
      parse_mode: "Markdown"
    });
  }
}

const { getValidAccessToken } = require('./tokenRefresh');

/**
 * Handle /leads command - fetch latest leads from Zoho CRM using database token
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
    
    // Import database functions (same as /testaccess)
    const { getTokens } = require('./tokenRepo');
    
    console.log(`📊 Fetching tokens from database for chat ${chatId}`);
    
    // Fetch tokens from database (same as /testaccess)
    const tokens = await getTokens(chatId);
    
    if (!tokens) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `📋 *Unable to Fetch Leads*\n\n` +
              `❌ No tokens found in database\n\n` +
              `📊 Chat ID: \`${chatId}\`\n` +
              `🗄️ Database query: Searched telegram_user_id = ${chatId}\n\n` +
              `💡 Use /connect to set up your Zoho CRM connection first!`,
        parse_mode: "Markdown"
      });
      
      return { success: false, error: 'No tokens found', chatId: chatId };
    }
    
    console.log(`✅ Found tokens in database for chat ${chatId}`);
    console.log(`🔑 Using access token: ${tokens.access_token.substring(0, 20)}...`);
    
    // Check token expiry (informational)
    const now = new Date();
    const expiresAt = new Date(tokens.expires_at);
    const isExpired = now >= expiresAt;
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
    
    if (isExpired) {
      console.log(`⚠️ Warning: Token appears expired for chat ${chatId}, but attempting anyway...`);
    } else {
      console.log(`✅ Token valid for ${minutesUntilExpiry} more minutes for chat ${chatId}`);
    }
    
    // Fetch leads from Zoho CRM using database token (same as /testleads)
    console.log(`📡 Fetching leads from Zoho CRM for chat ${chatId} using database token`);
    
    const response = await axios.get("https://www.zohoapis.com/crm/v2/Leads", {
      headers: { 
        Authorization: `Zoho-oauthtoken ${tokens.access_token.trim()}`
      },
      params: {
        sort_by: 'Created_Time',
        sort_order: 'desc',
        per_page: 5
      }
    });

    console.log(`✅ Successfully fetched leads for chat ${chatId} using database token`);
    console.log(`📊 Lead count: ${response.data.data?.length || 0}`);
    
    const leads = response.data.data;
    
    if (!leads || leads.length === 0) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `📋 *Latest Leads*\n\n` +
              `📭 No leads found in your CRM.\n\n` +
              `✅ Database token used successfully\n` +
              `💡 Add some leads to your Zoho CRM to see them here!\n\n` +
              `🔑 Token: ${tokens.access_token.substring(0, 20)}...`,
        parse_mode: "Markdown"
      });
      
      return { success: true, leadCount: 0, usedDatabaseToken: true };
    }
    
    // Format leads message (same as /testleads)
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
    
    // Add footer with database token info
    reply += `\n🔄 Last updated: ${new Date().toLocaleTimeString()}`;
    reply += `\n💾 Using database token`;
    reply += `\n🔑 Token: ${tokens.access_token.substring(0, 20)}...`;
    if (isExpired) {
      reply += `\n⚠️ Token appears expired but worked!`;
    } else {
      reply += `\n✅ Token valid for ${minutesUntilExpiry}m`;
    }

    // Send leads to user
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown"
    });

    console.log(`✅ Leads sent successfully to chat ${chatId} using database token`);
    
    return {
      success: true,
      leadCount: leads.length,
      usedDatabaseToken: true,
      tokenExpired: isExpired
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



/**
 * Handle /testleads command - test fetch leads with hardcoded token for debugging
 */
async function handleTestLeadsCommand(chatId, BOT_TOKEN) {
  // Hardcoded access token for testing purposes
  const TEST_ACCESS_TOKEN = "1000.caea110dcf13032965c5f65befcd3e8c.d0e10072e774474fb592f454626730da";
  
  try {
    console.log(`🧪 Processing /testleads command from chat ${chatId}`);
    
    // Send initial message
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: "🧪 *Testing Leads Fetch...*\n\nUsing hardcoded access token for debugging, please wait...",
      parse_mode: "Markdown"
    });
    
    console.log(`📡 Fetching leads from Zoho CRM for chat ${chatId} using test token`);
    console.log(`🔑 Using test access token: ${TEST_ACCESS_TOKEN.substring(0, 20)}...`);
    
    // Fetch leads from Zoho CRM using hardcoded token
    const response = await axios.get("https://www.zohoapis.com/crm/v2/Leads", {
      headers: { 
        Authorization: `Zoho-oauthtoken ${TEST_ACCESS_TOKEN.trim()}`
      },
      params: {
        sort_by: 'Created_Time',
        sort_order: 'desc',
        per_page: 5
      }
    });

    console.log(`✅ Successfully fetched leads for chat ${chatId} using test token`);
    console.log(`📊 Lead count: ${response.data.data?.length || 0}`);
    
    const leads = response.data.data;
    
    if (!leads || leads.length === 0) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `🧪 *Test Leads Results*\n\n` +
              `📭 No leads found in your CRM.\n\n` +
              `✅ Token is valid - API call succeeded\n` +
              `💡 Add some leads to your Zoho CRM to see them here!\n\n` +
              `🔑 Using test token: ${TEST_ACCESS_TOKEN.substring(0, 20)}...`,
        parse_mode: "Markdown"
      });
      
      return { success: true, leadCount: 0 };
    }
    
    // Format leads message
    let reply = "🧪 *Test Leads Results:*\n\n";
    
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
    reply += `\n🧪 Test Mode - Using hardcoded token`;
    reply += `\n🔑 Token: ${TEST_ACCESS_TOKEN.substring(0, 20)}...`;
    reply += `\n✅ API call successful!`;

    // Send leads to user
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown"
    });

    console.log(`✅ Test leads sent successfully to chat ${chatId}`);
    
    return {
      success: true,
      leadCount: leads.length,
      testMode: true
    };

  } catch (error) {
    console.error(`❌ Error in /testleads command for chat ${chatId}:`, error.message);
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code
    });
    
    let errorMessage = "❌ *Test Leads Error*\n\n";
    
    if (error.response?.status === 401) {
      errorMessage += `🔐 Test token is invalid or expired.\n\n` +
                     `The hardcoded token: ${TEST_ACCESS_TOKEN.substring(0, 20)}...\n` +
                     `is not working. Please get a fresh token and update the code.\n\n` +
                     `Error: ${error.response.data?.message || 'Invalid OAuth token'}`;
    } else if (error.response?.status === 403) {
      errorMessage += `🚫 Access denied with test token.\n\n` +
                     `The token may not have the required CRM permissions.`;
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
      errorMessage += `Test token: ${TEST_ACCESS_TOKEN.substring(0, 20)}...`;
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
      statusCode: error.response?.status,
      testMode: true
    };
  }
}

/**
 * Handle /testaccess command - test fetch access token from database for debugging
 */
async function handleTestAccessCommand(chatId, BOT_TOKEN) {
  try {
    console.log(`🔍 Processing /testaccess command from chat ${chatId}`);
    
    // Send initial message
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: "🔍 *Testing Database Access...*\n\nFetching your access token from database, please wait...",
      parse_mode: "Markdown"
    });
    
    // Import database functions
    const { getTokens } = require('./tokenRepo');
    
    console.log(`📊 Fetching tokens from database for chat ${chatId}`);
    
    // Fetch tokens from database
    const tokens = await getTokens(chatId);
    
    if (!tokens) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `🔍 *Test Access Results*\n\n` +
              `❌ No tokens found in database\n\n` +
              `📊 Chat ID: \`${chatId}\`\n` +
              `🗄️ Database query: Searched telegram_user_id = ${chatId}\n\n` +
              `💡 Use /connect to set up your Zoho CRM connection first!`,
        parse_mode: "Markdown"
      });
      
      return { success: false, error: 'No tokens found', chatId: chatId };
    }
    
    // Check token expiry
    const now = new Date();
    const expiresAt = new Date(tokens.expires_at);
    const isExpired = now >= expiresAt;
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60));
    const hoursUntilExpiry = Math.floor(minutesUntilExpiry / 60);
    
    let timeString;
    if (hoursUntilExpiry > 0) {
      timeString = `${hoursUntilExpiry}h ${minutesUntilExpiry % 60}m`;
    } else if (minutesUntilExpiry > 0) {
      timeString = `${minutesUntilExpiry}m`;
    } else if (minutesUntilExpiry >= 0) {
      timeString = "Less than 1 minute";
    } else {
      timeString = `Expired ${Math.abs(minutesUntilExpiry)}m ago`;
    }
    
    // Test the access token with Zoho API
    let apiTestResult = { success: false, error: 'Not tested' };
    
    try {
      console.log(`🧪 Testing access token with Zoho API...`);
      console.log(`🔑 Using access token: ${tokens.access_token.substring(0, 20)}...`);
      
      const testResponse = await axios.get('https://www.zohoapis.com/crm/v2/org', {
        headers: { 
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      apiTestResult = {
        success: true,
        status: testResponse.status,
        orgName: testResponse.data.org?.[0]?.company_name || 'N/A'
      };
      
      console.log(`✅ API test successful! Org: ${apiTestResult.orgName}`);
    } catch (apiError) {
      apiTestResult = {
        success: false,
        status: apiError.response?.status || 'No status',
        error: apiError.response?.data?.message || apiError.message,
        code: apiError.response?.data?.code || 'No code'
      };
      
      console.log(`❌ API test failed: ${apiTestResult.error}`);
    }
    
    // Format comprehensive response
    let reply = "🔍 *Test Access Results:*\n\n";
    
    // Database info
    reply += `📊 *Database Info:*\n`;
    reply += `• Chat ID: \`${chatId}\`\n`;
    reply += `• Telegram User ID: \`${tokens.telegram_user_id}\`\n`;
    reply += `• Record Found: ✅ Yes\n`;
    reply += `• Created: ${new Date(tokens.created_at).toLocaleString()}\n`;
    reply += `• Updated: ${new Date(tokens.updated_at).toLocaleString()}\n\n`;
    
    // Token info
    reply += `🔑 *Token Info:*\n`;
    reply += `• Access Token: ${tokens.access_token.substring(0, 20)}...\n`;
    reply += `• Refresh Token: ${tokens.refresh_token.substring(0, 20)}...\n`;
    reply += `• Client ID: ${tokens.client_id.substring(0, 20)}...\n`;
    reply += `• Expires At: ${expiresAt.toLocaleString()}\n`;
    reply += `• Status: ${isExpired ? '❌ Expired' : '✅ Valid'}\n`;
    reply += `• Time Left: ${timeString}\n\n`;
    
    // API test results
    reply += `🧪 *API Test:*\n`;
    if (apiTestResult.success) {
      reply += `• Status: ✅ Success (${apiTestResult.status})\n`;
      reply += `• Organization: ${apiTestResult.orgName}\n`;
      reply += `• Token Valid: ✅ Yes\n`;
    } else {
      reply += `• Status: ❌ Failed (${apiTestResult.status})\n`;
      reply += `• Error: ${apiTestResult.error}\n`;
      reply += `• Code: ${apiTestResult.code}\n`;
      reply += `• Token Valid: ❌ No\n`;
    }
    
    reply += `\n🔄 Last tested: ${new Date().toLocaleTimeString()}`;
    reply += `\n🔍 Test completed successfully!`;

    // Send comprehensive results
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown"
    });

    console.log(`✅ Test access completed successfully for chat ${chatId}`);
    
    return {
      success: true,
      chatId: chatId,
      tokenFound: true,
      isExpired: isExpired,
      apiTest: apiTestResult,
      testMode: true
    };

  } catch (error) {
    console.error(`❌ Error in /testaccess command for chat ${chatId}:`, error.message);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
    
    let errorMessage = "❌ *Test Access Error*\n\n";
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage += `🌐 Database connection error.\n\n` +
                     `Cannot connect to the database.\n` +
                     `Please check if the database is accessible.`;
    } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
      errorMessage += `🗄️ Database table missing.\n\n` +
                     `The oauth_tokens table does not exist.\n` +
                     `Please run the database setup script.`;
    } else {
      errorMessage += `📝 ${error.message}\n\n`;
      errorMessage += `🔧 Error code: ${error.code || 'Unknown'}\n\n`;
      errorMessage += `Chat ID: \`${chatId}\``;
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
      code: error.code,
      chatId: chatId,
      testMode: true
    };
  }
}

module.exports = {
  handleLeadsCommand,
  handleTestLeadsCommand,
  handleTestAccessCommand,
  handleLeadCreationCommand
};
