import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import OpenAI from "openai";
import crypto from "crypto";
import dotenv from "dotenv";

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🔥 absolute path to responses folder
const responsesDir = path.join(__dirname, "..", "..", "responses");

// Ensure responses directory exists
if (!fs.existsSync(responsesDir)) {
  fs.mkdirSync(responsesDir, { recursive: true });
}

export async function textToSpeech(text) {
  try {
    const fileName = `response-${crypto.randomUUID()}.mp3`;

    // ✅ ABSOLUTE FILE PATH (THIS FIXES ENOENT)
    const filePath = path.join(responsesDir, fileName);

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // 🔥 RETURN FILE PATH, NOT URL
    return filePath;

  } catch (error) {
    console.error("TTS Error:", error);
    throw new Error("Failed to generate speech");
  }
}