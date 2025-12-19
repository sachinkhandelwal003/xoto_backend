// models/propertyLead/propertyLead.model.js
const mongoose = require('mongoose');


const propertyLeadSchema = new mongoose.Schema({
type: {
  type: String,
  enum: [
    'buy',
    'sell',
    'rent',
    'schedule_visit',
    'partner',
    'investor',
    'developer',
    'enquiry',
    'consultation' 
  ],
  required: true,
  index: true
},


  // Core fields (always required)
  name: {
    first_name: { type: String, required: true, trim: true, maxlength: 50 },
    last_name:  { type: String, required: true, trim: true, maxlength: 50 }
  },
  mobile: {
    country_code: { type: String, required: true, trim: true, default: '+91' },
    number: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => /^\d{8,15}$/.test(v),
        message: 'Mobile number must be 8–15 digits only'
      }
    }
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
  },
  // Consultation specific
consultant_type: {
  type: String,
  enum: ['landscape', 'interior', 'architect', 'civil_engineer', 'other'],
  trim: true
},

  preferred_contact: {
    type: String,
    enum: ['call', 'whatsapp', 'email'],
    default: 'whatsapp'
  },

  // Generic fields used by multiple forms
  country: { type: String, trim: true },
  preferred_city: { type: String, trim: true },
  budget: { type: String, trim: true }, // Keep as String → ranges like "70-90 Lakhs"

  // Buy-specific
  desired_bedrooms: { type: String, trim: true },

  // Sell-specific
  listing_type: { type: String, trim: true },
  city: { type: String, trim: true },
  area: { type: String, trim: true },
  project_name: { type: String, trim: true },
  bedroom_config: { type: String, trim: true },
  price: { type: Number },
  description: { type: String, trim: true, maxlength: 2000 },

  // Schedule visit
  occupation: { type: String, trim: true },
  location: { type: String, trim: true },

  // Partner / Investor / Developer
  company: { type: String, trim: true },
  stakeholder_type: {
    type: String,
    enum: ['Business Associate', 'Execution Partner', 'Developer', 'Investor'],
    trim: true
  },
  message: { type: String, trim: true, maxlength: 1000 },

  // Admin fields
  status: { type: String, enum: ['submit', 'contacted', 'converted', 'dead'], default: 'submit' },
  follow_up_date: { type: Date },
  notes: [{
    text: { type: String, required: true },
    author: String,
    createdAt: { type: Date, default: Date.now }
  }],

  is_active: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, {
  timestamps: true
});

// Virtuals
propertyLeadSchema.virtual('full_name').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`.trim();
});

// Compound indexes for fast admin dashboard filters
propertyLeadSchema.index({ type: 1, createdAt: -1 });
propertyLeadSchema.index({ type: 1, preferred_city: 1 });
propertyLeadSchema.index({ type: 1, status: 1 });
propertyLeadSchema.index({ 'mobile.number': 1 });
propertyLeadSchema.index({ email: 1 });
propertyLeadSchema.index({ is_deleted: false });

// Soft delete
propertyLeadSchema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'aggregate'], function () {
  if (!this.getOptions()?.includeDeleted) {
    this.where({ is_deleted: false });
  }
});

const PropertyLead = mongoose.model('PropertyLead', propertyLeadSchema);

// ======================== VALIDATION (Universal for ALL forms) ========================


// ======================== CONTROLLER ========================


module.exports = PropertyLead;