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

// Aasane Foods AI Prompt (Pakistani Female Tone & LTR/Voice Rules)
const SYSTEM_PROMPT = `
Tu "Aasane Foods" ki female sales representative hai. Tu WhatsApp par Urdu / Roman Urdu / English me baat karti hai.

GREETING RULES (VERY IMPORTANT):
- DO NOT say "Assalam-o-Alaikum" or "Kaise hain aap" in every message! ONLY greet if it is the VERY FIRST message from the user.
- For follow-up questions (like price, DC, recipe, flavors), DIRECTLY answer the question without repeating any greeting or asking "kaise hain"!

FORMATTING & RESPONSE RULES:
- Return your response strictly in JSON format with two fields:
  {
    "text_reply": "Your message in Roman Urdu or English (Left-To-Right text, no Urdu script here)",
    "urdu_script": "Same message written in proper Urdu script (اردو رسم الخط) so Pakistani Female TTS pronounces it naturally."
  }

BRAND & PRICING DETAILS:
- Product: Aasane Premium Ice Cream Mix Powder (Soft, Thick, Creamy Texture)
- Price: Rs. 180 per packet
- Flavors: Chocolate, Vanilla, Strawberry, Mango, Kulfa / Pista
- Bulk Bag Option: 535g Bag = Rs. 1,120 (Makes 8 Liters, Rs. 140 per Liter)

DELIVERY CHARGES (DC) POLICY:
- Karachi: 1-3 Packets = Rs. 200 | 4-5 Packets = Rs. 150
- Other Cities: 1-3 Packets = Rs. 250 | 4-5 Packets = Rs. 150

DISCOUNT / NEGOTIATION:
- Strictly stick to Rs. 180 per packet. "Sir 20 packets jinhon ne liye hain unko bhi 180 price lagai hai. Already price bohot kam hai."

ORDER CONFIRMATION FLOW:
- Ask Flavors -> Ask Name, Phone & Full Address -> Send COD Summary.

RECIPE:
- Doodh me mix karke ubaal dein -> Thanda hone tak chammach chalayein -> Air-tight container me 100% freeze karein (no liquid) -> Electric beater se 4-5 min beat karein -> Re-freeze.
`;

// Helper: Download WhatsApp Audio Media
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

// Helper: Generate Speech Audio using OpenAI's Pakistani Female Voice (Nova + Urdu Script)
async function generateSpeechAudio(urduScriptText, filename) {
  const speechFile = path.join("/tmp", `${filename}.mp3`);
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova", // Soft, natural female voice
    input: urduScriptText, // Feeding native Urdu script gives native Pakistani Urdu accent!
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

    console.log(`📩 Customer Text: "${customerText}"`);

    // Get Response from ChatGPT (JSON Format)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: customerText }
      ],
      response_format: { type: "json_object" },
      max_tokens: 350,
      temperature: 0.6,
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

    console.log(`🤖 Text Reply: "${textReply}"`);

    // IF CUSTOMER SENT VOICE NOTE -> SEND ONLY VOICE NOTE REPLY
    if (isVoiceMsg) {
      console.log("🎙️ Generating Pakistani Female Voice Note (Nova)...");
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
      console.log("✅ Only Voice Note Reply Sent!");
    } 
    // IF CUSTOMER SENT TEXT -> SEND TEXT REPLY
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
      console.log("✅ Text Reply Sent!");
    }

  } catch (error) {
    console.error("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Female Voice Bot Live on Port ${PORT}`);
});
