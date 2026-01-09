// export function isPotentialCustomer(userText = "") {
//     if (!userText || typeof userText !== "string") return false;

//     const text = userText.toLowerCase();


//     const negativeSignals = [
//         "just asking",
//         "curious",
//         "job",
//         "career",
//         "intern",
//         "complaint",
//         "support",
//         "problem",
//         "bug",
//         "error",
//         "how does xoto work",
//         "what is xoto"
//     ];

//     if (negativeSignals.some(word => text.includes(word))) {
//         return false;
//     }

//     const strongSignals = [
//         "landscaping",
//         "garden",
//         "villa landscaping",
//         "interior",
//         "interiors",
//         "kitchen",
//         "wardrobe",
//         "renovation",
//         "design",

//         // money intent
//         "price",
//         "cost",
//         "budget",
//         "estimate",
//         "quotation",
//         "quote",

//         // action intent
//         "consultation",
//         "site visit",
//         "call",
//         "contact",
//         "expert",
//         "help me",

//         // real estate
//         "buy",
//         "purchase",
//         "rent",
//         "sell",
//         "property",
//         "villa",
//         "townhouse",
//         "apartment",
//         "off plan",
//         "ready property",

//         // mortgage
//         "mortgage",
//         "loan",
//         "emi",
//         "finance",
//         "home loan",
//         "pre approval",

//         // UPPERCASE versions
//         "LANDSCAPING",
//         "GARDEN",
//         "VILLA LANDSCAPING",
//         "INTERIOR",
//         "INTERIORS",
//         "KITCHEN",
//         "WARDROBE",
//         "RENOVATION",
//         "DESIGN",

//         "PRICE",
//         "COST",
//         "BUDGET",
//         "ESTIMATE",
//         "QUOTATION",
//         "QUOTE",

//         "CONSULTATION",
//         "SITE VISIT",
//         "CALL",
//         "CONTACT",
//         "EXPERT",
//         "HELP ME",

//         "BUY",
//         "PURCHASE",
//         "RENT",
//         "SELL",
//         "PROPERTY",
//         "VILLA",
//         "TOWNHOUSE",
//         "APARTMENT",
//         "OFF PLAN",
//         "READY PROPERTY",

//         "MORTGAGE",
//         "LOAN",
//         "EMI",
//         "FINANCE",
//         "HOME LOAN",
//         "PRE APPROVAL"
//     ];


//     return strongSignals.some(word => text.includes(word));
// }


async function isPotentialCustomerWithAI(userText, openai) {
  if (!userText || typeof userText !== "string") return false;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are an intent classifier for a real estate and home services company.

Your task:
Determine whether the user sounds like a POTENTIAL CUSTOMER right now.

A potential customer is someone who:
- Shows intent for landscaping, interiors, real estate, or mortgages
- Mentions buying, renting, selling, renovating, pricing, consultation, site visit, or financing
- Asks for help, estimates, quotes, or next steps

NOT a potential customer if:
- Just greeting (hi, hello, bye, thanks)
- Just asking general questions
- Job, career, internship
- Complaints or support issues
- Pure curiosity with no action intent

Return ONLY raw JSON.
Do NOT add explanations or markdown.

{
  "is_potential_customer": true | false
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
    return Boolean(result.is_potential_customer);
  } catch (err) {
    console.error("Potential customer detection failed:", err);
    return false;
  }
}

export default isPotentialCustomerWithAI;
