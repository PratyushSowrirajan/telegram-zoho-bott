const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const BOT_TOKEN = "7803103960:AAHfeyMoir-bUGTO7LldOEHUf-DLnW46pMA";
// Hardcoded valid Zoho access token for testing
const ZOHO_TOKEN = "1000.1a82ee2f25b83a4a51ce97f8c987832d.9fd1402872076cb3fc1983bd2e94735d";
const TEST_CHAT_ID = 6541363201;

app.post("/telegram-webhook", async (req, res) => {
  const message = req.body.message;
  const chatId = message.chat.id;
  const text = message.text;

  if (text === "/leadstesting" && chatId === TEST_CHAT_ID) {
    try {
      // Fetch leads from Zoho CRM using the hardcoded token
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
  } else {
    res.send("Unknown command");
  }
});

app.listen(3000, () => console.log("Test webhook running on port 3000"));
