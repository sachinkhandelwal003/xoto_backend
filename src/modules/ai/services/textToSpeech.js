// src/services/textToSpeech.js
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv"

dotenv.config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔥 absolute path to responses folder
const responsesDir = path.join(__dirname, "..", "..", "responses");

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
