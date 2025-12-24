// models/landingPageLead/landingPageLead.model.js
const mongoose = require('mongoose');

const landingPageLeadSchema = new mongoose.Schema({

  // Lead type (optional but useful for scaling)
  type: {
    type: String,
    default: 'landing_page',
    required: false
  },

  // Core fields (always required)
  name: {
    type: String,
    required: false,
    trim: true
  },

  phone_number: {
    type: String,
    required: false,
    trim: true
  },

  email: {
    type: String,
    required: false,
    trim: true
  },

  property_type: {
    type: String,
    required: false,
    trim: true
  },

  area: {
    type: String,
    required: false,
    trim: true
  },

  description: {
    type: String,
    required: false,
    trim: true
  },

  status: {
    type: String,
    enum: ['submit', 'contacted', 'converted', 'dead'],
    default: 'submit',
    required:false
  },

  notes: {
    type: [{
      text: { type: String, required: true },
      author: String,
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  },

  is_active: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }

}, {
  timestamps: true
});


const LandingPageLead = mongoose.model('LandingPageLead', landingPageLeadSchema);

module.exports = LandingPageLead;
