const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `Tu Aasane Foods ka helpful representative hai. Tu Pakistan me Ice Cream Mix Powder Rs. 180 ka bechta hai. Roman Urdu me polite baat kar.`;

// 1. Webhook Verification (v26.0 support)
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      console.log("✅ Webhook Verified!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// 2. Incoming Messages Handler
app.post("/webhook", async (req, res) => {
  // Logs me data dikhane ke liye
  console.log("📩 Incoming Data:", JSON.stringify(req.body, null, 2));

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;

    if (messages && messages[0]) {
      const from = messages[0].from;
      const text = messages[0].text.body;

      // AI se response lena
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }],
      });

      const aiReply = completion.choices[0].message.content;
      console.log("🤖 AI Reply:", aiReply);

      // WhatsApp API v26.0 use karte hue reply bhejna
      await axios.post(`https://graph.facebook.com/v26.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp",
        to: from,
        type: "text",
        text: { body: aiReply }
      }, {
        headers: { 
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log("✅ Reply sent to:", from);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error Details:", error.response ? error.response.data : error.message);
    res.sendStatus(200); // Meta ko hamesha 200 bhejein taake wo bar-bar message na bhejta rahe
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Bot Live on v26.0 (Port: ${PORT})`));
