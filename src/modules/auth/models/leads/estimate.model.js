// models/estimate/Estimate.model.js
const mongoose = require('mongoose');

const estimateSchema = new mongoose.Schema({

  customer_name: { type: String, required: true, trim: true },
  customer_email: { type: String, required: true, lowercase: true, trim: true },
  customer_mobile: { type: String, required: true, match: /^[6-9]\d{9}$/ },

  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  subcategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory_freelancer' }],

  description: { type: String, required: true },
  attachments: [{ type: String }],

  // simplified final status flow
  status: {
    type: String,
    enum: [
      'pending',
      'assigned',
      'final_created',
      'superadmin_approved',
      'customer_accepted',
      'customer_rejected',
      'cancelled'
    ],
    default: 'pending'
  },

  // 🔵 Supervisor assignment
  assigned_supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'Allusers' },
  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Allusers' },
  assigned_at: Date,

  // 🔵 Separate SUPERVISOR PROGRESS
 supervisor_progress: {
    type: String,
    enum: ['none', 'request_sent', 'request_completed', 'final_quotation_created'],
    default: 'none'
  },

  // Store freelancers selected to receive request
  sent_to_freelancers: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'Freelancer' }
  ],

  // Track freelancer quotations
  freelancer_quotations: [
    {
      freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'Freelancer' },
      quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
      submitted_at: Date
    }
  ],

  // Final quotation chosen by supervisor
  final_quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },

  // 🔵 CUSTOMER PROGRESS
 customer_progress: {
    type: String,
    enum: ['none', 'sent_to_customer', 'customer_responded'],
    default: 'none'
  },
customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },

  customer_response: {
    status: { type: String, enum: ['accepted', 'rejected', null], default: null },
    reason: String,
    responded_at: Date
  },

  submitted_at: { type: Date, default: Date.now }

}, { timestamps: true });

module.exports = mongoose.model('Estimate', estimateSchema);
