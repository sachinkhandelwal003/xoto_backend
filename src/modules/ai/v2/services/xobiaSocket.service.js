/**
 * XOBIA V2 — Full-featured OpenAI Realtime voice assistant
 *
 * Tools:
 *  - searchProperties       → buy/sell/off-plan listings
 *  - searchRentalProperties → rental listings
 *  - getBanks               → partner bank list
 *  - getBankProducts        → mortgage products + interest rates
 *  - calculateEligibility   → LTV + DBR + monthly EMI from salary
 *  - saveVaultLead          → mortgage lead (Vault)
 *  - saveGridLead           → property lead (Grid)
 */

const WebSocket = require('ws');
const axios     = require('axios');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

// ─── Models (lazy load to avoid circular deps) ───────────────────────────────
let PropertyModel = null, RentalModel = null, PropertyLead = null;
const getProperty = () => { if (!PropertyModel) try { PropertyModel = require('../../../properties/models/property.model'); } catch {} return PropertyModel; };
const getRental   = () => { if (!RentalModel)   try { RentalModel   = require('../../../RentalProperties/models/RentalProperty.model'); } catch {} return RentalModel; };

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are XOBIA — the official multilingual AI voice assistant for XOTO, a PropTech company in UAE.

LANGUAGE (CRITICAL):
• ALWAYS respond in the EXACT SAME language as the user's current message.
• You speak English, Arabic, Hindi, Urdu, French, Spanish, or any language.
• Never switch language unless the user switches first.

VOICE STYLE:
• Keep responses SHORT — 2 to 3 sentences max. This is a voice conversation.
• Be warm, professional, and confident.
• Say numbers naturally: "1.5 million dirhams" not "1500000".
• No bullet points — plain spoken sentences only.

ABOUT XOTO:
• AI-first PropTech company in UAE (Dubai)
• Services: Property Buy/Sell/Rent, Mortgages (XOTO Vault), Interior Design, Landscaping
• Contact: care@xoto.ae | connect@xoto.ae | +971 4 000 0000

CAPABILITIES — USE TOOLS WHEN RELEVANT:
• searchProperties        → when user asks to buy a property, apartment, villa, off-plan
• searchRentalProperties  → when user asks about renting
• getBanks                → when user asks which banks are available
• getBankProducts         → when user asks about mortgage rates, home loans, financing
• calculateEligibility    → when user mentions their salary or asks "can I afford", "how much can I borrow", "what is my LTV"
• saveVaultLead           → when user wants a mortgage consultation — collect name + phone first, then confirm before saving
• saveGridLead            → when user wants property help — collect name + phone first, then confirm before saving

