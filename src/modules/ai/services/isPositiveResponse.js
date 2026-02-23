// export function isPositiveResponse(text = "") {
//   const msg = text.toLowerCase();
//   return [
//     "yes",
//     "yeah",
//     "yup",
//     "sure",
//     "ok",
//     "okay",
//     "please",
//     "i want",
//     "why not",


//     "YES",
//     "YEAH",
//     "YUP",
//     "SURE",
//     "OK",
//     "OKAY",
//     "PLEASE",
//     "I WANT",
//     "WHY NOT"

//   ].some(word => msg.includes(word));
// }

// export function isNegativeResponse(text = "") {
//   const msg = text.toLowerCase();
//   return ["no", "not now", "later", "don't", "dont", "NO",
//     "NOT NOW",
//     "LATER",
//     "DON'T",
//     "DONT"].some(word =>
//       msg.includes(word)
//     );
// }



export async function isPositiveResponseWithAI(userText, openai) {
  if (!userText || typeof userText !== "string") return false;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are an intent classifier.

Your task:
Determine whether the user's message is a POSITIVE or AFFIRMATIVE response.

A positive response includes:
- Yes, okay, sure, fine, go ahead
- Agreement or consent
- Willingness to proceed
- Polite confirmations (e.g. "please do", "sounds good")

NOT positive if:
- The user is asking a question
- The user is delaying
- The user is declining
- The message is neutral or informational

Return ONLY raw JSON.
Do NOT add explanations or markdown.

{
  "is_positive": true | false
}
        `
      },
      {
        role: "user",
        content: userText
      }
    ]
  });

  let content = response.choices[0].message.content;

  try {
    content = content.replace(/```json|```/g, "").trim();
    const result = JSON.parse(content);
    return Boolean(result.is_positive);
  } catch (err) {
    console.error("Positive response detection failed:", err);
    return false;
  }
}


export async function isNegativeResponseWithAI(userText, openai) {
  if (!userText || typeof userText !== "string") return false;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are an intent classifier.

Your task:
Determine whether the user's message is a NEGATIVE or DECLINING response.

A negative response includes:
- No, not now, later
- Declining help or assistance
- Saying they are not interested
- Asking to postpone or stop

NOT negative if:
- The user is agreeing
- The user is asking a follow-up question
- The user is providing details
- The message is neutral

Return ONLY raw JSON.
Do NOT add explanations or markdown.

{
  "is_negative": true | false
}
        `
      },
      {
        role: "user",
        content: userText
      }
    ]
  });

  let content = response.choices[0].message.content;

  try {
    content = content.replace(/```json|```/g, "").trim();
    const result = JSON.parse(content);
    return Boolean(result.is_negative);
  } catch (err) {
    console.error("Negative response detection failed:", err);
    return false;
  }
}

