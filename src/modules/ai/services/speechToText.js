// src/services/speechToText.js
import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv"
import { convertWebmToWav } from "./audioConverter.js";

dotenv.config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY 
});

export async function speechToText(audioPath) {
  try {
    const wavPath = await convertWebmToWav(audioPath);
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: "gpt-4o-transcribe"
    });

    return transcription.text;
  } catch (error) {
    console.error("STT Error:", error);
    throw new Error("Failed to transcribe audio");
  }
}
