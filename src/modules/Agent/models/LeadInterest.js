// models/LeadInterest.js
const mongoose = require("mongoose");

const LeadInterestSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Properties", required: true },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer", default: null },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },

  // =========================
  // INTEREST SOURCE
  // =========================
  interest_source: {
    type: String,
    enum: ["ai_suggested", "agent_added", "client_selected", "brochure_sent"],
    default: "ai_suggested"
  },

  // =========================
  // AI MATCH DATA
  // =========================
  ai_match: {
    score: { type: Number, min: 0, max: 100 },
    reasons: [String],
    factors: {
      budget_match: Number,
      location_match: Number,
      bedroom_match: Number,
      property_type_match: Number,
      area_match: Number
    },
    generated_at: Date
  },

  // =========================
  // BROCHURE TRACKING
  // =========================
  brochure: {
    sent: { type: Boolean, default: false },
    sent_at: Date,
    sent_via: { type: String, enum: ["whatsapp", "email", "sms", "link"] },
    viewed: { type: Boolean, default: false },
    viewed_at: Date,
    view_duration: Number,
    file_url: String
  },

  // =========================
  // SITE VISIT
  // =========================
  site_visit: { type: mongoose.Schema.Types.ObjectId, ref: "SiteVisit", default: null },
  site_visit_requested: { type: Boolean, default: false },
  site_visit_requested_at: Date,

  // =========================
  // CONVERSION TRACKING
  // =========================
  is_selected: { type: Boolean, default: false },
  selected_at: Date,
  deal_id: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", default: null },
  
  conversion_stage: {
    type: String,
    enum: ["interest", "brochure_sent", "viewed", "site_visit_requested", "site_visit_completed", "deal"],
    default: "interest"
  },

  // =========================
  // ENGAGEMENT METRICS
  // =========================
  engagement_score: { type: Number, min: 0, max: 100, default: 0 },
  last_interaction: Date,
  interaction_count: { type: Number, default: 0 },

  // =========================
  // NOTES & STATUS
  // =========================
  notes: String,
  is_active: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: Date

}, { timestamps: true });

// Indexes
LeadInterestSchema.index({ lead: 1, property: 1 }, { unique: true });
LeadInterestSchema.index({ lead: 1, is_selected: 1 });
LeadInterestSchema.index({ conversion_stage: 1 });
LeadInterestSchema.index({ engagement_score: -1 });

// Virtuals
LeadInterestSchema.virtual("is_hot").get(function() {
  return this.engagement_score > 70 || 
         (this.brochure.viewed && this.brochure.sent) ||
         this.site_visit_requested;
});

LeadInterestSchema.virtual("conversion_probability").get(function() {
  if (this.deal_id) return 100;
  if (this.is_selected) return 80;
  if (this.site_visit) return 60;
  if (this.site_visit_requested) return 40;
  if (this.brochure.viewed) return 30;
  if (this.brochure.sent) return 20;
  return 10;
});

// Methods
LeadInterestSchema.methods.markBrochureSent = function(via = "whatsapp") {
  this.brochure.sent = true;
  this.brochure.sent_at = new Date();
  this.brochure.sent_via = via;
  this.conversion_stage = "brochure_sent";
  this.engagement_score = Math.min(100, this.engagement_score + 20);
  this.last_interaction = new Date();
  return this.save();
};

LeadInterestSchema.methods.markBrochureViewed = function(duration = 0) {
  this.brochure.viewed = true;
  this.brochure.viewed_at = new Date();
  this.brochure.view_duration = duration;
  this.conversion_stage = "viewed";
  this.engagement_score = Math.min(100, this.engagement_score + 15);
  this.last_interaction = new Date();
  return this.save();
};

LeadInterestSchema.methods.requestSiteVisit = function(siteVisitId) {
  this.site_visit = siteVisitId;
  this.site_visit_requested = true;
  this.site_visit_requested_at = new Date();
  this.conversion_stage = "site_visit_requested";
  this.engagement_score = Math.min(100, this.engagement_score + 30);
  return this.save();
};

LeadInterestSchema.methods.completeSiteVisit = function(interestScore) {
  this.conversion_stage = "site_visit_completed";
  this.engagement_score = Math.min(100, this.engagement_score + (interestScore >= 7 ? 40 : 20));
  this.last_interaction = new Date();
  return this.save();
};

LeadInterestSchema.methods.markAsSelected = function(dealId = null) {
  this.is_selected = true;
  this.selected_at = new Date();
  this.conversion_stage = "deal";
  this.engagement_score = 100;
  if (dealId) this.deal_id = dealId;
  return this.save();
};

module.exports = mongoose.models.LeadInterest || mongoose.model("LeadInterest", LeadInterestSchema);