const {
  generatePresentationNarrative,
  buildHtmlPresentation,
  uploadToS3,
  savePresentation: savePresentationService,   // ← rename karo
  trackView,
  getPresentationViews,
  generatePdfFromPresentation,
} = require('./presentation.service');
const Presentation = require('../model/presentation.model');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../../../../config/s3Client');
const Agent = require('../../Agent/models/agent');
const Advisor = require('../../Advisor/model');
const PropertyInventory = require('../../../properties/models/property.inventory.model');
const Property = require('../../../properties/models/property.model');
const GridNotification = require('../../Notification/GridNotificationmodal').default;
const { logAudit } = require('../../../vault/services/auditLog.service.js');

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

const resolvePresentationCreator = async (userId, submittedProfile = {}) => {
  const clean = (value) => String(value || '').trim();
  const roleText = clean(submittedProfile.userType || submittedProfile.role?.name || submittedProfile.role).toLowerCase();

  const fromAgent = async () => {
    const agent = await Agent.findById(userId)
      .select('first_name last_name fullName email phone_number agency')
      .populate('agency', 'companyName agency_name agencyName')
      .lean();
    if (!agent) return null;

    return {
      ...submittedProfile,
      first_name: agent.first_name,
      last_name: agent.last_name,
      name: agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim(),
      phone: agent.phone_number,
      phone_number: agent.phone_number,
      email: agent.email,
      userType: 'agent',
      agencyName: agent.agency?.companyName || agent.agency?.agency_name || agent.agency?.agencyName || submittedProfile.agencyName,
    };
  };

  const fromAdvisor = async () => {
    const advisor = await Advisor.findById(userId)
      .select('firstName lastName email phone employeeId')
      .lean();
    if (!advisor) return null;

    return {
      ...submittedProfile,
      firstName: advisor.firstName,
      lastName: advisor.lastName,
      name: `${advisor.firstName || ''} ${advisor.lastName || ''}`.trim(),
      phone: advisor.phone,
      email: advisor.email,
      employeeId: advisor.employeeId,
      userType: 'advisor',
    };
  };

  if (roleText.includes('agent')) return (await fromAgent()) || submittedProfile;
  if (roleText.includes('advisor')) return (await fromAdvisor()) || submittedProfile;

  return (await fromAgent()) || (await fromAdvisor()) || submittedProfile;
};

const enrichPropertyInventory = async (propertyId, property) => {
  const resolvedPropertyId = propertyId || property?._id || property?.id;
  if (!resolvedPropertyId) return property;

  try {
    const dbProperty = await Property.findById(resolvedPropertyId).lean();
    const inventory = await PropertyInventory.find({ propertyId: resolvedPropertyId })
      .sort({ unitType: 1, bedroomType: 1, price: 1, unitNumber: 1 })
      .select('unitNumber buildingName floorNumber unitType bedroomType bedrooms bathrooms area areaUnit price currency status paymentPlan')
      .lean();

    const mergedProperty = {
      ...(dbProperty || {}),
      ...(property || {}),
    };

    if ((!Array.isArray(mergedProperty.amenities) || !mergedProperty.amenities.length) && dbProperty?.amenities?.length) {
      mergedProperty.amenities = dbProperty.amenities;
    }

    if ((!Array.isArray(mergedProperty.paymentPlan) || !mergedProperty.paymentPlan.length) && dbProperty?.paymentPlan?.length) {
      mergedProperty.paymentPlan = dbProperty.paymentPlan;
    }

    if ((!mergedProperty.facilities || !Object.keys(mergedProperty.facilities).length) && dbProperty?.facilities) {
      mergedProperty.facilities = dbProperty.facilities;
    }

    if ((!mergedProperty.developerDetails || !Object.keys(mergedProperty.developerDetails).length) && dbProperty?.developerDetails) {
      mergedProperty.developerDetails = dbProperty.developerDetails;
    }

    return {
      ...mergedProperty,
      ...(inventory.length ? { inventory } : {}),
    };
  } catch (err) {
    console.warn('Presentation property enrichment failed:', err.message);
    return property;
  }
};




