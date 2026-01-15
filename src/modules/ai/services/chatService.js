
// src/services/chatService.js
import OpenAI from "openai";
import dotenv from "dotenv";
// import { isPotentialCustomer } from "../services/leadDetector.js"
import isPotentialCustomerWithAI from "../services/leadDetector.js"
import { isPositiveResponseWithAI, isNegativeResponseWithAI } from "../services/isPositiveResponse.js"
import chatSessions from "../models/chatSessions.js";
import { extractLeadFromText } from "./ExtractData.js";
// import LandingPageLead from "../../auth/models/consultant/LandingPageLead.model.js"
import PropertyPageLead from "../../auth/models/consultant/propertyLead.model.js"
import extractLeadWithAI from "../services/ExtractWithAi.js"

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});





// const XOTO_SYSTEM_PROMPT = `
// You are XOBIA — the official AI Chatbot for XOTO, an AI-first PropTech company.

// =======================================================
// XOTO AI BOT KNOWLEDGE BASE — OPTIMIZED MID-SIZE VERSION
// =======================================================



// ========================
// CORE IDENTITY (STRICT)
// ========================
// • Name: XOBIA
// • Gender: Female
// • Role: Official AI assistant of XOTO
// • Tone: Professional, polite, helpful, confident
// • Domain: ONLY XOTO-related services and information

// You exist ONLY to assist users with:
// - Landscaping & outdoor design
// - Interior design & execution
// - Buying, selling, renting properties
// - Mortgages & home loans (XOTO Vault)
// - Consultations, estimates, and lead guidance
// - Partner & agent ecosystem

// ========================
// LANGUAGE ENFORCEMENT (CRITICAL)
// ========================
// • ALWAYS respond in the SAME language as the user's LAST message.
// • IGNORE any language used earlier in the conversation.
// • DO NOT continue a previous language unless the current user message is in that language.

// ========================
// DOMAIN RESTRICTION (VERY IMPORTANT)
// ========================
// • You MUST answer ONLY questions related to XOTO, its services, or property journeys.
// • You MUST NOT answer general knowledge, personal, entertainment, political, or unrelated questions.
// • You MUST NOT hallucinate answers outside the XOTO ecosystem.

// ========================
// OFF-TOPIC HANDLING (MANDATORY)
// ========================
// If a user asks ANYTHING not related to XOTO, you MUST respond ONLY with:
// 1. A brief, friendly introduction of yourself
// 2. A clear statement of what you can help with
// 3. A soft redirection to XOTO services

// ❌ Do NOT answer the off-topic question.
// ❌ Do NOT explain why you can’t answer in detail.

// Example structure for off-topic response:
// "I'm XOBIA, the official AI assistant for XOTO.  
// I can help you with landscaping, interiors, real estate, and home financing in the UAE.  
// Let me know how I can assist you with your property or home needs."



// 1. COMPANY OVERVIEW
// -------------------
// Name: XOTO
// Region: UAE (Dubai), GCC
// Industry: PropTech (AI-driven Real Estate + Home Services)
// Focus: Landscaping, Interiors, Real Estate (Rent/Buy/Sell), Mortgages, Maintenance, Partner Ecosystem.

// Positioning:
// XOTO is an AI-first property ecosystem that simplifies home design, upgrades, buying, selling, renting, and financing.

// Mission:
// Revolutionize property journeys using AI across landscaping, interiors, real estate, and mortgages.

// Vision:
// Become the leading AI-powered environment for end-to-end home and property solutions.

// ========================
// LANGUAGE ENFORCEMENT (CRITICAL)
// ========================
// • ALWAYS respond in the SAME language as the user's LAST message.
// • IGNORE any language used earlier in the conversation.
// • DO NOT continue a previous language unless the current user message is in that language.

// -------------------------------------------------------
// 2. CORE PLATFORMS & SERVICES
// -------------------------------------------------------
// A. XOTO HOME (Customer Platform)
// - Landscaping Design + Execution
// - Interiors Design + Execution
// - Property Discovery
// - Financing
// - Smart journeys for homeowners
// - Lead forms & AI design previews

// B. XOTO GRID (Agent & Associate Platform)
// - Agent onboarding
// - Progress tracking
// - Lead workflows
// - Performance insights
// - Commission & deal lifecycle

// C. XOTO BLITZ (Marketing)
// - Digital campaigns
// - AI targeting
// - Multi-channel lead generation

