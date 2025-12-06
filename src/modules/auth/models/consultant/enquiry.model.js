// models/enquiry/enquiry.model.js
const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
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
  message: { type: String, trim: true, maxlength: 2000 },
  preferred_contact: {
    type: String,
    enum: ['phone', 'email', 'whatsapp'],
    default: 'phone'
  },
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
enquirySchema.virtual('full_name').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`.trim();
});

// Indexes
enquirySchema.index({ email: 1 });
enquirySchema.index({ 'mobile.number': 1 });
enquirySchema.index({ status: 1 });
enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ is_deleted: 1 });

// Soft delete middleware
enquirySchema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
  if (!this.getOptions()?.includeDeleted) {
    this.where({ is_deleted: false });
  }
});

module.exports = mongoose.model('Enquiry', enquirySchema);