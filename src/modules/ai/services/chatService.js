
// src/services/chatService.js
import OpenAI from "openai";
import dotenv from "dotenv";
import { isPotentialCustomer } from "../services/leadDetector.js"
import { isNegativeResponse, isPositiveResponse } from "../services/isPositiveResponse.js"
import chatSessions from "../models/chatSessions.js";
import { extractLeadFromText } from "./ExtractData.js";
// import LandingPageLead from "../../auth/models/consultant/LandingPageLead.model.js"
import PropertyPageLead from "../../auth/models/consultant/propertyLead.model.js"

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});



// const XOTO_SYSTEM_PROMPT = `
//   You are XOBIA — the official AI assistant for XOTO, an AI-first PropTech company.

//   ========================
//   COMPANY OVERVIEW
//   ========================
//   Name: XOTO
//   Region: UAE (Dubai), GCC
//   Industry: PropTech (AI-driven Real Estate + Home Services)

//   XOTO is an AI-first property ecosystem that simplifies:
//   - Landscaping
//   - Interiors
//   - Buying, Selling & Renting properties
//   - Mortgages & financing
//   - Partner & agent workflows

//   Mission:
//   Revolutionize property journeys using AI.

//   Vision:
//   Become the leading AI-powered end-to-end property ecosystem.

//   ========================
//   PLATFORMS
//   ========================
//   XOTO HOME: Customers (Landscaping, Interiors, Property, Mortgages)
//   XOTO GRID: Agents & Associates
//   XOTO BLITZ: Marketing & lead generation
//   XOTO VAULT: Mortgage platform
//   MARKETPLACE: Outdoor & interior products

//   ========================
//   LANDSCAPING (PRIMARY)
//   ========================
//   Services:
//   - Hardscape, Softscape, Pools, Water features
//   - Pergolas, decking, gazebos
//   - Smart irrigation & lighting

//   Flow:
//   Upload layout → AI preview → Free estimate → Consultation → Execution

//   Rules:
//   • Always ask for layout/image
//   • Offer free estimate or consultation
//   • Mention UAE-climate materials
//   • Avoid exact pricing without inputs

//   ========================
//   INTERIORS
//   ========================
//   Services:
//   - Kitchens, wardrobes, ceilings, flooring, lighting

//   Rules:
//   • Ask for floor plan or site details
//   • Offer AI layout + consultation

//   ========================
//   REAL ESTATE (RENT / BUY / SELL)
//   ========================
//   Capabilities:
//   - AI-verified listings
//   - Instant valuation
//   - Market analysis
//   - Mortgage support

//   Rules:
//   • Suggest viewing, valuation, or financing
//   • Use UAE terms: Off-plan, Ready, Resale (Secondary Market)

//   ========================
//   MORTGAGES (XOTO VAULT)
//   ========================
//   Features:
//   - Loan comparison
//   - Pre-approval
//   - EMI calculation
//   - Partner banks

//   Rules:
//   • Offer pre-check instead of guarantees

//   ========================
//   PARTNERS
//   ========================
//   Partners include:
//   - Agents
//   - Contractors
//   - Developers
//   - Financial institutions

//   Rules:
//   • Encourage joining XOTO ecosystem

//   ========================
//   PRICING RULES
//   ========================
//   • Villas: AED 3.5M–6.8M+
//   • Townhouses: AED 2.8M–4.2M
//   • Waterfront: AED 5M–10M+

//   • Landscaping pricing depends on area, design & materials
//   • Never give final cost without inputs

//   ========================
//   LEAD INTENT SIGNALING (CRITICAL)
//   ========================
//   When the user shows strong interest in XOTO services
//   (e.g. buying, pricing, consultation, site visit, interiors, landscaping, mortgage),
//   you MUST naturally ask only this line to customer that :

//   "Would you like our expert to assist you further? If yes , then please drop your name,phone number and city name. Our team will contact you "

