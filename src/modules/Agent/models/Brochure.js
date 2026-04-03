// models/Brochure.js
const mongoose = require("mongoose");

const BrochureSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Properties", required: true },
  interestId: { type: mongoose.Schema.Types.ObjectId, ref: "LeadInterest" },
  
  // =========================
  // FILE INFO
  // =========================
  fileUrl: { type: String, required: true },
  fileName: { type: String, default: "" },
  
  // =========================
  // TRACKING
  // =========================
  trackingId: {
    type: String,
    unique: true,
    required: true,
    default: () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  },
  shareLink: { type: String, default: "" },
  
  // =========================
  // EMAIL TRACKING
  // =========================
  emailSentTo: { type: String, default: "" },
  emailSentAt: { type: Date, default: null },
  
  // =========================
  // VIEW TRACKING
  // =========================
  views: [{
    viewedAt: { type: Date, default: Date.now },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    device: { type: String, enum: ["Desktop", "Mobile", "Tablet"], default: "Desktop" }
  }],
  viewCount: { type: Number, default: 0 },
  lastViewedAt: { type: Date, default: null }

}, { timestamps: true });

// Indexes
BrochureSchema.index({ trackingId: 1 });
BrochureSchema.index({ leadId: 1 });

// Methods
BrochureSchema.methods.recordView = function(ip, userAgent) {
  let device = "Desktop";
  if (userAgent.includes("Mobile")) device = "Mobile";
  if (userAgent.includes("iPad")) device = "Tablet";
  
  this.views.push({ viewedAt: new Date(), ip, userAgent, device });
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

BrochureSchema.methods.generateShareLink = function(baseUrl) {
  this.shareLink = `${baseUrl}/api/brochure/track/${this.trackingId}`;
  return this.save();
};

module.exports = mongoose.models.Brochure || mongoose.model("Brochure", BrochureSchema);