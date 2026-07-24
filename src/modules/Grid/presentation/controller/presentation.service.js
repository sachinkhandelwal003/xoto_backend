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
    const urlToParse = /^https?:\/\//i.test(src) ? src : `http://dummy-origin.com${src.startsWith('/') ? '' : '/'}${src}`;
    const parsed = new URL(urlToParse);
    const proxyKey = parsed.searchParams.get('key');
    if (proxyKey) return { bucket: process.env.AWS_S3_BUCKET, key: decodeURIComponent(proxyKey) };
    if (parsed.hostname.includes('.s3.')) return { bucket: parsed.hostname.split('.s3.')[0], key: decodeURIComponent(parsed.pathname.replace(/^\//, '')) };
  } catch (err) {
    return { bucket: process.env.AWS_S3_BUCKET, key: String(src).replace(/^\//, '') };
  }
  return null;
};

const imageSrcToDataUri = async (src) => {
  const s3Meta = getS3ImageMeta(src);
  const optimizeImageBuffer = async (buffer, contentType) => {
    if (!buffer?.length || contentType === 'image/svg+xml') return { buffer, contentType };
    if (buffer.length < 80 * 1024) return { buffer, contentType };
    try {
      const sharp = require('sharp');
      const optimized = await sharp(buffer).rotate().flatten({ background: '#ffffff' }).resize({ width: 960, height: 540, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 48, mozjpeg: true, progressive: false, chromaSubsampling: '4:2:0' }).toBuffer();
      return { buffer: optimized, contentType: 'image/jpeg' };
    } catch (err) {
      console.warn('PDF image optimization skipped:', err.message);
      return { buffer, contentType };
    }
  };

  const dataUriMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(src || '');
  if (dataUriMatch) {
    try {
      const contentType = dataUriMatch[1];
      const buffer = Buffer.from(dataUriMatch[2], 'base64');
      const optimized = await optimizeImageBuffer(buffer, contentType);
      return `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`;
    } catch (err) { return src; }
  }

  if (s3Meta?.bucket && s3Meta?.key) {
    const response = await s3.send(new GetObjectCommand({ Bucket: s3Meta.bucket, Key: s3Meta.key }));
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
  const imageSources = [...htmlContent.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]).filter(Boolean);
  const uniqueSources = [...new Set(imageSources)];
  const replacements = new Map();
  const concurrency = 3;

  for (let i = 0; i < uniqueSources.length; i += concurrency) {
    const batch = uniqueSources.slice(i, i + concurrency);
    await Promise.all(batch.map(async (src) => {
      try { replacements.set(src, await imageSrcToDataUri(src)); }
      catch (err) { console.warn(`PDF image inline failed for ${src}:`, err.message); replacements.set(src, src); }
    }));
    if (global.gc) { try { global.gc(); } catch (err) {} }
  }

  return htmlContent.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, before, src, after) => `${before}${replacements.get(src) || src}${after}`);
};

const preparePresentationHtmlForPdf = async (htmlContent) => {
  const inlinedHtml = await inlinePresentationImages(htmlContent);
  return inlinedHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
};

const PRESENTATION_PDF_WIDTH = 1280;
const PRESENTATION_PDF_HEIGHT = 720;
const PRESENTATION_PDF_IMAGE_QUALITY = 74;

const buildRasterPdf = (slideImages) => new Promise((resolve, reject) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true, info: { Title: 'Xoto Presentation', Creator: 'Xoto GRID', Producer: 'Xoto GRID' } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('error', reject);
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  slideImages.forEach((imageBuffer) => {
    doc.addPage({ size: [PRESENTATION_PDF_WIDTH, PRESENTATION_PDF_HEIGHT], margin: 0 });
    doc.image(imageBuffer, 0, 0, { width: PRESENTATION_PDF_WIDTH, height: PRESENTATION_PDF_HEIGHT });
  });
  doc.end();
});

const generatePresentationNarrative = async (property, clientNotes, settings) => {
  return await generateNarrative(property, clientNotes, settings);
};

