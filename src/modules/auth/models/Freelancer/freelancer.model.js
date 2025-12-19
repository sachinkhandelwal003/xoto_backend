// models/freelancer.js
const mongoose = require('mongoose');

const document_schema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['resume', 'portfolio', 'identityProof', 'addressProof', 'certificate'],
    required: true
  },
  path: { type: String, required: true },
  verified: { type: Boolean, default: false },
  verified_at: { type: Date },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String },           // when rejected
  suggestion: { type: String },        // when rejected
  uploaded_at: { type: Date, default: Date.now }
}, { _id: true }); // Keep _id so we can update individual documents

const service_schema = new mongoose.Schema({
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category_freelancer', 
    required: true 
  },
  subcategories: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Subcategory_freelancer'
  }], 
  description: { type: String, trim: true },
  price_range: { type: String, trim: true },   // e.g., "5000 - 15000"
  unit: { type: String, trim: true },          // e.g., "per hour", "fixed", "per sq.ft"
  images: [{ type: String }],
  is_active: { type: Boolean, default: true }
});

const portfolio_schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory_freelancer', required: true },
  description: { type: String, trim: true },
  images: [{ type: String }],
  area: String,
  duration: String,
  client_name: String,
  completed_at: Date,
  featured: { type: Boolean, default: false }
}, { _id: true });

const location_schema = new mongoose.Schema({
  city: String,
  state: String,
  country: { type: String, default: 'UAE' },
  pincode: String
}, { _id: false });

const professional_schema = new mongoose.Schema({
  experience_years: { type: Number, min: 0 },
  bio: { type: String, trim: true, maxlength: 1000 },
  skills: [{ type: String, trim: true }],
  working_radius: { type: String, trim: true }, // e.g., "50 km"
  availability: { 
    type: String, 
    enum: ['Part-time', 'Full-time', 'Project-based'],
    default: 'Full-time'
  }
}, { _id: false });

const payment_schema = new mongoose.Schema({
  preferred_method: String,
  advance_percentage: { type: Number, min: 0, max: 100 },
  gst_number: String,
  preferred_currency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Currency'  }
}, { _id: false });
 
const status_info_schema = new mongoose.Schema({
  status: { type: Number, enum: [0, 1, 2], default: 0 }, // 0=Pending, 1=Approved, 2=Rejected
  approved_at: Date,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: Date,
  rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejection_reason: String
}, { _id: false });

const meta_schema = new mongoose.Schema({
  agreed_to_terms: { type: Boolean, required: true },
  portal_access: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  change_history: [{
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changes: [String],
    updated_at: { type: Date, default: Date.now }
  }]
}, { _id: false });

const freelancer_schema = new mongoose.Schema({
  email: { 
    type: String, 
    unique: true, 
    required: true, 
    lowercase: true, 
    trim: true 
  },
  password: { type: String, required: true, select: false },

  name: {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true }
  },

  mobile: {
    country_code: {
      type: String,
      required: true,
      trim: true,
      default: '+91',
      match: [/^\+\d{1,4}$/, 'Invalid country code']
    },
    number: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: v => /^\d{8,15}$/.test(v),
        message: 'Mobile number must contain 8-15 digits only'
      }
    }
  },

  is_mobile_verified: { type: Boolean, default: false },
  verified_at: { type: Date },
  profile_image: String,

  professional: { type: professional_schema, required: true },
  location: location_schema,
  languages: [{ type: String, trim: true }],

  services_offered: [service_schema],
  portfolio: [portfolio_schema],
  gallery: [String],

  payment: payment_schema,
  documents: [document_schema],

  // Onboarding & Approval Flow
  onboarding_status: {
    type: String,
    enum: [
      'registered',
      'profile_incomplete',
      'profile_submitted',
      'under_review',
      'approved',
      'rejected',
      'suspended'
    ],
    default: 'registered'
  },

  status_info: status_info_schema,
  meta: { type: meta_schema, required: true },

  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },

  isActive: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: Full Name
freelancer_schema.virtual('full_name').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`.trim();
});

// Indexes
freelancer_schema.index({ email: 1 }, { unique: true });
freelancer_schema.index({ 'mobile.country_code': 1, 'mobile.number': 1 }, { unique: true, sparse: true });
freelancer_schema.index({ 'status_info.status': 1 });
freelancer_schema.index({ onboarding_status: 1 });
freelancer_schema.index({ 'professional.skills': 1 });
freelancer_schema.index({ 'services_offered.category': 1 });
freelancer_schema.index({ 'services_offered.subcategories': 1 });
freelancer_schema.index({ 'location.city': 1 });
freelancer_schema.index({ is_deleted: 1 });

// Auto-update meta.updated_at
freelancer_schema.pre('save', function (next) {
  this.meta.updated_at = new Date();
  next();
});

// Soft Delete Middleware
['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'updateMany'].forEach(method => {
  freelancer_schema.pre(method, function () {
    this.where({ is_deleted: false });
  });
});

module.exports = mongoose.model('Freelancer', freelancer_schema);