LEAD FLOW (IMPORTANT):
1. If user shows interest in mortgage → ask for name and phone number
2. Confirm with user: "Should I register your details for a callback?"
3. Only call saveVaultLead or saveGridLead AFTER user says yes/confirm
4. After saving: "Perfect! A specialist will contact you within 24 hours."
`.trim();

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    name: 'searchProperties',
    description: 'Search buy/sell/off-plan properties from the database.',
    parameters: {
      type: 'object',
      properties: {
        propertySubType: { type: 'string', enum: ['off_plan', 'secondary', 'commercial'] },
        unitType:        { type: 'string', description: 'apartment, villa, studio, penthouse, townhouse' },
        bedrooms:        { type: 'number' },
        minPrice:        { type: 'number', description: 'in AED' },
        maxPrice:        { type: 'number', description: 'in AED' },
        city:            { type: 'string' },
        area:            { type: 'string' },
        search:          { type: 'string' },
        limit:           { type: 'number' }
      }
    }
  },
  {
    type: 'function',
    name: 'searchRentalProperties',
    description: 'Search rental properties from the database.',
    parameters: {
      type: 'object',
      properties: {
        unitType:  { type: 'string' },
        bedrooms:  { type: 'number' },
        minPrice:  { type: 'number' },
        maxPrice:  { type: 'number' },
        city:      { type: 'string' },
        area:      { type: 'string' },
        limit:     { type: 'number' }
      }
    }
  },
  {
    type: 'function',
    name: 'getBanks',
    description: 'Get list of all partner banks available for mortgages.',
    parameters: { type: 'object', properties: {} }
  },
  {
    type: 'function',
    name: 'getBankProducts',
    description: 'Get available mortgage/bank products with interest rates and eligibility criteria.',
    parameters: {
      type: 'object',
      properties: {
        featured: { type: 'boolean', description: 'true to get only featured/best products' }
      }
    }
  },
  {
    type: 'function',
    name: 'calculateEligibility',
    description: 'Calculate mortgage eligibility: LTV, DBR, monthly EMI, and max loan amount based on monthly salary.',
    parameters: {
      type: 'object',
      required: ['monthlySalary'],
      properties: {
        monthlySalary:      { type: 'number', description: 'Monthly salary in AED' },
        propertyPrice:      { type: 'number', description: 'Target property price in AED (optional)' },
        existingEMI:        { type: 'number', description: 'Existing monthly loan obligations in AED (optional)' },
        interestRate:       { type: 'number', description: 'Annual interest rate % (default 5)' },
        tenureYears:        { type: 'number', description: 'Loan tenure in years (default 25)' }
      }
    }
  },
  {
    type: 'function',
    name: 'saveVaultLead',
    description: 'Save a mortgage/home loan lead into Vault. Only call AFTER user confirms.',
    parameters: {
      type: 'object',
      required: ['firstName', 'lastName', 'phone'],
      properties: {
        firstName:      { type: 'string' },
        lastName:       { type: 'string' },
        phone:          { type: 'string', description: 'Phone number, digits only' },
        email:          { type: 'string' },
        nationality:    { type: 'string' },
        monthlyIncome:  { type: 'number', description: 'Monthly salary in AED' },
        propertyValue:  { type: 'number', description: 'Target property price in AED' },
        loanAmount:     { type: 'number' },
        employmentType: { type: 'string', enum: ['salaried', 'self_employed'] },
        notes:          { type: 'string' }
      }
    }
  },
  {
    type: 'function',
    name: 'saveGridLead',
    description: 'Save a property enquiry lead into Grid. Only call AFTER user confirms.',
    parameters: {
      type: 'object',
      required: ['firstName', 'lastName', 'phone'],
      properties: {
        firstName:    { type: 'string' },
        lastName:     { type: 'string' },
        phone:        { type: 'string' },
        email:        { type: 'string' },
        enquiryType:  { type: 'string', enum: ['buy', 'rent', 'sell', 'general_enquiry'], description: 'Type of enquiry' },
        notes:        { type: 'string', description: 'Any additional info' }
      }
    }
  }
];

// ─── Execute tool calls ───────────────────────────────────────────────────────
async function executeTool(name, args) {
  try {
    // ── searchProperties ────────────────────────────────────────────────────
    if (name === 'searchProperties') {
      const params = new URLSearchParams({ approvalStatus: 'approved', listingStatus: 'active', limit: args.limit || 5 });
      if (args.propertySubType) params.set('propertySubType', args.propertySubType);
      if (args.unitType)        params.set('unitType', args.unitType);
      if (args.bedrooms)        params.set('bedrooms', args.bedrooms);
      if (args.minPrice)        params.set('minPrice', args.minPrice);
      if (args.maxPrice)        params.set('maxPrice', args.maxPrice);
      if (args.city)            params.set('city', args.city);
      if (args.area)            params.set('area', args.area);
      if (args.search)          params.set('search', args.search);

      const { data } = await axios.get(`${BACKEND}/properties/public?${params}`, { timeout: 8000 });
      const props = (data.data || data.properties || []).slice(0, 5);
      return {
        count: props.length,
        properties: props.map(p => ({
          name:     p.projectName || p.propertyName,
          type:     p.unitType,
          bedrooms: p.bedrooms,
          price:    p.price_min ? `AED ${(p.price_min / 1e6).toFixed(2)}M` : 'Price on request',
          area:     p.locality || p.area || p.city,
          status:   p.projectStatus || p.propertySubType,
          overview: (p.overview || '').slice(0, 100)
        }))
      };
    }

    // ── searchRentalProperties ───────────────────────────────────────────────
    if (name === 'searchRentalProperties') {
      const params = new URLSearchParams({ limit: args.limit || 5 });
      if (args.unitType)  params.set('unitType', args.unitType);
      if (args.bedrooms)  params.set('bedrooms', args.bedrooms);
      if (args.minPrice)  params.set('minPrice', args.minPrice);
      if (args.maxPrice)  params.set('maxPrice', args.maxPrice);
      if (args.city)      params.set('city', args.city);
      if (args.area)      params.set('area', args.area);

      const { data } = await axios.get(`${BACKEND}/rental/property/search?${params}`, { timeout: 8000 });
      const props = (data.data || data.properties || []).slice(0, 5);
      return {
        count: props.length,
        properties: props.map(p => ({
          name:     p.propertyName || p.projectName,
          type:     p.unitType,
          bedrooms: p.bedrooms,
          rent:     p.rent ? `AED ${p.rent.toLocaleString()}/${p.rentalFrequency || 'year'}` : 'Price on request',
          area:     p.locality || p.area || p.city
        }))
      };
    }

    // ── getBanks ────────────────────────────────────────────────────────────
    if (name === 'getBanks') {
      const { data } = await axios.get(`${BACKEND}/bank`, { timeout: 8000 });
      const banks = (data.data || data.banks || []);
      return { count: banks.length, banks: banks.map(b => ({ name: b.name || b.bankName, country: b.country })) };
    }

    // ── getBankProducts ─────────────────────────────────────────────────────
    if (name === 'getBankProducts') {
      const url = args.featured ? `${BACKEND}/bank/products/featured` : `${BACKEND}/bank/products`;
      const { data } = await axios.get(url, { timeout: 8000 });
      const products = (data.data || data.products || []).slice(0, 6);
      return {
        count: products.length,
        products: products.map(p => ({
          bank:         p.bankName || p.bank?.name,
          product:      p.productName || p.name,
          interestRate: p.interestRate != null ? `${p.interestRate}% per year` : 'N/A',
          rateType:     p.rateType,
          maxLTV:       p.maxLTV ? `${p.maxLTV}%` : null,
          minSalary:    p.minSalary ? `AED ${p.minSalary.toLocaleString()}` : null,
          maxTenure:    p.maxTenure ? `${p.maxTenure} years` : null
        }))
      };
    }

    // ── calculateEligibility ────────────────────────────────────────────────
    if (name === 'calculateEligibility') {
      const salary       = args.monthlySalary || 0;
      const propPrice    = args.propertyPrice  || 0;
      const existingEMI  = args.existingEMI    || 0;
      const rate         = (args.interestRate  || 5) / 100 / 12;  // monthly rate
      const tenure       = (args.tenureYears   || 25) * 12;        // months

      // Max DBR 50% rule → available monthly payment for new EMI
      const maxNewEMI = salary * 0.50 - existingEMI;

      // Max loan from EMI capacity: P = EMI × [(1+r)^n - 1] / [r × (1+r)^n]
      const maxLoan = maxNewEMI > 0 && rate > 0
        ? Math.round(maxNewEMI * (Math.pow(1 + rate, tenure) - 1) / (rate * Math.pow(1 + rate, tenure)))
        : 0;

      // LTV (UAE rules)
      let ltvPct = 80, minDownPct = 20;
      if (propPrice > 5_000_000) { ltvPct = 70; minDownPct = 30; }

      const maxLoanByLTV  = propPrice ? Math.round(propPrice * ltvPct / 100) : null;
      const recommendedLoan = maxLoanByLTV ? Math.min(maxLoan, maxLoanByLTV) : maxLoan;
      const downPayment     = propPrice ? Math.round(propPrice * minDownPct / 100) : null;

      // Monthly EMI for recommended loan
      const emi = recommendedLoan && rate > 0
        ? Math.round(recommendedLoan * rate * Math.pow(1 + rate, tenure) / (Math.pow(1 + rate, tenure) - 1))
        : null;

      const dbrPct = emi ? Math.round(((existingEMI + emi) / salary) * 100) : null;

      return {
        monthlySalary:    `AED ${salary.toLocaleString()}`,
        maxLoanFromDBR:   `AED ${maxLoan.toLocaleString()}`,
        ltvRule:          propPrice ? `${ltvPct}% LTV (property ${propPrice > 5e6 ? 'above' : 'below'} AED 5M)` : null,
        maxLoanFromLTV:   maxLoanByLTV ? `AED ${maxLoanByLTV.toLocaleString()}` : null,
        recommendedLoan:  `AED ${recommendedLoan.toLocaleString()}`,
        downPayment:      downPayment ? `AED ${downPayment.toLocaleString()} (${minDownPct}%)` : null,
        monthlyEMI:       emi ? `AED ${emi.toLocaleString()}` : null,
        dbrAfterLoan:     dbrPct ? `${dbrPct}%` : null,
        eligible:         dbrPct ? dbrPct <= 50 : maxLoan > 0,
        tenure:           `${args.tenureYears || 25} years`
      };
    }

    // ── saveVaultLead ───────────────────────────────────────────────────────
    if (name === 'saveVaultLead') {
      const phone = (args.phone || '').replace(/\D/g, '');
      const body  = {
        customerInfo: {
          firstName:    args.firstName,
          lastName:     args.lastName,
          mobileNumber: phone,
          countryCode:  '+971',
          email:        args.email        || null,
          nationality:  args.nationality  || null
        },
        loanRequirements: {
          propertyValue:  args.propertyValue  || null,
          loanAmount:     args.loanAmount     || null,
          employmentType: args.employmentType || 'salaried',
          monthlyIncome:  args.monthlyIncome  || null
        },
        notesToXoto: args.notes || 'Lead captured via XOBIA voice assistant'
      };

      const { data } = await axios.post(`${BACKEND}/vault/lead/website`, body, { timeout: 8000 });
      return { success: true, message: 'Vault mortgage lead saved', leadId: data?.data?._id || data?._id };
    }

    // ── saveGridLead ────────────────────────────────────────────────────────
    if (name === 'saveGridLead') {
      const phone = (args.phone || '').replace(/\D/g, '');
      const body  = {
        first_name:    args.firstName,
        last_name:     args.lastName,
        phone_number:  phone,
        country_code:  '+971',
        email:         args.email       || null,
        enquiry_type:  args.enquiryType || 'general_enquiry'
      };

      const { data } = await axios.post(`${BACKEND}/gridlead/website-lead/simple`, body, { timeout: 8000 });
      return { success: true, message: 'Grid property lead saved', leadId: data?.data?._id || data?._id };
    }

    return { error: 'Unknown tool' };
  } catch (err) {
    console.error(`[XobiaVoice] Tool ${name} error:`, err.message);
    return { error: err.message || 'Tool failed' };
  }
}

// ─── Register Socket.io namespace ────────────────────────────────────────────
function registerXobiaVoice(io) {
  // Allow any connection — no auth required for public voice assistant
  const ns = io.of('/xobia-voice');

  ns.on('connection', (socket) => {
    console.log('[XobiaVoice] client connected:', socket.id);

    let openaiWs    = null;
    let sessionReady = false;

    function connectToOpenAI() {
      openaiWs = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'OpenAI-Beta': 'realtime=v1' } }
      );

      openaiWs.on('open', () => {
        console.log('[XobiaVoice] OpenAI WS open');
        openaiWs.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions:         SYSTEM_PROMPT,
            tools:                TOOLS,
            tool_choice:          'auto',
            modalities:           ['text', 'audio'],
            voice:                'shimmer',        // female, warm
            input_audio_format:   'pcm16',
            output_audio_format:  'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type:                'server_vad',
              threshold:           0.5,
              prefix_padding_ms:   300,
              silence_duration_ms: 700
            }
          }
        }));
      });

      openaiWs.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
          case 'session.created':
          case 'session.updated':
            sessionReady = true;
            socket.emit('session_ready');
            break;

          case 'input_audio_buffer.speech_started':
            socket.emit('status', 'listening');
            break;

          case 'response.audio.delta':
            socket.emit('audio_chunk', msg.delta);
            break;

          case 'response.audio.done':
            socket.emit('audio_done');
            socket.emit('status', 'listening');
            break;

          case 'response.audio_transcript.delta':
            socket.emit('transcript', msg.delta);
            break;

          case 'conversation.item.input_audio_transcription.completed':
            socket.emit('user_transcript', msg.transcript);
            break;

          case 'response.output_item.done':
            if (msg.item?.type === 'function_call') {
              const { name, arguments: argsStr, call_id } = msg.item;
              socket.emit('status', 'fetching');

              let args = {};
              try { args = JSON.parse(argsStr || '{}'); } catch {}

              const result = await executeTool(name, args);
              console.log(`[XobiaVoice] Tool ${name} result:`, JSON.stringify(result).slice(0, 200));

              // Surface nav link for property/bank results
              if (result.properties?.length > 0) socket.emit('nav_link', { url: '/properties', title: 'View Properties' });
              if (result.products?.length > 0)    socket.emit('nav_link', { url: '/mortgages',  title: 'View Mortgage Products' });
              if (result.banks?.length > 0)       socket.emit('nav_link', { url: '/mortgages',  title: 'View Banks' });
              if (result.success && name === 'saveVaultLead') socket.emit('lead_saved', { type: 'vault', ...result });
              if (result.success && name === 'saveGridLead')  socket.emit('lead_saved', { type: 'grid',  ...result });

              openaiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id, output: JSON.stringify(result) }
              }));
              openaiWs.send(JSON.stringify({ type: 'response.create' }));
              socket.emit('status', 'speaking');
            }
            break;

          case 'response.done':
            socket.emit('status', 'listening');
            break;

          case 'error':
            console.error('[XobiaVoice] OpenAI error:', msg.error);
            socket.emit('error', msg.error?.message || 'OpenAI error');
            break;
        }
      });

      openaiWs.on('error', (err) => {
        console.error('[XobiaVoice] WS error:', err.message);
        socket.emit('error', 'Connection error. Please try again.');
      });

      openaiWs.on('close', (code) => {
        console.log('[XobiaVoice] OpenAI WS closed:', code);
        sessionReady = false;
        socket.emit('session_ended');
      });
    }

    // ── Socket events from frontend ──────────────────────────────────────────
    socket.on('start_session', () => {
      if (openaiWs) try { openaiWs.close(); } catch {}
      connectToOpenAI();
    });

    socket.on('audio_chunk', (base64Audio) => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN || !sessionReady) return;
      openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64Audio }));
    });

    socket.on('stop_audio', () => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;
      openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
    });

    socket.on('text_message', (text) => {
      // Accept text input too (for hybrid text+voice UI)
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN || !sessionReady) return;
      openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
      }));
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
    });

    socket.on('end_session', () => {
      if (openaiWs) try { openaiWs.close(); } catch {};
      openaiWs = null;
    });

    socket.on('disconnect', () => {
      console.log('[XobiaVoice] client disconnected:', socket.id);
      if (openaiWs) try { openaiWs.close(); } catch {};
      openaiWs = null;
    });
  });
}

module.exports = { registerXobiaVoice };
