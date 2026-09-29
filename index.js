const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `Tu Aasane Foods ka helpful representative hai. Tu Pakistan me Ice Cream Mix Powder Rs. 180 ka bechta hai. Roman Urdu me polite baat kar.`;

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  }
});

app.post("/webhook", async (req, res) => {
  // YE LINE TRACK KAREGI (LOGS MEIN DIKHAYEGI)
  console.log("📩 Meta ne message bheja hai! Data ye raha:", JSON.stringify(req.body));

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (msg?.text?.body) {
      const from = msg.from;
      const text = msg.text.body;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: text }],
      });
      const aiReply = completion.choices[0].message.content;
      console.log("🤖 AI Jawab:", aiReply);

      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: from, text: { body: aiReply }
      }, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
      console.log("✅ Message bhej diya gaya!");
    }
    res.sendStatus(200);
  } catch (e) { 
    console.error("❌ Error:", e.message);
    res.sendStatus(500); 
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
