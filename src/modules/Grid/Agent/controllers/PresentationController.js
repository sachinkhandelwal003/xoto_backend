const Presentation = require("../models/Presentation");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");
const { uploadFileToS3 } = require("../../../s3/upload");

// ══════════════════════════════════════════════════════════════
//  HELPER — detect device type from user agent
// ══════════════════════════════════════════════════════════════
const getDeviceType = (userAgent = "") => {
  if (/mobile/i.test(userAgent))  return "mobile";
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/desktop|windows|macintosh|linux/i.test(userAgent)) return "desktop";
  return "unknown";
};

// ══════════════════════════════════════════════════════════════
//  HELPER — build PDF buffer wrapped in a Promise
//
//  ROOT CAUSE FIX: The original code called res.json() inside
//  doc.on("end") — a plain callback. Any error thrown inside it
//  could not be caught by the outer try/catch, and calling
//  res.json() after headers were already sent would crash Node.
//
//  Fix: wrap the entire PDFKit stream in a Promise so we can
//  await the buffer cleanly before touching res at all.
// ══════════════════════════════════════════════════════════════
function buildPDFBuffer(presentation) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];

    doc.on("data",  (chunk) => chunks.push(chunk));
    doc.on("end",   ()      => resolve(Buffer.concat(chunks)));
    doc.on("error", (err)   => reject(err));

    const settings   = presentation.settings || {};
    const agentName  = `${presentation.agent?.first_name || ""} ${presentation.agent?.last_name || ""}`.trim() || "Xoto Advisor";
    const clientName = presentation.lead
      ? `${presentation.lead?.name?.first_name || ""} ${presentation.lead?.name?.last_name || ""}`.trim()
      : "";

    // ── SLIDE 1: Cover ────────────────────────────────────────
    if (!settings.hideSections?.cover) {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#1E1A50");

      doc.fillColor("#7F77DD").fontSize(32).font("Helvetica-Bold")
        .text("Xoto", 50, 80, { continued: true })
        .fillColor("#3DAF78").text(" GRID");

      doc.fillColor("#ffffff").fontSize(9).font("Helvetica")
        .text("EXCLUSIVE PROPERTY PRESENTATION", 50, 130, { characterSpacing: 2 });

      doc.fillColor("#ffffff").fontSize(26).font("Helvetica-Bold")
        .text(presentation.title || "Property Presentation", 50, 180, { width: 495 });

      if (clientName) {
        doc.fillColor("rgba(255,255,255,0.5)").fontSize(9).font("Helvetica")
          .text("PREPARED EXCLUSIVELY FOR", 50, 280, { characterSpacing: 1.5 });
        doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold")
          .text(clientName, 50, 298);
      }

      doc.moveTo(50, doc.page.height - 120)
        .lineTo(doc.page.width - 50, doc.page.height - 120)
        .strokeColor("rgba(255,255,255,0.15)").stroke();

      doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
        .text(agentName, 50, doc.page.height - 100);
      doc.fillColor("rgba(255,255,255,0.5)").fontSize(10).font("Helvetica")
        .text("Xoto Real Estate Advisor", 50, doc.page.height - 82);

      // PRD §10.3 — "Powered by Xoto" on every page footer
      doc.fillColor("#7F77DD").fontSize(8)
        .text("Powered by Xoto", 50, doc.page.height - 40, { align: "right", width: 495 });
      doc.fillColor("rgba(255,255,255,0.3)").fontSize(8)
        .text(new Date().toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" }), 50, doc.page.height - 40);

      doc.addPage();
    }

    // ── SLIDES: One page per property ────────────────────────
    for (let pi = 0; pi < presentation.properties.length; pi++) {
      const entry = presentation.properties[pi];
      const p     = entry.property;
      if (!p) continue;

      const currency = settings.currency || "AED";
      const areaUnit = settings.areaUnit === "sqm" ? "sq m" : "sq ft";

      if (!settings.hideSections?.projectDesc) {
        doc.fillColor("#7F77DD").fontSize(20).font("Helvetica-Bold")
          .text(p.propertyName || "Property", 50, 50);
        doc.moveTo(50, 80).lineTo(doc.page.width - 50, 80)
          .strokeColor("#e5e7eb").stroke();
        doc.fillColor("#374151").fontSize(11).font("Helvetica")
          .text(p.description || "A premium property brought to you exclusively by Xoto.", 50, 95, { width: 495, lineGap: 4 });
        doc.moveDown(1.5);
      }

      // Stat boxes
      const yStats = doc.y;
      const stats  = [];

      if (!settings.hideSections?.unitPrices) {
        const price = p.price || p.price_min;
        if (price) stats.push({ label: "Price", value: `${currency} ${Number(price).toLocaleString("en-AE")}` });
      }
      if (p.bedrooms !== undefined) stats.push({ label: "Bedrooms", value: String(p.bedrooms || "N/A") });
      const area = p.builtUpArea || p.builtUpArea_min;
      if (area) stats.push({ label: "Area", value: `${Number(area).toLocaleString()} ${areaUnit}` });
      if (!settings.hideSections?.location && (p.area || p.city)) {
        stats.push({ label: "Location", value: `${p.area || ""}${p.area && p.city ? ", " : ""}${p.city || ""}` });
      }
      if (!settings.hideSections?.developer && p.developer) {
        stats.push({ label: "Developer", value: p.developer });
      }

      stats.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x   = 50 + col * 255;
        const y   = yStats + row * 70;
        doc.rect(x, y, 240, 58).fillColor("#F8F7FF").fill();
        doc.fillColor("#7F77DD").fontSize(9).font("Helvetica-Bold")
          .text(s.label.toUpperCase(), x + 12, y + 12, { characterSpacing: 1 });
        doc.fillColor("#1f2937").fontSize(14).font("Helvetica-Bold")
          .text(s.value, x + 12, y + 28, { width: 216 });
      });

      doc.y = yStats + Math.ceil(stats.length / 2) * 70 + 20;

      // Payment plan
      if (!settings.hideSections?.paymentPlans && p.paymentPlan?.length) {
        doc.fillColor("#1f2937").fontSize(13).font("Helvetica-Bold").text("Payment Plan", 50, doc.y);
        doc.moveDown(0.5);
        p.paymentPlan.forEach((phase) => {
          doc.fillColor("#7F77DD").fontSize(11).font("Helvetica-Bold")
            .text(`${phase.percentage || ""}%`, 50, doc.y, { continued: true, width: 60 })
            .fillColor("#374151").font("Helvetica")
            .text(`  ${phase.milestone || phase.description || ""}`, { continued: false });
        });
        doc.moveDown();
      }

      // Agent note
      if (entry.customNote) {
        doc.rect(50, doc.y, 495, 40).fillColor("#FAEEDA").fill();
        doc.fillColor("#633806").fontSize(9).font("Helvetica-Bold")
          .text("AGENT NOTE", 62, doc.y - 34, { characterSpacing: 1 });
        doc.fillColor("#633806").fontSize(10).font("Helvetica")
          .text(entry.customNote, 62, doc.y - 20, { width: 471 });
        doc.moveDown(2);
      }

      // PRD §10.3 — footer on every page
      doc.fontSize(8).fillColor("#9ca3af")
        .text("Powered by Xoto GRID · Confidential", 50, doc.page.height - 40, { align: "center", width: 495 });

      if (pi < presentation.properties.length - 1) doc.addPage();
    }

    // ── SLIDE: Next steps ────────────────────────────────────
    doc.addPage();

    doc.fillColor("#7F77DD").fontSize(22).font("Helvetica-Bold")
      .text("Ready to move forward?", 50, 50);
    doc.fillColor("#374151").fontSize(11).font("Helvetica")
      .text(
        "Your Xoto Real Estate Advisor is ready to guide you through the next steps. Schedule a private viewing, ask questions, or request a detailed financial breakdown.",
        50, 90, { width: 495, lineGap: 4 }
      );

    const ctaItems = [
      { label: "Schedule a Viewing", sub: "Private site visit arranged within 24 hours" },
      { label: "Chat on WhatsApp",   sub: "Instant response from your advisor" },
      { label: "Call Your Advisor",  sub: agentName },
    ];
    ctaItems.forEach((c, i) => {
      const x = 50 + i * 170;
      doc.rect(x, 160, 155, 80).fillColor("#F8F7FF").fill();
      doc.fillColor("#1f2937").fontSize(10).font("Helvetica-Bold").text(c.label, x + 12, 175, { width: 131 });
      doc.fillColor("#9ca3af").fontSize(8).font("Helvetica").text(c.sub, x + 12, 194, { width: 131 });
    });

    // PRD §10.3 — footer on last page too
    doc.fontSize(8).fillColor("#9ca3af")
      .text("Powered by Xoto GRID · Confidential", 50, doc.page.height - 40, { align: "center", width: 495 });

    doc.end();
  });
}

