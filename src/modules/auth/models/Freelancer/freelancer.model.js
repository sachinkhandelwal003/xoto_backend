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
  uploaded_at: { type: Date, default: Date.now }
});

const service_schema = new mongoose.Schema({
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category_freelancer', 
    required: true 
  },
  subcategories: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Subcategory_freelancer', 
    required: true 
  }], // ← NOW ARRAY OF SUBCATEGORIES
  description: { type: String, trim: true },
  price_range: { type: String, trim: true },
  unit: { type: String, trim: true },
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
});

const location_schema = new mongoose.Schema({
  city: String,
  state: String,
  country: String,
  pincode: String
}, { _id: false });

const professional_schema = new mongoose.Schema({
  experience_years: { type: Number, min: 0 },
  bio: { type: String, trim: true, maxlength: 1000 },
  skills: [{ type: String, trim: true }],
  working_radius: { type: String, trim: true },
  availability: { type: String, enum: ['Part-time', 'Full-time', 'Project-based'] }
}, { _id: false });

const payment_schema = new mongoose.Schema({
  preferred_method: String,
  advance_percentage: { type: Number, min: 0, max: 100 },
  gst_number: String
}, { _id: false });

const status_info_schema = new mongoose.Schema({
  status: { type: Number, default: 0, enum: [0, 1, 2] }, // 0=Pending, 1=Approved, 2=Rejected
  approved_at: Date,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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
});

const freelancer_schema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
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
    match: [/^\+\d{1,4}$/, 'Invalid country code (e.g. +91, +1, +44)']
  },
  number: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{8,15}$/.test(v);
      },
      message: 'Mobile number must contain 8-15 digits only'
    }
  }
},

is_mobile_verified: { type: Boolean, default: false },
verified_at: { type: Date }, // optional: set when verified
  profile_image: String,

  professional: { type: professional_schema, required: true },
  location: location_schema,
  languages: [{ type: String, trim: true }],

  services_offered: [service_schema],
  portfolio: [portfolio_schema],
  gallery: [String],

  payment: payment_schema,
  status_info: status_info_schema,
  meta: { type: meta_schema, required: true },

  documents: [document_schema], // Will be uploaded after registration

  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },

  isActive: { type: Boolean, default: true },
  is_deleted: { type: Boolean, default: false },
  deleted_at: Date
}, {
  timestamps: true
});

// Indexes
freelancer_schema.index({ mobile: 1 }, { unique: true, sparse: true });
freelancer_schema.index({ 'status_info.status': 1 });
freelancer_schema.index({ 'professional.skills': 1 });
freelancer_schema.index({ 'services_offered.category': 1 });
freelancer_schema.index({ 'services_offered.subcategory': 1 });
freelancer_schema.index({ 'location.city': 1 });
freelancer_schema.index({ is_deleted: 1 });

// Auto-update meta.updated_at
freelancer_schema.pre('save', function(next) {
  this.meta.updated_at = new Date();
  next();
});

// Soft delete
['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'updateMany'].forEach(method => {
  freelancer_schema.pre(method, function() {
    this.where({ is_deleted: false });
  });
});

module.exports = mongoose.model('Freelancer', freelancer_schema);