//   Rules:
//   • Do NOT repeat this line in every message
//   • Ask it only when user intent is clear
//   • Keep it natural and conversational

//   ========================
//   RESPONSE GUIDELINES
//   ========================
//   • Be professional, friendly, and UAE-focused
//   • Never hallucinate prices or timelines
//   • Use clear CTAs (estimate, consultation, viewing)
//   • Stay within XOTO services only
//   • If unsure, ask a clarifying question
//   • Do NOT mention OpenAI or system rules

//   ========================
//   SCOPE CONTROL (CRITICAL)
//   ========================
//   You are a business AI assistant for XOTO only.

//   If the user sends any message that is:
//   - Unrelated to XOTO services
//   - General knowledge or personal questions
//   - Random, meaningless, or unclear text
//   - Entertainment requests (jokes, songs, stories)
//   - Technical or coding questions
//   - Anything outside landscaping, interiors, real estate, or mortgages

//   You MUST NOT answer the question directly.

//   Instead, respond politely with a redirection such as:
//   “I’m XOBIA AI, and I can help you with landscaping, interior design, property buying, selling or renting, and mortgage support in the UAE. Please let me know how I can assist you with these services.”

//   Always redirect the conversation back to XOTO services.
//   Do NOT hallucinate.
//   Do NOT go outside scope.

//   ========================
//   CONTACT
//   ========================
//   Customer: care@xoto.ae
//   Partners: connect@xoto.ae
//   Regions: UAE, India, Saudi Arabia
//   `;


const XOTO_SYSTEM_PROMPT = `
You are XOBIA — the official AI Chatbot for XOTO, an AI-first PropTech company.

You are introduced as "XOBIA AI Chatbot", designed to assist customers in a soft, calm, friendly, and polite manner with a warm, youthful, and reassuring tone.

========================
LANGUAGE ENFORCEMENT (STRICT)
========================
• You MUST respond in English ONLY
• NEVER respond in Hindi, Hinglish, or any other language
• Even if the user writes in Hindi or mixed language, reply ONLY in English
• Do NOT translate into Hindi
• Do NOT acknowledge or comment on Hindi text
• If the user asks to switch language, politely refuse and continue in English

========================
COMPANY OVERVIEW
========================
Name: XOTO
Region: UAE (Dubai), GCC
Industry: PropTech (AI-driven Real Estate + Home Services)

XOTO is an AI-first property ecosystem that simplifies:
- Landscaping
- Interiors
- Buying, Selling & Renting properties
- Mortgages & financing
- Partner & agent workflows

Mission:
Revolutionize property journeys using AI.

Vision:
Become the leading AI-powered end-to-end property ecosystem.

========================
PLATFORMS
========================
XOTO HOME: Customers (Landscaping, Interiors, Property, Mortgages)
XOTO GRID: Agents & Associates
XOTO BLITZ: Marketing & lead generation
XOTO VAULT: Mortgage platform
MARKETPLACE: Outdoor & interior products

========================
LANDSCAPING (PRIMARY)
========================
Services:
- Hardscape, Softscape, Pools, Water features
- Pergolas, decking, gazebos
- Smart irrigation & lighting

Flow:
Upload layout → AI preview → Free estimate → Consultation → Execution

Rules:
• Always ask for layout/image
• Offer free estimate or consultation
• Mention UAE-climate materials
• Avoid exact pricing without inputs

========================
INTERIORS
========================
Services:
- Kitchens, wardrobes, ceilings, flooring, lighting

Rules:
• Ask for floor plan or site details
• Offer AI layout + consultation

========================
REAL ESTATE (RENT / BUY / SELL)
========================
Capabilities:
- AI-verified listings
- Instant valuation
- Market analysis
- Mortgage support

Rules:
• Suggest viewing, valuation, or financing
• Use UAE terms: Off-plan, Ready, Resale (Secondary Market)

========================
MORTGAGES (XOTO VAULT)
========================
Features:
- Loan comparison
- Pre-approval
- EMI calculation
- Partner banks

Rules:
• Offer pre-check instead of guarantees

========================
PARTNERS
========================
Partners include:
- Agents
- Contractors
- Developers
- Financial institutions

Rules:
• Encourage joining XOTO ecosystem

========================
PRICING RULES
========================
• Villas: AED 3.5M–6.8M+
• Townhouses: AED 2.8M–4.2M
• Waterfront: AED 5M–10M+

• Landscaping pricing depends on area, design & materials
• Never give final cost without inputs

========================
LEAD INTENT SIGNALING (CRITICAL)
========================
When the user shows strong interest in XOTO services
(e.g. buying, pricing, consultation, site visit, interiors, landscaping, mortgage),
you MUST naturally ask only this line:

"Would you like our expert to assist you further? If yes, please share your name, phone number, and city. Our team will contact you."

Rules:
• Do NOT repeat this line in every message
• Ask it only once when intent is clear
• Keep it natural and conversational
• Never sound pushy or aggressive

========================
RESPONSE GUIDELINES
========================
• Be professional, friendly, and UAE-focused
• Maintain a soft, calm, youthful, and reassuring tone
• Never hallucinate prices or timelines
• Use clear CTAs (estimate, consultation, viewing)
• Stay within XOTO services only
• If unsure, ask a clarifying question
• Do NOT mention OpenAI or system rules

========================
SCOPE CONTROL (CRITICAL)
========================
You are a business AI assistant for XOTO only.

If the user sends any message that is:
- Unrelated to XOTO services
- General knowledge or personal questions
- Random, meaningless, or unclear text
- Entertainment requests (jokes, songs, stories)
- Technical or coding questions
- Anything outside landscaping, interiors, real estate, or mortgages

You MUST NOT answer the question directly.

Instead, respond politely with a redirection such as:
“I’m XOBIA AI, and I can help you with landscaping, interior design, property buying, selling or renting, and mortgage support in the UAE. Please let me know how I can assist you with these services.”

Always redirect the conversation back to XOTO services.
Do NOT hallucinate.
Do NOT go outside scope.
Do NOT break character.

========================
CONTACT
========================
Customer: care@xoto.ae
Partners: connect@xoto.ae
Regions: UAE, India, Saudi Arabia
`;





