const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : ""
});

const chatHistories = new Map();
const lastMsgAt = new Map();
const followupSent = new Map();

// Image Links
const COMBINE_IMAGE = "https://raw.githubusercontent.com/aasanefoods-coder/aasane-bot/main/Max_a_isme_har_packet_ke_a.png";
const CHOCOLATE_IMAGE = "https://raw.githubusercontent.com/aasanefoods-coder/aasane-bot/main/WhatsApp%20Imagec%202026-09-28%20at%2010.55.51%20PM.jpeg";
const MANGO_IMAGE = "https://raw.githubusercontent.com/aasanefoods-coder/aasane-bot/main/WhatsApp%20Imagem%202026-09-28%20at%2010.55.35%20PM.jpeg";
const STRAWBERRY_IMAGE = "https://raw.githubusercontent.com/aasanefoods-coder/aasane-bot/main/WhatsApp%20Image%202026-09-28%20at%2010.55.51%20PM.jpeg";
const VANILLA_IMAGE = "https://raw.githubusercontent.com/aasanefoods-coder/aasane-bot/main/WhatsApp%20Imagev%202026-09-28%20at%2010.55.35%20PM.jpeg";
const PISTA_IMAGE = "https://raw.githubusercontent.com/aasanefoods-coder/aasane-bot/main/WhatsApp%20Imagep%202026-09-28%20at%2010.55.35%20PM.jpeg";

const YOUTUBE_VIDEO_LINK = "https://youtu.be/rqJ6iWq2BCc?si=aEufXWVM5Y9TOHuN";

const RECIPE_TEXT_URDU = `🍨 صرف ایک پاؤ دودھ سے تقریباً 1 لیٹر آئس کریم بنائیں — انتہائی آسان طریقہ

پیکٹ میں 2 پاؤچ ہوتے ہیں:
• آئس کریم پاؤڈر
• فلیور ساشے

1️⃣ آئس کریم پاؤڈر کو ایک پاؤ بہترین کوالٹی کے کھلے دودھ میں اچھی طرح مکس کریں تاکہ کوئی بھی گھٹلی (Lumps) باقی نہ رہے۔
2️⃣ درمیانی آنچ پر مکسچر کو صرف ایک مکمل ابال دیں، جیسے دودھ کو ایک ابال دیا جاتا ہے۔ اسے پکانا نہیں ہے۔
3️⃣ مکسچر کو ٹھنڈا کریں، لیکن وقفے وقفے سے چمچ یا وسک (Whisk) چلاتے رہیں تاکہ اوپر بالائی نہ جمے۔
4️⃣ بیس (Base) کو کسی بھی ایئر ٹائٹ کنٹینر میں ڈال کر ڈیپ فریزر میں مکمل جمنے تک رکھیں۔
5️⃣ آئس کریم بیس (Ice Cream Base) کو باؤل میں نکالیں، فلیور شامل کریں۔
6️⃣ الیکٹرک بیٹر سے 4 سے 5 منٹ یا آئس کریم کا والیوم تقریباً 3 گنا ہونے تک فل اسپیڈ پر بیٹ کریں۔
7️⃣ آئس کریم کو پلاسٹک یا شیشے کے ایئر ٹائٹ کنٹینر میں ڈال کر دوبارہ 4 سے 5 گھنٹے کے لیے ڈیپ فریزر میں رکھ دیں۔

🍨 مزیدار، کریمی اور برانڈ لیول آئس کریم تیار ہے۔

⚠️ نوٹ:
- پتیلی کی سائیڈوں پر جمنے والے بیس کو بھی مکسچر میں یکجان کریں۔
- بیٹ کرنے سے پہلے یقینی بنائیں کہ بیس مکمل جما ہوا ہو، اس میں ذرا سا بھی لیکوئیڈ (Liquid) باقی نہ ہو۔`;

