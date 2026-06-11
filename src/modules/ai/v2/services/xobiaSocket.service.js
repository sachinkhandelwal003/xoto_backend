/**
 * XOBIA V2 — OpenAI Realtime WebSocket ↔ Socket.io bridge
 *
 * Flow:
 *   Browser (mic PCM16) → Socket.io → this service → OpenAI WS → events back → Socket.io → Browser
 *
 * Socket.io namespace:  /xobia-voice
 */

const WebSocket = require('ws');
const { searchWebsiteKnowledge } = require('./crawler.service');

let PropertyModel = null;
let PropertyLead   = null;

function getProperty() {
  if (!PropertyModel) {
    try { PropertyModel = require('../../../properties/models/property.model'); } catch (e) {}
  }
  return PropertyModel;
}
function getLead() {
  if (!PropertyLead) {
    try { PropertyLead = require('../../../auth/models/consultant/propertyLead.model'); } catch (e) {}
  }
  return PropertyLead;
}

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are XOBIA — the official multilingual AI voice assistant for XOTO, a PropTech company in UAE.

LANGUAGE (CRITICAL):
• ALWAYS respond in the EXACT SAME language as the user's current message.
• You can speak English, Arabic, Hindi, Urdu, French, Chinese, Spanish, or ANY language.
• Never switch language unless the user switches first.

VOICE STYLE:
• Keep responses SHORT — 2 to 3 sentences max. This is a voice conversation.
• Be warm, professional, confident.
• Format numbers naturally: say "3.5 million dirhams" not "3500000".

ABOUT XOTO:
• AI-first PropTech company in UAE (Dubai)
• Services: Landscaping, Interiors, Property Buy/Sell/Rent, Mortgages (XOTO Vault)
• Contact: care@xoto.ae | connect@xoto.ae