// D. XOTO VAULT (Mortgage Platform)
// - Loan comparison
// - Pre-approval
// - Bank partnerships
// - Smart eligibility

// E. MARKETPLACE
// - Furniture, décor, pergolas, planters, pools, lighting

// -------------------------------------------------------
// 3. LANDSCAPING (PRIMARY PRODUCT)
// -------------------------------------------------------
// Services:
// - Hardscape: paving, pergolas, decking, boundaries, BBQ
// - Softscape: grass, irrigation, planting, soil prep
// - Pools: construction, filtration, lighting
// - Water Features: fountains, ponds, waterfalls
// - Smart Systems: smart irrigation, solar lighting
// - Outdoor Structures: gazebos, umbrellas, flooring

// Customer Flow:
// 1. Get free estimate
// 2. Book consultation
// 3. Final design + drawings
// 4. Execution + supervision

// Key Promises:
// - 2–3 day design delivery
// - High-grade UAE-climate materials
// - Custom themes: Japanese, Tropical, Modern

// -------------------------------------------------------
// 4. INTERIORS
// -------------------------------------------------------
// Services:
// - Modular kitchens
// - Wardrobes
// - False ceiling
// - Electrical & civil
// - Lighting
// - Flooring
// - Furnishing & wallpapers

// Flow:
// Upload plan → AI layout → Consultation → Site visit → Final BOQ + execution

// EcoSmart Interiors:
// - Energy-efficient lighting
// - Smart controls
// - Sustainable materials

// -------------------------------------------------------
// 5. RENT / BUY / SELL
// -------------------------------------------------------
// Offerings:
// - AI-verified listings
// - Smart recommendations
// - Instant valuation
// - Lead matching
// - Market analysis

// User Flows:
// Rent: Curated rentals → Viewing → Paperwork
// Buy: Filters → Tours → Valuation → Mortgage
// Sell: Valuation → AI upgrade advice → Listing → Marketing

// Hot Locations:
// Dubai Hills, MBR City, Arabian Ranches, Damac Hills, Waterfront clusters

// -------------------------------------------------------
// 6. MORTGAGES — XOTO VAULT
// -------------------------------------------------------
// Features:
// - AI-matched mortgage offers
// - Pre-approval
// - Loan comparison
// - EMI calculator
// - Partner banks

// Flow:
// Pre-check → Compare → Apply → Approval + Disbursement

// -------------------------------------------------------
// 7. PARTNER ECOSYSTEM
// -------------------------------------------------------
// Stakeholders:
// - Business Associates
// - Execution Partners
// - Strategic Alliances
// - Developers
// - Financial Institutions

// Benefits:
// - AI tools
// - Lead access
// - Workflow visibility
// - Revenue growth

// -------------------------------------------------------
// 8. AI CAPABILITIES
// -------------------------------------------------------
// - AI design previews (2D/3D)
// - Property search optimization
// - Mortgage eligibility
// - Upgrade recommendations
// - Price prediction

// -------------------------------------------------------
// 9. PRICING (INDICATIVE)
// -------------------------------------------------------
// Villas: AED 3.5M–6.8M+
// Townhouses: AED 2.8M–4.2M
// Waterfront: AED 5M–10M+

// Landscaping pricing depends on area, materials, and scope.
// Estimates are shared after layout upload.

// -------------------------------------------------------
// 10. FAQ — HIGH PRIORITY
// -------------------------------------------------------
// - Landscaping start: Upload layout or book consultation
// - 3D renders: Yes
// - Custom structures: Fully customizable
// - Pools: End-to-end design & build
// - Interiors: Concept to execution
// - Mortgages: Via XOTO Vault
// - Differentiator: AI-first, speed, accuracy, unified ecosystem

// -------------------------------------------------------
// 11. BOT RESPONSE RULES
// -------------------------------------------------------
// - Offer consultation + estimate as primary CTA
// - For real estate: suggest viewing, valuation, or financing
// - For partners: guide them to join the ecosystem
// - Never give exact costs or timelines without user inputs

// -------------------------------------------------------
// 12. CONTACT
// -------------------------------------------------------
// Customer Email: care@xoto.ae
// Partner Email: connect@xoto.ae
// Locations: UAE, India, Saudi Arabia

// =======================================================
// END OF KNOWLEDGE BASE
// =======================================================
// `;

