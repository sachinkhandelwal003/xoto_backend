// models/consultant/consult.model.js
const mongoose = require('mongoose');

const consultant_schema = new mongoose.Schema({
  name: {
    first_name: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 50
    },
    last_name: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 50
    }
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
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  type: {
    type: String,
    required: [true, 'Consultant type is required'],
    enum: ['landscape', 'interior', 'architect', 'civil_engineer', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    default: 'submitted',
    enum: ['submitted', 'contacted', 'qualified', 'not_qualified', 'converted', 'rejected']
  },
  message: { type: String, trim: true, maxlength: 1000 },
  follow_up_date: { type: Date },
  notes: { type: String, trim: true, maxlength: 500 },
  is_active: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, {
  timestamps: true
});

// Virtual: full name
consultant_schema.virtual('full_name').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`;
});

// Indexes
consultant_schema.index({ email: 1 });
consultant_schema.index({ status: 1 });
consultant_schema.index({ is_deleted: 1 });
consultant_schema.index({ 'mobile.number': 1 });
consultant_schema.index({ follow_up_date: 1 });
consultant_schema.index({ type: 1 });           // New index for type filtering
consultant_schema.index({ type: 1, status: 1 }); // Compound index for common queries

// Soft delete middleware
consultant_schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
  if (!this.getOptions().includeDeleted) {
    this.where({ is_deleted: false });
  }
});

module.exports = mongoose.model('Consultant', consultant_schema);