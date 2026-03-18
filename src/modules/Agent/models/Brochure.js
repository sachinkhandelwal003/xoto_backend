const mongoose = require("mongoose");

const BrochureSchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
    required: true
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true
  },
  interestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LeadInterest"
  },
  
  // File info
  fileUrl: {
    type: String,
    required: true
  },
  fileName: String,
  
  // Tracking
  trackingId: {
    type: String,
    unique: true,
    required: true,
    default: () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  },
  shareLink: String,
  
  // Email tracking
  emailSentTo: String,
  emailSentAt: Date,
  
  // View tracking
  views: [{
    viewedAt: Date,
    ip: String,
    userAgent: String,
    device: String
  }],
  
  viewCount: { type: Number, default: 0 },
  lastViewedAt: Date,
  
  createdAt: { type: Date, default: Date.now }
});

BrochureSchema.index({ trackingId: 1 });
BrochureSchema.index({ leadId: 1 });

module.exports = mongoose.model("Brochure", BrochureSchema);