const SYSTEM_PROMPT = `
Tu "Aasane Foods" (Pakistan) ki polite aur helpful sales representative hai.
Tu WhatsApp par Roman Urdu, Urdu Script ya English me baat karti hai.

GREETING RULES (STRICT):
- Full Greeting ("Assalam-o-Alaikum! Aasane Foods me khushamdeed!") ONLY in the VERY FIRST message.
- If customer says "AOA", "Assalam-o-Alaikum", "Salam" in LATER messages, ONLY reply: "Walaikum Assalam! Ji batayein, main kya madad kar sakti hoon?"
- DO NOT repeat "Aasane Foods me khushamdeed" or send product intros in follow-up chats!

PRODUCT & PRICING:
- Main Product: Ice Cream Mix Powder (Rs. 180 per packet)
- 5 Flavors ONLY: Chocolate, Mango (never write "Aam"), Strawberry, Vanilla, Pistachio/Pista (never write "Kulfa").
- Delivery Charges (DC):
  * Karachi: 1-3 Packets = Rs. 200 | 4-5 Packets = Rs. 150
  * Other Cities: 1-3 Packets = Rs. 250 | 4-5 Packets = Rs. 150
- Fixed Price: Strictly Rs. 180. If discount asked: "Sir 20 packets lene walo ko bhi 180 hi lagta hai, price pehle se bohot kam hai."

PHONE NUMBER VALIDATION (PAKISTAN):
- Phone number MUST be valid:
  * Starts with '03' and EXACTLY 11 digits long (e.g., 03001234567).
  * OR starts with '923' and EXACTLY 12 digits long (e.g., 923001234567).
- If phone number is missing digits or invalid, SAY EXACTLY:
  "Bhai phone number incomplete hai. Pakistani number 11 digits ka (0300xxxxxxx) hona chahiye. Kindly sahi number bhej dein."

ORDER CONFIRMATION TWO-STEP FLOW:
1. When customer provides Name, Phone, and Address (with City):
   - First check if Phone Number is valid (11 digits starting 03 or 12 digits starting 923).
   - If address is missing City, ask for City name.
   - If valid, send BILL PREVIEW and ask for confirmation:
     "Aapka order bill summary:
     Name: [Name]
     Phone: [Phone]
     Address: [Address, City]
     Packets: [Packets] ([Flavors])
     Total COD: Rs. [Total] (including DC)

     Kya order confirm kar dein? Kindly 'HAAN' ya 'YES' likh kar bata dein."
   - Set "order_confirmed": false at this stage!
2. Set "order_confirmed": true ONLY AND ONLY IF customer explicitly replies "HAAN", "HAN", "YES", "OK", "CONFIRM DO", etc.

RECIPE RULE:
- If customer asks recipe/video/tareeqa: DO NOT write recipe text yourself. Set "is_recipe_requested": true and write short line: "Ji, recipe aur video tutorial ye raha:"

JSON RESPONSE FORMAT (STRICT):
{
  "text_reply": "Message for customer",
  "is_flavor_request": true/false,
  "is_recipe_requested": true/false,
  "order_confirmed": true/false,
  "order_data": {
    "name": "",
    "phone": "",
    "address": "",
    "city": "",
    "packets": 0,
    "cod": 0,
    "dc": 0
  }
}
`;

async function downloadWhatsAppMedia(mediaId, token) {
  const urlResponse = await axios.get(`https://graph.facebook.com/v26.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const mediaUrl = urlResponse.data.url;
  const audioResponse = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${token}` }
  });
  const filePath = path.join("/tmp", `${mediaId}.ogg`);
  fs.writeFileSync(filePath, Buffer.from(audioResponse.data));
  return filePath;
}

async function sendText(to, text, phoneId, token) {
  await axios.post(
    `https://graph.facebook.com/v26.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text, preview_url: true }
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
}

async function sendImage(to, imageUrl, caption, phoneId, token) {
  await axios.post(
    `https://graph.facebook.com/v26.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: {
        link: imageUrl,
        caption: caption || ""
      }
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
  );
}

