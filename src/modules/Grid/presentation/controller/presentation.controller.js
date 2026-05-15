const {
  generatePresentationNarrative,
  buildHtmlPresentation,
  uploadToS3,
  savePresentation: savePresentationService,   // ← rename karo
  trackView,
  getPresentationViews,
} = require('./presentation.service');
const Presentation = require('../model/presentation.model');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../../../../config/s3Client');

// ── POST /api/presentation/generate-narrative ────────────────────────────────
// Step 1: Sirf AI narrative generate karo (preview ke liye)
const generateNarrative = async (req, res) => {
  try {
    const { property, clientNotes, settings } = req.body;

    if (!property || !settings) {
      return res.status(400).json({ success: false, message: 'property and settings required' });
    }

    const narrative = await generatePresentationNarrative(property, clientNotes || {}, settings);

    res.json({ success: true, data: narrative });
  } catch (err) {
    console.error('Narrative generation error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate narrative', error: err.message });
  }
};

// ── POST /api/presentation/save ──────────────────────────────────────────────
// Step 2: HTML build karo, S3 upload karo, DB mein save karo
const savePresentation = async (req, res) => {
  try {
    const {
      leadId, propertyId,
      property, narrative,
      settings, clientNotes,
      agentProfile,
    } = req.body;

    const agentId = req.user._id; // auth middleware se

    if (!property || !narrative || !settings) {
      return res.status(400).json({ success: false, message: 'property, narrative, settings required' });
    }

    // 1. HTML build karo
    const htmlContent = buildHtmlPresentation(property, narrative, settings, agentProfile || {});

    // 2. S3 pe upload karo
    const fileName = `${agentId}_${Date.now()}`;
    const { key, url } = await uploadToS3(htmlContent, fileName);

    // 3. DB mein save karo
    const title = `${property.propertyName} — ${clientNotes?.clientName || 'Client'}`;
    const presentation = await savePresentation({
      leadId, propertyId, agentId,
      settings, clientNotes: clientNotes || {},
      narrative, s3Key: key, s3Url: url, title,
    });

    // 4. Tracking URL banao
    const trackingUrl = `${process.env.FRONTEND_URL}/p/${presentation.trackingToken}`;

    res.json({
      success: true,
      data: {
        presentationId: presentation._id,
        trackingToken:  presentation.trackingToken,
        trackingUrl,
        s3Url:          url,
      }
    });
  } catch (err) {
    console.error('Save presentation error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save presentation', error: err.message });
  }
};

// ── GET /api/presentation/track/:token ──────────────────────────────────────
// Client jab link open kare — view log karo aur HTML serve karo
const trackAndServe = async (req, res) => {
  try {
    const { token } = req.params;

    const presentation = await Presentation.findOne({ trackingToken: token });

    if (!presentation) {
      return res.status(404).send('<h1>Presentation not found</h1>');
    }

    // View track karo
    await trackView(token, {
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
    });

    // S3 se HTML fetch karo
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key:    presentation.s3Key,
    }));

    // Stream to response
    res.setHeader('Content-Type', 'text/html');
    s3Response.Body.pipe(res);

  } catch (err) {
    console.error('Track and serve error:', err.message);
    res.status(500).send('<h1>Error loading presentation</h1>');
  }
};

// ── GET /api/presentation/views/:presentationId ──────────────────────────────
// Agent ko views dikhao
const getViews = async (req, res) => {
  try {
    const agentId = req.user._id;
    const data = await getPresentationViews(req.params.presentationId, agentId);

    if (!data) {
      return res.status(404).json({ success: false, message: 'Presentation not found' });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/presentation/my ─────────────────────────────────────────────────
// Agent ki saari presentations
const getMyPresentations = async (req, res) => {
  try {
    const agentId = req.user._id;
    const { leadId, page = 1, limit = 10 } = req.query;

    const query = { agentId };
    if (leadId) query.leadId = leadId;

    const presentations = await Presentation.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-s3Key'); // s3 key frontend ko nahi dikhana

    const total = await Presentation.countDocuments(query);

    res.json({
      success: true,
      data: presentations,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/presentation/:id ─────────────────────────────────────────────
const deletePresentation = async (req, res) => {
  try {
    const agentId = req.user._id;
    const presentation = await Presentation.findOne({
      _id: req.params.id, agentId
    });

    if (!presentation) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    await Presentation.deleteOne({ _id: presentation._id });

    res.json({ success: true, message: 'Presentation deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
// ── POST /api/presentation/save ──────────────────────────────────────────────
const savePresentationHandler = async (req, res) => {   // ← naam badlo
  try {
    const {
      leadId, propertyId,
      property, narrative,
      settings, clientNotes,
      agentProfile,
    } = req.body;

    const agentId = req.user._id;

    if (!property || !narrative || !settings) {
      return res.status(400).json({ success: false, message: 'property, narrative, settings required' });
    }

    const htmlContent = buildHtmlPresentation(property, narrative, settings, agentProfile || {});

    const fileName = `${agentId}_${Date.now()}`;
    const { key, url } = await uploadToS3(htmlContent, fileName);

    const title = `${property.propertyName} — ${clientNotes?.clientName || 'Client'}`;

    // ✅ renamed service function use karo
    const presentation = await savePresentationService({
      leadId, propertyId, agentId,
      settings, clientNotes: clientNotes || {},
      narrative, s3Key: key, s3Url: url, title,
    });

    const trackingUrl = `${process.env.FRONTEND_URL}/p/${presentation.trackingToken}`;

    res.json({
      success: true,
      data: {
        presentationId: presentation._id,
        trackingToken:  presentation.trackingToken,
        trackingUrl,
        s3Url:          url,
      }
    });
  } catch (err) {
    console.error('Save presentation error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save presentation', error: err.message });
  }
};

module.exports = {
  generateNarrative,
  savePresentationHandler,
  trackAndServe,
  getViews,
  getMyPresentations,
  deletePresentation,
};

