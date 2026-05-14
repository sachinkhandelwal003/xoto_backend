const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../../../config/s3Client');
const { generateNarrative } = require('../../../../utils/groq.util');
const Presentation = require('../model/presentation.model');

// ── 1. Generate AI Narrative ─────────────────────────────────────────────────
const generatePresentationNarrative = async (property, clientNotes, settings) => {
  const narrative = await generateNarrative(property, clientNotes, settings);
  return narrative;
};

// ── 2. Build HTML Content ────────────────────────────────────────────────────
const buildHtmlPresentation = (property, narrative, settings, agentProfile) => {
  const sections = settings.sections || {};

  const coverSlide = sections.cover ? `
    <div class="slide cover-slide">
      <div class="cover-overlay"></div>
      ${property.mainImage ? `<img src="${property.mainImage}" class="cover-bg" alt="Property"/>` : ''}
      <div class="cover-content">
        <div class="xoto-badge">XOTO GRID</div>
        <h1 class="property-title">${property.propertyName || 'Property'}</h1>
        <p class="property-location">📍 ${property.area || ''}, ${property.city || ''}</p>
        <div class="price-badge">${settings.currency} ${Number(property.price || 0).toLocaleString()}</div>
      </div>
      <div class="agent-card">
        <div class="agent-initials">${(agentProfile?.firstName?.[0] || 'A').toUpperCase()}</div>
        <div>
          <p class="agent-name">${agentProfile?.firstName || ''} ${agentProfile?.lastName || ''}</p>
          <p class="agent-phone">${agentProfile?.phone || ''}</p>
        </div>
      </div>
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>` : '';

  const overviewSlide = sections.projectDescription ? `
    <div class="slide overview-slide">
      <div class="slide-header">
        <h2>Property Overview</h2>
        <div class="header-line"></div>
      </div>
      <p class="overview-text">${narrative.propertyOverview || ''}</p>
      ${sections.keyHighlights ? `
      <div class="highlights-grid">
        ${(narrative.keyHighlights || []).map(h => `
          <div class="highlight-chip">
            <span class="check">✓</span> ${h}
          </div>`).join('')}
      </div>` : ''}
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>` : '';

  const gallerySlide = sections.gallery && property.photos?.length ? `
    <div class="slide gallery-slide">
      <div class="slide-header">
        <h2>Gallery</h2>
        <div class="header-line"></div>
      </div>
      <div class="photo-grid">
        ${(property.photos || []).slice(0, 6).map(photo => `
          <img src="${photo}" alt="Property" class="gallery-img"/>`).join('')}
      </div>
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>` : '';

  const priceSlide = sections.unitPrices && property.unitTypes?.length ? `
    <div class="slide price-slide">
      <div class="slide-header">
        <h2>Pricing & Units</h2>
        <div class="header-line"></div>
      </div>
      <table class="price-table">
        <thead>
          <tr>
            <th>Unit Type</th>
            <th>Area (${settings.areaUnit})</th>
            <th>Price (${settings.currency})</th>
          </tr>
        </thead>
        <tbody>
          ${(property.unitTypes || []).map(unit => `
            <tr>
              <td>${unit.type}</td>
              <td>${unit.area}</td>
              <td>${Number(unit.price || 0).toLocaleString()}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>` : '';

  const paymentSlide = sections.paymentPlan && property.paymentPlan?.length ? `
    <div class="slide payment-slide">
      <div class="slide-header">
        <h2>Payment Plan</h2>
        <div class="header-line"></div>
      </div>
      <div class="payment-rows">
        ${(property.paymentPlan || []).map(stage => `
          <div class="payment-row">
            <div class="payment-milestone">${stage.milestone}</div>
            <div class="payment-percent">${stage.percentage}%</div>
            <div class="payment-desc">${stage.description || ''}</div>
          </div>`).join('')}
      </div>
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>` : '';

  const locationSlide = sections.location ? `
    <div class="slide location-slide">
      <div class="slide-header">
        <h2>Location & Community</h2>
        <div class="header-line"></div>
      </div>
      <p class="location-text">${narrative.locationCommunity || ''}</p>
      <p class="investment-text">${narrative.investmentAngle || ''}</p>
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>` : '';

  const nextStepsSlide = `
    <div class="slide nextsteps-slide">
      <div class="slide-header">
        <h2>Next Steps</h2>
        <div class="header-line"></div>
      </div>
      <p class="nextsteps-text">${narrative.nextSteps || ''}</p>
      <div class="cta-buttons">
        ${agentProfile?.phone ? `<a href="tel:${agentProfile.phone}" class="cta-btn">📞 Call Us</a>` : ''}
        ${agentProfile?.whatsapp ? `<a href="https://wa.me/${agentProfile.whatsapp}" class="cta-btn cta-wa">💬 WhatsApp</a>` : ''}
      </div>
      <div class="slide-footer">Powered by Xoto GRID</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${property.propertyName || 'Property'} — Xoto GRID</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #f8f8f8; color: #111; }
    .slide { 
      position: relative; max-width: 900px; margin: 20px auto; 
      background: white; border-radius: 16px; padding: 48px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08); page-break-after: always;
    }
    .slide-header h2 { font-size: 24px; font-weight: 800; color: #5c039b; }
    .header-line { height: 3px; width: 48px; background: #5c039b; margin: 8px 0 24px; }
    .slide-footer { 
      position: absolute; bottom: 16px; right: 24px;
      font-size: 10px; color: #9ca3af; font-weight: 600;
    }

    /* Cover */
    .cover-slide { 
      background: linear-gradient(135deg, #5c039b, #7c3aed);
      color: white; min-height: 500px; overflow: hidden;
    }
    .cover-bg { 
      position: absolute; inset: 0; width: 100%; height: 100%; 
      object-fit: cover; opacity: 0.25; border-radius: 16px;
    }
    .cover-content { position: relative; z-index: 2; }
    .xoto-badge { 
      display: inline-block; background: rgba(255,255,255,0.2);
      padding: 4px 12px; border-radius: 20px; font-size: 11px;
      font-weight: 700; margin-bottom: 16px; letter-spacing: 2px;
    }
    .property-title { font-size: 36px; font-weight: 900; margin-bottom: 8px; }
    .property-location { font-size: 16px; opacity: 0.85; margin-bottom: 20px; }
    .price-badge {
      display: inline-block; background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      padding: 8px 20px; border-radius: 8px; font-size: 20px; font-weight: 800;
    }
    .agent-card {
      position: absolute; bottom: 40px; left: 48px; z-index: 2;
      display: flex; align-items: center; gap: 12px;
      background: rgba(255,255,255,0.15); padding: 12px 16px; border-radius: 12px;
    }
    .agent-initials {
      width: 40px; height: 40px; border-radius: 50%;
      background: rgba(255,255,255,0.3); display: flex;
      align-items: center; justify-content: center;
      font-weight: 800; font-size: 16px; color: white;
    }
    .agent-name { font-weight: 700; font-size: 14px; color: white; }
    .agent-phone { font-size: 12px; color: rgba(255,255,255,0.75); }
    .cover-slide .slide-footer { color: rgba(255,255,255,0.5); }

    /* Overview */
    .overview-text { font-size: 15px; line-height: 1.8; color: #374151; margin-bottom: 24px; }
    .highlights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .highlight-chip { 
      background: #f5f3ff; border: 1px solid #ddd6fe;
      padding: 10px 14px; border-radius: 10px; font-size: 13px;
      color: #5b21b6; font-weight: 500;
    }
    .check { font-weight: 800; margin-right: 6px; }

    /* Gallery */
    .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .gallery-img { width: 100%; height: 160px; object-fit: cover; border-radius: 8px; }

    /* Price Table */
    .price-table { width: 100%; border-collapse: collapse; }
    .price-table th { 
      background: #5c039b; color: white; padding: 12px 16px; 
      font-size: 12px; text-align: left; font-weight: 700;
    }
    .price-table td { 
      padding: 12px 16px; border-bottom: 1px solid #f3f4f6; 
      font-size: 14px; color: #374151;
    }
    .price-table tr:hover td { background: #faf5ff; }

    /* Payment Plan */
    .payment-row { 
      display: grid; grid-template-columns: 2fr 1fr 2fr;
      padding: 14px; border-bottom: 1px solid #f3f4f6;
      align-items: center;
    }
    .payment-percent { 
      font-size: 20px; font-weight: 800; color: #5c039b; text-align: center;
    }
    .payment-milestone { font-weight: 600; font-size: 14px; }
    .payment-desc { font-size: 12px; color: #6b7280; }

    /* Location */
    .location-text { font-size: 15px; line-height: 1.8; color: #374151; margin-bottom: 16px; }
    .investment-text { 
      font-size: 14px; line-height: 1.7; color: #5b21b6;
      background: #f5f3ff; padding: 16px; border-radius: 10px;
      border-left: 3px solid #5c039b;
    }

    /* Next Steps */
    .nextsteps-slide { background: linear-gradient(135deg, #5c039b, #7c3aed); color: white; }
    .nextsteps-slide .slide-header h2 { color: white; }
    .nextsteps-slide .header-line { background: rgba(255,255,255,0.4); }
    .nextsteps-text { font-size: 16px; line-height: 1.8; opacity: 0.9; margin-bottom: 32px; }
    .cta-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
    .cta-btn { 
      padding: 12px 24px; background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3); color: white;
      border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px;
    }
    .cta-wa { background: rgba(37,211,102,0.3); border-color: rgba(37,211,102,0.4); }
    .nextsteps-slide .slide-footer { color: rgba(255,255,255,0.5); }

    @media print { .slide { margin: 0; border-radius: 0; box-shadow: none; } }
  </style>
</head>
<body>
  ${coverSlide}
  ${overviewSlide}
  ${gallerySlide}
  ${priceSlide}
  ${paymentSlide}
  ${locationSlide}
  ${nextStepsSlide}
</body>
</html>`;
};

// ── 3. Upload to S3 ──────────────────────────────────────────────────────────
const uploadToS3 = async (htmlContent, fileName) => {
  const key = `presentations/${fileName}.html`;

  await s3.send(new PutObjectCommand({
    Bucket:      process.env.AWS_S3_BUCKET,
    Key:         key,
    Body:        htmlContent,
    ContentType: 'text/html',
  }));

  const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { key, url };
};

// ── 4. Save Presentation to DB ───────────────────────────────────────────────
const savePresentation = async ({
  leadId, propertyId, agentId,
  settings, clientNotes, narrative,
  s3Key, s3Url, title,
}) => {
  const trackingToken = uuidv4();

  const presentation = await Presentation.create({
    leadId, propertyId, agentId,
    settings, clientNotes, narrative,
    s3Key, s3Url, title,
    trackingToken,
    views: [],
    engagementScore: 0,
    status: 'active',
  });

  return presentation;
};

// ── 5. Track a View ──────────────────────────────────────────────────────────
const trackView = async (trackingToken, requestData) => {
  const ua = requestData.userAgent || '';
  const device = /mobile/i.test(ua) ? 'Mobile' : /tablet/i.test(ua) ? 'Tablet' : 'Desktop';

  const presentation = await Presentation.findOneAndUpdate(
    { trackingToken },
    {
      $push: {
        views: {
          timestamp: new Date(),
          ip:        requestData.ip,
          device,
          userAgent: ua,
        }
      },
      $inc: { engagementScore: 15 },
    },
    { new: true }
  );

  return presentation;
};

// ── 6. Get Presentation Views ────────────────────────────────────────────────
const getPresentationViews = async (presentationId, agentId) => {
  const presentation = await Presentation.findOne({
    _id:     presentationId,
    agentId,
  }).select('views engagementScore title trackingToken createdAt');

  return presentation;
};

module.exports = {
  generatePresentationNarrative,
  buildHtmlPresentation,
  uploadToS3,
  savePresentation,
  trackView,
  getPresentationViews,
};