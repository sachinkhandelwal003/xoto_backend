import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();



async function extractLeadWithAI(userText, openai) {
    console.log("userText came cameeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", userText)
    const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
            {
                role: "system",
                content: `
You are a background information extractor.

Extract any lead or contact details mentioned by the user.
The input may come from voice transcription.

Return ONLY raw JSON.
Do NOT add markdown, text, or explanations.

If a field is missing, return null.

{
  "name": string | null,
  "phone_number": string | null,
  "email": string | null,
  "property_type": string | null,
  "city": string | null,
  "description": string | null
}
        `
            },
            { role: "user", content: userText }
        ]
    });

    let content = response.choices[0].message.content;

    try {
        // remove ```json fences if any
        content = content.replace(/```json|```/g, "").trim();

        const data = JSON.parse(content);

        // normalize phone number
        if (data.phone_number) {
            data.phone_number = data.phone_number.replace(/\D/g, "");
        }

        console.log("Dataaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",data);

        return data;
    } catch (err) {
        console.error("Lead extraction failed:", err);
        return null;
    }
}

export default extractLeadWithAI