// models/estimate/Estimate.model.js
const mongoose = require('mongoose');


const ImageSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    url: String
  },
  { _id: false }
);

const estimateSchema = new mongoose.Schema({
  service_type: {
    type: String,
    required: true,
    enum: ['landscape', 'interior'],
  },
 
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'EstimateMasterSubcategory' },

  type: { type: mongoose.Schema.Types.ObjectId, ref: 'EstimateMasterType', required: true },

  type_gallery_snapshot: {
    previewImage: ImageSchema,
    moodboardImages: [ImageSchema]
  },

  package: { type: mongoose.Schema.Types.ObjectId, ref: 'LandscapingPackage' },

  area_length: { type: Number },
  area_width: { type: Number },
  area_sqft: { type: Number, required: true },

  description: { type: String, required: true },
  attachments: [{ type: String }],

  // simplified final status flow
  status: {
    type: String,
    enum: [
      'pending', // customer - > superadmin -> 
      'assigned',// superadmin -> supervisor 
      'final_created', // supervisor --> superadmin
      'superadmin_approved', 
      'customer_accepted',
      'customer_rejected',
      'cancelled', 'deal'
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
  supervisor_progress: { // supervisor --> freelancer , 
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
  admin_final_quotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' }, //admin --> customer
  freelancer_selected_quotation:{ type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
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
  estimated_amount :{
    type:Number,
    default:0,
    required:false
  },
  submitted_at: { type: Date, default: Date.now }

}, { timestamps: true });

module.exports = mongoose.model('Estimate', estimateSchema);
