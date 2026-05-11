const mongoose = require("mongoose");
const GridAgent = require("../../Agent/models/agent");

const propertyEntrySchema = new mongoose.Schema(
  {
    property:   { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    customNote: { type: String, default: "" },
    order:      { type: Number, default: 0 }
  },
  { _id: false }
);

// Tracks who viewed the shared link
const viewTrackingSchema = new mongoose.Schema(
  {
    viewedAt:   { type: Date, default: Date.now },
    deviceType: { type: String, enum: ["mobile", "desktop", "unknown"], default: "unknown" },
    ip:         { type: String, default: "" },
  },
  { _id: false }
);

const presentationSchema = new mongoose.Schema(
  {
    agent:      { type: mongoose.Schema.Types.ObjectId, ref: "GridAgent", required: true },
    lead:       { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    title:      { type: String, default: "Property Presentation" },
    properties: [propertyEntrySchema],

    // PRD 10.1 — Customization options
    settings: {
      language:     { type: String, default: "English" },
      currency:     { type: String, default: "AED" },
      areaUnit:     { type: String, enum: ["sqft", "sqm"], default: "sqft" },
      hideSections: {
        cover:          { type: Boolean, default: false },
        projectDesc:    { type: Boolean, default: false },
        developer:      { type: Boolean, default: false },
        unitPrices:     { type: Boolean, default: false },
        paymentPlans:   { type: Boolean, default: false },
        location:       { type: Boolean, default: false },
      },
    },

    // PRD 10.2 — AI narrative
    aiNarrative:  { type: String, default: "" }, // AI generated property summary
    tone:         { type: String, enum: ["professional", "friendly", "luxury"], default: "professional" },

    // PRD 10.1 — Status
    status: {
      type: String,
      enum: ["draft", "generated", "archived"],
      default: "draft"
    },

    // PRD 10.1 — Share link & tracking
    shareToken:    { type: String, default: "" },
    shareLink:     { type: String, default: "" },
    pdfUrl:        { type: String, default: "" },
    pptxUrl:       { type: String, default: "" }, // PRD 10.3 — export as .pptx
    generatedAt:   { type: Date },

    // PRD 10.1 — Engagement tracking
    viewCount:     { type: Number, default: 0 },
    viewHistory:   [viewTrackingSchema],
    lastViewedAt:  { type: Date },

    // PRD 10.1 — Pipeline status update on view
    pipelineStatus: {
      type: String,
      enum: ["not_sent", "sent", "viewed"],
      default: "not_sent"
    },

    // PRD 10.3 — Linked to agency for white-label
    agency:        { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null },
    isWhiteLabel:  { type: Boolean, default: false },

    // PRD 13 — WhatsApp sharing
    sharedViaWhatsApp: { type: Boolean, default: false },
    sharedViaEmail:    { type: Boolean, default: false },
    sharedAt:          { type: Date },
  },
  { timestamps: true }
);

// Index for fast token lookup
presentationSchema.index({ shareToken: 1 });
presentationSchema.index({ agent: 1, createdAt: -1 });

module.exports = mongoose.model("Presentation", presentationSchema);