// ── GET /api/presentation/track/:token ──────────────────────────────────────
// Client jab link open kare — view log karo aur HTML serve karo
const servePresentationHtml = async (req, res, presentation, token) => {
  try {
    // S3 se HTML fetch karo
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key:    presentation.s3Key,
    }));

    // Stream to string
    const chunks = [];
    for await (const chunk of s3Response.Body) chunks.push(chunk);
    let htmlContent = Buffer.concat(chunks).toString('utf-8');

    // ✅ PDF download button inject karo — </body> se pehle
const pdfDownloadUrl = `${req.baseUrl}/pdf/${encodeURIComponent(token)}`;
const presentationThemePatch = `
<style id="presentation-theme-patch">
  .slide-header {
    min-height: 92px !important;
    padding: 22px 80px !important;
    align-items: center !important;
    gap: 30px !important;
    background: linear-gradient(90deg, #4A027C, #26003f) !important;
    box-shadow: 0 16px 38px rgba(74,2,124,0.18) !important;
  }
  .slide-header::after {
    left: 80px !important;
    right: 80px !important;
    bottom: 0 !important;
    width: auto !important;
    height: 2px !important;
    background: linear-gradient(90deg, #C5A059, rgba(197,160,89,0.18)) !important;
  }
  .slide-title {
    color: #fff !important;
    font-size: 42px !important;
  }
  .slide-title em {
    color: #C5A059 !important;
  }
  .header-logo {
    height: 38px !important;
    max-width: 190px !important;
    opacity: 1 !important;
    background: transparent !important;
    border-radius: 0 !important;
    padding: 0 !important;
  }
  .content-area {
    padding-top: 34px !important;
  }
</style>`;
const pdfDownloadHtml = `
<style>
  #pdf-fab {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #4A027C, #7C3AED);
    color: white;
    border: none;
    padding: 14px 32px;
    border-radius: 50px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    cursor: pointer;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 8px 32px rgba(74,2,124,0.4);
    transition: all 0.3s;
    white-space: nowrap;
  }
  #pdf-fab:hover {
    transform: translateX(-50%) translateY(-2px);
    box-shadow: 0 12px 40px rgba(74,2,124,0.5);
  }

  /* ✅ Print mode — saare slides dikhao, ek ek page pe */
  @media print {
    #pdf-fab  { display: none !important; }
    .controls { display: none !important; }
    .hint-text { display: none !important; }
    #play-status { display: none !important; }

    body {
      background: white !important;
      overflow: visible !important;
      height: auto !important;
    }

    #deck-container {
      position: static !important;
      width: 1280px !important;
      height: auto !important;
      overflow: visible !important;
    }

    .slide {
      position: static !important;
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      transition: none !important;
      display: flex !important;
      width: 1280px !important;
      height: 720px !important;
      page-break-after: always !important;
      break-after: page !important;
    }

    .slide-inner {
      width: 1280px !important;
      height: 720px !important;
    }
  }
</style>

<button type="button" id="pdf-fab">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M12 16l-5-5 1.41-1.41L11 13.17V4h2v9.17l2.59-2.58L17 11l-5 5zm-6 2h12v2H6v-2z"/>
  </svg>
  Download PDF
</button>

<script>
  const downloadPdf = () => {
    const btn = document.getElementById('pdf-fab');
    if (!btn) return;
    btn.innerHTML = 'Preparing PDF...';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    window.location.href = '${pdfDownloadUrl}';

    setTimeout(() => {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 16l-5-5 1.41-1.41L11 13.17V4h2v9.17l2.59-2.58L17 11l-5 5zm-6 2h12v2H6v-2z"/></svg> Download PDF';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }, 2500);
  };

  document.getElementById('pdf-fab')?.addEventListener('click', downloadPdf);

  document.querySelectorAll('.controls .nav-btn').forEach((button, index) => {
    if (button.dataset.action) return;

    button.addEventListener('click', () => {
      if (index === 0 && typeof window.toggleAutoPlay === 'function') window.toggleAutoPlay();
      if (index === 1 && typeof window.prevSlide === 'function') window.prevSlide();
      if (index === 2 && typeof window.nextSlide === 'function') window.nextSlide();
    });
  });
</script>`;

    // </body> se pehle inject karo
    htmlContent = htmlContent.replace('</head>', `${presentationThemePatch}\n</head>`);
    htmlContent = htmlContent.replace('</body>', `${pdfDownloadHtml}\n</body>`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
        "img-src 'self' data: blob: https: http:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')
    );
    res.send(htmlContent);

  } catch (err) {
    console.error('Presentation serve error:', err.message);
    res.status(500).send('<h1>Error loading presentation</h1>');
  }
};

