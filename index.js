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
const lastBotReply = new Map();

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
3️⃣ مکسچر کو ٹھنڈا کریں، لیکن وقفے وقفے سے چمچ یا وسک (Whisk) چلاتے رہیں تاکہ اوپر بالائی نہ جمے، اور پتیلی کی سائیڈوں پر جمنے والے بیس (Base) کو بھی مکسچر میں یکجان کرتے رہیں۔
4️⃣ بیس (Base) کو کسی بھی ایئر ٹائٹ کنٹینر میں ڈال کر ڈیپ فریزر میں مکمل جمنے تک رکھیں۔
5️⃣ آئس کریم بیس (Ice Cream Base) کو باؤل میں نکالیں، فلیور شامل کریں۔
6️⃣ الیکٹرک بیٹر سے 4 سے 5 منٹ یا آئس کریم کا والیوم تقریباً 3 گنا ہونے تک فل اسپیڈ پر بیٹ کریں۔
7️⃣ آئس کریم کو پلاسٹک یا شیشے کے ایئر ٹائٹ کنٹینر میں ڈال کر دوبارہ 4 سے 5 گھنٹے کے لیے ڈیپ فریزر میں رکھیں۔

🍨 مزیدار، کریمی اور برانڈ لیول آئس کریم تیار ہے۔

⚠️ نوٹ:
- پتیلی کی سائیڈوں پر جمنے والے بیس کو بھی مکسچر میں یکجان کریں۔
- بیٹ کرنے سے پہلے یقینی بنائیں کہ بیس مکمل جما ہوا ہو، اس میں ذرا سا بھی لیکوئیڈ (Liquid) باقی نہ ہو۔`;

const SYSTEM_PROMPT = `
Tu "Aasane Foods" (Pakistan) ki bohot friendly, polite aur natural sales girl hai.
Roman Urdu / Urdu / English me baat kar.

BEHAVIOR & TONE:
- Sales Increase karne par focus kar. Natural, friendly aur polite baat kar.
- DOBARA SAME MESSAGE BHEJNA SAKHT MANA HAI!
- Har baar 'Aasane Foods me khushamdeed' ya 'Assalam-o-Alaikum' bilkul nahi bolna.
- Pehli chat ke baad agar customer Salam kare to SIRF "Walaikum Assalam! Ji batayein 🙂" bolna.

ORDER INTENT & FLAVOR MANDATORY RULE (CRITICAL):
- JAB TAK CUSTOMER KHUD YE NA BATA DE KE USAY KONSE FLAVORS AUR KITNE PACKETS CHAHIYE, TAB TAK BILL SUMMARY YA ORDER CONFIRMATION BILKUL MAT BANAO!
- Agar customer bole "Order lein", "Order book karein", ya details bhej de lekin FLAVORS / QUANTITY na bataye, to pehle poocho:
  "Ji bilkul! 🍦 Aapko kitne packets aur konse flavors (Chocolate, Mango, Strawberry, Vanilla, Pistachio) chahiye?"
- DO NOT send flavor images during ordering flow unless customer asks "flavors dikhao".

PRODUCT & PRICING:
- Ice Cream Mix Powder (Rs. 180 per packet).
- 5 Flavors ONLY: Chocolate, Mango (never Aam/آم), Strawberry, Vanilla, Pistachio/Pista (never Kulfa).
- DC Karachi: 1-3 = Rs. 200 | 4-5 = Rs. 150
- DC Other Cities: 1-3 = Rs. 250 | 4-5 = Rs. 150
- Discount requested: "Sir 20 packets lene walo ko bhi 180 lagta hai, price pehle se bohot kam hai 🙂"

PHONE VALIDATION (PAKISTAN):
- Valid numbers: 11 digits starting with '03' OR 12 digits starting with '923'.
- Agar customer invalid number de aur bole "sahi number hai", to polite samjhao:
  "Ji bilkul, main check kar leti hoon 🙂 Aapka number thoda incomplete lag raha hai. Pakistani number 03 se start hota hai aur total 11 digits hota hai (jaise 0300xxxxxxx). Digits count karke dobara bhej dein, main order confirm kar deti hoon."

ORDER CONFIRMATION FLOW:
1. Order ke liye 5on cheezen zaroori hain:
   - Flavors list
   - Number of Packets
   - Name
   - Valid Phone (11 digits starting 03)
   - Address WITH City Name
2. Agar in me se KOI BHI CHEEZ missing ho (khas tor par Flavors ya Packets), to pehle wo missing detail poocho, summary MAT banao!
3. Jab 5on cheezen poori mil jayen, tab Summary bhejo aur poocho:
   "Aapka Order Bill Summary:
   Name: [Name]
   Phone: [Phone]
   Address: [Address, City]
   Packets: [Quantity] ([Selected Flavors])
   Total COD: Rs. [Total] (including DC)

   Kya order confirm kar dein? Kindly 'HAAN' ya 'YES' likh kar bata dein."
4. "order_confirmed": true SIRF TABHI karo jab customer explicitly "HAAN", "YES", "OK", "CONFIRM" bole.

