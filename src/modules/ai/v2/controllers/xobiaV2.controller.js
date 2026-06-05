const OpenAI = require('openai');
const { crawlWebsite, searchWebsiteKnowledge } = require('../services/crawler.service');
const WebsiteKnowledge = require('../models/WebsiteKnowledge');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Lazy-load models to avoid circular dependency issues
let Property = null;
let PropertyLead = null;

function getProperty() {
  if (!Property) {
    try { Property = require('../../../properties/models/property.model'); } catch (e) {}
  }
  return Property;
}

function getPropertyLead() {
  if (!PropertyLead) {
    try { PropertyLead = require('../../../auth/models/consultant/propertyLead.model'); } catch (e) {}
  }
  return PropertyLead;
}

// ─────────────────────────────────────────
// SYSTEM PROMPT  (multilingual + tools)
// ─────────────────────────────────────────
const SYSTEM_PROMPT = `
You are XOBIA — the official multilingual AI voice assistant for XOTO, a PropTech company in UAE.

========================
LANGUAGE (CRITICAL)
========================
• ALWAYS respond in the EXACT SAME language as the user's current message.
• You can speak: English, Arabic, Hindi, Urdu, French, Chinese, Spanish, or ANY language.
• Never switch language unless the user switches first.

========================
VOICE STYLE
========================
• Keep responses SHORT — 2 to 3 sentences max. This is a voice conversation.
• Be warm, professional, confident.
• Never say "I will search for that" — just search and speak the result.
• Format numbers naturally: say "3.5 million dirhams" not "3500000".

========================
ABOUT XOTO
========================
• AI-first PropTech company in UAE (Dubai)
• Services: Landscaping, Interiors, Property Buy/Sell/Rent, Mortgages (XOTO Vault)
• Platforms: XOTO HOME, XOTO GRID, XOTO VAULT, XOTO BLITZ, Marketplace
• Contact: care@xoto.ae | connect@xoto.ae | Locations: UAE, India, Saudi Arabia

========================
TOOLS USAGE
========================
• Use searchWebsite  → for questions about services, pricing, pages, or features
• Use searchProperties → when user asks about buying, renting, or specific property listings
• Use saveLead → when user gives their name/phone/email or says they want to be contacted
• Always give the page link after searchWebsite so user can navigate directly

========================
LEAD CAPTURE
========================
• Naturally ask for name + phone if user shows clear interest
• Confirm once details are saved: "Great, our team will contact you soon"
• Do NOT ask for details more than once
`;

// ─────────────────────────────────────────
// TOOL DEFINITIONS  (sent to OpenAI session)
// ─────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    name: 'searchWebsite',
    description: 'Search XOTO website content and get direct page links. Use for service info, pricing, features, or to guide user to a page.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "landscaping pricing", "mortgage eligibility")' }
      },
      required: ['query']
    }
  },
  {
    type: 'function',
    name: 'searchProperties',
    description: 'Search real property listings from the XOTO database. Use when user asks to buy, rent, or wants specific listings.',
    parameters: {
      type: 'object',
      properties: {
        unitType:        { type: 'string',  description: 'villa, apartment, townhouse, penthouse, plot, office' },
        location:        { type: 'string',  description: 'Area or city in UAE e.g. Dubai Hills, Marina' },
        maxPrice:        { type: 'number',  description: 'Max price in AED' },
        minPrice:        { type: 'number',  description: 'Min price in AED' },
        bedrooms:        { type: 'number',  description: 'Number of bedrooms' },
        transactionType: { type: 'string',  description: 'rent or sell' },
        propertySubType: { type: 'string',  description: 'off_plan, secondary, rental, commercial' }
      }
    }
  },
  {
    type: 'function',
    name: 'saveLead',
    description: 'Save customer contact details when they show interest or provide their info.',
    parameters: {
      type: 'object',
      properties: {
        name:        { type: 'string', description: 'Full name' },
        phone:       { type: 'string', description: 'Phone or WhatsApp number' },
        email:       { type: 'string', description: 'Email address' },
        requirement: { type: 'string', description: 'What they are looking for' },
        city:        { type: 'string', description: 'Preferred city or area' }
      },
      required: ['phone']
    }
  }
];

