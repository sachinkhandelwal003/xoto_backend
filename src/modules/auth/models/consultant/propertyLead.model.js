// models/propertyLead/propertyLead.model.js
const mongoose = require('mongoose');

const propertyLeadSchema = new mongoose.Schema({
 type: {
    type: String,
    enum: [
      'buy', 
      'sell', 
      'rent',           // new: from hero form
      'schedule_visit',
      'partner',        // new: for Partner Ecosystem
      'investor',       // optional split if needed
      'developer'
    ],
    required: true
  },
  name: {
    first_name: { type: String, required: true, trim: true, maxlength: 50 },
    last_name: { type: String, required: true, trim: true, maxlength: 50 }
  },
  mobile: {
    country_code: { type: String, required: true, trim: true, default: '+91' },
    number: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => /^\d{8,15}$/.test(v),
        message: 'Mobile number must be 8-15 digits'
      }
    }
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  preferred_contact: {
    type: String,
    enum: ['call', 'whatsapp', 'email'],
    default: 'call'
  },
  company: { type: String, trim: true },
  stakeholder_type: {
    type: String,
    enum: ['Business Associate', 'Execution Partner', 'Developer', 'Investor'],
    trim: true
  },
  message: { type: String, trim: true, maxlength: 1000 },

  // Optional: keep budget as string for flexibility (used in hero form)
  budget: { type: String, trim: true }, // changed from Number → String

  // For property leads
  preferred_city: { type: String, trim: true }, // renamed from 'city' for clarity
  looking_for: { 
    type: String, 
    enum: ['Buy', 'Sell', 'Rent'],
    trim: true 
  },
  // Buy specific
  desired_bedrooms: { type: String, trim: true },
  // Sell specific
  listing_type: { type: String, trim: true },
  city: { type: String, trim: true },
  area: { type: String, trim: true },
  project_name: { type: String, trim: true },
  developer: { type: String, trim: true },
  bedrooms: { type: String, trim: true },
  unit_type: {
    type: String,
    enum: ['apartment', 'villa', 'townhouse', 'duplex', 'penthouse', 'other']
  },
  bedroom_config: { type: String, trim: true }, // e.g., 'studio', '1bed'
  price: { type: Number },
  size_sqft: { type: Number },
  description: { type: String, trim: true, maxlength: 2000 },
  // Schedule specific
  occupation: { type: String, trim: true },
  location: { type: String, trim: true },
  // General
  status: {
    type: String,
    enum: ['submit', 'contacted'],
    default: 'submit'
  },
  follow_up_date: { type: Date },
  notes: [{
    text: String,
    author: String,
    createdAt: { type: Date, default: Date.now }
  }],
  is_active: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// Virtual full name
propertyLeadSchema.virtual('full_name').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`.trim();
});

// Indexes
propertyLeadSchema.index({ email: 1 });
propertyLeadSchema.index({ 'mobile.number': 1 });
propertyLeadSchema.index({ status: 1 });
propertyLeadSchema.index({ type: 1 });
propertyLeadSchema.index({ createdAt: -1 });
propertyLeadSchema.index({ is_deleted: 1 });

// Soft delete middleware
propertyLeadSchema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
  if (!this.getOptions()?.includeDeleted) {
    this.where({ is_deleted: false });
  }
});

module.exports = mongoose.model('PropertyLead', propertyLeadSchema);