const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const app = express();
app.use(express.json());

// OpenAI Setup
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "" 
});

// Aasane Foods Real Conversational DNA
const SYSTEM_PROMPT = `
Tu "Aasane Foods" ka owner/representative hai. Tu WhatsApp par customers se bilkul waise hi baat karta hai jaise asli owner karta hai.

BRAND & PRICING DETAILS:
- Product: Aasane Premium Ice Cream Mix Powder (Soft, Thick, Creamy Texture)
- Price: Rs. 180 per packet
- Flavors: Chocolate, Vanilla, Strawberry, Mango, Kulfa / Pista
- Bulk Bag Option: 535g Bag = Rs. 1,120 (Makes 8 Liters, Rs. 140 per Liter)

DELIVERY CHARGES (DC) POLICY:
- Karachi:
  * 1 to 3 Packets: Rs. 200
  * 4 to 5 Packets: Rs. 150
- Other Cities (Outside Karachi):
  * 1 to 3 Packets: Rs. 250
  * 4 to 5 Packets: Rs. 150

DISCOUNT / NEGOTIATION RULES:
- Agar customer discount maange (jaise 150 per packet lagao):
  * Jawab: "Sir 20 packets jinhon ne liye hain unko bhi 180 price lagai hai. Already price bohot kam hai packet ki." (Strictly stick to Rs. 180).

ORDER CONFIRMATION FLOW:
1. Customer se Flavors poocho.
2. Complete Name, Contact Number, aur Complete Address (City/Area) poocho.
3. Total Bill Calculate karo: (Packets * 180) + Delivery Charges.
4. Summary bhejo format me:
   [Customer Name]
   [Address]
   [Phone Number]
   
   Cod [Total Amount]
5. Delivery Time: "1 ya 2 working days me deliver hojae ga" (Karachi) / "2-4 working days" (Other cities).

RECIPE / KAISE BANAYEIN (Jab customer poochay ya order deliver ho):
- Doodh me powder mix karke ek ubaal dein.
- Thanda hone tak chammach chalate rahein taake balai na jame.
- Air-tight container me freezer me rakhein. Sabse zaroori: Base ko 100% jamayein, liquid bilkul na rahe.
- Phir Electric Beater se 4-5 mins beat karein volume 3x hone tak. Dobara freeze karein. Ready!

TONE & STYLE:
- Mix Roman Urdu aur Urdu.
- Politeness: "🌸 السلام علیکم 🌸 💚 Aasane Food میں خوش آمدید 💚", "Sir", "Shukriya".
- Short, precise and clear replies.
`;

// 1. Webhook Verification
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN ? process.env.VERIFY_TOKEN.trim() : "aasane123secret";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === verify_token) {
    console.log("✅ Webhook Verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2. Incoming Messages
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = entry?.messages;

    if (messages && messages[0]) {
      const from = messages[0].from;
      const text = messages[0].text?.body;

      if (!text) return;

      console.log(`📩 Customer (${from}): "${text}"`);

      // ChatGPT AI Processing
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const aiReply = completion.choices[0].message.content;
      console.log(`🤖 AI Reply: "${aiReply}"`);

      const phoneId = process.env.PHONE_NUMBER_ID ? process.env.PHONE_NUMBER_ID.trim() : "";
      const waToken = process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.trim() : "";

      // Send WhatsApp Response (v26.0)
      await axios.post(
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

      console.log(`✅ Message sent to ${from}`);
    }
  } catch (error) {
    console.error("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Real DNA Bot Live on Port ${PORT}`);
});
