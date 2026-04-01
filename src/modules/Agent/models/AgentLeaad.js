// models/Lead.js
const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema({
  // =========================
  // REFERENCES
  // =========================
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    required: true
  },
  agency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agency",
    default: null
  },

  // =========================
  // PROPERTY PREFERENCES
  // =========================
  budget: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 }
  },
  preferred_location: [{ type: String, default: [] }],
  bedrooms: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 }
  },
  property_type: [{ 
    type: String, 
    enum: ["apartment", "villa", "townhouse", "duplex", "penthouse"],
    default: []
  }],
  area: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 }
  },
  specific_project: { type: String, default: "" },
  furnishing: { 
    type: String, 
    enum: ["furnished", "semi_furnished", "unfurnished", null],
    default: null 
  },
  has_view: { type: Boolean, default: null },
  parking_spaces: { type: Number, default: 0 },
  requirement_description: { type: String, default: "" },

  // =========================
  // SELECTED PROPERTY
  // =========================
  selected_property: { type: mongoose.Schema.Types.ObjectId, ref: "Properties", default: null },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer", default: null },

  // =========================
  // LEAD SOURCE & STATUS
  // =========================
  source: {
    type: String,
    enum: ["manual", "presentation", "enquiry", "site_visit", "qr_code", "website", "bulk_upload"],
    default: "manual"
  },
  status: {
    type: String,
    enum: ["customer", "lead", "visit", "deal", "booking", "closed", "lost"],
    default: "customer"
  },
  
  lastActivity: { type: String, default: "New Lead" },
  followUpDate: { type: Date, default: null },
  lostAt: { type: Date, default: null },
  convertedAt: { type: Date, default: null },

  // =========================
  // DEAL TRACKING
  // =========================
  dealValue: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },

  // =========================
  // SOFT DELETE
  // =========================
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }

}, { timestamps: true });

// Indexes
LeadSchema.index({ customer: 1 });
LeadSchema.index({ agent: 1, status: 1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ followUpDate: 1 });

// Virtual
LeadSchema.virtual("customer_name").get(function() {
  return this.customer ? `${this.customer.first_name} ${this.customer.last_name}` : "";
});

// Methods
LeadSchema.methods.markAsLost = function(reason) {
  this.status = "lost";
  this.lostAt = new Date();
  this.lastActivity = `Lost: ${reason}`;
  return this.save();
};

LeadSchema.methods.markAsConverted = function(dealValue) {
  this.status = "closed";
  this.convertedAt = new Date();
  this.dealValue = dealValue;
  this.lastActivity = "Converted to deal";
  return this.save();
};

LeadSchema.methods.selectProperty = function(propertyId) {
  this.selected_property = propertyId;
  this.lastActivity = `Property selected: ${propertyId}`;
  return this.save();
};

module.exports = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);