JSON OUTPUT (STRICT):
{
  "text_reply": "Short natural response for WhatsApp",
  "explicit_flavor_request": true/false,
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
      max_tokens: 300,
      temperature: 0.2
    });

    let parsed = {};
    let textReply = "";
    try {
      parsed = JSON.parse(completion.choices[0].message.content);
      textReply = parsed.text_reply || "Ji bilkul 🙂 batayein main madad karti hoon.";
    } catch (e) {
      textReply = "Ji bilkul 🙂 batayein main madad karti hoon.";
    }

    // First time greeting
    if (isFirstTimeUser) {
      textReply = "Assalam-o-Alaikum! Aasane Foods me khushamdeed! 🍦\nGhar par creamy ice cream banane ka premium mix powder sirf Rs. 180 me.";
    } else {
      if (/^(aoa|assalamualaikum|assalam-o-alaikum|salam|hello|hi)\b/i.test(customerText.trim())) {
        textReply = "Walaikum Assalam! Ji batayein 🙂";
      }
    }

    // Phone format check safeguard
    const phoneFromOrder = parsed?.order_data?.phone || "";
    if (phoneFromOrder && !isValidPakPhone(phoneFromOrder)) {
      const userArgues = /sahi|shi|galat nahi|check|galti/i.test(customerText);
      textReply = userArgues
        ? "Ji bilkul, galti ho sakti hai meri taraf se bhi 🙂 Aap ek baar digits count kar ke number dobara bhej dein. Pakistani number 03 se start ho kar 11 digits ka hota hai. Main turant order confirm karti hoon."
        : "Ji soft si baat hai 🙂 Aapka phone number incomplete lag raha hai. Pakistani number 03 se start hota hai aur total 11 digits ka hota hai (jaise 0300xxxxxxx). Digits count karke sahi number bhej dein.";
      parsed.order_confirmed = false;
    }

    // Prevent duplicate exact message repetition
    const prevReply = lastBotReply.get(from);
    if (prevReply && normalizeReply(prevReply) === normalizeReply(textReply)) {
      textReply = "Ji samajh gayi 🙂 Aap flavors aur quantity ke sath address bhej dein, main abhi bill calculate karke order aage barhati hoon.";
    }

    history.push({ role: "assistant", content: textReply });
    lastBotReply.set(from, textReply);

    // Send Main Text
    await sendText(from, textReply, phoneId, waToken);

    // 1) First Message: Combine Image + "Flavors and details 👆"
    if (isFirstTimeUser) {
      await sendImage(from, COMBINE_IMAGE, "🍦 Aasane Premium Ice Cream Mix Powder", phoneId, waToken);
      await sendText(from, "Flavors and details 👆", phoneId, waToken);
    }

    // 2) Flavor Images ONLY IF EXPLICITLY ASKED
    const isOrdering = /order|mangwana|khareedna|chahiye|bhej/i.test(customerText);
    const explicitlyAskedFlavors = /konse flavor|kon sa flavor|available flavor|flover|flavor dikhao|flavors dikhao|flavors konsi|kon kon se flavor/i.test(customerText) || (parsed.explicit_flavor_request && !isOrdering);

    if (explicitlyAskedFlavors && !isFirstTimeUser) {
      console.log("📸 Sending 5 Flavor Images...");
      await sendImage(from, CHOCOLATE_IMAGE, "Chocolate 🍫", phoneId, waToken);
      await sendImage(from, MANGO_IMAGE, "Mango 🥭", phoneId, waToken);
      await sendImage(from, STRAWBERRY_IMAGE, "Strawberry 🍓", phoneId, waToken);
      await sendImage(from, VANILLA_IMAGE, "Vanilla 🤍", phoneId, waToken);
      await sendImage(from, PISTA_IMAGE, "Pistachio 🥜", phoneId, waToken);
    }

    // 3) Recipe Request
    const askedRecipe = parsed.is_recipe_requested || /recipe|tareeqa|kaise banaye|banane ka|video/i.test(customerText);
    if (askedRecipe) {
      await sendText(from, `🎥 Aasane Ice Cream Banane Ka Complete Video Tutorial:\n${YOUTUBE_VIDEO_LINK}`, phoneId, waToken);
      await sendText(from, RECIPE_TEXT_URDU, phoneId, waToken);
    }

    // 4) Save to Google Sheet ONLY IF CONFIRMED & VALID PHONE & PACKETS > 0
    if (
      parsed.order_confirmed &&
      parsed.order_data &&
      parsed.order_data.packets > 0 &&
      isValidPakPhone(parsed.order_data.phone) &&
      sheetScriptUrl
    ) {
      console.log("📊 Saving valid order with flavors to Google Sheet...");
      await axios.post(sheetScriptUrl, parsed.order_data).catch((err) => {
        console.error("Sheet save error:", err.message);
      });
    }

    console.log(`✅ Success for ${from}`);
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

      await sendText(from, "Assalam-o-Alaikum, bas check kar rahi thi 🙂 Order confirm karna hai ya koi help chahiye?", phoneId, waToken);
      followupSent.set(from, true);
    }
  } catch (e) {
    console.error("Follow-up error:", e.message);
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Complete Mandatory Flavor Sales Bot Live on Port ${PORT}`);
});