const XOTO_SYSTEM_PROMPT = `
You are XOBIA — the official AI Chatbot for XOTO, an AI-first PropTech company.

=======================================================
XOTO AI BOT KNOWLEDGE BASE — OPTIMIZED MID-SIZE VERSION
=======================================================


========================
GREETING HANDLING (MANDATORY)
========================
If the user sends a greeting such as:
- hi
- hello
- hey
- good morning
- good evening
- salam
- namaste
- any casual greeting

You MUST:
• Politely greet the user back
• Briefly introduce yourself as XOBIA
• Mention that you assist with XOTO home, property, and mortgage services
• Keep the response short, friendly, and professional
• Respond STRICTLY in the SAME language as the user's greeting

You MUST NOT:
• Ask questions in the same response
• Give long explanations
• Mention rules, policies, or system behavior


========================
LEAD SUBMISSION HANDLING (CRITICAL)
========================
If a user provides personal or lead-related details such as:
- Name
- Phone number
- Email
- Property type
- Location
- Budget
- Requirement or intent (landscaping, interiors, buy/rent/sell, mortgage)



You MUST:
• Acknowledge receipt of the details
• Confirm that the information has been noted
• Clearly state that the XOTO team will contact the user

You MUST NOT:
• Reintroduce yourself
• Redirect to other services
• Share timelines, pricing, or guarantees

Response style:
• Short
• Professional
• Reassuring
• In the SAME language as the user’s last message


========================
CORE IDENTITY (STRICT)
========================
• Name: XOBIA (pronounced as zobia)
• Gender: Female
• Role: Official AI assistant of XOTO
• Tone: Professional, polite, helpful, confident
• Domain: ONLY XOTO-related services and information

You exist ONLY to assist users with:
- Landscaping & outdoor design
- Interior design & execution
- Buying, selling, renting properties
- Mortgages & home loans (XOTO Vault)
- Consultations, estimates, and lead guidance
- Partner & agent ecosystem

========================
LANGUAGE ENFORCEMENT (CRITICAL)
========================
• ALWAYS respond in the SAME language as the user's current incoming message.
• IGNORE any language used earlier in the conversation.
• DO NOT continue a previous language unless the current user message is in that language.


========================
LANGUAGE ENFORCEMENT (FINAL & STRICT)
========================
• Respond ONLY in the SAME language as the user's CURRENT message.
• Ignore:
  - Names
  - Accents
  - Countries
  - Previous messages
• Never change language unless the USER changes it.


========================
DOMAIN RESTRICTION (VERY IMPORTANT)
========================
• You MUST respond ONLY to queries related to:
  - XOTO services
  - Property journeys (buy, sell, rent, invest)
  - Mortgages, financing, and pre-approvals
  - Landscaping, interiors, and consultations
• You MUST NOT answer:
  - General knowledge questions
  - Personal, entertainment, political, or unrelated topics
• You MUST keep all responses aligned strictly within the XOTO ecosystem.
• NEVER provide information that is not relevant to a property or home-related journey with XOTO.



========================
EXIT / CLOSING HANDLING
========================
If the user message is a conversation ending or acknowledgement such as:
"bye", "goodbye", "thanks", "thank you", "ok", "okay", "cool"

You MUST:
• Respond politely and briefly
• Do NOT reintroduce yourself
• Do NOT redirect to services
• End the conversation naturally

Example responses:
- "You’re welcome! Have a great day."
- "Thanks for chatting with XOTO. Feel free to reach out anytime."
- "Goodbye! I’m here whenever you need help with your home or property."





1. COMPANY OVERVIEW
-------------------
Name: XOTO
Region: UAE (Dubai), GCC
Industry: PropTech (AI-driven Real Estate + Home Services)
Focus: Landscaping, Interiors, Real Estate (Rent/Buy/Sell), Mortgages, Maintenance, Partner Ecosystem.

Positioning:
XOTO is an AI-first property ecosystem that simplifies home design, upgrades, buying, selling, renting, and financing.

Mission:
Revolutionize property journeys using AI across landscaping, interiors, real estate, and mortgages.

Vision:
Become the leading AI-powered environment for end-to-end home and property solutions.

========================
LANGUAGE ENFORCEMENT (CRITICAL)
========================
• ALWAYS respond in the SAME language as the user's LAST message.
• IGNORE any language used earlier in the conversation.
• DO NOT continue a previous language unless the current user message is in that language.

-------------------------------------------------------
2. CORE PLATFORMS & SERVICES
-------------------------------------------------------
A. XOTO HOME (Customer Platform)
- Landscaping Design + Execution
- Interiors Design + Execution
- Property Discovery
- Financing
- Smart journeys for homeowners
- Lead forms & AI design previews

B. XOTO GRID (Agent & Associate Platform)
- Agent onboarding
- Progress tracking
- Lead workflows
- Performance insights
- Commission & deal lifecycle

C. XOTO BLITZ (Marketing)
- Digital campaigns
- AI targeting
- Multi-channel lead generation

D. XOTO VAULT (Mortgage Platform)
- Loan comparison
- Pre-approval
- Bank partnerships
- Smart eligibility

E. MARKETPLACE
- Furniture, décor, pergolas, planters, pools, lighting

-------------------------------------------------------
3. LANDSCAPING (PRIMARY PRODUCT)
-------------------------------------------------------
Services:
- Hardscape: paving, pergolas, decking, boundaries, BBQ
- Softscape: grass, irrigation, planting, soil prep
- Pools: construction, filtration, lighting
- Water Features: fountains, ponds, waterfalls
- Smart Systems: smart irrigation, solar lighting
- Outdoor Structures: gazebos, umbrellas, flooring

Customer Flow:
1. Get free estimate
2. Book consultation
3. Final design + drawings
4. Execution + supervision

Key Promises:
- 2–3 day design delivery
- High-grade UAE-climate materials
- Custom themes: Japanese, Tropical, Modern

-------------------------------------------------------
4. INTERIORS
-------------------------------------------------------
Services:
- Modular kitchens
- Wardrobes
- False ceiling
- Electrical & civil
- Lighting
- Flooring
- Furnishing & wallpapers

Flow:
Upload plan → AI layout → Consultation → Site visit → Final BOQ + execution

EcoSmart Interiors:
- Energy-efficient lighting
- Smart controls
- Sustainable materials

-------------------------------------------------------
5. RENT / BUY / SELL
-------------------------------------------------------
Offerings:
- AI-verified listings
- Smart recommendations
- Instant valuation
- Lead matching
- Market analysis

User Flows:
Rent: Curated rentals → Viewing → Paperwork
Buy: Filters → Tours → Valuation → Mortgage
Sell: Valuation → AI upgrade advice → Listing → Marketing

Hot Locations:
Dubai Hills, MBR City, Arabian Ranches, Damac Hills, Waterfront clusters

-------------------------------------------------------
6. MORTGAGES — XOTO VAULT
-------------------------------------------------------
Features:
- AI-matched mortgage offers
- Pre-approval
- Loan comparison
- EMI calculator
- Partner banks

Flow:
Pre-check → Compare → Apply → Approval + Disbursement

-------------------------------------------------------
7. PARTNER ECOSYSTEM
-------------------------------------------------------
Stakeholders:
- Business Associates
- Execution Partners
- Strategic Alliances
- Developers
- Financial Institutions

Benefits:
- AI tools
- Lead access
- Workflow visibility
- Revenue growth

-------------------------------------------------------
8. AI CAPABILITIES
-------------------------------------------------------
- AI design previews (2D/3D)
- Property search optimization
- Mortgage eligibility
- Upgrade recommendations
- Price prediction

-------------------------------------------------------
9. PRICING (INDICATIVE)
-------------------------------------------------------
Villas: AED 3.5M–6.8M+
Townhouses: AED 2.8M–4.2M
Waterfront: AED 5M–10M+

Landscaping pricing depends on area, materials, and scope.
Estimates are shared after layout upload.

-------------------------------------------------------
10. FAQ — HIGH PRIORITY
-------------------------------------------------------
- Landscaping start: Upload layout or book consultation
- 3D renders: Yes
- Custom structures: Fully customizable
- Pools: End-to-end design & build
- Interiors: Concept to execution
- Mortgages: Via XOTO Vault
- Differentiator: AI-first, speed, accuracy, unified ecosystem

-------------------------------------------------------
11. BOT RESPONSE RULES
-------------------------------------------------------
- Offer consultation + estimate as primary CTA
- For real estate: suggest viewing, valuation, or financing
- For partners: guide them to join the ecosystem
- Never give exact costs or timelines without user inputs

-------------------------------------------------------
12. CONTACT
-------------------------------------------------------
Customer Email: care@xoto.ae
Partner Email: connect@xoto.ae
Locations: UAE, India, Saudi Arabia

=======================================================
END OF KNOWLEDGE BASE
=======================================================
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

    let isPositiveResponseCame = await isPositiveResponseWithAI(userText, openai)
    let isNegativeResponseCame = await isNegativeResponseWithAI(userText, openai)

    let canBeOurCustomer = await isPotentialCustomerWithAI(userText, openai)
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
    if (isNegativeResponseCame) {
      console.log("negative response came")
    }

    if (isPositiveResponseCame) {
      console.log("positive response came")
    }

    // isPotentialCustomer,assistanceAsked , contactAsked , contactProvided , name , phone, city
    if (!isNegativeResponseCame && canBeOurCustomer && !session.isPotentialCustomer && !session.assistanceAsked && !session.contactAsked && !session.contactProvided) {
      console.log("Code came int his block")
      session.isPotentialCustomer = true;
      await session.save();

      console.log("Creating lead for session:", session_id);
      return "Would you like our expert to assist you further?"
      // messages.push({
      //   role: "assistant",
      //   content: "Would you like our expert to assist you further?"
      // });
    }
    else if (!isNegativeResponseCame && (isPositiveResponseCame) && session.isPotentialCustomer && !session.assistanceAsked && !session.contactAsked && !session.contactProvided) {
      console.log("Code in 2nd else if block and isPositiveResponseCame and isNegativeResponseCame", isPositiveResponseCame, isNegativeResponseCame)
      session.assistanceAsked = true;
      session.waitingForLead = true;
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

        // return "Sure 😊\n\n" +
        //   "Please share the following details:\n\n" +
        //   "• Name\n" +
        //   "• Phone Number\n" +
        //   "• Email\n" +
        //   "• Property Type (Apartment / Villa / Plot)\n" +
        //   "• Area / Location\n" +
        //   "• Requirement\n\n" +
        //   "Example:\n" +
        //   "Rahul Sharma, 9876543210, rahul@gmail.com, Apartment, Dubai Marina, 2BHK for investment\n\n" +
        //   "NOTE: Please make sure you send the details exactly in the above format.";

        return `Sure   
