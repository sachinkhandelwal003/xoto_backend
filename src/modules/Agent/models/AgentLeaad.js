const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema({
  // CLIENT INFO
  name: {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true }
  },
  email: { type: String, trim: true, lowercase: true },
  phone_number: { type: String, required: true, trim: true },

  // PROPERTY INTEREST
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  property_interest: { type: String, trim: true },

  // REQUIREMENTS
  requirement_description: { type: String, trim: true },
  budget: { type: Number, min: 0 },
  preferred_location: { type: String, trim: true },
  bedrooms: { type: Number, min: 0 },
  property_type: { type: String, trim: true },

  // AGENT
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  
  source: {
    type: String,
    enum: ["manual", "presentation", "enquiry", "site_visit", "qr_code", "website"],
    default: "manual"
  },

  // STATUS
  status: {
    type: String,
    enum: ["customer", "lead", "visit", "deal", "booking", "closed", "lost"],
    default: "customer"
  },

  // TRACKING
  lastActivity: { type: String, default: "New Lead" },
  followUpDate: { type: Date },
  
  // SOFT DELETE
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }

}, { timestamps: true });

// Indexes
LeadSchema.index({ agent: 1, status: 1 });
LeadSchema.index({ project: 1 });
LeadSchema.index({ phone_number: 1 });
LeadSchema.index({ followUpDate: 1 });

module.exports = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);