// ══════════════════════════════════════════════════════════════
//  CREATE DRAFT
//  POST /agent/lead/presentations
// ══════════════════════════════════════════════════════════════
exports.createPresentationDraft = async (req, res) => {
  try {
    const { leadId, title, properties, settings, tone } = req.body;
    const agentId      = req.user._id;
    const agencyId     = req.user.agency || null;

    const presentation = await Presentation.create({
      agent:       agentId,
      lead:        leadId || null,
      title:       title || "Property Presentation",
      properties:  properties || [],
      settings:    settings || {},
      tone:        tone || "professional",
      agency:      agencyId,
      isWhiteLabel: !!agencyId,
      status:      "draft",
    });

    await presentation.populate("properties.property");
    res.status(201).json({ success: true, data: presentation });
  } catch (err) {
    console.error("Create draft error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  UPDATE DRAFT
//  PUT /agent/lead/presentations/:id
// ══════════════════════════════════════════════════════════════
exports.updatePresentation = async (req, res) => {
  try {
    const { title, properties, settings, tone, aiNarrative } = req.body;
    const presentation = await Presentation.findOne({ _id: req.params.id, agent: req.user._id });

    if (!presentation)
      return res.status(404).json({ success: false, message: "Presentation not found" });
    if (presentation.status !== "draft")
      return res.status(400).json({ success: false, message: "Only drafts can be edited" });

    if (title       !== undefined) presentation.title       = title;
    if (properties  !== undefined) presentation.properties  = properties;
    if (settings    !== undefined) presentation.settings    = { ...presentation.settings, ...settings };
    if (tone        !== undefined) presentation.tone        = tone;
    if (aiNarrative !== undefined) presentation.aiNarrative = aiNarrative;

    await presentation.save();
    await presentation.populate("properties.property");
    res.status(200).json({ success: true, data: presentation });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  GENERATE PDF + SHARE LINK
//  POST /agent/lead/presentations/:id/generate
// ══════════════════════════════════════════════════════════════
exports.generatePresentation = async (req, res) => {
  try {
    const { id } = req.params;

    const presentation = await Presentation.findOne({ _id: id, agent: req.user._id })
      .populate("properties.property")
      .populate("lead")
      .populate("agent");

    if (!presentation)
      return res.status(404).json({ success: false, message: "Presentation not found" });

    if (!presentation.properties.length)
      return res.status(400).json({ success: false, message: "Add at least one property before generating" });

    // ── Step 1: Build PDF buffer (awaited — no callback hell) ─
    let pdfBuffer;
    try {
      pdfBuffer = await buildPDFBuffer(presentation);
    } catch (pdfErr) {
      console.error("PDF build error:", pdfErr);
      return res.status(500).json({ success: false, message: "PDF generation failed", detail: pdfErr.message });
    }

    // ── Step 2: Upload to S3 ──────────────────────────────────
    let pdfUrl = "";
    try {
    const fakeReq = {
  file: {
    buffer: pdfBuffer,
    originalname: `presentation-${id}-${Date.now()}.pdf`,
    mimetype: "application/pdf",
    size: pdfBuffer.length,
    location: ""
  }
};

const fakeRes = {
  status: () => ({
    json: (data) => data
  })
};

const s3Response = await uploadFileToS3(fakeReq, fakeRes);

      // Handle both S3 SDK v2 (Location) and v3 (url / Location)
      pdfUrl = s3Response?.Location || s3Response?.url || "";

      if (!pdfUrl) {
        console.error("S3 response missing URL. Full response:", JSON.stringify(s3Response));
        return res.status(500).json({ success: false, message: "PDF upload failed — S3 returned no URL. Check S3 credentials and bucket config." });
      }
    } catch (s3Err) {
      console.error("S3 upload error:", s3Err);
      return res.status(500).json({
        success: false,
        message: "PDF upload failed",
        detail:  s3Err.message,
      });
    }

    // ── Step 3: Save and respond ──────────────────────────────
    const shareToken = uuidv4();

    presentation.pdfUrl         = pdfUrl;
    presentation.shareToken     = shareToken;
    presentation.shareLink      = `${process.env.BASE_URL}/presentation/share/${shareToken}`;
    presentation.status         = "generated";
    presentation.generatedAt    = new Date();
    presentation.pipelineStatus = "not_sent";

    await presentation.save();

    return res.status(200).json({
      success: true,
      message: "Presentation generated successfully",
      data: { ...presentation.toObject(), shareLink: presentation.shareLink },
    });

  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

// ══════════════════════════════════════════════════════════════
//  LIST ALL
//  GET /agent/lead/presentations
// ══════════════════════════════════════════════════════════════
exports.listPresentations = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { agent: req.user._id };
    if (status) filter.status = status;

    const total         = await Presentation.countDocuments(filter);
    const presentations = await Presentation.find(filter)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("lead", "name email")
      .populate("properties.property", "propertyName price area city")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: presentations.length, total, page: Number(page), pages: Math.ceil(total / limit), data: presentations });
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  GET SINGLE
//  GET /agent/lead/presentations/:id
// ══════════════════════════════════════════════════════════════
exports.getPresentation = async (req, res) => {
  try {
    const presentation = await Presentation.findOne({ _id: req.params.id, agent: req.user._id })
      .populate("properties.property")
      .populate("lead");

    if (!presentation)
      return res.status(404).json({ success: false, message: "Not found" });

    res.status(200).json({ success: true, data: presentation });
  } catch (err) {
    console.error("Get error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  PUBLIC SHARE VIEW (no auth)
//  GET /agent/lead/presentations/share/:token
// ══════════════════════════════════════════════════════════════
exports.sharePresentation = async (req, res) => {
  try {
    const presentation = await Presentation.findOne({ shareToken: req.params.token, status: "generated" })
      .populate("properties.property")
      .populate("lead");

    if (!presentation)
      return res.status(404).json({ success: false, message: "Presentation not found" });

    // PRD §10.1 — track open: timestamp, device type, +15 engagement score
    presentation.viewCount     += 1;
    presentation.lastViewedAt   = new Date();
    presentation.pipelineStatus = "viewed";
    presentation.viewHistory.push({
      viewedAt:   new Date(),
      deviceType: getDeviceType(req.headers["user-agent"]),
      ip:         req.ip,
    });

    await presentation.save();
    res.status(200).json({ success: true, data: presentation });
  } catch (err) {
    console.error("Share error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  SHARE VIA CHANNEL
//  POST /agent/lead/presentations/:id/share
// ══════════════════════════════════════════════════════════════
exports.shareViaChannel = async (req, res) => {
  try {
    const { channel } = req.body;
    const presentation = await Presentation.findOne({ _id: req.params.id, agent: req.user._id });

    if (!presentation)
      return res.status(404).json({ success: false, message: "Presentation not found" });
    if (presentation.status !== "generated")
      return res.status(400).json({ success: false, message: "Generate the presentation first" });

    if (channel === "whatsapp") presentation.sharedViaWhatsApp = true;
    if (channel === "email")    presentation.sharedViaEmail    = true;

    presentation.sharedAt       = new Date();
    presentation.pipelineStatus = "sent";

    await presentation.save();
    res.status(200).json({ success: true, message: `Shared via ${channel}`, shareLink: presentation.shareLink });
  } catch (err) {
    console.error("Share via channel error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  ARCHIVE
//  DELETE /agent/lead/presentations/:id
// ══════════════════════════════════════════════════════════════
exports.archivePresentation = async (req, res) => {
  try {
    const presentation = await Presentation.findOne({ _id: req.params.id, agent: req.user._id });

    if (!presentation)
      return res.status(404).json({ success: false, message: "Not found" });

    presentation.status = "archived";
    await presentation.save();
    res.status(200).json({ success: true, message: "Presentation archived" });
  } catch (err) {
    console.error("Archive error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};