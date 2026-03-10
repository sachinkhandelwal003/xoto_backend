import path from "path";
import OpenAI from "openai";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";  // 👈 MISSING IMPORT ADDED
import { fileURLToPath } from 'url';  // 👈 ADD THIS

dotenv.config();

// 👇 ADD THESE LINES TO CREATE __dirname IN ES MODULES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Absolute path to responses folder
const responsesDir = path.join(__dirname, "..", "..", "responses");

export async function textToSpeech(text) {
  try {
    const fileName = `response-${crypto.randomUUID()}.mp3`;

    // Absolute file path
    const filePath = path.join(responsesDir, fileName);

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Return file path, not URL
    return filePath;

  } catch (error) {
    console.error("TTS Error:", error);
    throw new Error("Failed to generate speech");
  }
}