const generatePdfFromPresentation = async (trackingToken) => {
  const puppeteer = require('puppeteer');
  let browser;
  const presentation = await Presentation.findOne({ trackingToken });
  if (!presentation) throw new Error('Presentation not found');

  const s3Response = await s3.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: presentation.s3Key }));
  const htmlContent = (await streamToBuffer(s3Response.Body)).toString('utf-8');
  const printableHtmlContent = await preparePresentationHtmlForPdf(htmlContent);

  browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: 'new',
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none'
    ]
});

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      if ((resourceType === 'font' || resourceType === 'stylesheet') && /googleapis|gstatic|cdnjs/i.test(url)) { request.abort(); return; }
      request.continue();
    });

    await page.setViewport({ width: PRESENTATION_PDF_WIDTH, height: PRESENTATION_PDF_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(printableHtmlContent, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('Array.from(document.images).every(img => img.complete)', { timeout: 5000 }).catch(() => {});

    await page.addStyleTag({
      content: `
      @page { size: ${PRESENTATION_PDF_WIDTH}px ${PRESENTATION_PDF_HEIGHT}px; margin: 0; }
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      html, body { width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #fff !important; }
      #pdf-fab, #download-fab-wrap, .controls, .hint-text, #play-status { display: none !important; }
      #deck-container { width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; position: fixed !important; inset: 0 !important; overflow: hidden !important; background: #fff !important; }
      .slide { position: fixed !important; inset: 0 !important; width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; display: flex !important; opacity: 0 !important; visibility: hidden !important; transform: none !important; z-index: 0 !important; }
      .slide.pdf-current-slide { opacity: 1 !important; visibility: visible !important; z-index: 1 !important; }
      .slide-inner { width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; transform: none !important; }
      `,
    });

    const slideCount = await page.$$eval('.slide', slides => slides.length);
    if (!slideCount) throw new Error('No slides found in presentation');

    const slideImages = [];
    for (let index = 0; index < slideCount; index += 1) {
      await page.evaluate((currentIndex) => {
        document.querySelectorAll('.slide').forEach((slide, slideIndex) => {
          slide.classList.toggle('pdf-current-slide', slideIndex === currentIndex);
        });
      }, index);
      const slide = await page.$('.slide.pdf-current-slide');
      if (!slide) continue;
      const imageBuffer = await slide.screenshot({ type: 'jpeg', quality: PRESENTATION_PDF_IMAGE_QUALITY, captureBeyondViewport: false });
      slideImages.push(Buffer.from(imageBuffer));
      await slide.dispose();
    }

    if (!slideImages.length) throw new Error('Unable to render presentation slides');
    const pdfBuffer = await buildRasterPdf(slideImages);
    slideImages.length = 0;
    return pdfBuffer;
  } catch (err) {
    console.error('PDF render failed:', err.message);
    throw err;
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

  const presentationApiBase = '/api/presentation';

  const toFullUrl = (url) => {
    if (!url) return null;
    const raw = typeof url === 'string' ? url : url?.url || url?.src || url?.key || url?.path || url?.location || url?.secure_url;
    if (!raw || typeof raw !== 'string') return null;
    if (raw.startsWith('data:')) return raw;
    let key;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const urlObj = new URL(raw);
        if (urlObj.searchParams.get('key') && urlObj.pathname.includes('/presentation/image-proxy')) return raw;
        if (!urlObj.hostname.includes('.s3.') && !urlObj.hostname.includes(String(process.env.AWS_S3_BUCKET || ''))) return raw;
        key = urlObj.pathname.replace(/^\//, '');
      } catch (e) { return raw; }
    } else { key = raw.replace(/^\//, ''); }
    return `${presentationApiBase}/image-proxy?key=${encodeURIComponent(key)}`;
  };
  const xotoLogoUrl = toFullUrl(XOTO_LOGO) || XOTO_LOGO;

  const getDeveloperDocument = async () => {
    const candidate = property.developerId || property.developer_id || property.developer;
    if (!candidate || typeof candidate === 'object') return candidate || null;
    if (!/^[a-f\d]{24}$/i.test(String(candidate))) return null;
    try { return await Developer.findById(candidate).lean(); }
    catch (err) { console.warn('Developer lookup failed:', err.message); return null; }
  };
  const developerDoc = await getDeveloperDocument();

  const fmt = (n) => n > 0 ? Number(n).toLocaleString() : null;
  const price = fmt(property.price_min || property.priceRange?.from || property.price || 0);
  const priceMax = fmt(property.price_max || property.priceRange?.to || 0);
  const priceStr = price && priceMax ? `${currency} ${price} – ${priceMax}` : price ? `${currency} ${price}` : 'On Request';

  const areaStr = (() => {
    const min = fmt(property.builtUpArea_min || property.builtUpArea || 0);
    const max = fmt(property.builtUpArea_max || 0);
    if (min && max && min !== max) return `${min} - ${max}`;
    return min || null;
  })();

  const loc = [property.area, property.city, property.country].filter(Boolean).join(', ');
  const unitTypes = Array.isArray(property.unitTypes) ? property.unitTypes : [];
  const inventoryRows = (() => {
    if (Array.isArray(property.inventory) && property.inventory.length) return property.inventory;
    if (Array.isArray(property.units) && property.units.length) return property.units;
    if (Array.isArray(property.availableUnits) && property.availableUnits.length) return property.availableUnits;
    return unitTypes;
  })();

  const amenitiesList = (() => {
    const list = [];
    const pushAmenity = (value) => {
      if (!value) return;
      if (typeof value === 'string') { list.push(value); return; }
      if (Array.isArray(value)) { value.forEach(pushAmenity); return; }
      if (typeof value === 'object') { Object.entries(value).forEach(([k, v]) => { if (v === true) list.push(labelize(k)); else if (typeof v === 'string') list.push(v); }); }
    };
    pushAmenity(property.amenities); pushAmenity(property.amenity); pushAmenity(property.features); pushAmenity(property.amenitiesAndFacilities);
    if (property.facilities && typeof property.facilities === 'object') { Object.entries(property.facilities).forEach(([k, v]) => { if (v === true) list.push(labelize(k)); }); }
    return [...new Set(list)];
  })();

  const photos = (() => {
    const all = [];
    const pushImage = (value) => {
      if (!value) return;
      if (typeof value === 'string') { all.push(value); return; }
      if (Array.isArray(value)) { value.forEach(pushImage); return; }
      if (typeof value === 'object') {
        const direct = value.url || value.src || value.key || value.path || value.location || value.secure_url || value.image;
        if (direct && direct !== value) pushImage(direct);
      }
    };
    [property.mainImage, property.mainLogo, property.coverImage, property.thumbnail, property.logo, property.media?.mainLogo, property.images, property.photos, property.media?.architectureImages, property.media?.interiorImages, property.media?.lobbyImages, property.media?.otherImages, property.floorPlanImages, property.gallery, property.attachments].forEach(pushImage);
    if (Array.isArray(property.buildings)) property.buildings.forEach(building => pushImage(building?.image));
    return [...new Set(all.map(toFullUrl).filter(Boolean))];
  })();

  const labelize = (key) => String(key || '').replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim().replace(/^./, s => s.toUpperCase());
  const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
    if (typeof completion === 'string' || completion instanceof Date) return formatDateDDMMYY(completion) || completion;
    const directDate = completion.fullDate || completion.date;
    if (directDate) return formatDateDDMMYY(directDate) || String(directDate);
    if (completion.quarter && completion.year) {
      const quarterEnd = { Q1: `03/31/${completion.year}`, Q2: `06/30/${completion.year}`, Q3: `09/30/${completion.year}`, Q4: `12/31/${completion.year}` }[String(completion.quarter).toUpperCase()];
      return formatDateDDMMYY(quarterEnd) || `${completion.quarter} ${completion.year}`;
    }
    return Object.values(completion).filter(Boolean).join(' ') || 'On Request';
  };
  const completionDate = formatCompletionDate(property.completionDate);
  const developerCompanyName = property.developerDetails?.companyName || property.developerCompanyName || developerDoc?.companyName || property.developer?.companyName || property.companyName;
  const developerPersonName = property.developerName || property.developer_name || developerDoc?.name || property.developer?.name || (typeof property.developer === 'string' ? property.developer : null);
  const developerName = developerCompanyName || developerPersonName || 'Developer';
  const developerImageRaw = property.developerProfileImage || property.developerProfileImg || property.developerLogo || property.developerImage || property.developerPhoto || developerDoc?.logo || property.developer?.profileImage || property.developer?.profile_image || property.developer?.logo || property.developer?.image;
  const developerImage = toFullUrl(developerImageRaw);
  const developerDescription = developerDoc?.description || property.developerDescription || property.developer?.description || `${developerName} is the developer behind ${property.propertyName || property.projectName || 'this project'}.`;
  const developerWebsite = developerDoc?.websiteUrl || property.developerWebsite || property.developer?.websiteUrl;
  const developerContact = developerDoc?.primaryContactName || property.primaryContactName || property.developer?.primaryContactName || (developerPersonName && developerPersonName !== developerName ? developerPersonName : null);

  const creatorName = `${agentProfile?.firstName || agentProfile?.first_name || ''} ${agentProfile?.lastName || agentProfile?.last_name || ''}`.trim() || agentProfile?.companyName || agentProfile?.fullName || agentProfile?.name || 'Xoto GRID Advisor';
  const creatorRoleRaw = agentProfile?.title || agentProfile?.designation || agentProfile?.userType || agentProfile?.role?.name || agentProfile?.role || 'Advisor';
  const creatorTitle = (() => {
    const value = typeof creatorRoleRaw === 'string' ? creatorRoleRaw : 'Advisor';
    const normalized = value.toLowerCase().replace(/[_-]/g, ' ');
    if (normalized.includes('agent')) return 'Property Agent';
    if (normalized.includes('advisor')) return 'Portfolio Advisor';
    if (normalized.includes('developer')) return 'Developer Representative';
    if (normalized.includes('referral')) return 'Referral Partner';
    return value.replace(/\b\w/g, c => c.toUpperCase());
  })();
  const creatorType = (() => {
    const normalized = String(creatorRoleRaw || agentProfile?.userType || '').toLowerCase().replace(/[_-]/g, ' ');
    if (normalized.includes('agent')) return 'Agent';
    if (normalized.includes('advisor')) return 'Advisor';
    return creatorTitle;
  })();
  const creatorAgencyName = agentProfile?.agencyName || agentProfile?.agency_name || agentProfile?.agency?.companyName || agentProfile?.agency?.agency_name || agentProfile?.agency?.agencyName || agentProfile?.companyName;

  const headerBrand = `
    <div class="header-brand">
      <div class="header-presenter">
        <span class="header-presenter-label">Prepared by ${escapeHtml(creatorType)}</span>
        <span class="header-presenter-name">${escapeHtml(creatorName)}</span>
        ${creatorType === 'Agent' && creatorAgencyName ? `<span class="header-presenter-agency">${escapeHtml(creatorAgencyName)}</span>` : ''}
      </div>
      <img class="header-logo" src="${xotoLogoUrl}" alt="Xoto">
    </div>`;

  const displayValue = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toLocaleDateString('en-AE');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number(value).toLocaleString();
    if (Array.isArray(value)) {
      const rendered = value.map(item => {
        if (item && typeof item === 'object') return Object.entries(item).map(([k, v]) => { const shown = displayValue(v); return shown ? `${labelize(k)}: ${shown}` : null; }).filter(Boolean).join(', ');
        return displayValue(item);
      }).filter(Boolean);
      return rendered.length ? rendered.join(' | ') : null;
    }
    if (typeof value === 'object') {
      if (value.date) return displayValue(value.date);
      const rendered = Object.entries(value).map(([k, v]) => { const shown = displayValue(v); return shown ? `${labelize(k)}: ${shown}` : null; }).filter(Boolean);
      return rendered.length ? rendered.join(', ') : null;
    }
    return String(value);
  };

  const detailItems = [
    ['Project Name', property.propertyName], ['Developer', developerName], ['Property Type', property.propertyType || property.type],
    ['Location', loc], ['Area', areaStr ? `${areaStr} ${areaUnit}` : property.areaSize], ['Floors', property.floors],
    ['Completion', completionDate], ['Handover', property.handoverDate || property.handover || property.completionStatus],
    ['Furnishing', property.furnishing || property.furnished], ['Parking', property.parking || property.parkingSpaces],
  ].filter(([, value]) => displayValue(value));

  const paymentPlan = (() => {
    const source = property.paymentPlan || property.payment_plan || property.paymentPlans || property.payment_plan_details;
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (typeof source === 'string') return source.trim() ? [{ milestone: 'Payment Plan', description: source }] : [];
    if (typeof source === 'object') return Object.entries(source).map(([key, value]) => ({ milestone: labelize(key), description: displayValue(value) }));
    return [];
  })();
  const paymentPlanFallback = displayValue(property.paymentPlanText || property.payment || property.payment_plan_text || property.paymentDescription);
  const overviewStats = [
    ['Starting Price', priceStr], ['Property Type', property.propertyType || property.type || 'On Request'],
    ['Developer', developerName], ['Timeline', completionDate || 'On Request'],
  ];
  const paymentPlanRows = paymentPlan.length
    ? paymentPlan.slice(0, 6).map((item, index) => ({ label: displayValue(item.milestone || item.stage || item.title || `Stage ${index + 1}`) || `Stage ${index + 1}`, value: displayValue(item.percentage || item.amount || item.description || item.value || item) || 'On Request' }))
    : [
        { label: 'Payment Plan', value: paymentPlanFallback || 'Flexible payment terms available through the advisor.' },
        { label: 'Starting Price', value: priceStr },
        { label: 'Completion', value: completionDate || 'On Request' },
        { label: 'Reservation', value: 'Contact advisor for booking amount and next steps.' },
      ];
  const chunk = (items, size) => { const chunks = []; for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size)); return chunks; };

  const neededExtraKeys = ['developer', 'developerName', 'community', 'subCommunity', 'serviceCharge', 'service_charge', 'ownership', 'saleType', 'permitNumber', 'reraPermit', 'dldPermitNumber', 'referenceNumber'];
  const appendixItems = neededExtraKeys.map(key => [labelize(key), displayValue(property?.[key])]).filter(([, value]) => value);

  const buildInventoryRow = (rawUnit) => {
    const row = typeof rawUnit === 'string' ? { unitType: rawUnit } : (rawUnit || {});
    const type = row.bedroomType || row.unitType || row.type || row.configuration || row.name || 'Unit';
    const rowAreaUnit = row.areaUnit || areaUnit;
    const rowArea = Number(row.area || row.builtUpArea || row.sqft || row.areaFrom || row.size || 0);
    const rowCurrency = row.currency || currency;
    const rowPrice = Number(row.price || row.startingPrice || row.priceFrom || row.amount || 0);
    const status = row.status || row.availability || 'Available';
    return { unitLabel: row.unitNumber || row.unit_no || row.unit || row.buildingName || 'Inventory', type: displayValue(type), area: rowArea > 0 ? `${displayValue(rowArea)} ${rowAreaUnit}` : 'On Request', areaValue: rowArea, areaUnit: rowAreaUnit, price: rowPrice > 0 ? `${rowCurrency} ${rowPrice.toLocaleString()}` : priceStr, priceValue: rowPrice, currency: rowCurrency, status: labelize(displayValue(status)) };
  };

  const inventoryDisplayRows = (() => {
    const rows = inventoryRows.map(buildInventoryRow);
    if (rows.length <= 8) return rows;
    const grouped = new Map();
    rows.forEach((row) => {
      const key = `${row.type}|${row.status}|${row.currency}|${row.areaUnit}`;
      const existing = grouped.get(key) || { unitLabel: '', type: row.type, status: row.status, currency: row.currency, areaUnit: row.areaUnit, count: 0, minArea: null, maxArea: null, minPrice: null, maxPrice: null };
      existing.count += 1;
      if (row.areaValue > 0) { existing.minArea = existing.minArea === null ? row.areaValue : Math.min(existing.minArea, row.areaValue); existing.maxArea = existing.maxArea === null ? row.areaValue : Math.max(existing.maxArea, row.areaValue); }
      if (row.priceValue > 0) { existing.minPrice = existing.minPrice === null ? row.priceValue : Math.min(existing.minPrice, row.priceValue); existing.maxPrice = existing.maxPrice === null ? row.priceValue : Math.max(existing.maxPrice, row.priceValue); }
      grouped.set(key, existing);
    });
    return [...grouped.values()].sort((a, b) => a.type.localeCompare(b.type) || a.status.localeCompare(b.status)).slice(0, 10).map((row) => {
      const area = row.minArea ? `${row.minArea.toLocaleString()}${row.maxArea && row.maxArea !== row.minArea ? ` - ${row.maxArea.toLocaleString()}` : ''} ${row.areaUnit}` : 'On Request';
      const price = row.minPrice ? `${row.currency} ${row.minPrice.toLocaleString()}${row.maxPrice && row.maxPrice !== row.minPrice ? ` - ${row.maxPrice.toLocaleString()}` : ''}` : priceStr;
      return { unitLabel: `${row.count} unit${row.count > 1 ? 's' : ''}`, type: row.type, area, price, status: row.status };
    });
  })();

  const gallerySlides = (photos.length ? chunk(photos, 5) : [[]]).map((items, index) => `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Visual <em>Perspective</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                ${items.length ? `
                <div class="gallery-grid">
                    <div class="g-img g-main"><img src="${items[0]}"></div>
                    ${items.slice(1, 5).map(p => `<div class="g-img"><img src="${p}"></div>`).join('')}
                </div>` : `<div class="narrative-panel">Property images are currently unavailable.</div>`}
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Property Gallery ${index + 1}</span>
                <span class="footer-page">${String(3 + index).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `).join('');

  const inventorySlides = `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Inventory <em>Status</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <table class="ppt-table inventory-table">
                    <thead><tr><th>Unit</th><th>Type</th><th>Area</th><th>Pricing</th><th>Status</th></tr></thead>
                    <tbody>
                        ${inventoryDisplayRows.length ? inventoryDisplayRows.map((row) => `
                            <tr>
                                <td>${escapeHtml(displayValue(row.unitLabel))}</td>
                                <td>${escapeHtml(displayValue(row.type))}</td>
                                <td>${escapeHtml(row.area)}</td>
                                <td class="price-text">${escapeHtml(row.price)}</td>
                                <td style="color: #22c55e; font-weight: 700;">${escapeHtml(row.status)}</td>
                            </tr>
                        `).join('') : `<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--muted)">No inventory rows found.</td></tr>`}
                    </tbody>
                </table>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">Financial Inventory${inventoryRows.length > 8 ? ` • ${inventoryRows.length} units summarized` : ''}</span>
                <span class="footer-page">${String(3 + Math.max(photos.length ? Math.ceil(photos.length / 5) : 1, 1)).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `;

  const appendixSlides = chunk(appendixItems, 12).map((items, index) => `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Additional <em>Details</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <table class="data-table">
                    <tbody>${items.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody>
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
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="developer-profile-layout">
                    <div class="developer-card developer-card-large">
                        ${developerImage ? `<img class="developer-logo developer-logo-large" src="${developerImage}">` : `<div class="developer-fallback developer-fallback-large">${escapeHtml(String(developerName || 'D')[0].toUpperCase())}</div>`}
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

  // ── THE FULL HTML WITH MOBILE RESPONSIVE CSS ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${property.propertyName || 'Property'} — Xoto GRID</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
          --primary: #4A027C; --accent: #C5A059; --text: #17131f;
          --muted: #667085; --bg: #0c011a; --paper: #fbfaf8; --line: #e8e2d8;
          --slide-w: 1280; --slide-h: 720;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 100%; height: 100%;
          font-family: 'Plus Jakarta Sans', sans-serif;
          background-color: var(--bg);
          overflow: hidden;
          touch-action: pan-y;
        }

        /* ── DECK WRAPPER ── */
        #deck-container {
          width: 100vw; height: 100vh;
          position: relative; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }

        /* ── SLIDE ── */
        .slide {
          position: absolute; top: 0; left: 0;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; visibility: hidden;
          transition: opacity 0.7s ease, transform 0.7s ease;
          transform: scale(1.02);
          z-index: 1;
        }
        .slide.active {
          opacity: 1; visibility: visible;
          transform: scale(1); z-index: 10;
        }

        /* ── SLIDE INNER — scales to fit any screen ── */
        .slide-inner {
          width: 1280px; height: 720px;
          position: relative;
          display: flex; flex-direction: column;
          background:
            radial-gradient(circle at 6% 8%, rgba(197,160,89,0.10), transparent 24%),
            linear-gradient(135deg, #ffffff 0%, var(--paper) 100%);
          overflow: hidden;
          /* ✅ KEY: scale to fit viewport while keeping 16:9 ratio */
          transform-origin: center center;
        }

        /* ── HEADER ── */
        .slide-header {
          min-height: 92px; padding: 22px 80px;
          display: flex; justify-content: space-between; align-items: center;
          gap: 30px; z-index: 10; position: relative;
          background: linear-gradient(90deg, var(--primary), #26003f);
          box-shadow: 0 16px 38px rgba(74,2,124,0.18); flex-shrink: 0;
        }
        .slide-header::after {
          content: ''; position: absolute; left: 80px; right: 80px; bottom: 0;
          height: 2px; background: linear-gradient(90deg, var(--accent), rgba(197,160,89,0.18));
        }
        .slide-title { font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 300; color: white; letter-spacing: 0; line-height: 1; }
        .slide-title em { font-style: italic; color: var(--accent); }
        .header-brand { display: flex; align-items: center; justify-content: flex-end; gap: 24px; min-width: 430px; max-width: 560px; }
        .header-presenter { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; min-width: 0; color: white; text-align: right; }
        .header-presenter-label { font-size: 9px; line-height: 1; font-weight: 800; letter-spacing: 1.7px; text-transform: uppercase; color: rgba(255,255,255,0.58); }
        .header-presenter-name { font-size: 14px; line-height: 1.15; font-weight: 800; color: #fff; max-width: 300px; overflow-wrap: anywhere; }
        .header-presenter-agency { font-size: 10px; line-height: 1.15; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); max-width: 300px; overflow-wrap: anywhere; }
        .header-logo { height: 38px; max-width: 190px; object-fit: contain; opacity: 1; flex-shrink: 0; }

        .content-area { flex-grow: 1; padding: 34px 80px 100px; display: flex; flex-direction: column; justify-content: center; width: 100%; z-index: 5; overflow: hidden; }
        .footer-strip { position: absolute; bottom: 0; left: 0; width: 100%; padding: 22px 80px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); background: rgba(255,255,255,0.84); z-index: 10; }
        .footer-brand { font-size: 11px; letter-spacing: 3px; font-weight: 800; color: var(--primary); text-transform: uppercase; }
        .footer-page { font-size: 11px; font-weight: 600; color: var(--muted); }

        /* ── NAVIGATION CONTROLS ── */
        .controls {
          position: fixed; bottom: 24px; right: 24px;
          display: flex; gap: 12px; z-index: 1000;
        }
        .nav-btn {
          background: rgba(255,255,255,0.15); backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.2); color: white;
          width: 48px; height: 48px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.3s; font-size: 16px;
          appearance: none; -webkit-appearance: none;
        }
        .nav-btn:hover { background: var(--accent); color: var(--primary); }

        /* ── SLIDE COUNTER ── */
        #slide-counter {
          position: fixed; bottom: 28px; left: 50%;
          transform: translateX(-50%);
          display: flex; gap: 6px; z-index: 1000;
        }
        .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: rgba(255,255,255,0.3);
          transition: background 0.3s, transform 0.3s;
          cursor: pointer;
        }
        .dot.active { background: var(--accent); transform: scale(1.4); }

        .play-indicator {
          position: fixed; top: 20px; right: 20px;
          background: var(--accent); color: var(--primary);
          padding: 6px 14px; border-radius: 4px;
          font-size: 10px; font-weight: 800; letter-spacing: 2px;
          text-transform: uppercase; z-index: 1000; display: none;
        }
        .hint-text {
          position: fixed; bottom: 28px; left: 24px;
          font-size: 10px; color: rgba(255,255,255,0.35);
          text-transform: uppercase; letter-spacing: 2px; z-index: 1000;
        }

        /* ── COVER SLIDE ── */
        .cover-layout { height: 100%; width: 100%; position: relative; overflow: hidden; background: var(--primary); }
        .cover-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.64; }
        .cover-bg-fallback { background: radial-gradient(circle at 72% 28%, rgba(197,160,89,0.26), transparent 30%), linear-gradient(135deg, #4A027C, #12011f); }
        .cover-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(12,1,26,0.98) 0%, rgba(74,2,124,0.84) 43%, rgba(74,2,124,0.20) 100%), linear-gradient(0deg, rgba(12,1,26,0.62), transparent 44%); }
        .cover-accent-line { position: absolute; left: 80px; top: 170px; width: 82px; height: 2px; background: var(--accent); }
        .cover-text { position: relative; z-index: 2; height: 100%; max-width: 760px; padding: 62px 80px 88px; display: flex; flex-direction: column; color: white; }
        .cover-top { display: flex; align-items: center; justify-content: space-between; gap: 30px; margin-bottom: auto; }
        .cover-developer { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2.5px; color: rgba(255,255,255,0.72); text-align: right; max-width: 260px; overflow-wrap: anywhere; }
        .exclusive-tag { background: rgba(197,160,89,0.16); border: 1px solid rgba(197,160,89,0.55); color: var(--accent); padding: 8px 14px; font-size: 10px; font-weight: 800; letter-spacing: 3px; border-radius: 2px; width: fit-content; margin-bottom: 28px; text-transform: uppercase; }
        .hero-title { font-family: 'Cormorant Garamond', serif; font-size: 80px; font-weight: 300; line-height: 1.01; margin-bottom: 24px; }
        .hero-subtitle { font-size: 16px; line-height: 1.65; color: rgba(255,255,255,0.78); max-width: 590px; margin-bottom: 32px; }
        .cover-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
        .cover-chip { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); color: white; padding: 10px 15px; border-radius: 4px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .price-badge { width: fit-content; font-size: 28px; font-weight: 300; border-left: 3px solid var(--accent); padding-left: 22px; margin-top: 18px; color: white; }
        .cover-logo { height: 54px; object-fit: contain; display: block; max-width: 220px; }

        /* ── CONTENT COMPONENTS ── */
        .specs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .spec-item { background: rgba(255,255,255,0.86); padding: 28px 18px; min-height: 142px; display: flex; flex-direction: column; justify-content: center; text-align: center; border: 1px solid var(--line); box-shadow: 0 16px 40px rgba(30,20,45,0.06); }
        .spec-val { font-family: 'Cormorant Garamond', serif; font-size: 28px; color: var(--primary); line-height: 1.14; margin-bottom: 10px; overflow-wrap: anywhere; }
        .spec-lab { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 2px; }
        .gallery-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: repeat(2, 1fr); gap: 14px; height: 450px; }
        .g-img { border-radius: 8px; overflow: hidden; background: rgba(74,2,124,0.12); }
        .g-img img { width: 100%; height: 100%; object-fit: cover; }
        .g-main { grid-row: span 2; }
        .image-missing { background: linear-gradient(135deg, rgba(74,2,124,0.14), rgba(197,160,89,0.20)); }
        .ppt-table { width: 100%; border-collapse: separate; border-spacing: 0; background: rgba(255,255,255,0.9); border: 1px solid var(--line); box-shadow: 0 18px 46px rgba(23,19,31,0.07); }
        .ppt-table th { text-align: left; padding: 18px 20px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); border-bottom: 1px solid var(--line); background: #f7f3ee; }
        .ppt-table td { padding: 22px 20px; border-bottom: 1px solid #EFE7DD; font-size: 16px; font-weight: 500; }
        .inventory-table th { padding: 14px 16px; font-size: 10px; }
        .inventory-table td { padding: 15px 16px; font-size: 14px; }
        .price-text { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: var(--primary); font-weight: 600; }
        .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .info-item { border: 1px solid var(--line); border-left: 4px solid var(--accent); padding: 18px; min-height: 92px; background: rgba(255,255,255,0.9); }
        .info-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; margin-bottom: 10px; }
        .info-value { font-size: 17px; color: var(--text); font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
        .chip-grid { display: flex; flex-wrap: wrap; gap: 12px; align-content: flex-start; }
        .data-chip { border: 1px solid rgba(74,2,124,0.14); background: rgba(255,255,255,0.88); color: var(--primary); padding: 12px 17px; border-radius: 999px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; overflow-wrap: anywhere; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; align-items: stretch; }
        .narrative-panel { border-left: 5px solid var(--primary); background: rgba(255,255,255,0.9); padding: 30px; font-size: 18px; line-height: 1.7; color: var(--muted); font-weight: 300; }
        .data-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; background: rgba(255,255,255,0.9); border: 1px solid var(--line); }
        .data-table th { width: 28%; text-align: left; padding: 13px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.3px; color: var(--primary); border-bottom: 1px solid var(--line); vertical-align: top; background: #f7f3ee; }
        .data-table td { padding: 13px 16px; font-size: 13px; line-height: 1.45; color: var(--text); border-bottom: 1px solid var(--line); overflow-wrap: anywhere; vertical-align: top; }
        .payment-panel { height: 100%; min-height: 390px; background: rgba(255,255,255,0.92); border: 1px solid var(--line); border-top: 5px solid var(--accent); padding: 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; }
        .payment-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
        .payment-kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 900; color: var(--accent); margin-bottom: 8px; }
        .payment-title { font-family: 'Cormorant Garamond', serif; font-size: 34px; line-height: 1; color: var(--primary); font-weight: 400; }
        .payment-badge { border: 1px solid rgba(74,2,124,0.16); color: var(--primary); padding: 10px 14px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; }
        .payment-list { display: grid; gap: 12px; }
        .payment-row { display: grid; grid-template-columns: 130px 1fr; gap: 16px; align-items: center; padding: 14px 16px; background: #fbfaf8; border: 1px solid rgba(74,2,124,0.08); }
        .payment-row-label { font-size: 10px; color: var(--primary); font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; overflow-wrap: anywhere; }
        .payment-row-value { font-size: 14px; line-height: 1.4; color: var(--text); font-weight: 700; overflow-wrap: anywhere; }
        .payment-note { border-left: 3px solid var(--primary); padding-left: 14px; font-size: 12px; line-height: 1.55; color: var(--muted); font-weight: 600; }
        .agent-card { display: flex; align-items: center; gap: 50px; background: rgba(255,255,255,0.9); padding: 60px; border-radius: 10px; border-left: 8px solid var(--primary); }
        .agent-avatar { width: 120px; height: 120px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond'; font-size: 48px; flex-shrink: 0; }
        .developer-profile-layout { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 42px; align-items: stretch; }
        .developer-card { background: linear-gradient(145deg, var(--primary), #26003f); color: white; padding: 46px; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 280px; }
        .developer-card-large { min-height: 420px; }
        .developer-logo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; background: white; padding: 8px; margin-bottom: 24px; }
        .developer-logo-large { width: 170px; height: 170px; }
        .developer-fallback { width: 120px; height: 120px; border-radius: 50%; background: var(--accent); color: var(--primary); display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', serif; font-size: 48px; margin-bottom: 24px; }
        .developer-fallback-large { width: 170px; height: 170px; font-size: 70px; }
        .developer-name { font-family: 'Cormorant Garamond', serif; font-size: 34px; line-height: 1.15; font-weight: 400; overflow-wrap: anywhere; }
    </style>
</head>
<body>

<div class="hint-text" id="hint-text">← Swipe or use arrows →</div>
<div id="play-status" class="play-indicator">Auto-Play</div>

<div class="controls">
    <button type="button" class="nav-btn" data-action="toggle-auto-play" title="Auto-Play"><i class="fa-solid fa-play"></i></button>
    <button type="button" class="nav-btn" data-action="prev-slide" title="Previous"><i class="fa-solid fa-chevron-left"></i></button>
    <button type="button" class="nav-btn" data-action="next-slide" title="Next"><i class="fa-solid fa-chevron-right"></i></button>
</div>

<div id="slide-counter"></div>

<div id="deck-container">

    <!-- SLIDE 1: COVER -->
    <section class="slide active">
        <div class="slide-inner" style="background: var(--primary);">
            <div class="cover-layout">
                ${photos[0] ? `<img class="cover-bg" src="${photos[0]}" alt="">` : '<div class="cover-bg cover-bg-fallback" style="position:absolute;inset:0"></div>'}
                <div class="cover-scrim"></div>
                <div class="cover-accent-line"></div>
                <div class="cover-text">
                    <div class="cover-top">
                        <img class="cover-logo" src="${xotoLogoUrl}">
                        <div class="cover-developer">${escapeHtml(developerName)}</div>
                    </div>
                    <div>
                        <div class="exclusive-tag">Curated Property Brief</div>
                        <h1 class="hero-title">${escapeHtml(property.propertyName || property.projectName || 'Property')}<br><em>Presentation</em></h1>
                        <p class="hero-subtitle">${escapeHtml(narrative.propertyOverview || property.overview || `${loc || 'Prime location'} property opportunity curated for your client.`)}</p>
                        <div class="price-badge">${priceStr}</div>
                        <div class="cover-meta">
                            ${loc ? `<span class="cover-chip"><i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> ${escapeHtml(loc)}</span>` : ''}
                            ${property.propertyType ? `<span class="cover-chip">${escapeHtml(property.propertyType)}</span>` : ''}
                            ${completionDate ? `<span class="cover-chip">Completion ${escapeHtml(completionDate)}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div class="footer-strip" style="background:transparent;border:none;">
                <span class="footer-brand" style="color:rgba(255,255,255,0.4)">Xoto GRID Luxury Portfolio</span>
                <span class="footer-page" style="color:rgba(255,255,255,0.4)">01</span>
            </div>
        </div>
    </section>

    <!-- SLIDE 2: OVERVIEW -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">The Master <em>Vision</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:80px;align-items:center;">
                    <div>
                        <div style="height:1px;width:80px;background:var(--accent);margin-bottom:30px;"></div>
                        <p style="font-size:20px;line-height:1.8;color:var(--muted);font-weight:300;">${narrative.propertyOverview || ''}</p>
                        <div style="margin-top:40px;display:flex;flex-wrap:wrap;gap:10px;">
                            ${amenitiesList.slice(0, 4).map(a => `<span style="border:1px solid var(--accent);color:var(--primary);padding:8px 20px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase;">✦ ${escapeHtml(a)}</span>`).join('')}
                        </div>
                    </div>
                    <div class="specs-grid">
                        ${overviewStats.map(([label, value]) => `
                            <div class="spec-item">
                                <div class="spec-val">${escapeHtml(displayValue(value) || 'On Request')}</div>
                                <div class="spec-lab">${escapeHtml(label)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">Executive Overview</span><span class="footer-page">02</span></div>
        </div>
    </section>

    ${gallerySlides}
    ${inventorySlides}

    <!-- SLIDE: PROPERTY DETAILS -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Property <em>Details</em></h2>
                ${headerBrand}
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
            <div class="footer-strip"><span class="footer-brand">Project Specifications</span><span class="footer-page">05</span></div>
        </div>
    </section>

    <!-- SLIDE: AMENITIES -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Amenities <em>& Facilities</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="chip-grid">
                    ${amenitiesList.length ? amenitiesList.map(a => `<span class="data-chip">${escapeHtml(a)}</span>`).join('') : '<span class="data-chip">Contact advisor for full amenity details</span>'}
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">Lifestyle Features</span><span class="footer-page">06</span></div>
        </div>
    </section>

    <!-- SLIDE: LOCATION & PAYMENT -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Location <em>& Plan</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="two-column">
                    <div class="narrative-panel">
                        <div class="info-label">Location & Community</div>
                        ${escapeHtml(narrative.locationCommunity || loc || 'Location details available on request.')}
                        <div class="info-label" style="margin-top:24px;">Investment Angle</div>
                        ${escapeHtml(narrative.investmentAngle || 'Investment details available on request.')}
                    </div>
                    <div class="payment-panel">
                        <div class="payment-panel-head">
                            <div>
                                <div class="payment-kicker">Commercial Structure</div>
                                <div class="payment-title">Payment Plan</div>
                            </div>
                            <div class="payment-badge">${escapeHtml(currency)}</div>
                        </div>
                        <div class="payment-list">
                            ${paymentPlanRows.map(row => `
                                <div class="payment-row">
                                    <div class="payment-row-label">${escapeHtml(row.label)}</div>
                                    <div class="payment-row-value">${escapeHtml(row.value)}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="payment-note">Final instalments and payment milestones should be confirmed with the advisor before client commitment.</div>
                    </div>
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">Location & Payment Plan</span><span class="footer-page">07</span></div>
        </div>
    </section>

    ${appendixSlides}
    ${developerSlide}

    <!-- SLIDE: CONTACT -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">Next <em>Steps</em></h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <p style="font-size:20px;color:var(--muted);max-width:600px;margin-bottom:40px;font-weight:300;">Ready to secure your place in this landmark development?</p>
                <div class="agent-card">
                    <div class="agent-avatar">${(creatorName?.[0] || 'X').toUpperCase()}</div>
                    <div class="agent-details">
                        <div style="font-size:12px;text-transform:uppercase;letter-spacing:3px;color:var(--accent);font-weight:700;margin-bottom:5px;">${escapeHtml(creatorTitle)}</div>
                        <h3 style="font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:400;color:var(--primary);">${escapeHtml(creatorName)}</h3>
                        ${creatorType === 'Agent' && creatorAgencyName ? `<div style="margin-top:8px;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:800;">Agency: ${escapeHtml(creatorAgencyName)}</div>` : ''}
                        <div style="margin-top:25px;display:flex;gap:15px;flex-wrap:wrap;">
                            ${agentProfile?.phone ? `<span style="background:var(--primary);color:white;padding:12px 30px;border-radius:50px;font-size:12px;font-weight:700;">📞 ${escapeHtml(agentProfile.phone)}</span>` : ''}
                            <span style="background:#25D366;color:white;padding:12px 30px;border-radius:50px;font-size:12px;font-weight:700;">WhatsApp</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="footer-strip" style="justify-content:center;border:none;">
                <img style="height:30px;opacity:0.2" src="${xotoLogoUrl}">
            </div>
        </div>
    </section>

</div>

<script>
    // ── State ──
    let currentIndex = 0;
    let autoPlayInterval = null;
    const slides = document.querySelectorAll('.slide');
    const playStatus = document.getElementById('play-status');
    const hintText = document.getElementById('hint-text');
    const counter = document.getElementById('slide-counter');

    // ── Build dot indicators ──
    slides.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goTo(i));
        counter.appendChild(dot);
    });

    // ── Scale slide-inner to fit viewport (key for mobile) ──
  // ✅ NAYA — sahi approach
function scaleSlides() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = vw / 1280;
    const scaleY = vh / 720;
    const scale = Math.min(scaleX, scaleY);
    document.querySelectorAll('.slide-inner').forEach(el => {
        el.style.transform       = 'scale(' + scale + ')';
        el.style.transformOrigin = 'top left';
        el.style.position        = 'absolute';
        el.style.top             = Math.max(0, (vh - 720 * scale) / 2) + 'px';
        el.style.left            = Math.max(0, (vw - 1280 * scale) / 2) + 'px';
        el.style.margin          = '0';
    });
}

    scaleSlides();
    window.addEventListener('resize', scaleSlides);

    // ── Navigation ──
    function updateUI() {
        slides.forEach((slide, i) => slide.classList.toggle('active', i === currentIndex));
        document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
        // Hide hint after first nav
        if (currentIndex > 0 && hintText) hintText.style.opacity = '0';
    }

    function goTo(index) {
        currentIndex = (index + slides.length) % slides.length;
        updateUI();
    }

    function nextSlide() { goTo(currentIndex + 1); }
    function prevSlide() { goTo(currentIndex - 1); }

    function toggleAutoPlay() {
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
            if (playStatus) playStatus.style.display = 'none';
            document.querySelector('[data-action="toggle-auto-play"] i').className = 'fa-solid fa-play';
        } else {
            autoPlayInterval = setInterval(nextSlide, 5000);
            if (playStatus) playStatus.style.display = 'block';
            document.querySelector('[data-action="toggle-auto-play"] i').className = 'fa-solid fa-pause';
            nextSlide();
        }
    }

    // ── Button listeners ──
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'toggle-auto-play') toggleAutoPlay();
            if (action === 'prev-slide') prevSlide();
            if (action === 'next-slide') nextSlide();
        });
    });

    // ── Keyboard ──
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextSlide(); }
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'Escape' && autoPlayInterval) toggleAutoPlay();
    });

    // ── Touch / Swipe ──
    let touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            if (dx < 0) nextSlide(); else prevSlide();
        }
    }, { passive: true });

    // ── Broken images ──
    document.querySelectorAll('img').forEach(img => {
        const markMissing = () => {
            img.style.display = 'none';
            const frame = img.closest('.g-img, .developer-card, .slide-header, .cover-top');
            if (frame) frame.classList.add('image-missing');
        };
        img.addEventListener('error', markMissing);
        if (img.complete && img.naturalWidth === 0) markMissing();
    });
</script>

</body>
</html>`;
};

// ── 3. Upload to S3 ──────────────────────────────────────────────────────────
const uploadToS3 = async (htmlContent, fileName) => {
  const key = `presentations/${fileName}.html`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: htmlContent, ContentType: 'text/html' }));
  const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { key, url };
};

// ── 4. Save Presentation to DB ───────────────────────────────────────────────
const savePresentation = async ({ leadId, propertyId, agentId, settings, clientNotes, narrative, s3Key, s3Url, title }) => {
  const trackingToken = uuidv4();
  return await Presentation.create({ leadId, propertyId, agentId, settings, clientNotes, narrative, s3Key, s3Url, title, trackingToken, views: [], engagementScore: 0, status: 'active' });
};

const trackView = async (trackingToken, requestData) => {
  const axios = require('axios');
  const ua = requestData.userAgent || '';
  const device = /mobile/i.test(ua) ? 'Mobile' : /tablet/i.test(ua) ? 'Tablet' : 'Desktop';
  
  let country = 'Unknown';
  let ip = requestData.ip;
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'localhost') {
    try {
      const geoRes = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
      if (geoRes.data && geoRes.data.status === 'success') {
        country = geoRes.data.country || 'Unknown';
      }
    } catch (err) {
      console.error('[GeoIP Lookup Error]:', err.message);
    }
  }

  return await Presentation.findOneAndUpdate(
    { trackingToken },
    { 
      $push: { 
        views: { 
          timestamp: new Date(), 
          ip: requestData.ip, 
          device, 
          userAgent: ua,
          country: country 
        } 
      }, 
      $inc: { engagementScore: 15 } 
    },
    { new: true }
  );
};

// ── 6. Get Presentation Views ────────────────────────────────────────────────
const getPresentationViews = async (presentationId, agentId) => {
  return await Presentation.findOne({ _id: presentationId, agentId }).select('views engagementScore title trackingToken createdAt');
};

const getLeadPresentations = async (leadId, agentId) => {
  return await Presentation.find({ leadId, agentId })
    .sort({ createdAt: -1 })
    .select('title trackingToken views engagementScore status createdAt propertyId clientNotes settings')
    .lean();
};

module.exports = {
  generatePresentationNarrative,
  buildHtmlPresentation,
  uploadToS3,
  savePresentation,
  trackView,
  getPresentationViews,
  getLeadPresentations,
  generatePdfFromPresentation,
};
