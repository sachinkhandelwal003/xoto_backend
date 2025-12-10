const mongoose = require('mongoose');

const store_details_schema = new mongoose.Schema({
  store_name: { type: String, required: true, trim: true },
  store_description: { type: String, trim: true },
  store_type: {
    type: String,
    enum: ['Individual / Sole Proprietor', 'Private Limited', 'Partnership'],
    required: true,
    trim: true
  },
  store_address: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  country: { type: String, default: 'India', trim: true },
  pincode: { type: String, required: true, trim: true },
  website: { type: String, trim: true },
  logo: { type: String, trim: true },
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  }],
  social_links: {
    facebook: { type: String, trim: true },
    twitter: { type: String, trim: true },
    instagram: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    youtube: { type: String, trim: true }
  }
}, { _id: false });

const registration_schema = new mongoose.Schema({
  pan_number: { type: String, trim: true, uppercase: true },
  gstin: { type: String, trim: true, uppercase: true },
  business_license_number: { type: String, trim: true },
  shop_act_license: { type: String, trim: true } // document path
}, { _id: false });

const bank_details_schema = new mongoose.Schema({
  bank_account_number: { type: String, trim: true },
  ifsc_code: { type: String, trim: true, uppercase: true },
  account_holder_name: { type: String, trim: true },
  upi_id: { type: String, trim: true },
  preferred_currency: { type: String, default: 'INR', trim: true }
}, { _id: false });

const contact_schema = new mongoose.Schema({
  name: { type: String, trim: true, trim: true },
  designation: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  mobile: { type: String, trim: true },
  whatsapp: { type: String, trim: true }
}, { _id: false });

const contacts_schema = new mongoose.Schema({
  primary_contact: { type: contact_schema },
  support_contact: { type: contact_schema }
}, { _id: false });

const document_schema = new mongoose.Schema({
  type: { type: String, trim: true },
  path: { type: String, required: false, trim: true },   // ✅ OPTIONAL
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true },
  suggestion: { type: String, trim: true },
  uploaded_at: { type: Date, default: Date.now }
}, { _id: false });



const documents_schema = new mongoose.Schema({
  identity_proof: { type: document_schema, required: false },
  address_proof: { type: document_schema, required: false },
  gst_certificate: { type: document_schema, required: false }
}, { _id: false });

const operations_schema = new mongoose.Schema({
  delivery_modes: [{ type: String, trim: true }],
  return_policy: { type: String, trim: true },
  avg_delivery_time_days: { type: Number, min: 0 }
}, { _id: false });

const performance_schema = new mongoose.Schema({
  ratings: { type: Number, min: 0, max: 5, default: 0 },
  reviews_count: { type: Number, min: 0, default: 0 },
  on_time_delivery_rate: { type: Number, min: 0, max: 100 },
  cancellation_rate: { type: Number, min: 0, max: 100 },
  top_selling_products: [{ type: String, trim: true }]
}, { _id: false });

const status_info_schema = new mongoose.Schema({
  status: { type: Number, default: 0 }, // 0=Pending, 1=Approved, 2=Rejected
  approved_at: { type: Date },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const change_history_schema = new mongoose.Schema({
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now },
  changes: [{ type: String, trim: true }]
}, { _id: false });

const meta_schema = new mongoose.Schema({
  agreed_to_terms: { type: Boolean, required: true },
  vendor_portal_access: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  change_history: [change_history_schema]
}, { _id: false });

// Main Vendor Schema - Updated with first_name/last_name + proper mobile
const vendor_b2c_schema = new mongoose.Schema({
  // Personal Info
  name: {
    first_name: { type: String, required: true, trim: true, maxlength: 50 },
    last_name: { type: String, required: true, trim: true, maxlength: 50 }
  },

  email: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true
  },

  password: { type: String, required: true, select: false },

  mobile: {
    country_code: { type: String, default: '+91', trim: true },
    number: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{8,15}$/, 'Mobile number must be 8-15 digits']
    }
  },
  is_mobile_verified: { type: Boolean, default: false },

  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },

  // All your original sections - kept 100% intact
  store_details: { type: store_details_schema, required: true },
  registration: { type: registration_schema },
  bank_details: { type: bank_details_schema },
  contacts: { type: contacts_schema },
  documents: { type: documents_schema },
  operations: { type: operations_schema },
  performance: { type: performance_schema },
  status_info: { type: status_info_schema },
  meta: { type: meta_schema, required: true }
}, {
  timestamps: true // adds createdAt, updatedAt automatically at root level
});

// Indexes for fast queries
vendor_b2c_schema.index({ email: 1 });
vendor_b2c_schema.index({ 'mobile.number': 1 });
vendor_b2c_schema.index({ 'status_info.status': 1 });
vendor_b2c_schema.index({ 'store_details.categories': 1 });
vendor_b2c_schema.index({ 'store_details.store_name': 'text' });

// Virtual for full name (if needed in future)
vendor_b2c_schema.virtual('full_name').get(function() {
  return `${this.name.first_name} ${this.name.last_name}`.trim();
});

module.exports = mongoose.model('VendorB2C', vendor_b2c_schema);