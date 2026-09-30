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

// Memory maps for follow-up system
const lastMsgAt = new Map();
const followupSent = new Map();

// Aasane Foods AI System Prompt
const SYSTEM_PROMPT = `
Tu "Aasane Foods" ki sales representative hai. Tu WhatsApp par Roman Urdu / English me baat karti hai.

CRITICAL RULES:
1. GREETING RULE: "Assalam-o-Alaikum" or greetings ONLY in the VERY FIRST message from the customer. NEVER repeat greetings or ask "kaise hain" in follow-up messages!
2. SHORT & DIRECT REPLIES: Keep replies short (max 2-3 lines). Answer ONLY what is asked. Do not dump unnecessary information.
3. NO BULK MENTIONS: DO NOT mention bulk bags, wholesale rates, or 535g bags UNLESS the customer specifically uses words like "bulk", "wholesale", "supplier", "bag", or "large quantity". Default product is Rs. 180 per packet.
4. ORDER VALIDATION:
   - Require: 1) Name, 2) Contact Number, 3) Complete Address WITH City Name.
   - If ANY of these details (or City name) is missing, DO NOT confirm the order. Instead reply EXACTLY:
     "Bhai ye details incomplete hain. Kindly dobara bhej dein:
     1) Name
     2) Contact Number
     3) Complete Address (City ke sath)"
   - If complete, calculate bill: Total = (Packets * 180) + DC, then give short COD summary.

PRICING & DELIVERY CHARGES:
- Price: Rs. 180 per packet (Flavors: Chocolate, Vanilla, Strawberry, Mango, Kulfa)
- Delivery Charges (DC):
  * Karachi: 1-3 Packets = Rs. 200 | 4-5 Packets = Rs. 150
  * Other Cities: 1-3 Packets = Rs. 250 | 4-5 Packets = Rs. 150
- Fixed Price: Strictly Rs. 180/packet. If discount asked: "Sir 20 packets jinhon ne liye hain unko bhi 180 price lagai hai. Already price bohot kam hai."

RESPONSE FORMAT:
Return strictly a JSON object with two fields:
{
  "text_reply": "Short response in Roman Urdu/English for LTR text display",
  "urdu_script": "Same response written in proper native Urdu script (اردو رسم الخط) for natural female TTS pronunciation"
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

// Helper: Generate Natural Pakistani Urdu Female Audio via OpenAI TTS
async function generateSpeechAudio(urduScriptText, filename) {
  const speechFile = path.join("/tmp", `${filename}.mp3`);
  const mp3 = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: "shimmer",
    input: urduScriptText,
    speed: 0.95,
  });
  const buffer = Buffer.from(await mp3.arrayBuffer());
  fs.writeFileSync(speechFile, buffer);
  return speechFile;
}

// Helper: Upload Audio to WhatsApp Media
async function uploadMediaToWhatsApp(filePath, phoneId, token) {
  const formData = new FormData();
  const fileBlob = new Blob([fs.readFileSync(filePath)], { type: 'audio/mpeg' });
  formData.append('file', fileBlob, 'response.mp3');
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', 'audio/mpeg');

  const uploadRes = await axios.post(`https://graph.facebook.com/v26.0/${phoneId}/media`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data'
    }
  });
  return uploadRes.data.id;
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

    // Track last message timestamp for 24h follow-up
    lastMsgAt.set(from, Date.now());
    followupSent.set(from, false);

    let customerText = "";
    let isVoiceMsg = false;

    // Handle Text Message
    if (msg.type === "text") {
      customerText = msg.text?.body;
    } 
    // Handle Voice Note
    else if (msg.type === "audio" || msg.type === "voice") {
      isVoiceMsg = true;
      console.log(`🎙️ Voice Message from ${from}`);
      const mediaId = msg.audio?.id || msg.voice?.id;
      
      const audioPath = await downloadWhatsAppMedia(mediaId, waToken);
      
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      });
      
      customerText = transcription.text;
      console.log(`📝 Transcribed Audio: "${customerText}"`);
      
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }

    if (!customerText) return;

    console.log(`📩 Customer (${from}): "${customerText}"`);

    // Get Response from ChatGPT (JSON Format)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: customerText }
      ],
      response_format: { type: "json_object" },
      max_tokens: 200,
      temperature: 0.5,
    });

    const aiReplyRaw = completion.choices[0].message.content;
    let textReply = "";
    let urduScriptReply = "";

    try {
      const parsed = JSON.parse(aiReplyRaw);
      textReply = parsed.text_reply || aiReplyRaw;
      urduScriptReply = parsed.urdu_script || textReply;
    } catch(e) {
      textReply = aiReplyRaw;
      urduScriptReply = aiReplyRaw;
    }

    console.log(`🤖 AI Text Reply: "${textReply}"`);

    // IF CUSTOMER SENT VOICE NOTE -> REPLY ONLY WITH VOICE NOTE
    if (isVoiceMsg) {
      console.log("🎙️ Generating Female Voice Note...");
      const speechPath = await generateSpeechAudio(urduScriptReply, `reply_${msg.id}`);
      const audioMediaId = await uploadMediaToWhatsApp(speechPath, phoneId, waToken);

      await axios.post(
        `https://graph.facebook.com/v26.0/${phoneId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: from,
          type: "audio",
          audio: { id: audioMediaId }
        },
        { headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" } }
      );

      if (fs.existsSync(speechPath)) fs.unlinkSync(speechPath);
      console.log("✅ Sent Audio-Only Reply!");
    } 
    // IF CUSTOMER SENT TEXT -> REPLY ONLY WITH TEXT
    else {
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
      console.log("✅ Sent Text-Only Reply!");
    }

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
  console.log(`🚀 Aasane Foods Custom Bot Live on Port ${PORT}`);
});
