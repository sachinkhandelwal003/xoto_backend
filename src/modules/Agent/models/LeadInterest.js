const mongoose = require("mongoose");

const LeadInterestSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
    required: true
  },
  
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true
  },
  
  developer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Developer"
  },
  
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    required: true
  },

  // =========================
  // INTEREST SOURCE
  // =========================
  interest_source: {
    type: String,
    enum: [
      "ai_suggested",      // AI recommended
      "agent_added",       // Agent manually added
      "client_selected",   // Client showed interest
      "brochure_sent"      // Brochure sent
    ],
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
      property_type_match: Number
    },
    generated_at: Date
  },

  // =========================
  // BROCHURE TRACKING
  // =========================
  brochure: {
    sent: { type: Boolean, default: false },
    sent_at: Date,
    sent_via: { 
      type: String, 
      enum: ["whatsapp", "email", "sms", "link"] 
    },
    
    // Tracking
    viewed: { type: Boolean, default: false },
    viewed_at: Date,
    view_duration: Number, // seconds spent viewing
    
    clicked: { type: Boolean, default: false },
    clicked_at: Date,
    clicked_pages: [String], // which pages they clicked
    
    // Brochure file
    file_url: String,
    file_name: String,
    
    // QR Code tracking
    qr_code: String,
    qr_scanned_at: Date
  },

  // =========================
  // SITE VISIT LINK (to your existing SiteVisit model)
  // =========================
  site_visit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SiteVisit"  // Links to your existing SiteVisit model
  },
  
  site_visit_requested: {
    type: Boolean,
    default: false
  },
  
  site_visit_requested_at: Date,

  // =========================
  // CONVERSION TRACKING
  // =========================
  is_selected: { 
    type: Boolean, 
    default: false  // true when client chooses this property
  },
  
  selected_at: Date,
  
  deal_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Deal"
  },
  
  conversion_stage: {
    type: String,
    enum: ["interest", "brochure_sent", "viewed", "site_visit_requested", "site_visit_completed", "deal"],
    default: "interest"
  },

  // =========================
  // ENGAGEMENT METRICS
  // =========================
  engagement_score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  last_interaction: Date,
  interaction_count: { type: Number, default: 0 },

  // =========================
  // NOTES
  // =========================
  notes: String,

  // =========================
  // STATUS
  // =========================
  is_active: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: Date

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =========================
// INDEXES
// =========================
LeadInterestSchema.index({ lead: 1, property: 1 }, { unique: true }); // One interest per lead per property
LeadInterestSchema.index({ lead: 1, is_selected: 1 });
LeadInterestSchema.index({ agent: 1 });
LeadInterestSchema.index({ "brochure.sent": 1, "brochure.viewed": 1 });
LeadInterestSchema.index({ conversion_stage: 1 });
LeadInterestSchema.index({ engagement_score: -1 });
LeadInterestSchema.index({ site_visit: 1 }); // Index for SiteVisit reference

// =========================
// VIRTUAL FIELDS
// =========================
LeadInterestSchema.virtual("is_hot").get(function() {
  return this.engagement_score > 70 || 
         (this.brochure.viewed && this.brochure.clicked) ||
         this.site_visit_requested;
});

LeadInterestSchema.virtual("conversion_probability").get(function() {
  if (this.deal_id) return 100;
  if (this.is_selected) return 80;
  if (this.site_visit) return 60; // Has site visit record
  if (this.site_visit_requested) return 40;
  if (this.brochure.viewed) return 30;
  if (this.brochure.sent) return 20;
  return 10;
});

// =========================
// METHODS
// =========================

// Track brochure view
LeadInterestSchema.methods.trackBrochureView = function(duration, pages) {
  this.brochure.viewed = true;
  this.brochure.viewed_at = new Date();
  this.brochure.view_duration = duration;
  this.last_interaction = new Date();
  this.interaction_count += 1;
  
  // Update engagement score
  this.engagement_score = Math.min(100, this.engagement_score + 20);
  
  // Update conversion stage
  if (this.conversion_stage === "interest" || this.conversion_stage === "brochure_sent") {
    this.conversion_stage = "viewed";
  }
};

// Track brochure click
LeadInterestSchema.methods.trackBrochureClick = function(page) {
  if (!this.brochure.clicked) {
    this.brochure.clicked = true;
    this.brochure.clicked_at = new Date();
  }
  
  if (page && !this.brochure.clicked_pages.includes(page)) {
    this.brochure.clicked_pages.push(page);
  }
  
  this.last_interaction = new Date();
  this.interaction_count += 1;
  
  // Update engagement score
  this.engagement_score = Math.min(100, this.engagement_score + 15);
};

// Request site visit (links to your SiteVisit model)
LeadInterestSchema.methods.requestSiteVisit = function(siteVisitId) {
  this.site_visit = siteVisitId;
  this.site_visit_requested = true;
  this.site_visit_requested_at = new Date();
  this.conversion_stage = "site_visit_requested";
  this.last_interaction = new Date();
  this.interaction_count += 1;
  this.engagement_score = Math.min(100, this.engagement_score + 30);
};

// Mark site visit as completed (updates based on SiteVisit feedback)
LeadInterestSchema.methods.completeSiteVisit = function(interestScore) {
  this.conversion_stage = "site_visit_completed";
  this.last_interaction = new Date();
  this.interaction_count += 1;
  
  if (interestScore >= 7) {
    this.engagement_score = Math.min(100, this.engagement_score + 40);
  }
};

// Mark as selected (client chooses this property)
LeadInterestSchema.methods.markAsSelected = function(dealId = null) {
  this.is_selected = true;
  this.selected_at = new Date();
  this.conversion_stage = "deal";
  this.engagement_score = 100;
  
  if (dealId) {
    this.deal_id = dealId;
  }
};

// =========================
// STATIC METHODS
// =========================

// Get hot leads (high engagement)
LeadInterestSchema.statics.findHotLeads = function(agentId = null) {
  const query = { 
    is_active: true,
    $or: [
      { engagement_score: { $gt: 70 } },
      { "brochure.viewed": true, "brochure.clicked": true },
      { site_visit_requested: true }
    ]
  };
  
  if (agentId) query.agent = agentId;
  
  return this.find(query)
    .populate("lead", "name phone_number email")
    .populate("property", "propertyName price")
    .sort({ engagement_score: -1 });
};

// Get leads that viewed brochure but no site visit
LeadInterestSchema.statics.findWarmLeads = function(agentId = null) {
  const query = {
    is_active: true,
    "brochure.viewed": true,
    site_visit_requested: false,
    engagement_score: { $gt: 30, $lte: 70 }
  };
  
  if (agentId) query.agent = agentId;
  
  return this.find(query)
    .populate("lead", "name phone_number")
    .populate("property", "propertyName");
};

module.exports = mongoose.models.LeadInterest || mongoose.model("LeadInterest", LeadInterestSchema);