const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../../../config/s3Client');
const { generateNarrative } = require('../../../../utils/groq.util');
const Presentation = require('../model/presentation.model');
const Developer = require('../../Developer/models/developer.model');

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const contentTypeFromKey = (key) => {
  const ext = String(key || '').split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
};

const getS3ImageMeta = (src) => {
  if (!src || src.startsWith('data:')) return null;

  try {
    const parsed = new URL(src);
    const proxyKey = parsed.searchParams.get('key');
    if (proxyKey) {
      return {
        bucket: process.env.AWS_S3_BUCKET,
        key: decodeURIComponent(proxyKey),
      };
    }

    if (parsed.hostname.includes('.s3.')) {
      return {
        bucket: parsed.hostname.split('.s3.')[0],
        key: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
      };
    }
  } catch (err) {
    return {
      bucket: process.env.AWS_S3_BUCKET,
      key: String(src).replace(/^\//, ''),
    };
  }

  return null;
};

const imageSrcToDataUri = async (src) => {
  const s3Meta = getS3ImageMeta(src);
  const optimizeImageBuffer = async (buffer, contentType) => {
    if (!buffer?.length || contentType === 'image/svg+xml') {
      return { buffer, contentType };
    }

    if (buffer.length < 250 * 1024) {
      return { buffer, contentType };
    }

    try {
      const sharp = require('sharp');
      const optimized = await sharp(buffer)
        .rotate()
        .resize({
          width: 1600,
          height: 1000,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();

      return { buffer: optimized, contentType: 'image/jpeg' };
    } catch (err) {
      console.warn('PDF image optimization skipped:', err.message);
      return { buffer, contentType };
    }
  };

  if (s3Meta?.bucket && s3Meta?.key) {
    const response = await s3.send(new GetObjectCommand({
      Bucket: s3Meta.bucket,
      Key: s3Meta.key,
    }));
    const buffer = await streamToBuffer(response.Body);
    const contentType = response.ContentType || contentTypeFromKey(s3Meta.key);
    const optimized = await optimizeImageBuffer(buffer, contentType);
    return `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`;
  }

  if (/^https?:\/\//i.test(src) && typeof fetch === 'function') {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Image fetch failed ${response.status}: ${src}`);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || contentTypeFromKey(src);
    const optimized = await optimizeImageBuffer(Buffer.from(arrayBuffer), contentType);
    return `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`;
  }

  return src;
};

const inlinePresentationImages = async (htmlContent) => {
  const imageSources = [...htmlContent.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1])
    .filter(Boolean);

  const uniqueSources = [...new Set(imageSources)];
  const replacements = new Map();
  const concurrency = 3;

  for (let i = 0; i < uniqueSources.length; i += concurrency) {
    const batch = uniqueSources.slice(i, i + concurrency);
    await Promise.all(batch.map(async (src) => {
      try {
        replacements.set(src, await imageSrcToDataUri(src));
      } catch (err) {
        console.warn(`PDF image inline failed for ${src}:`, err.message);
        replacements.set(src, src);
      }
    }));

    if (global.gc) {
      try {
        global.gc();
      } catch (err) {
        // ignore gc availability differences
      }
    }
  }

  return htmlContent.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, before, src, after) => {
    return `${before}${replacements.get(src) || src}${after}`;
  });
};

// ── 1. Generate AI Narrative ─────────────────────────────────────────────────
const generatePresentationNarrative = async (property, clientNotes, settings) => {
  const narrative = await generateNarrative(property, clientNotes, settings);
  return narrative;
};