// ─────────────────────────────────────────
// POST /api/ai/v2/session
// Returns ephemeral token for OpenAI Realtime WebRTC
// ─────────────────────────────────────────
const createSession = async (req, res) => {
  try {
    const { voice = 'nova' } = req.body || {};

    const session = await openai.beta.realtime.sessions.create({
      model:        'gpt-4o-mini-realtime-preview',
      voice,
      instructions: SYSTEM_PROMPT,
      tools:        TOOLS,
      tool_choice:  'auto',
      modalities:   ['text', 'audio'],
      turn_detection: {
        type:                'server_vad',
        threshold:           0.5,
        prefix_padding_ms:   300,
        silence_duration_ms: 600
      }
    });

    res.json({
      client_secret: session.client_secret,
      session_id:    session.id
    });
  } catch (err) {
    console.error('Session error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create voice session' });
  }
};

// ─────────────────────────────────────────
// POST /api/ai/v2/crawler/start
// Triggers website crawl in background
// ─────────────────────────────────────────
const startCrawler = async (req, res) => {
  res.json({ message: 'Crawler started. Check /status for progress.' });

  crawlWebsite()
    .then(results => {
      const ok = results.filter(r => r.success).length;
      console.log(`Crawl done: ${ok}/${results.length} pages saved`);
    })
    .catch(err => console.error('Crawl error:', err.message));
};

// ─────────────────────────────────────────
// GET /api/ai/v2/search?q=...
// Called by frontend when AI tool "searchWebsite" fires
// ─────────────────────────────────────────
const searchWebsite = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q param required' });

    const results = await searchWebsiteKnowledge(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────
// GET /api/ai/v2/properties
// Called by frontend when AI tool "searchProperties" fires
// Supports filters: unitType, location, minPrice, maxPrice,
//                   bedrooms, transactionType, propertySubType
// ─────────────────────────────────────────
const searchProperties = async (req, res) => {
  try {
    const PropertyModel = getProperty();
    if (!PropertyModel) {
      return res.json({ properties: [], count: 0, message: 'Property model unavailable' });
    }

    const {
      unitType, location, maxPrice, minPrice,
      bedrooms, transactionType, propertySubType
    } = req.query;

    const query = {};

    if (unitType)        query.unitType        = new RegExp(unitType, 'i');
    if (transactionType) query.transactionType = transactionType;
    if (propertySubType) query.propertySubType = propertySubType;

    if (location) {
      query.$or = [
        { locality:      new RegExp(location, 'i') },
        { developerName: new RegExp(location, 'i') },
        { projectName:   new RegExp(location, 'i') }
      ];
    }

    if (maxPrice) query.price_max = { $lte: Number(maxPrice) };
    if (minPrice) query.price_min = { $gte: Number(minPrice) };
    if (bedrooms) query.bedrooms  = Number(bedrooms);

    const properties = await PropertyModel.find(query)
      .select('propertyName projectName unitType bedrooms bathrooms price price_min price_max locality developerName overview transactionType propertySubType isFeatured isHot')
      .sort({ isFeatured: -1, isHot: -1, createdAt: -1 })
      .limit(5)
      .lean();

    res.json({ properties, count: properties.length });
  } catch (err) {
    console.error('Property search error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────
// POST /api/ai/v2/lead
// Called by frontend when AI tool "saveLead" fires
// ─────────────────────────────────────────
const saveLead = async (req, res) => {
  try {
    const LeadModel = getPropertyLead();
    if (!LeadModel) {
      return res.status(500).json({ error: 'Lead model unavailable' });
    }

    const { name, phone, email, requirement, city } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const [first_name, ...rest] = (name || 'Guest').trim().split(' ');

    const lead = await LeadModel.create({
      type:              'ai_voice_enquiry',
      name:              { first_name, last_name: rest.join(' ') || 'NA' },
      mobile:            { country_code: '', number: phone },
      email:             email    || null,
      description:       requirement || null,
      city:              city     || null,
      preferred_contact: 'whatsapp',
      status:            'submit'
    });

    res.json({ success: true, lead_id: lead._id });
  } catch (err) {
    console.error('Lead save error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────
// GET /api/ai/v2/status
// Check how many pages are crawled
// ─────────────────────────────────────────
const getStatus = async (req, res) => {
  try {
    const count = await WebsiteKnowledge.countDocuments();
    const pages = await WebsiteKnowledge.find().select('url title lastCrawled').lean();
    res.json({
      crawledPages: count,
      status:       count > 0 ? 'ready' : 'not_crawled',
      pages
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createSession, startCrawler, searchWebsite, searchProperties, saveLead, getStatus };
