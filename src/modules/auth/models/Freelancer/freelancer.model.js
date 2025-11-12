// models/freelancer.js
const mongoose = require('mongoose');

// ----- Document Sub-schema -----
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

// ----- Sub-schemas (all snake_case) -----
const service_schema = new mongoose.Schema({
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory_freelancer', required: true },
  description: { type: String, trim: true },
  price_range: { type: String, trim: true },
  unit: { type: String, trim: true },
  images: [{ type: String, trim: true }],
  is_active: { type: Boolean, default: true }
});


const portfolio_schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category_freelancer', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory_freelancer', required: true },
  description: { type: String, trim: true },
  images: [{ type: String, trim: true }],
  area: { type: String, trim: true },
  duration: { type: String, trim: true },
  client_name: { type: String, trim: true },
  completed_at: { type: Date },
  featured: { type: Boolean, default: false }
});

const location_schema = new mongoose.Schema({
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  pincode: { type: String, trim: true }
});

const professional_schema = new mongoose.Schema({
  experience_years: { type: Number, min: 0 },
  bio: { type: String, trim: true },
  skills: [{ type: String, trim: true }],
  working_radius: { type: String, trim: true },
  availability: { type: String, enum: ['Part-time', 'Full-time', 'Project-based'], trim: true }
});

const payment_schema = new mongoose.Schema({
  preferred_method: { type: String,  trim: true },
  advance_percentage: { type: Number, min: 0, max: 100 },
  gst_number: { type: String, trim: true }
});

const status_info_schema = new mongoose.Schema({
  status: { type: Number, default: 0 }, // 0=Pending, 1=Approved, 2=Rejected
  approved_at: { type: Date },
  approved_by: { type: String, trim: true }
});

const meta_schema = new mongoose.Schema({
  agreed_to_terms: { type: Boolean, default: false },
  portal_access: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  change_history: [
    {
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      changes: [{ type: String }],
      updated_at: { type: Date, default: Date.now }
    }
  ]
});

// ----- Main Freelancer Schema -----
const freelancer_schema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },

  name: {
    first_name: { type: String, required: true, trim: true },
    last_name:  { type: String, required: true, trim: true }
  },

  mobile: { type: String, trim: true },
  is_mobile_verified: { type: Boolean, default: false },
  profile_image: { type: String, trim: true },

  professional: { type: professional_schema, required: true },
  location: { type: location_schema },
  languages: [{ type: String, trim: true }],

  services_offered: [{ type: service_schema }],
  portfolio: [{ type: portfolio_schema }],
  gallery: [{ type: String, trim: true }],

  payment: { type: payment_schema },
  status_info: { type: status_info_schema },
  meta: { type: meta_schema, required: true },

  documents: [document_schema], // ← ADDED

  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
 isActive: {
    type: Boolean,
    default: true
  },  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

// ----- Indexes -----
freelancer_schema.index({ mobile: 1 });
freelancer_schema.index({ 'status_info.status': 1 });
freelancer_schema.index({ 'professional.skills': 1 });
freelancer_schema.index({ 'services_offered.category': 1 });
freelancer_schema.index({ 'services_offered.subcategory': 1 });
freelancer_schema.index({ 'location.city': 1 });
freelancer_schema.index({ is_deleted: 1 });

// Update meta.updated_at
freelancer_schema.pre('save', function (next) {
  this.meta.updated_at = Date.now();
  next();
});

// Soft-delete middleware
freelancer_schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
  this.where({ is_deleted: false });
});

module.exports = mongoose.model('Freelancer', freelancer_schema);