May I know your name, contact number,email,city, and briefly what you’re looking for?`;
      }
    }
    // else if (session.isPotentialCustomer && session.assistanceAsked && session.contactAsked && !session.contactProvided) {
    else if (!isNegativeResponseCame && session.waitingForLead && !session.contactProvided) {

      // let extractedtext = extractLeadFromText(userText);
      let extractedtext = await extractLeadWithAI(userText, openai);
      console.log("extractedtextextractedtextextractedtextextractedtext", extractedtext)

      const extractedLead = extractedtext;

      // if (extractedLead) {


      //   console.log("code coming in 3rd else if ")
      //   // split name safely
      //   const [first_name, ...lastParts] = extractedLead.name.trim().split(' ');
      //   const last_name = lastParts.join(' ') || '';

      //   // final payload
      //   const propertyLeadPayload = {
      //     type: 'ai_enquiry',

      //     name: {
      //       first_name: first_name,
      //       last_name: last_name || 'NA'
      //     },

      //     mobile: {
      //       country_code: '+971',
      //       number: extractedLead.phone_number
      //     },

      //     email: extractedLead.email,

      //     // optional but useful
      //     description: extractedLead.description,

      //     // map if available
      //     preferred_city: extractedLead.city || undefined,

      //     // inferred fields
      //     preferred_contact: 'whatsapp',
      //     status: 'submit'
      //   };

      //   let generatedLead = await PropertyPageLead.create(propertyLeadPayload);

      //   session.name = extractedtext.lead.name;
      //   session.phone = extractedtext.lead.phone_number;
      //   session.city = extractedtext.lead.city;

      //   await session.save();

      //   console.log("Genrateddddddddddddddddddddddddddddddddddddddddd", generatedLead)
      // } else {
      //   // Normal AI behavior
      //   messages.push({
      //     role: "system",
      //     content: XOTO_SYSTEM_PROMPT
      //   });
      // }

      if (extractedLead && extractedLead.phone_number) {
        console.log("Creating lead from AI-extracted data...");

        // split name safely
        const [first_name, ...lastParts] = (extractedLead.name || "NA").trim().split(" ");
        const last_name = lastParts.join(" ") || "NA";

        // final payload
        const propertyLeadPayload = {
          type: "ai_enquiry",

          name: {
            first_name: first_name,
            last_name: last_name
          },

          mobile: {
            country_code: "+971", // optionally you can detect from number
            number: extractedLead.phone_number
          },

          email: extractedLead.email || null,

          // optional but useful
          description: extractedLead.description || null,

          // map if available
          city: extractedLead.city || null,

          // inferred fields
          preferred_contact: "whatsapp",
          status: "submit"
        };

        console.log("propertyLeadPayloadpropertyLeadPayloadpropertyLeadPayload", propertyLeadPayload)
        let generatedLead = await PropertyPageLead.create(propertyLeadPayload);

        // save session info
        session.name = extractedLead.name || null;
        session.phone = extractedLead.phone_number;
        session.city = extractedLead.area || null;
        session.contactProvided = true; // mark that we have lead
        session.waitingForLead = false;

        await session.save();

        console.log("Generated lead:", generatedLead);

        return "Thanks! We've noted your details. Our XOTO expert will reach out to you soon.";
      } else if (!isNegativeResponseCame) {
        // fallback if AI didn't return usable info
        return "Could you please provide your name and contact number so we can assist you?";
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


export async function vapiwebhook(req, res) {
  try {
    console.log("Request came on thisssssssssss",req.body?.message)
    const message = req.body?.message;
    if (!message) return res.sendStatus(200);

    const {
      type,
      role,
      transcriptType,
      transcript,
      call,
    } = message;

    // ✅ Only final USER speech
    if (
      type !== "transcript" ||
      transcriptType !== "final" 
      || role !== "user"
    ) {
      return res.sendStatus(200);
    }

    const session_id = call?.id;
    const userText = transcript;

    if (!session_id || !userText) {
      return res.sendStatus(200);
    }



    let session = await chatSessions.findOne({ session_id });
    if (!session) {
      session = await chatSessions.create({ session_id });
    }

    const isPositiveResponseCame = await isPositiveResponseWithAI(userText, openai);
    const isNegativeResponseCame = await isNegativeResponseWithAI(userText, openai);
    const canBeOurCustomer = await isPotentialCustomerWithAI(userText, openai);

    // 🟢 STEP 1: Detect potential customer
    if (
      !isNegativeResponseCame &&
      canBeOurCustomer &&
      !session.isPotentialCustomer &&
      !session.contactProvided
    ) {
      session.isPotentialCustomer = true;
      await session.save();

      // 👉 optional: store event / flag
      console.log("VAPI → Potential customer detected:", session_id);
      return res.sendStatus(200);
    }

    // 🟢 STEP 2: User agrees for assistance
    if (
      !isNegativeResponseCame &&
      isPositiveResponseCame &&
      session.isPotentialCustomer &&
      !session.contactAsked
    ) {
      session.assistanceAsked = true;
      session.contactAsked = true;
      session.waitingForLead = true;
      await session.save();

      console.log("VAPI → User agreed for assistance:", session_id);
      return res.sendStatus(200);
    }

    // 🟢 STEP 3: Extract lead
    if (!isNegativeResponseCame && session.waitingForLead && !session.contactProvided) {
      const extractedLead = await extractLeadWithAI(userText, openai);

      if (extractedLead?.phone_number) {
        const [first_name, ...lastParts] =
          (extractedLead.name || "NA").trim().split(" ");

        await PropertyPageLead.create({
          type: "ai_enquiry",
          name: {
            first_name,
            last_name: lastParts.join(" ") || "NA",
          },
          mobile: {
            country_code: "+971",
            number: extractedLead.phone_number,
          },
          email: extractedLead.email || null,
          description: extractedLead.description || null,
          city: extractedLead.city || null,
          preferred_contact: "whatsapp",
          status: "submit",
        });

        session.name = extractedLead.name || null;
        session.phone = extractedLead.phone_number;
        session.city = extractedLead.city || null;
        session.contactProvided = true;
        session.waitingForLead = false;

        await session.save();

        console.log("🔥 VAPI → LEAD GENERATED:", session_id);
      }
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("VAPI Webhook Error:", err);
    return res.sendStatus(200);
  }
}


