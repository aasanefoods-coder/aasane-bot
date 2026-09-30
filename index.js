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
const lastBotReply = new Map(); // same reply dobara na bheje

// Images
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
Tu "Aasane Foods" Pakistan ki bohot friendly, soft aur professional sales girl hai.
Roman Urdu / Urdu / English me baat kar.

ASLI INSAN KI TARAH BAAT KARO:
- Kabhi bhi SAME message 2 baar mat bhejo.
- Agar customer gusse me ho ya bole "number sahi hai", to soft bano, argue mat karo.
- Short, pyar se, clear baat karo.

GREETING:
- Full greeting SIRF pehli baat me:
  "Assalam-o-Alaikum! Aasane Foods me khushamdeed! 🍦"
- Baad me AOA/Salam aaye to sirf:
  "Walaikum Assalam! Ji batayein 🙂"
- Dobara khushamdeed/product intro mat do.

PRODUCT:
- Ice Cream Mix Powder
- Price: Rs. 180 per packet
- Flavors: Chocolate, Mango, Strawberry, Vanilla, Pistachio/Pista
- Mango ko kabhi Aam mat likho, Kulfa mat likho.

DC:
- Karachi: 1-3 = 200 | 4-5 = 150
- Other city: 1-3 = 250 | 4-5 = 150

ORDER FLOW (BOHOT ZAROORI):
1) Jab tak customer clearly order na de / details na bheje, phone ya address MAT mango.
2) "Mera order lein" bole to pehle soft pooch:
   - Kaunse flavors?
   - Kitne packets?
   - Name, phone, complete address (city ke sath)
3) Phone tab check karo jab customer number bheje.
4) Valid phone:
   - 03XXXXXXXXX = exactly 11 digits
   - 923XXXXXXXXX = exactly 12 digits
5) Agar number galat ho:
   - Soft samjhao, same line dobara mat maro.
   - Example:
     "Ji bilkul, main check kar leti hoon 🙂
     Aapka number thoda incomplete/galat format me hai.
     Pakistani number usually 03 se start hota hai aur total 11 digit hota hai
     (jaise 0300xxxxxxx).
     Digits count karke ek baar dobara bhej dein, main turant order aage barhati hoon."
6) Details complete hon to PEHLE bill confirmation bhejo:
   Name, Phone, Address, Packets/Flavors, COD total
   aur poocho: "Agar sahi hai to HAAN likh dein."
7) order_confirmed=true SIRF tab jab customer HAAN/YES/OK/CONFIRM likhe.

RECIPE:
- Recipe/video pooche to khud steps mat likho.
- Short bolo: "Ji, recipe aur video ye raha:"
- is_recipe_requested=true

FLAVORS:
- Flavors pooche to short text do aur is_flavor_request=true

JSON STRICT:
{
  "text_reply": "short friendly reply",
  "is_flavor_request": false,
  "is_recipe_requested": false,
  "order_confirmed": false,
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

function isValidPakPhone(phone) {
  if (!phone) return false;
  const p = String(phone).replace(/[\s-]/g, "");
  return /^(03\d{9}|923\d{9})$/.test(p);
}

function normalizeReply(text) {
  return (text || "").trim().replace(/\s+/g, " ").toLowerCase();
}

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
    if (history.length > 14) history.splice(1, history.length - 14);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: history,
      response_format: { type: "json_object" },
      max_tokens: 280,
      temperature: 0.3
    });

    let parsed = {};
    let textReply = "";
    try {
      parsed = JSON.parse(completion.choices[0].message.content);
      textReply = (parsed.text_reply || "").trim();
    } catch (e) {
      textReply = "Ji bilkul 🙂 batayein main madad karti hoon.";
    }

    // First message forced greeting
    if (isFirstTimeUser) {
      textReply = "Assalam-o-Alaikum! Aasane Foods me khushamdeed! 🍦\nGhar par creamy ice cream banane ka premium mix powder sirf Rs. 180 me.";
    } else {
      // Later salam
      if (/^(aoa|assalamualaikum|assalam-o-alaikum|salam|hello|hi)\b/i.test(customerText.trim())) {
        textReply = "Walaikum Assalam! Ji batayein 🙂";
      }
    }

    // Soft phone handling if AI becomes robotic
    const phoneFromOrder = parsed?.order_data?.phone || "";
    const customerClaimsNumberOk = /sahi number|shi number|number sahi|number shi|galat nahi|check karein|galti/i.test(customerText);
    if (phoneFromOrder && !isValidPakPhone(phoneFromOrder)) {
      textReply = customerClaimsNumberOk
        ? "Ji bilkul, galti ho sakti hai meri taraf se bhi 🙂\nAap ek baar digits count kar ke number dobara bhej dein.\nPakistani number 03 se start + total 11 digit hona chahiye (ya 92 se 12 digit). Main turant aage barhati hoon."
        : "Ji soft si baat hai 🙂 number format thoda mismatch hai.\nPakistani number 03 se start hota hai aur 11 digit ka hota hai (jaise 0300xxxxxxx).\nEk baar count karke sahi number bhej dein, order confirm kar deti hoon.";
      parsed.order_confirmed = false;
    }

    // Same message anti-repeat
    const prev = lastBotReply.get(from);
    if (prev && normalizeReply(prev) === normalizeReply(textReply)) {
      textReply = "Ji samajh gayi 🙂 thoda clear detail bhej dein, main turant help karti hoon. Flavors, packets, name, phone aur city ke sath address bhej sakte hain.";
    }

    if (!textReply) textReply = "Ji batayein 🙂";

    history.push({ role: "assistant", content: textReply });
    lastBotReply.set(from, textReply);
    await sendText(from, textReply, phoneId, waToken);

    // 1) First message: combine image + finger message
    if (isFirstTimeUser) {
      await sendImage(
        from,
        COMBINE_IMAGE,
        "🍦 Aasane Premium Ice Cream Mix Powder",
        phoneId,
        waToken
      );
      await sendText(
        from,
        " Flavors and details 👆",
        phoneId,
        waToken
      );
    }

    // 2) Flavor request => 5 images
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

    // 3) Recipe
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

    // 4) Save only truly confirmed + valid phone orders
    if (
      parsed.order_confirmed &&
      parsed.order_data &&
      isValidPakPhone(parsed.order_data.phone) &&
      sheetScriptUrl
    ) {
      console.log("📊 Saving confirmed order...");
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
        "Assalam-o-Alaikum, bas check kar rahi thi 🙂 order confirm karna hai ya koi help chahiye?",
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
  console.log(`🚀 Aasane Foods Human-like Sales Bot Live on Port ${PORT}`);
});