TOOLS:
• searchWebsite  → for questions about services, pages, features
• searchProperties → when user asks about buying, renting, or specific listings
• saveLead → when user gives their name and phone number
`.trim();

// ─── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    name: 'searchWebsite',
    description: 'Search XOTO website content and get page links.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' }
      },
      required: ['query']
    }
  },
  {
    type: 'function',
    name: 'searchProperties',
    description: 'Search real property listings from the database.',
    parameters: {
      type: 'object',
      properties: {
        unitType:        { type: 'string'  },
        location:        { type: 'string'  },
        maxPrice:        { type: 'number'  },
        minPrice:        { type: 'number'  },
        bedrooms:        { type: 'number'  },
        transactionType: { type: 'string'  }
      }
    }
  },
  {
    type: 'function',
    name: 'saveLead',
    description: 'Save customer contact details.',
    parameters: {
      type: 'object',
      properties: {
        name:        { type: 'string' },
        phone:       { type: 'string' },
        email:       { type: 'string' },
        requirement: { type: 'string' },
        city:        { type: 'string' }
      },
      required: ['phone']
    }
  }
];

// ─── Execute tool call ───────────────────────────────────────────────────────
async function executeTool(name, args) {
  try {
    if (name === 'searchWebsite') {
      const results = await searchWebsiteKnowledge(args.query || '');
      return { results, topLink: results[0] ? { url: results[0].url, title: results[0].title } : null };
    }

    if (name === 'searchProperties') {
      const P = getProperty();
      if (!P) return { properties: [], count: 0 };
      const q = {};
      if (args.unitType)        q.unitType        = new RegExp(args.unitType, 'i');
      if (args.transactionType) q.transactionType = args.transactionType;
      if (args.location)        q.$or = [{ locality: new RegExp(args.location, 'i') }, { projectName: new RegExp(args.location, 'i') }];
      if (args.maxPrice)        q.price_max = { $lte: Number(args.maxPrice) };
      if (args.minPrice)        q.price_min = { $gte: Number(args.minPrice) };
      if (args.bedrooms)        q.bedrooms  = Number(args.bedrooms);
      const props = await P.find(q).select('propertyName unitType bedrooms price_min price_max locality overview transactionType').limit(5).lean();
      return { properties: props, count: props.length };
    }

    if (name === 'saveLead') {
      const L = getLead();
      if (!L) return { success: false };
      const [first_name, ...rest] = (args.name || 'Guest').trim().split(' ');
      const lead = await L.create({
        type: 'ai_voice_enquiry',
        name: { first_name, last_name: rest.join(' ') || 'NA' },
        mobile: { country_code: '', number: args.phone },
        email: args.email || null,
        description: args.requirement || null,
        city: args.city || null,
        preferred_contact: 'whatsapp',
        status: 'submit'
      });
      return { success: true, lead_id: lead._id };
    }
  } catch (err) {
    return { error: err.message };
  }
  return { error: 'Unknown tool' };
}

// ─── Register Socket.io namespace ────────────────────────────────────────────
function registerXobiaVoice(io) {
  const ns = io.of('/xobia-voice');

  ns.on('connection', (socket) => {
    console.log('[XobiaVoice] client connected:', socket.id);

    let openaiWs = null;
    let sessionReady = false;

    // ── Open OpenAI Realtime WebSocket ───────────────────────────────────────
    function connectToOpenAI() {
      openaiWs = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime-mini',
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      );

      openaiWs.on('open', () => {
        console.log('[XobiaVoice] OpenAI WS open');

        // Configure session
        openaiWs.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions:    SYSTEM_PROMPT,
            tools:           TOOLS,
            tool_choice:     'auto',
            modalities:      ['text', 'audio'],
            voice:           'alloy',
            input_audio_format:  'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
              type:                'server_vad',
              threshold:           0.5,
              prefix_padding_ms:   300,
              silence_duration_ms: 600
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
            // Stream audio chunk to frontend
            socket.emit('audio_chunk', msg.delta);
            break;

          case 'response.audio.done':
            socket.emit('audio_done');
            socket.emit('status', 'listening');
            break;

          case 'response.audio_transcript.delta':
            socket.emit('transcript', msg.delta);
            break;

          case 'response.output_item.done':
            if (msg.item?.type === 'function_call') {
              const { name, arguments: argsStr, call_id } = msg.item;
              socket.emit('status', 'fetching');

              let args = {};
              try { args = JSON.parse(argsStr || '{}'); } catch { /* ignore */ }

              const result = await executeTool(name, args);

              // Surface navigation link to frontend
              if (name === 'searchWebsite' && result?.topLink) {
                socket.emit('nav_link', result.topLink);
              }

              // Send result back to OpenAI
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
        socket.emit('error', 'Connection error');
      });

      openaiWs.on('close', (code, reason) => {
        console.log('[XobiaVoice] OpenAI WS closed:', code, reason.toString());
        sessionReady = false;
        socket.emit('session_ended');
      });
    }

    // ── Socket.io events from frontend ───────────────────────────────────────

    socket.on('start_session', () => {
      if (openaiWs) {
        try { openaiWs.close(); } catch { /* ignore */ }
      }
      connectToOpenAI();
    });

    // Receive PCM16 audio chunks from browser and forward to OpenAI
    socket.on('audio_chunk', (base64Audio) => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN || !sessionReady) return;
      openaiWs.send(JSON.stringify({
        type:  'input_audio_buffer.append',
        audio: base64Audio
      }));
    });

    socket.on('stop_audio', () => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;
      openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
    });

    socket.on('end_session', () => {
      if (openaiWs) {
        try { openaiWs.close(); } catch { /* ignore */ }
        openaiWs = null;
      }
    });

    socket.on('disconnect', () => {
      console.log('[XobiaVoice] client disconnected:', socket.id);
      if (openaiWs) {
        try { openaiWs.close(); } catch { /* ignore */ }
        openaiWs = null;
      }
    });
  });
}

module.exports = { registerXobiaVoice };