const trackAndServe = async (req, res) => {
  try {
    const { token } = req.params;

    const presentation = await Presentation.findOne({ trackingToken: token });
    if (!presentation) {
      return res.status(404).send('<h1>Presentation not found</h1>');
    }

    const isPreview = ['1', 'true', 'yes'].includes(String(req.query.preview || '').toLowerCase());
    if (!isPreview) {
      await trackView(token, {
        ip:        req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    return servePresentationHtml(req, res, presentation, token);
  } catch (err) {
    console.error('Track and serve error:', err.message);
    return res.status(500).send('<h1>Error loading presentation</h1>');
  }
};

const previewAndServe = async (req, res) => {
  try {
    const { token } = req.params;
    const userId = String(req.user?._id || '');

    const presentation = await Presentation.findOne({ trackingToken: token });
    if (!presentation) {
      return res.status(404).send('<h1>Presentation not found</h1>');
    }

    if (String(presentation.agentId) !== userId) {
      return res.status(403).send('<h1>Not allowed to preview this presentation</h1>');
    }

    return servePresentationHtml(req, res, presentation, token);
  } catch (err) {
    console.error('Preview presentation error:', err.message);
    return res.status(500).send('<h1>Error loading presentation preview</h1>');
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
    let agentIds = [req.user._id];
    const { leadId, page = 1, limit = 10 } = req.query;

    if (req.user.constructor.modelName === 'Agency') {
      const Agent = require('../../Agent/models/agent');
      agentIds = await Agent.find({ agency: req.user._id }).distinct('_id');
    }

    const query = { agentId: { $in: agentIds } };
    if (leadId) query.leadId = leadId;

    const presentations = await Presentation.find(query)
      .populate('leadId', 'contact_info name status')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-s3Key')
      .lean(); // s3 key frontend ko nahi dikhana

    const propertyIds = presentations
      .map((presentation) => presentation.propertyId)
      .filter(Boolean)
      .map((id) => id.toString());

    if (propertyIds.length > 0) {
      const LegacyProperty = require('../../../properties/models/PropertyModel');
      const GridProperty = require('../../../properties/models/property.model');

      const [legacyProperties, gridProperties] = await Promise.all([
        LegacyProperty.find({ _id: { $in: propertyIds } })
          .select('propertyName area price bedrooms bathrooms mainLogo photos')
          .lean(),
        GridProperty.find({ _id: { $in: propertyIds } })
          .select('propertyName projectName area locality price price_min price_max bedrooms bathrooms mainLogo photos media')
          .lean(),
      ]);

      const propertyMap = new Map(
        [...legacyProperties, ...gridProperties].map((property) => [
          property._id.toString(),
          property,
        ])
      );

      presentations.forEach((presentation) => {
        const propertyId = presentation.propertyId?.toString();
        presentation.propertyId = propertyMap.get(propertyId) || presentation.propertyId;
      });
    }

    const total = await Presentation.countDocuments(query);

    const apiBaseUrl = `${process.env.BACKEND_URL}/api/presentation`;
    const presentationRows = presentations.map((presentation) => {
      const row = presentation.toObject ? presentation.toObject() : presentation;
      const trackingUrl = `${apiBaseUrl}/track/${row.trackingToken}`;
      return {
        ...row,
        trackingUrl,
        previewUrl: `${trackingUrl}?preview=1`,
      };
    });

    res.json({
      success: true,
      data: presentationRows,
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

    const resolvedAgentProfile = await resolvePresentationCreator(agentId, agentProfile || {});
    const propertyWithInventory = await enrichPropertyInventory(propertyId, property);
    const htmlContent = await buildHtmlPresentation(propertyWithInventory, narrative, settings, resolvedAgentProfile);

    const fileName = `${agentId}_${Date.now()}`;
    const { key, url } = await uploadToS3(htmlContent, fileName);

    const title = `${property.propertyName} — ${clientNotes?.clientName || 'Client'}`;

    // ✅ renamed service function use karo
    const presentation = await savePresentationService({
      leadId, propertyId, agentId,
      settings, clientNotes: clientNotes || {},
      narrative, s3Key: key, s3Url: url, title,
    });

    // Log PPT generation audit
    logAudit({
      entityType:      'PRESENTATION',
      entityId:        presentation._id,
      entityRef:       presentation.trackingToken,
      action:          'PPT_GENERATED',
      performedBy:     agentId,
      performedByName: resolvedAgentProfile?.name || resolvedAgentProfile?.firstName || 'Unknown',
      performedByRole: resolvedAgentProfile?.userType || 'agent',
      visibleToRoles:  ['grid_admin', 'superadmin'],
      ipAddress:       req.ip || req.headers['x-forwarded-for'] || null,
      userAgent:       req.headers['user-agent'] || null,
      metadata: {
        title,
        propertyName:  property?.propertyName || null,
        propertyId:    propertyId || null,
        leadId:        leadId || null,
        clientName:    clientNotes?.clientName || null,
        theme:         settings?.theme || null,
      },
    });

    // const trackingUrl = `${process.env.FRONTEND_URL}/p/${presentation.trackingToken}`;
const trackingUrl = `${process.env.BACKEND_URL}/api/presentation/track/${presentation.trackingToken}`;
const previewUrl = `${trackingUrl}?preview=1`;
res.json({
  success: true,
  data: {
    presentationId: presentation._id,
    trackingToken:  presentation.trackingToken,
    trackingUrl,        // backend tracking link — share karo
    previewUrl,         // dashboard preview link, view count nahi badhega
    s3Url:          url, // S3 direct link — preview ke liye
  }
});
// ✅ PRD 3.6/8.1 — Check presentation balance after save
try {
  const Agency = require('../../agency/models/index.js');
  const agency = await Agency.findOne({ agents: agentId });
  if (agency) {
    const balance = Math.max(0, (agency.presentationQuota || 0) - (agency.presentationsUsed || 0));
    const LOW_THRESHOLD = 10;

    if (balance <= LOW_THRESHOLD && balance > 0) {
      await GridNotification.create({
        eventType:      'LOW_PRESENTATION_BALANCE',
        title:          `Low Presentation Balance ⚠️ (${balance} remaining)`,
        message:        `Your agency has only ${balance} presentation(s) remaining on the ${agency.subscriptionTier} plan. Consider upgrading to avoid service interruption.`,
        entityId:       agency._id,
        entityModel:    'Agency',
        recipientId:    agency._id,
        recipientModel: 'Agency',
        recipientRole:  'partner',
        createdByName:  'System',
        createdByRole:  'system',
      });
    }

    if (balance === 0) {
      await GridNotification.create({
        eventType:      'SUBSCRIPTION_TIER_LIMIT_REACHED',
        title:          'Presentation Quota Exhausted 🚫',
        message:        `Your agency has reached the presentation limit on the ${agency.subscriptionTier} plan. Upgrade your subscription to generate more presentations.`,
        entityId:       agency._id,
        entityModel:    'Agency',
        recipientId:    agency._id,
        recipientModel: 'Agency',
        recipientRole:  'partner',
        createdByName:  'System',
        createdByRole:  'system',
      });
    }
  }
} catch (quotaErr) {
  console.error('Quota notification failed:', quotaErr.message);
}
  } catch (err) {
    console.error('Save presentation error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save presentation', error: err.message });
  }
};



const proxyImage = async (req, res) => {
  try {
    const key = decodeURIComponent(req.query.key);
    
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    
    const s3Response = await s3.send(command);
    
    res.setHeader('Content-Type', s3Response.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    s3Response.Body.pipe(res);
  } catch (err) {
    res.status(404).send('Image not found');
  }
};

const downloadPdf = async (req, res) => {
  try {
    const { token } = req.params;
    const pdfBuffer = await generatePdfFromPresentation(token);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="xoto-presentation-${token}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(pdfBuffer);

  } catch (err) {
    console.error('PDF error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  generateNarrative,
  savePresentationHandler,
  trackAndServe,
  previewAndServe,
  getViews,
  getMyPresentations,
  deletePresentation,
  proxyImage,
  downloadPdf,
};

