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

// Memory Maps
const chatHistories = new Map();
const lastMsgAt = new Map();
const followupSent = new Map();

// Official Recipe Details
const YOUTUBE_VIDEO_LINK = "https://youtu.be/rqJ6iWq2BCc?si=aEufXWVM5Y9TOHuN";

const RECIPE_TEXT_URDU = `🍨 صرف ایک پاؤ دودھ سے تقریباً 1 لیٹر آئس کریم بنائیں — انتہائی آسان طریقہ

پیکٹ میں 2 پاؤچ ہوتے ہیں:
• آئس کریم پاؤڈر
• فلیور ساشے

1️⃣ آئس کریم پاؤڈر کو ایک پاؤ بہترین کوالٹی کے کھلے دودھ میں اچھی طرح مکس کریں تاکہ کوئی بھی گھٹلی (Lumps) باقی نہ رہے۔
2️⃣ درمیانی آنچ پر مکسچر کو صرف ایک مکمل ابال دیں، جیسے دودھ کو ایک ابال دیا جاتا ہے۔ اسے پکانا نہیں ہے۔
3️⃣ مکسچر کو ٹھنڈا کریں، لیکن وقفے وقفے سے چمچ یا وسک (Whisk) چلاتے رہیں تاکہ اوپر بالائی نہ جمے، اور پتیلی کی سائیڈوں پر جمنے والے بیس (Base) کو بھی مکسچر میں یکجان کرتے رہیں۔
4️⃣ بیس (Base) کو کسی بھی ایئر ٹائٹ کنٹینر میں ڈال کر ڈیپ فریزر میں مکمل جمنے تک رکھیں۔
5️⃣ آئس کریم بیس (Ice Cream Base) کو باؤل میں نکالیں، فلیور شامل کریں۔
6️⃣ الیکٹرک بیٹر سے 4 سے 5 منٹ یا آئس کریم کا والیوم تقریباً 3 گنا ہونے تک فل اسپیڈ پر بیٹ کریں۔
7️⃣ آئس کریم کو پلاسٹک یا شیشے کے ایئر ٹائٹ کنٹینر میں ڈال کر دوبارہ 4 سے 5 گھنٹے کے لیے ڈیپ فریزر میں رکھ دیں۔

🍨 مزیدار، کریمی اور برانڈ لیول آئس کریم تیار ہے۔

⚠️ نوٹ:
- پتیلی کی سائیڈوں پر جمنے والے بیس کو بھی مکسچر میں یکجان کریں۔
- بیٹ کرنے سے پہلے یقینی بنائیں کہ بیس مکمل جما ہوا ہو، اس میں ذرا سا بھی لیکوئیڈ (Liquid) باقی نہ ہو۔`;

// System Prompt
const SYSTEM_PROMPT = `
Tu "Aasane Foods" (Pakistan) ki sales representative hai. Tu WhatsApp par Roman Urdu, Urdu Script, ya English me baat karti hai.

GREETING RULES:
- "Assalam-o-Alaikum! Aasane Foods me khushamdeed!" ONLY AND ONLY IN THE VERY FIRST MESSAGE.
- NEVER repeat greetings or "Aasane Foods me khushamdeed" in follow-up chats.

BRANDED PHRASING & VOCABULARY RULES:
- NEVER SAY "zarurat hai". Always use: "Aap kaunsa flavor try karna chahenge?"
- FORBIDDEN HINDI/INDIAN WORDS: "Swagat", "Namaste", "Dhanyawad", "Kripya", "Samagri", "Aam".
- ALWAYS USE PAKISTANI WORDS: "Khushamdeed", "Shukriya", "Bhai", "Sir", "JazakAllah".

EXACT 5 FLAVORS ONLY:
- 1) Chocolate
- 2) Mango (Never write "Aam" or "آم", write "Mango" or "مینگو")
- 3) Strawberry
- 4) Vanilla
- 5) Pistachio / Pista (Never write "Kulfa")

PRODUCT & PRICING:
- Main Product: "Ice Cream Mix Powder" (Price: Rs. 180 per packet).
- Delivery Charges (DC):
  * Karachi: 1-3 Packets = Rs. 200 | 4-5 Packets = Rs. 150
  * Other Cities: 1-3 Packets = Rs. 250 | 4-5 Packets = Rs. 150
- Fixed Price: Strictly Rs. 180. Discount poochnay par: "Sir 20 packets jinhon ne liye hain unko bhi 180 price lagai hai. Already price bohot kam hai."

RECIPE / HOW TO MAKE:
- If customer asks "kaise banayein", "recipe", "tareeqa", or "banane ka tareeqa": Reply with brief instructions and mention that complete video tutorial and step-by-step recipe is being sent.

ORDER VALIDATION & JSON OUTPUT:
- Require 3 details: Name, Contact Number, Complete Address WITH City Name.
- If ANY detail (or City Name) is missing, DO NOT confirm order. Say:
  "Bhai ye details incomplete hain. Kindly dobara bhej dein:
  1) Name
  2) Contact Number
  3) Complete Address (City ke sath)"

JSON RESPONSE FORMAT:
Return response strictly in JSON format with fields:
{
  "text_reply": "Message for customer",
  "is_recipe_requested": true/false,
  "order_confirmed": true/false,
  "order_data": {
    "name": "Customer Name",
    "phone": "Customer Phone",
    "address": "Full Address",
    "city": "City Name",
    "packets": 4,
    "cod": 870,
    "dc": 150
  }
}
`;

