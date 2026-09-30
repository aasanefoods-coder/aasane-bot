const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// OpenAI Setup
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "" 
});

// Memory maps for 24-hour single follow-up
const lastMsgAt = new Map();
const followupSent = new Map();

// System Prompt
const SYSTEM_PROMPT = `
Tu "Aasane Foods" (Pakistan) ki polite aur professional sales representative hai. Tu WhatsApp par Pakistani Roman Urdu, Urdu Script, ya English me baat karti hai.

GREETING & FIRST MESSAGE RULE (STRICT):
- "Assalam-o-Alaikum! Aasane Foods me khushamdeed!" ONLY AND ONLY FIRST MESSAGE ME BOLNA HAI.
- Har message me "Aasane Foods me khushamdeed" ya "Assalam-o-Alaikum" ya "kaise hain" REPEAT MAT KARO!
- Agar customer ne pehle baat shuru kar li hai ya koi sawal poocha hai, to DIRECTLY uske sawal ka jawab do, koi welcome message dobara mat do.

BRANDED PHRASING & VOCABULARY RULES:
- NEVER SAY: "Aapko kis flavor ki zarurat hai?" or "zarurat". (Yeh unprofessional lagta hai).
- INSTEAD USE BRANDED PHRASES: "Aap kaunsa flavor try karna chahenge?" ya "Aapko kaunse flavors chahiye?"
- STRICTLY BANNED WORDS (INDIAN/HINDI WORDS ARE FORBIDDEN): "Swagat", "Namaste", "Dhanyawad", "Kripya", "Samagri", "Aam" etc.
- ALWAYS USE PAKISTANI WORDS: "Khushamdeed", "Shukriya", "Bhai", "Sir", "JazakAllah".

EXACT 5 FLAVORS ONLY (STRICT):
- 1) Chocolate
- 2) Mango (NEVER write "Aam" or "آم". Always write "Mango" in Roman or "مینگو" in Urdu script)
- 3) Strawberry
- 4) Vanilla
- 5) Pistachio / Pista (NEVER write "Kulfa")

PRODUCT DETAILS:
- Single main product: "Ice Cream Mix Powder" (Price: Rs. 180 per packet).
- NEVER ask "aapko konsay product ke baray me jan-na hai". There is ONLY ONE product (Ice Cream Mix Powder) which comes in 5 flavors.

SCRIPT & LANGUAGE SELECTION:
- VOICE NOTES & ROMAN URDU TYPED: Reply strictly in PAKISTANI ROMAN URDU.
- TYPED URDU SCRIPT: Reply in Urdu Script (اردو) using Pakistani words ("مینگو" for Mango, "پستہ" for Pista).
- TYPED ENGLISH: Reply in English.

PRICING & DELIVERY CHARGES (DC):
- Price: Rs. 180 per packet
- Karachi: 1-3 Packets = Rs. 200 | 4-5 Packets = Rs. 150
- Other Cities: 1-3 Packets = Rs. 250 | 4-5 Packets = Rs. 150
- Fixed Price: Strictly Rs. 180/packet. Discount poochnay par: "Sir 20 packets jinhon ne liye hain unko bhi 180 price lagai hai. Already price bohot kam hai."

ORDER VALIDATION:
- Require 3 details: 1) Name, 2) Contact Number, 3) Complete Address WITH City Name.
- Agar koi bhi detail (ya City Name) missing ho, to order confirm mat karo. Exactly bolo:
  "Bhai ye details incomplete hain. Kindly dobara bhej dein:
  1) Name
  2) Contact Number
  3) Complete Address (City ke sath)"
- Complete details milnay par: Total = (Packets * 180) + DC calculate karke short COD summary do.
`;

// Helper: Download WhatsApp Audio Media for Whisper Transcription
async function downloadWhatsAppMedia(mediaId, token) {
  const urlResponse = await axios.get(`https://graph.facebook.com/v26.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const mediaUrl = urlResponse.data.url;
  const audioResponse = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${token}` }
  });
  const filePath = path.join("/tmp", `${mediaId}.ogg`);
  fs.writeFileSync(filePath, Buffer.from(audioResponse.data));
  return filePath;
}

// 1. Webhook Verification
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN ? process.env.VERIFY_TOKEN.trim() : "aasane123secret";
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verify_token) {
    console.log("✅ Webhook Verified!");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// 2. Incoming Messages Handler
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];

    if (!msg) return;

    const from = msg.from;
    const phoneId = process.env.PHONE_NUMBER_ID ? process.env.PHONE_NUMBER_ID.trim() : "";
    const waToken = process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.trim() : "";

    // Save timestamp for 24h follow-up
    lastMsgAt.set(from, Date.now());
    followupSent.set(from, false);

    let customerText = "";

    // Handle Text Message
    if (msg.type === "text") {
      customerText = msg.text?.body;
    } 
    // Handle Voice Note (Transcribe Voice to Text, NO VOICE REPLY)
    else if (msg.type === "audio" || msg.type === "voice") {
      console.log(`🎙️ Voice Message received from ${from}`);
      const mediaId = msg.audio?.id || msg.voice?.id;
      
      const audioPath = await downloadWhatsAppMedia(mediaId, waToken);
      
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      });
      
      // Treat transcribed voice as a prompt requiring Roman Urdu reply
      customerText = `[Voice Note Transcribed]: ${transcription.text}`;
      console.log(`📝 Transcribed Audio text: "${transcription.text}"`);
      
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }

    if (!customerText) return;

    console.log(`📩 Customer (${from}): "${customerText}"`);

    // Get Text Response from ChatGPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: customerText }
      ],
      max_tokens: 250,
      temperature: 0.3,
    });

    const aiReply = completion.choices[0].message.content;
    console.log(`🤖 AI Text Reply: "${aiReply}"`);

    // Always reply with TEXT ONLY
    await axios.post(
      `https://graph.facebook.com/v26.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: from,
        type: "text",
        text: { body: aiReply }
      },
      { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
    );

    console.log(`✅ Text Reply Sent to ${from}`);

  } catch (error) {
    console.error("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

// Single Follow-Up Worker (Checks every hour for 24-hour inactive customers, sends only ONCE)
setInterval(async () => {
  try {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const phoneId = process.env.PHONE_NUMBER_ID ? process.env.PHONE_NUMBER_ID.trim() : "";
    const waToken = process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.trim() : "";

    if (!phoneId || !waToken) return;

    for (const [from, ts] of lastMsgAt.entries()) {
      if (followupSent.get(from)) continue;
      if (now - ts >= oneDay) {
        console.log(`📌 Sending 24h Single Follow-up to ${from}...`);
        await axios.post(
          `https://graph.facebook.com/v26.0/${phoneId}/messages`,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: from,
            type: "text",
            text: { body: "Assalam-o-Alaikum, bas confirm karna tha ke kya aapka order place karna hai ya koi aur sawal hai?" }
          },
          { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
        );
        followupSent.set(from, true);
      }
    }
  } catch (e) {
    console.error("❌ Follow-up Worker Error:", e.message);
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Text-Only Reply Bot Live on Port ${PORT}`);
});
