import fs from "fs";
import path from "path";
import OpenAI from "openai";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const responsesDir = path.join(__dirname, "..", "..", "responses");

// Ensure responses directory exists
if (!fs.existsSync(responsesDir)) fs.mkdirSync(responsesDir, { recursive: true });

/**
 * Convert text to speech using OpenAI gpt-4o-mini-tts.
 * Produces natural, expressive audio similar to ElevenLabs quality.
 * @param {string} text
 * @param {string} voice  - nova | alloy | echo | fable | onyx | shimmer
 * @returns {string} absolute file path of saved MP3
 */
export async function textToSpeech(text, voice = "nova") {
  try {
    const fileName = `response-${crypto.randomUUID()}.mp3`;
    const filePath = path.join(responsesDir, fileName);

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text.replace(/XOBIA/gi, "Jobia").replace(/Xobia/gi, "Jobia"),
      instructions:
        "Speak warmly and naturally, like a knowledgeable professional assistant. " +
        "Use a confident, friendly tone with clear pronunciation. " +
        "Be expressive and vary your intonation naturally — avoid sounding robotic.",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return filePath;
  } catch (error) {
    console.error("TTS Error:", error);
    throw new Error("Failed to generate speech");
  }
}