// Helper: Download WhatsApp Audio
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
    const sheetScriptUrl = process.env.GOOGLE_SHEET_SCRIPT_URL ? process.env.GOOGLE_SHEET_SCRIPT_URL.trim() : "";
    const imageUrl = process.env.PRODUCT_IMAGE_URL ? process.env.PRODUCT_IMAGE_URL.trim() : "";

    const isFirstTimeUser = !chatHistories.has(from);

    lastMsgAt.set(from, Date.now());
    followupSent.set(from, false);

    let customerText = "";

    // Handle Text Message
    if (msg.type === "text") {
      customerText = msg.text?.body;
    } 
    // Handle Voice Note
    else if (msg.type === "audio" || msg.type === "voice") {
      console.log(`🎙️ Voice Message received from ${from}`);
      const mediaId = msg.audio?.id || msg.voice?.id;
      const audioPath = await downloadWhatsAppMedia(mediaId, waToken);
      
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      });
      
      customerText = transcription.text;
      console.log(`📝 Transcribed Audio text: "${customerText}"`);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }

    if (!customerText) return;

    console.log(`📩 Customer (${from}): "${customerText}"`);

    // If First Time User or User asks for Photo -> Send Product Image Direct
    if (isFirstTimeUser || /photo|picture|pic|image|tasveer/i.test(customerText)) {
      if (imageUrl) {
        console.log("🖼️ Sending Product Image...");
        await axios.post(
          `https://graph.facebook.com/v26.0/${phoneId}/messages`,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: from,
            type: "image",
            image: { 
              link: imageUrl,
              caption: "🍦 Aasane Premium Ice Cream Mix Powder\nPure Milk rich Creamy Texture!" 
            }
          },
          { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
        ).catch(e => console.error("Image send error:", e.message));
      }
    }

    // Initialize Chat History
    if (!chatHistories.has(from)) {
      chatHistories.set(from, [
        { role: "system", content: SYSTEM_PROMPT }
      ]);
    }

    const history = chatHistories.get(from);
    history.push({ role: "user", content: customerText });

    if (history.length > 11) {
      history.splice(1, history.length - 11);
    }

    // Get Structured Response from ChatGPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: history,
      response_format: { type: "json_object" },
      max_tokens: 350,
      temperature: 0.2,
    });

    const aiReplyRaw = completion.choices[0].message.content;
    let textReply = "";
    let parsedData = {};

    try {
      parsedData = JSON.parse(aiReplyRaw);
      textReply = parsedData.text_reply || aiReplyRaw;
    } catch(e) {
      textReply = aiReplyRaw;
    }

    console.log(`🤖 AI Reply: "${textReply}"`);
    history.push({ role: "assistant", content: textReply });

    // Send WhatsApp Text Reply
    await axios.post(
      `https://graph.facebook.com/v26.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: from,
        type: "text",
        text: { body: textReply }
      },
      { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
    );

    // If Recipe Requested -> Send Video Link with Thumbnail Preview FIRST, then Detailed Urdu Text
    if (parsedData.is_recipe_requested || /recipe|banane ka|tareeqa|kaise banaye/i.test(customerText)) {
      console.log("🎥 Sending Recipe Video Link with Thumbnail Preview...");
      
      // 1. Send YouTube Video Link Message (preview_url: true enables Thumbnail)
      await axios.post(
        `https://graph.facebook.com/v26.0/${phoneId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: from,
          type: "text",
          text: { 
            preview_url: true,
            body: `🎥 *Aasane Ice Cream Banane Ka Complete Video Tutorial:*\n${YOUTUBE_VIDEO_LINK}`
          }
        },
        { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
      );

      console.log("📜 Sending Detailed Urdu Recipe Text...");
      
      // 2. Send Detailed Urdu Recipe Text Message
      await axios.post(
        `https://graph.facebook.com/v26.0/${phoneId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: from,
          type: "text",
          text: { body: RECIPE_TEXT_URDU }
        },
        { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
      );
    }

    // If Order Confirmed -> Auto Save to Google Sheet
    if (parsedData.order_confirmed && parsedData.order_data && sheetScriptUrl) {
      console.log("📊 Saving Order to Google Sheet...");
      await axios.post(sheetScriptUrl, parsedData.order_data)
        .then(() => console.log("✅ Order Auto-Saved to Google Sheet!"))
        .catch(err => console.error("❌ Google Sheet Save Error:", err.message));
    }

  } catch (error) {
    console.error("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

// Single Follow-Up Worker (24h Inactive)
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
  console.log(`🚀 Aasane Foods Video Thumbnail & Urdu Recipe Bot Live on Port ${PORT}`);
});
