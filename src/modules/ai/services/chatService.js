// src/services/chatService.js
import OpenAI from "openai";
import dotenv from "dotenv"

dotenv.config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function chatWithAI(userText) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful, friendly AI assistant."
        },
        {
          role: "user",
          content: userText
        }
      ]
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Chat Error:", error);
    throw new Error("Failed to get AI response");
  }
}
