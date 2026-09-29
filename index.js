const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const app = express();
app.use(express.json());

// OpenAI API Setup
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "" 
});

// Aasane Foods AI Prompt (Pakistani Roman Urdu Tone)
const SYSTEM_PROMPT = `Tu "Aasane Foods" ka polite aur helpful representative hai. Tu Pakistan me Ice Cream Mix Powder Rs. 180 per pack bechta hai.

PRODUCT DETAILS:
- Product: Ice Cream Mix Powder (Readymix powder)
- Price: Rs. 180 per pack (1 pack se 1 Litre ice cream banti hai)
- Flavors: Vanilla, Chocolate, Mango, Strawberry, Kulfa
- Kaise Banayein: 1 pack powder ko 500ml thande doodh me mix karein, 5 min blend karein, aur freezer me 6-8 ghante jamne rakh dein.
- Delivery: Poore Pakistan me delivery available hai (Cash on Delivery / JazzCash / EasyPaisa).

RULES:
- Customer se Roman Urdu / Hinglish me baat kar.
- Chhote aur natural messages bhej.
- Friendly tone rakh, jaise: "Aoa", "G bilkul", "Kya haal hain?".
- Order lene ke liye customer ka Naam, Address aur City poocho.
- Kabhi mat bol ke tu AI ya bot hai. Tu Aasane Foods ki team hai.`;

// 1. Webhook Verification (Meta Verification Link)
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN ? process.env.VERIFY_TOKEN.trim() : "aasane123secret";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      console.log("✅ Webhook Verification Successful!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// 2. Incoming WhatsApp Messages Handler
app.post("/webhook", async (req, res) => {
  // Always respond with 200 OK to Meta immediately
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;

    if (messages && messages[0]) {
      const from = messages[0].from; // Customer ka phone number
      const text = messages[0].text?.body; // Customer ka message

      if (!text) return;

      console.log(`📩 Message from ${from}: "${text}"`);

      // ChatGPT (OpenAI) se response mangwana
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        max_tokens: 250,
      });

      const aiReply = completion.choices[0].message.content;
      console.log(`🤖 AI Response: "${aiReply}"`);

      // Clean Keys & Tokens
      const phoneId = process.env.PHONE_NUMBER_ID ? process.env.PHONE_NUMBER_ID.trim() : "";
      const waToken = process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.trim() : "";

      // WhatsApp Cloud API v26.0 through reply bhejnah
      const response = await axios.post(
        `https://graph.facebook.com/v26.0/${phoneId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: from,
          type: "text",
          text: { body: aiReply }
        },
        {
          headers: {
            Authorization: `Bearer ${waToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      console.log(`✅ Message Delivered to ${from}! Status: ${response.status}`);
    }
  } catch (error) {
    console.error("❌ Delivery Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

// Server Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Bot is Live on Port ${PORT}`);
});
