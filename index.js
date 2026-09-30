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

// Aasane Foods AI Prompt (Strictly Left-to-Right Formatting)
const SYSTEM_PROMPT = `
Tu "Aasane Foods" ka owner/representative hai. Tu WhatsApp par customers se Urdu / Roman Urdu / English me baat karta hai.

LANGUAGE & FORMATTING RULES (VERY IMPORTANT):
- DO NOT use Urdu/Arabic script (like السلام علیکم). ONLY use Latin/English letters so text aligns Left-To-Right (LTR).
- Example Greeting: "Assalam-o-Alaikum! Aasane Foods me khushamdeed!"
- MULTILINGUAL: If the customer writes or speaks in ENGLISH, reply in natural ENGLISH. If the customer speaks/writes in Roman Urdu, reply in natural ROMAN URDU.

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
- If customer asks for discount (e.g. 150 per packet):
  * Reply: "Sir 20 packets jinhon ne liye hain unko bhi 180 price lagai hai. Already price bohot kam hai packet ki." (Strictly stick to Rs. 180).

ORDER CONFIRMATION FLOW:
1. Ask for Flavors.
2. Ask for Name, Contact Number, and Full Address (City/Area).
3. Calculate Total: (Packets * 180) + Delivery Charges.
4. Send Summary:
   [Customer Name]
   [Address]
   [Phone Number]
   
   Cod [Total Amount]
5. Delivery Time: "1 ya 2 working days" (Karachi) / "2-4 working days" (Other cities).

RECIPE / KAISE BANAYEIN:
- Doodh me powder mix karke ubaal dein.
- Thanda hone tak chammach chalate rahein.
- Air-tight container me freeze karein. Base ko 100% freeze karein (no liquid).
- Phir Electric Beater se 4-5 mins beat karein (3x volume). Re-freeze. Ready!
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

// Helper: Convert Text to Audio using OpenAI TTS
async function generateSpeechAudio(text, filename) {
  const speechFile = path.join("/tmp", `${filename}.mp3`);
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy", // Friendly natural voice
    input: text,
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

// 2. Incoming Messages (Text & Voice Notes)
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
    // Handle Voice Message (Audio)
    else if (msg.type === "audio" || msg.type === "voice") {
      isVoiceMsg = true;
      console.log(`🎙️ Voice Message received from ${from}`);
      const mediaId = msg.audio?.id || msg.voice?.id;
      
      // Step A: Download Audio
      const audioPath = await downloadWhatsAppMedia(mediaId, waToken);
      
      // Step B: Transcribe Voice to Text via OpenAI Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      });
      
      customerText = transcription.text;
      console.log(`📝 Transcribed Audio: "${customerText}"`);
      
      // Cleanup temp file
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    }

    if (!customerText) return;

    console.log(`📩 Processing (${from}): "${customerText}"`);

    // Step C: Generate AI Response from ChatGPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: customerText }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const aiReply = completion.choices[0].message.content;
    console.log(`🤖 AI Reply: "${aiReply}"`);

    // Step D: Send Text Reply
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

    // Step E: If Customer sent Voice Note, reply with a Voice Note too!
    if (isVoiceMsg) {
      console.log("🎙️ Generating Voice Note Reply...");
      const speechPath = await generateSpeechAudio(aiReply, `reply_${msg.id}`);
      const audioMediaId = await uploadMediaToWhatsApp(speechPath, phoneId, waToken);

      // Send Audio Message
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

      // Cleanup temp audio file
      if (fs.existsSync(speechPath)) fs.unlinkSync(speechPath);
      console.log("✅ Voice Note Sent!");
    }

  } catch (error) {
    console.error("❌ Error:", error.response ? JSON.stringify(error.response.data) : error.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Aasane Foods Voice & LTR Text Bot Live on Port ${PORT}`);
});
