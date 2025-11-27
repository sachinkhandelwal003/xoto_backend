// models/estimate/Estimate.model.js
const mongoose = require('mongoose');

const estimateSchema = new mongoose.Schema({

  customer_name: { type: String, required: true, trim: true },
  customer_email: { type: String, required: true, lowercase: true, trim: true },
 customer_mobile: {
  country_code: {
    type: String,
    required: true,
    trim: true,
    default: '+91',
  },
  number: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{8,15}$/.test(v);
      }    }
  }
},
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
      'cancelled','deal'
    ],
    default: 'pending'
  },

  // 🔵 Supervisor assignment
  assigned_supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'Allusers' },
  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Allusers' },
  assigned_at: Date,
deal_converted_at: Date,
deal_converted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    enum: ['none', 'sent_to_customer', 'customer_responded', 'deal_created'],
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