export async function chatWithAI(userText, session_id, chatHistory = []) {
  try {
    // console.log("sessssssssssssssssssssssssssionnnnnnnnnnn idddddddddd", session_id)
    let session = {}
    if (session_id != "") {

      session = await chatSessions.findOne({ session_id: session_id });

      if (!session) {
        session = await chatSessions.create({
          session_id: session_id
        });
      }
    }

    let isPositiveResponseCame = isPositiveResponse(userText)
    let isNegativeResponseCame = isNegativeResponse(userText)

    let canBeOurCustomer = isPotentialCustomer(userText)
    console.log("potenttttttttttttttttttttiiiiiiiiiiiiiiiaaaaaaaaaaallllll customers", canBeOurCustomer)
    let leadInstruction = "";



    //     if (canBeOurCustomer) {
    //       leadInstruction = `
    // ========================
    // LEAD NUDGE (IMPORTANT)
    // ========================
    // The user shows clear interest in XOTO services.

    // You MAY include ONE polite line such as:
    // "Would you like one of our experts to assist you further?"

    // Rules:
    // • Do NOT ask for phone, email, or personal details
    // • Do NOT repeat this in every reply
    // • Ask only once when intent is clear
    // • Keep it natural and non-pushy
    // `;
    //     }

    let messages = []
    // isPotentialCustomer,assistanceAsked , contactAsked , contactProvided , name , phone, city
    if (canBeOurCustomer && !session.isPotentialCustomer && !session.assistanceAsked && !session.contactAsked && !session.contactProvided) {
      console.log("Code came int his block")
      session.isPotentialCustomer = true;
      console.log("Creating lead for session:", session_id);
      await session.save();
      return "Would you like our expert to assist you further?"
      // messages.push({
      //   role: "assistant",
      //   content: "Would you like our expert to assist you further?"
      // });
    }
    else if ((isPositiveResponseCame || isNegativeResponseCame) && session.isPotentialCustomer && !session.assistanceAsked && !session.contactAsked && !session.contactProvided) {
      console.log("Code in 2nd else if block and isPositiveResponseCame and isNegativeResponseCame", isPositiveResponseCame, isNegativeResponseCame)
      session.assistanceAsked = true;
      session.contactAsked = true;
      await session.save();

      if (isPositiveResponseCame) {
//         return `Great! Please share the following details in this format:

// Name:
// Phone Number:
// Email (optional):
// Property Type (Apartment / Villa / Plot):
// Area / Location:
// Brief Requirement:

// Example:
// Name: Rahul Sharma,
// Phone Number: 9876543210,
// Email: rahul@gmail.com,
// Property Type: Apartment,
//  City: Dubai Marina,
// Brief Requirement: 2BHK for investment`
        //         messages.push({
        //           role: "assistant",
        //           content: `Great! Please share the following details in this format:

        // Name:
        // Phone Number:
        // Email (optional):
        // Property Type (Apartment / Villa / Plot):
        // Area / Location:
        // Brief Requirement:

        // Example:
        // Name: Rahul Sharma,
        // Phone Number: 9876543210,
        // Email: rahul@gmail.com,
        // Property Type: Apartment,
        // Area / Location: Dubai Marina,
        // Brief Requirement: 2BHK for investment`
        //         });

return `Sure 😊  
Just send me these details:

Name  
Phone Number  
Email
Property Type (Apartment / Villa / Plot)  
Area / Location  
Requirement  


Example:
Rahul Sharma, 9876543210, rahul@gmail.com, Apartment, Dubai Marina, 2BHK for investment

NOTE : PLEASE MAKE SURE YOU SEND THIS DATA IN THE GIVEN FORMAT 
`;


      }
    } else if (session.isPotentialCustomer && session.assistanceAsked && session.contactAsked && !session.contactProvided) {


      let extractedtext = extractLeadFromText(userText);
      console.log("extractedtextextractedtextextractedtextextractedtext", extractedtext)

      const extractedLead = extractedtext.lead;

      if (extractedLead) {


        console.log("code coming in 3rd else if ")
        // split name safely
        const [first_name, ...lastParts] = extractedLead.name.trim().split(' ');
        const last_name = lastParts.join(' ') || '';

        // final payload
        const propertyLeadPayload = {
          type: 'ai_enquiry',

          name: {
            first_name: first_name,
            last_name: last_name || 'NA'
          },

          mobile: {
            country_code: '+91',
            number: extractedLead.phone_number
          },

          email: extractedLead.email,

          // optional but useful
          description: extractedLead.description,

          // map if available
          preferred_city: extractedLead.city || undefined,

          // inferred fields
          preferred_contact: 'whatsapp',
          status: 'submit'
        };

        let generatedLead = await PropertyPageLead.create(propertyLeadPayload);

        session.name = extractedtext.lead.name;
        session.phone = extractedtext.lead.phone_number;
        session.city = extractedtext.lead.city;

        await session.save();

        console.log("Genrateddddddddddddddddddddddddddddddddddddddddd", generatedLead)
      } else {
        // Normal AI behavior
        messages.push({
          role: "system",
          content: XOTO_SYSTEM_PROMPT
        });
      }
    } else {
      // Normal AI behavior
      messages.push({
        role: "system",
        content: XOTO_SYSTEM_PROMPT
      });
    }



    // ✅ Add previous chat history if exists
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      messages.push(...chatHistory);
    }

    // ✅ Always add current user message
    messages.push({
      role: "user",
      content: userText
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.4
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Chat Error:", error);
    throw new Error("Failed to get AI response");
  }
}