const generatePdfFromPresentation = async (trackingToken) => {
  const puppeteer = require('puppeteer');
  let browser;

  const presentation = await Presentation.findOne({ trackingToken });
  if (!presentation) throw new Error('Presentation not found');

  // S3 se HTML fetch karo
  const s3Response = await s3.send(new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key:    presentation.s3Key,
  }));

  const htmlContent = (await streamToBuffer(s3Response.Body)).toString('utf-8');
  const printableHtmlContent = await inlinePresentationImages(htmlContent);

  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      if ((resourceType === 'font' || resourceType === 'stylesheet') && /googleapis|gstatic|cdnjs/i.test(url)) {
        request.abort();
        return;
      }
      request.continue();
    });

    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(printableHtmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForFunction(
      'Array.from(document.images).every(img => img.complete)',
      { timeout: 5000 }
    ).catch(() => {});

    await page.addStyleTag({
      content: `
      @page {
        size: 1280px 720px;
        margin: 0;
      }

      @media print {
        html,
        body {
          width: 1280px !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #fff !important;
          display: block !important;
        }

        #pdf-fab,
        #download-fab-wrap,
        .controls,
        .hint-text,
        #play-status {
          display: none !important;
        }

        #deck-container {
          width: 1280px !important;
          height: auto !important;
          position: static !important;
          overflow: visible !important;
          background: #fff !important;
        }

        .slide {
          position: relative !important;
          inset: auto !important;
          width: 1280px !important;
          height: 720px !important;
          min-width: 1280px !important;
          min-height: 720px !important;
          max-width: 1280px !important;
          max-height: 720px !important;
          display: flex !important;
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          transition: none !important;
          z-index: auto !important;
          overflow: hidden !important;
          page-break-after: always !important;
          break-after: page !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .slide:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }

        .slide-inner {
          width: 1280px !important;
          height: 720px !important;
          min-width: 1280px !important;
          min-height: 720px !important;
          max-width: 1280px !important;
          max-height: 720px !important;
          margin: 0 !important;
          transform: none !important;
          overflow: hidden !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `,
    });

    await page.emulateMediaType('print');
    const pdfBuffer = await page.pdf({
      width: '1280px',
      height: '720px',
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 60000,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

// ── 2. Build HTML Content ────────────────────────────────────────────────────
const buildHtmlPresentation = async (property, narrative, settings, agentProfile) => {
  const sections = settings.sections || {};
  const currency = settings.currency || 'AED';
  const areaUnit = settings.areaUnit || 'sqft';

  const XOTO_LOGO = 'https://xotostaging.s3.me-central-1.amazonaws.com/properties/1778837544857-logogrid.png';

  const toFullUrl = (url) => {
    if (!url) return null;
    let key;
    if (url.startsWith('http')) {
      try {
        const urlObj = new URL(url);
        key = urlObj.pathname.replace(/^\//, '');
      } catch (e) { key = url; }
    } else {
      key = url.replace(/^\//, '');
    }
    return `${process.env.BACKEND_URL}/api/presentation/image-proxy?key=${encodeURIComponent(key)}`;
  };

  const getDeveloperDocument = async () => {
    const candidate = property.developerId || property.developer_id || property.developer;
    if (!candidate || typeof candidate === 'object') return candidate || null;
    if (!/^[a-f\d]{24}$/i.test(String(candidate))) return null;

    try {
      return await Developer.findById(candidate).lean();
    } catch (err) {
      console.warn('Developer lookup failed for presentation:', err.message);
      return null;
    }
  };
  const developerDoc = await getDeveloperDocument();

  const fmt = (n) => n > 0 ? Number(n).toLocaleString() : null;
  const price = fmt(property.price_min || property.price || 0);
  const priceMax = fmt(property.price_max || 0);
  const priceStr = price && priceMax
    ? `${currency} ${price} – ${priceMax}`
    : price ? `${currency} ${price}` : 'On Request';

  const loc = [property.area, property.city, property.country].filter(Boolean).join(', ');

  const unitTypes = Array.isArray(property.unitTypes) ? property.unitTypes : [];

  const amenitiesList = (() => {
    const list = [];
    if (Array.isArray(property.amenities)) list.push(...property.amenities.filter(Boolean));
    if (property.facilities && typeof property.facilities === 'object') {
      Object.entries(property.facilities).forEach(([k, v]) => {
        if (v === true) list.push(k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim());
      });
    }
    return [...new Set(list)];
  })();

  const photos = (() => {
    const all = [];
    if (property.mainImage) all.push(property.mainImage);
    if (Array.isArray(property.images)) all.push(...property.images);
    else if (property.images && typeof property.images === 'object') {
      Object.values(property.images).forEach(arr => {
        if (Array.isArray(arr)) all.push(...arr);
        else if (arr) all.push(arr);
      });
    }
    if (Array.isArray(property.photos)) all.push(...property.photos);
    else if (property.photos && typeof property.photos === 'object') {
      Object.values(property.photos).forEach(arr => { if (Array.isArray(arr)) all.push(...arr); });
    }
    return [...new Set(all)].map(toFullUrl).filter(Boolean);
  })();

  const formatDateDDMMYY = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };
  const formatCompletionDate = (completion) => {
    if (!completion) return 'On Request';
    if (typeof completion === 'string' || completion instanceof Date) {
      return formatDateDDMMYY(completion) || completion;
    }

    const directDate = completion.fullDate || completion.date;
    if (directDate) return formatDateDDMMYY(directDate) || String(directDate);

    if (completion.quarter && completion.year) {
      const quarterEnd = {
        Q1: `03/31/${completion.year}`,
        Q2: `06/30/${completion.year}`,
        Q3: `09/30/${completion.year}`,
        Q4: `12/31/${completion.year}`,
      }[String(completion.quarter).toUpperCase()];
      return formatDateDDMMYY(quarterEnd) || `${completion.quarter} ${completion.year}`;
    }

    return Object.values(completion).filter(Boolean).join(' ') || 'On Request';
  };
  const completionDate = formatCompletionDate(property.completionDate);
  const developerName = property.developerCompanyName
    || property.companyName
    || developerDoc?.companyName
    || property.developerName
    || property.developer_name
    || property.developer?.companyName
    || agentProfile?.companyName
    || developerDoc?.name
    || property.developer?.name
    || agentProfile?.name
    || (typeof property.developer === 'string' ? property.developer : null)
    || 'Developer';
  const developerImageRaw = property.developerProfileImage
    || property.developerProfileImg
    || property.developerLogo
    || property.developerImage
    || property.developerPhoto
    || developerDoc?.logo
    || property.developer?.profileImage
    || property.developer?.profile_image
    || property.developer?.logo
    || property.developer?.image;
  const developerImage = toFullUrl(developerImageRaw);
  const developerDescription = developerDoc?.description
    || property.developerDescription
    || property.developer?.description
    || `${developerName} is the developer behind ${property.propertyName || property.projectName || 'this project'}.`;
  const developerWebsite = developerDoc?.websiteUrl || property.developerWebsite || property.developer?.websiteUrl;
  const developerContact = developerDoc?.primaryContactName || property.primaryContactName || property.developer?.primaryContactName;

  const creatorName = `${agentProfile?.firstName || agentProfile?.first_name || ''} ${agentProfile?.lastName || agentProfile?.last_name || ''}`.trim()
    || agentProfile?.companyName
    || agentProfile?.name
    || 'Xoto GRID Advisor';
  const creatorRoleRaw = agentProfile?.title
    || agentProfile?.designation
    || agentProfile?.userType
    || agentProfile?.role?.name
    || agentProfile?.role
    || 'Advisor';
  const creatorTitle = (() => {
    const value = typeof creatorRoleRaw === 'string' ? creatorRoleRaw : 'Advisor';
    const normalized = value.toLowerCase().replace(/[_-]/g, ' ');
    if (normalized.includes('agent')) return 'Property Agent';
    if (normalized.includes('advisor')) return 'Portfolio Advisor';
    if (normalized.includes('developer')) return 'Developer Representative';
    if (normalized.includes('referral')) return 'Referral Partner';
    return value.replace(/\b\w/g, c => c.toUpperCase());
  })();
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const labelize = (key) => String(key || '')
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, s => s.toUpperCase());
  const displayValue = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toLocaleDateString('en-AE');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number(value).toLocaleString();
    if (Array.isArray(value)) {
      const rendered = value
        .map(item => {
          if (item && typeof item === 'object') {
            return Object.entries(item)
              .map(([k, v]) => {
                const shown = displayValue(v);
                return shown ? `${labelize(k)}: ${shown}` : null;
              })
              .filter(Boolean)
              .join(', ');
          }
          return displayValue(item);
        })
        .filter(Boolean);
      return rendered.length ? rendered.join(' | ') : null;
    }
    if (typeof value === 'object') {
      if (value.date) return displayValue(value.date);
      const rendered = Object.entries(value)
        .map(([k, v]) => {
          const shown = displayValue(v);
          return shown ? `${labelize(k)}: ${shown}` : null;
        })
        .filter(Boolean);
      return rendered.length ? rendered.join(', ') : null;
    }
    return String(value);
  };
  const detailItems = [
    ['Project Name', property.propertyName],
    ['Developer', developerName],
    ['Property Type', property.propertyType || property.type],
    ['Location', loc],
    ['Bedrooms', property.bedrooms],
    ['Bathrooms', property.bathrooms],
    ['Area', property.builtUpArea ? `${fmt(property.builtUpArea)} ${areaUnit}` : property.areaSize],
    ['Floors', property.floors],
    ['Completion', completionDate],
    ['Handover', property.handoverDate || property.handover || property.completionStatus],
    ['Furnishing', property.furnishing || property.furnished],
    ['Parking', property.parking || property.parkingSpaces],
  ].filter(([, value]) => displayValue(value));
  const paymentPlan = Array.isArray(property.paymentPlan)
    ? property.paymentPlan
    : Array.isArray(property.payment_plan)
      ? property.payment_plan
      : [];
  const chunk = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  };
  const neededExtraKeys = [
    'status', 'availability', 'propertyStatus', 'completionStatus',
    'developer', 'developerName', 'community', 'subCommunity',
    'serviceCharge', 'service_charge', 'ownership', 'saleType',
    'permitNumber', 'reraPermit', 'dldPermitNumber', 'referenceNumber',
  ];
  const appendixItems = neededExtraKeys
    .map(key => [labelize(key), displayValue(property?.[key])])
    .filter(([, value]) => value);
  const gallerySlides = (photos.length ? chunk(photos, 5) : [[]]).map((items, index) => `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Visual <em>Perspective</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                ${items.length ? `
                <div class="gallery-grid">
                    <div class="g-img g-main"><img src="${items[0]}"></div>
                    ${items.slice(1, 5).map(p => `<div class="g-img"><img src="${p}"></div>`).join('')}
                </div>` : `
                <div class="narrative-panel">Property images are currently unavailable.</div>`}
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Property Gallery ${index + 1}</span>
                <span class="footer-page">${String(3 + index).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `).join('');
  const appendixSlides = chunk(appendixItems, 12).map((items, index) => `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Additional <em>Details</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <table class="data-table">
                    <tbody>
                        ${items.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Relevant Property Details</span>
                <span class="footer-page">${String(8 + index).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `).join('');
  const developerSlide = `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Developer <em>Profile</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <div class="developer-profile-layout">
                    <div class="developer-card developer-card-large">
                        ${developerImage
                          ? `<img class="developer-logo developer-logo-large" src="${developerImage}">`
                          : `<div class="developer-fallback developer-fallback-large">${escapeHtml(String(developerName || 'D')[0].toUpperCase())}</div>`}
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: var(--accent); font-weight: 800; margin-bottom: 10px;">Developer</div>
                        <div class="developer-name">${escapeHtml(developerName)}</div>
                    </div>
                    <div class="narrative-panel">
                        <div class="info-label">Project</div>
                        <div class="info-value" style="font-size: 30px; font-family: 'Cormorant Garamond', serif; color: var(--primary); margin-bottom: 24px;">${escapeHtml(property.propertyName || 'Property')}</div>
                        <div class="info-label">Company</div>
                        <div style="margin-bottom: 22px;">${escapeHtml(developerName)}</div>
                        ${developerContact ? `<div class="info-label">Primary Contact</div><div style="margin-bottom: 22px;">${escapeHtml(developerContact)}</div>` : ''}
                        <div class="info-label">Location</div>
                        <div style="margin-bottom: 22px;">${escapeHtml(loc || 'Location on request')}</div>
                        <div class="info-label">Completion</div>
                        <div style="margin-bottom: 22px;">${escapeHtml(completionDate)}</div>
                        ${developerWebsite ? `<div class="info-label">Website</div><div>${escapeHtml(developerWebsite)}</div>` : ''}
                        <div style="margin-top: 24px; font-size: 15px; line-height: 1.65;">${escapeHtml(developerDescription)}</div>
                    </div>
                </div>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Developer Information</span>
                <span class="footer-page">DEV</span>
            </div>
        </div>
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${property.propertyName || 'Property'} — Xoto GRID</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root { --primary: #4A027C; --accent: #C5A059; --text: #17131f; --muted: #667085; --bg: #0c011a; --paper: #fbfaf8; --line: #e8e2d8; }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        /* ── PPT DECK SETUP ── */
        body { 
            background-color: var(--bg); 
            width: 100vw;
            height: 100vh;
            font-family: 'Plus Jakarta Sans', sans-serif;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #deck-container {
            width: 100vw;
            height: 100vh;
            position: relative;
            overflow: hidden;
        }

        .slide {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                radial-gradient(circle at 8% 8%, rgba(197,160,89,0.10), transparent 28%),
                linear-gradient(135deg, #ffffff 0%, var(--paper) 100%);
            display: flex;
            flex-direction: column;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s ease-out;
            transform: scale(1.02);
            z-index: 1;
        }

        .slide.active {
            opacity: 1;
            visibility: visible;
            transform: scale(1);
            z-index: 10;
        }

        .slide-inner {
            width: 1280px;
            height: 720px;
            margin: auto;
            position: relative;
            display: flex;
            flex-direction: column;
            background:
                radial-gradient(circle at 6% 8%, rgba(197,160,89,0.10), transparent 24%),
                linear-gradient(135deg, #ffffff 0%, var(--paper) 100%);
            overflow: hidden;
        }

        /* ── NAVIGATION OVERLAYS ── */
        .controls {
            position: fixed;
            bottom: 30px;
            right: 40px;
            display: flex;
            gap: 15px;
            z-index: 100;
        }

        .nav-btn {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s;
            font-size: 18px;
        }

        .nav-btn:hover { background: var(--accent); color: var(--primary); }

        .play-indicator {
            position: fixed;
            top: 30px;
            right: 40px;
            background: var(--accent);
            color: var(--primary);
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            z-index: 100;
            display: none;
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }

        /* ── SLIDE CONTENT STYLES ── */
        .slide-header { padding: 54px 80px 18px; display: flex; justify-content: space-between; align-items: flex-end; z-index: 10; position: relative; }
        .slide-header::after { content: ''; position: absolute; left: 80px; bottom: 0; width: 92px; height: 2px; background: var(--accent); }
        .slide-title { font-family: 'Cormorant Garamond', serif; font-size: 54px; font-weight: 300; color: var(--primary); letter-spacing: 0; line-height: 1; }
        .slide-title em { font-style: italic; color: var(--accent); }
        .header-logo { height: 34px; object-fit: contain; opacity: 0.86; }

        .content-area { flex-grow: 1; padding: 28px 80px 100px; display: flex; flex-direction: column; justify-content: center; width: 100%; z-index: 5; }

        .footer-strip { position: absolute; bottom: 0; left: 0; width: 100%; padding: 22px 80px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); background: rgba(255,255,255,0.84); z-index: 10; }
        .footer-brand { font-size: 11px; letter-spacing: 3px; font-weight: 800; color: var(--primary); text-transform: uppercase; }
        .footer-page { font-size: 11px; font-weight: 600; color: var(--muted); }

        /* ── COVER ── */
        .cover-slide { background: var(--primary); }
        .cover-layout { height: 100%; width: 100%; position: relative; overflow: hidden; background: var(--primary); }
        .cover-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.64; filter: saturate(0.92) contrast(1.08); transform: scale(1.01); }
        .cover-scrim { position: absolute; inset: 0; background:
            linear-gradient(90deg, rgba(12,1,26,0.98) 0%, rgba(74,2,124,0.84) 43%, rgba(74,2,124,0.20) 100%),
            linear-gradient(0deg, rgba(12,1,26,0.62), transparent 44%); }
        .cover-accent-line { position: absolute; left: 80px; top: 170px; width: 82px; height: 2px; background: var(--accent); }
        .cover-text { position: relative; z-index: 2; height: 100%; max-width: 760px; padding: 62px 80px 88px; display: flex; flex-direction: column; color: white; }
        .cover-top { display: flex; align-items: center; justify-content: space-between; gap: 30px; margin-bottom: auto; }
        .cover-developer { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2.5px; color: rgba(255,255,255,0.72); text-align: right; max-width: 260px; overflow-wrap: anywhere; }
        .exclusive-tag { background: rgba(197,160,89,0.16); border: 1px solid rgba(197,160,89,0.55); color: var(--accent); padding: 8px 14px; font-size: 10px; font-weight: 800; letter-spacing: 3px; border-radius: 2px; width: fit-content; margin-bottom: 28px; text-transform: uppercase; }
        .hero-title { font-family: 'Cormorant Garamond', serif; font-size: 80px; font-weight: 300; line-height: 1.01; margin-bottom: 24px; text-shadow: 0 16px 42px rgba(0,0,0,0.34); }
        .hero-subtitle { font-size: 16px; line-height: 1.65; color: rgba(255,255,255,0.78); max-width: 590px; margin-bottom: 32px; }
        .cover-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
        .cover-chip { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); color: white; padding: 10px 15px; border-radius: 4px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .price-badge { width: fit-content; font-size: 28px; font-weight: 300; border-left: 3px solid var(--accent); padding-left: 22px; margin-top: 18px; color: white; }

        .specs-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: transparent; border-radius: 0; overflow: visible; border: 0; }
        .spec-item { background: rgba(255,255,255,0.86); padding: 36px 20px; text-align: center; border: 1px solid var(--line); box-shadow: 0 16px 40px rgba(30,20,45,0.06); }
        .spec-val { font-family: 'Cormorant Garamond', serif; font-size: 42px; color: var(--primary); line-height: 1; margin-bottom: 10px; }
        .spec-lab { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 2px; }

        .gallery-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: repeat(2, 1fr); gap: 14px; height: 450px; }
        .g-img { border-radius: 8px; overflow: hidden; background: #eee; box-shadow: 0 18px 46px rgba(23,19,31,0.10); }
        .g-img img { width: 100%; height: 100%; object-fit: cover; }
        .g-main { grid-row: span 2; }

        .ppt-table { width: 100%; border-collapse: separate; border-spacing: 0; background: rgba(255,255,255,0.9); border: 1px solid var(--line); box-shadow: 0 18px 46px rgba(23,19,31,0.07); }
        .ppt-table th { text-align: left; padding: 18px 20px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); border-bottom: 1px solid var(--line); background: #f7f3ee; }
        .ppt-table td { padding: 22px 20px; border-bottom: 1px solid #EFE7DD; font-size: 16px; font-weight: 500; }
        .price-text { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: var(--primary); font-weight: 600; }
        .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .info-item { border: 1px solid var(--line); border-left: 4px solid var(--accent); padding: 18px; min-height: 92px; background: rgba(255,255,255,0.9); box-shadow: 0 16px 36px rgba(23,19,31,0.05); }
        .info-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; margin-bottom: 10px; }
        .info-value { font-size: 17px; color: var(--text); font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
        .chip-grid { display: flex; flex-wrap: wrap; gap: 12px; align-content: flex-start; }
        .data-chip { border: 1px solid rgba(74,2,124,0.14); background: rgba(255,255,255,0.88); color: var(--primary); padding: 12px 17px; border-radius: 999px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; max-width: 100%; overflow-wrap: anywhere; box-shadow: 0 10px 22px rgba(23,19,31,0.05); }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; align-items: stretch; }
        .narrative-panel { border-left: 5px solid var(--primary); background: rgba(255,255,255,0.9); padding: 30px; font-size: 18px; line-height: 1.7; color: var(--muted); font-weight: 300; box-shadow: 0 18px 46px rgba(23,19,31,0.07); }
        .data-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; background: rgba(255,255,255,0.9); border: 1px solid var(--line); box-shadow: 0 16px 36px rgba(23,19,31,0.06); }
        .data-table th { width: 28%; text-align: left; padding: 13px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.3px; color: var(--primary); border-bottom: 1px solid var(--line); vertical-align: top; background: #f7f3ee; }
        .data-table td { padding: 13px 16px; font-size: 13px; line-height: 1.45; color: var(--text); border-bottom: 1px solid var(--line); overflow-wrap: anywhere; vertical-align: top; }

        .agent-card { display: flex; align-items: center; gap: 50px; background: rgba(255,255,255,0.9); padding: 60px; border-radius: 10px; border-left: 8px solid var(--primary); box-shadow: 0 22px 60px rgba(23,19,31,0.10); }
        .agent-avatar { width: 120px; height: 120px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond'; font-size: 48px; }
        .cover-logo { height: 54px; object-fit: contain; display: block; width: fit-content; max-width: 220px; }
        .developer-profile-layout { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 42px; align-items: stretch; }
        .developer-card { background: linear-gradient(145deg, var(--primary), #26003f); color: white; padding: 46px; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 280px; box-shadow: 0 24px 60px rgba(74,2,124,0.22); }
        .developer-card-large { min-height: 420px; }
        .developer-logo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; background: white; padding: 8px; margin-bottom: 24px; }
        .developer-logo-large { width: 170px; height: 170px; }
        .developer-fallback { width: 120px; height: 120px; border-radius: 50%; background: var(--accent); color: var(--primary); display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', serif; font-size: 48px; margin-bottom: 24px; }
        .developer-fallback-large { width: 170px; height: 170px; font-size: 70px; }
        .developer-name { font-family: 'Cormorant Garamond', serif; font-size: 34px; line-height: 1.15; font-weight: 400; overflow-wrap: anywhere; }

        .hint-text { position: fixed; bottom: 30px; left: 40px; font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 2px; }
    </style>
</head>
<body>

<div class="hint-text">Use Arrows or Enter to navigate</div>
<div id="play-status" class="play-indicator">Auto-Play Active</div>

<div class="controls">
    <div class="nav-btn" onclick="toggleAutoPlay()" title="Auto-Play"><i class="fa-solid fa-play"></i></div>
    <div class="nav-btn" onclick="prevSlide()"><i class="fa-solid fa-chevron-left"></i></div>
    <div class="nav-btn" onclick="nextSlide()"><i class="fa-solid fa-chevron-right"></i></div>
</div>

<div id="deck-container">
    <!-- SLIDE 1: COVER -->
    <section class="slide active">
        <div class="slide-inner" style="background: var(--primary);">
            <div class="cover-layout">
                <img class="cover-bg" src="${photos[0] || ''}">
                <div class="cover-scrim"></div>
                <div class="cover-accent-line"></div>
                <div class="cover-text">
                    <div class="cover-top">
                        <img class="cover-logo" src="${XOTO_LOGO}">
                        <div class="cover-developer">${escapeHtml(developerName)}</div>
                    </div>
                    <div>
                    <div class="exclusive-tag">Curated Property Brief</div>
                    <h1 class="hero-title">${escapeHtml(property.propertyName || property.projectName || 'Property')}<br><em>Presentation</em></h1>
                    <p class="hero-subtitle">${escapeHtml(narrative.propertyOverview || property.overview || `${loc || 'Prime location'} property opportunity curated for your client.`)}</p>
                    <div class="price-badge">${priceStr}</div>
                    <div class="cover-meta">
                        ${loc ? `<span class="cover-chip"><i class="fa-solid fa-location-dot" style="color: var(--accent)"></i> ${escapeHtml(loc)}</span>` : ''}
                        ${property.propertyType || property.type ? `<span class="cover-chip">${escapeHtml(property.propertyType || property.type)}</span>` : ''}
                        ${completionDate ? `<span class="cover-chip">Completion ${escapeHtml(completionDate)}</span>` : ''}
                    </div>
                    </div>
                </div>
            </div>
            <div class="footer-strip" style="background: transparent; border: none; color: rgba(255,255,255,0.4);">
                <span class="footer-brand">Xoto GRID Luxury Portfolio</span>
                <span class="footer-page">01</span>
            </div>
        </div>
    </section>

    <!-- SLIDE 2: OVERVIEW -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">The Master <em>Vision</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 80px; align-items: center;">
                    <div>
                        <div style="height: 1px; width: 80px; background: var(--accent); margin-bottom: 30px;"></div>
                        <p style="font-size: 20px; line-height: 1.8; color: var(--muted); font-weight: 300;">${narrative.propertyOverview || ''}</p>
                        <div style="margin-top: 40px; display: flex; flex-wrap: wrap; gap: 10px;">
                            ${amenitiesList.slice(0, 4).map(a => `<span style="border: 1px solid var(--accent); color: var(--primary); padding: 8px 20px; border-radius: 100px; font-size: 11px; font-weight: 700; text-transform: uppercase;">✦ ${a}</span>`).join('')}
                        </div>
                    </div>
                    <div class="specs-grid">
                        <div class="spec-item"><div class="spec-val">${property.bedrooms || '—'}</div><div class="spec-lab">Bedrooms</div></div>
                        <div class="spec-item"><div class="spec-val">${fmt(property.builtUpArea) || '—'}</div><div class="spec-lab">${areaUnit}</div></div>
                        <div class="spec-item"><div class="spec-val">${property.floors || '—'}</div><div class="spec-lab">Floors</div></div>
                        <div class="spec-item"><div class="spec-val">${completionDate}</div><div class="spec-lab">Timeline</div></div>
                    </div>
                </div>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Executive Overview</span>
                <span class="footer-page">02</span>
            </div>
        </div>
    </section>

    ${gallerySlides}

    <!-- SLIDE 4: PRICING -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Inventory <em>Status</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <table class="ppt-table">
                    <thead>
                        <tr><th>Configuration</th><th>Area (${areaUnit})</th><th>Pricing</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${unitTypes.map(u => `
                            <tr>
                                <td>${u.type || u.unitType}</td>
                                <td>${u.area || u.builtUpArea || '—'}</td>
                                <td class="price-text">${u.price ? currency + ' ' + Number(u.price).toLocaleString() : priceStr}</td>
                                <td style="color: #22c55e; font-weight: 700;">${u.status || 'Available'}</td>
                            </tr>
                        `).join('')}
                        ${unitTypes.length === 0 ? `<tr><td colspan="4" style="text-align:center; padding: 60px; color: var(--muted)">Contact advisor for details.</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Financial Inventory</span>
                <span class="footer-page">04</span>
            </div>
        </div>
    </section>

    <!-- SLIDE 5: PROPERTY DETAILS -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Property <em>Details</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <div class="info-grid">
                    ${detailItems.map(([label, value]) => `
                        <div class="info-item">
                            <div class="info-label">${escapeHtml(label)}</div>
                            <div class="info-value">${escapeHtml(displayValue(value))}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Project Specifications</span>
                <span class="footer-page">05</span>
            </div>
        </div>
    </section>

    <!-- SLIDE 6: AMENITIES -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Amenities <em>& Facilities</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <div class="chip-grid">
                    ${amenitiesList.length
                      ? amenitiesList.map(a => `<span class="data-chip">${escapeHtml(a)}</span>`).join('')
                      : '<span class="data-chip">Contact advisor for full amenity details</span>'}
                </div>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Lifestyle Features</span>
                <span class="footer-page">06</span>
            </div>
        </div>
    </section>

    <!-- SLIDE 7: LOCATION AND PAYMENT -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Location <em>& Plan</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <div class="two-column">
                    <div class="narrative-panel">
                        <div class="info-label">Location & Community</div>
                        ${escapeHtml(narrative.locationCommunity || loc || 'Location details available on request.')}
                        <div class="info-label" style="margin-top: 24px;">Investment Angle</div>
                        ${escapeHtml(narrative.investmentAngle || 'Investment details available on request.')}
                    </div>
                    <div>
                        <table class="data-table">
                            <tbody>
                                ${paymentPlan.length
                                  ? paymentPlan.slice(0, 8).map((item, index) => `<tr><th>${escapeHtml(item.milestone || item.stage || `Stage ${index + 1}`)}</th><td>${escapeHtml(displayValue(item.percentage || item.amount || item.description || item))}</td></tr>`).join('')
                                  : `<tr><th>Payment Plan</th><td>${escapeHtml(displayValue(property.paymentPlanText || property.payment || 'Contact advisor for payment plan details.'))}</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Location & Payment Plan</span>
                <span class="footer-page">07</span>
            </div>
        </div>
    </section>

    ${appendixSlides}

    ${developerSlide}

    <!-- CONTACT -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Next <em>Steps</em></h2>
                <img class="header-logo" src="${XOTO_LOGO}">
            </div>
            <div class="content-area">
                <p style="font-size: 20px; color: var(--muted); max-width: 600px; margin-bottom: 40px; font-weight: 300;">Ready to secure your place in this landmark development?</p>
                <div class="agent-card">
                    <div class="agent-avatar">${(creatorName?.[0] || 'X').toUpperCase()}</div>
                    <div class="agent-details">
                        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 3px; color: var(--accent); font-weight: 700; margin-bottom: 5px;">${escapeHtml(creatorTitle)}</div>
                        <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 400; color: var(--primary);">${escapeHtml(creatorName)}</h3>
                        <div style="margin-top: 25px; display: flex; gap: 15px; flex-wrap: wrap;">
                            ${agentProfile?.phone ? `<span style="background: var(--primary); color: white; padding: 12px 30px; border-radius: 50px; font-size: 12px; font-weight: 700;">📞 ${escapeHtml(agentProfile.phone)}</span>` : ''}
                            <span style="background: #25D366; color: white; padding: 12px 30px; border-radius: 50px; font-size: 12px; font-weight: 700;">WhatsApp</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="footer-strip" style="justify-content: center; border: none;">
                <img style="height: 30px; opacity: 0.2" src="${XOTO_LOGO}">
            </div>
        </div>
    </section>
</div>

<script>
    /* STREAMING_CHUNK:Initializing navigation logic... */
    let currentIndex = 0;
    let autoPlayInterval = null;
    const slides = document.querySelectorAll('.slide');
    const playStatus = document.getElementById('play-status');

    function updateSlides() {
        slides.forEach((slide, index) => {
            slide.classList.remove('active');
            if (index === currentIndex) slide.classList.add('active');
        });
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % slides.length;
        updateSlides();
    }

    function prevSlide() {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        updateSlides();
    }

    function toggleAutoPlay() {
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
            playStatus.style.display = 'none';
        } else {
            autoPlayInterval = setInterval(nextSlide, 5000); // 5 seconds per slide
            playStatus.style.display = 'block';
            nextSlide();
        }
    }

    /* STREAMING_CHUNK:Adding keyboard event listeners... */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            nextSlide();
        }
        if (e.key === 'ArrowLeft') {
            prevSlide();
        }
    });

    // Touch support
    let startX = 0;
    document.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
    document.addEventListener('touchend', (e) => {
        let endX = e.changedTouches[0].clientX;
        if (startX - endX > 50) nextSlide();
        if (endX - startX > 50) prevSlide();
    });
</script>

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
  generatePdfFromPresentation,
};