app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN ? process.env.VERIFY_TOKEN.trim() : "aasane123secret";
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verify_token) {
    console.log("✅ Webhook Verified!");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

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

    const isFirstTimeUser = !chatHistories.has(from);

    lastMsgAt.set(from, Date.now());
    followupSent.set(from, false);

    let customerText = "";

    if (msg.type === "text") {
      customerText = msg.text?.body || "";
    } else if (msg.type === "audio" || msg.type === "voice") {
      const mediaId = msg.audio?.id || msg.voice?.id;
      const audioPath = await downloadWhatsAppMedia(mediaId, waToken);
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1"
      });
      customerText = transcription.text || "";
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }

    if (!customerText) return;
    console.log(`📩 ${from}: ${customerText}`);

    if (!chatHistories.has(from)) {
      chatHistories.set(from, [{ role: "system", content: SYSTEM_PROMPT }]);
    }

    const history = chatHistories.get(from);
    history.push({ role: "user", content: customerText });
    if (history.length > 12) history.splice(1, history.length - 12);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: history,
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.2
    });

    let parsed = {};
    let textReply = "";
    try {
      parsed = JSON.parse(completion.choices[0].message.content);
      textReply = parsed.text_reply || "Ji, batayein main madad karti hoon.";
    } catch (e) {
      textReply = "Ji, batayein main madad karti hoon.";
    }

    // Override first message greeting
    if (isFirstTimeUser) {
      textReply = "Assalam-o-Alaikum! Aasane Foods me khushamdeed! 🍦\nGhar par creamy ice cream banane ka premium mix powder sirf Rs. 180 me.";
    }

    history.push({ role: "assistant", content: textReply });
    await sendText(from, textReply, phoneId, waToken);

    // 1) Combine Image ONLY on VERY FIRST message
    if (isFirstTimeUser) {
      await sendImage(
        from,
        COMBINE_IMAGE,
        "🍦 Aasane Premium Ice Cream Mix Powder - 5 Flavors",
        phoneId,
        waToken
      );
    }

    // 2) 5 Separate Images on Flavor Request
    const askedFlavors =
      parsed.is_flavor_request ||
      /flavor|flavours|konse flavor|kon sa flavor|available flavor|flover/i.test(customerText);

    if (askedFlavors && !isFirstTimeUser) {
      await sendImage(from, CHOCOLATE_IMAGE, "Chocolate 🍫", phoneId, waToken);
      await sendImage(from, MANGO_IMAGE, "Mango 🥭", phoneId, waToken);
      await sendImage(from, STRAWBERRY_IMAGE, "Strawberry 🍓", phoneId, waToken);
      await sendImage(from, VANILLA_IMAGE, "Vanilla 🤍", phoneId, waToken);
      await sendImage(from, PISTA_IMAGE, "Pistachio 🥜", phoneId, waToken);
    }

    // 3) Recipe Request => Send Video Tutorial link + Urdu text
    const askedRecipe =
      parsed.is_recipe_requested ||
      /recipe|tareeqa|kaise banaye|banane ka|video/i.test(customerText);

    if (askedRecipe) {
      await sendText(
        from,
        `🎥 Aasane Ice Cream Banane Ka Complete Video Tutorial:\n${YOUTUBE_VIDEO_LINK}`,
        phoneId,
        waToken
      );
      await sendText(from, RECIPE_TEXT_URDU, phoneId, waToken);
    }

    // 4) Save confirmed order to Google Sheet
    if (parsed.order_confirmed && parsed.order_data && sheetScriptUrl) {
      console.log("📊 Saving confirmed order to Google Sheet...");
      await axios.post(sheetScriptUrl, parsed.order_data).catch((err) => {
        console.error("Sheet save error:", err.message);
      });
    }

    console.log(`✅ Replied to ${from}`);
  } catch (error) {
    console.error("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

setInterval(async () => {
  try {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const phoneId = process.env.PHONE_NUMBER_ID ? process.env.PHONE_NUMBER_ID.trim() : "";
    const waToken = process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.trim() : "";
    if (!phoneId || !waToken) return;

    for (const [from, ts] of lastMsgAt.entries()) {
      if (followupSent.get(from)) continue;
      if (now - ts < oneDay) continue;

      await sendText(
        from,
        "Assalam-o-Alaikum, bas check kar raha tha. Order confirm karna hai ya koi help chahiye?",
        phoneId,
        waToken
      );
      followupSent.set(from, true);
    }
  } catch (e) {
    console.error("Follow-up error:", e.message);
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Complete Validated Sales Bot Live on Port ${PORT}`);
});
