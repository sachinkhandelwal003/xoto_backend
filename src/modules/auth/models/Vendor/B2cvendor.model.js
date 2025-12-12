// models/Vendor/B2cvendor.model.js

const mongoose = require('mongoose');

// ==================== SUB SCHEMAS ====================

const storeDetailsSchema = new mongoose.Schema({
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
  state: { type: String, trim: true },
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
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    youtube: String
  }
}, { _id: false });

const registrationSchema = new mongoose.Schema({
  pan_number: { type: String, uppercase: true, trim: true },
  gstin: { type: String, uppercase: true, trim: true },
  business_license_number: { type: String, trim: true },
  shop_act_license: { type: String, trim: true }
}, { _id: false });

const bankDetailsSchema = new mongoose.Schema({
  bank_account_number: { type: String, trim: true },
  ifsc_code: { type: String, uppercase: true, trim: true },
  account_holder_name: { type: String, trim: true },
  bank_name: { type: String, trim: true },
  branch_name: { type: String, trim: true },
  upi_id: { type: String, trim: true },
preferred_currency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Currency'  }}, { _id: false });

const contactSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  mobile: { type: String, trim: true },
  whatsapp: { type: String, trim: true }
}, { _id: false });

const contactsSchema = new mongoose.Schema({
  primary_contact: { type: contactSchema},
  support_contact: { type: contactSchema }
}, { _id: false });

const documentSchema = new mongoose.Schema({
  type: { type: String, trim: true },
  path: { type: String, trim: true },
  verified: { type: Boolean, default: false },
  verified_at: { type: Date },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, trim: true },
  suggestion: { type: String, trim: true },
  uploaded_at: { type: Date, default: Date.now }
}, { _id: false });

const documentsSchema = new mongoose.Schema({
  identity_proof: { type: documentSchema },
  address_proof: { type: documentSchema },
  pan_card: { type: documentSchema },
  gst_certificate: { type: documentSchema },
  cancelled_cheque: { type: documentSchema },
  shop_act_license: { type: documentSchema }
}, { _id: false });

const operationsSchema = new mongoose.Schema({
  delivery_modes: [{ type: String, trim: true }],
  return_policy: { type: String, trim: true },
  avg_delivery_time_days: { type: Number, min: 1, max: 30 }
}, { _id: false });

const performanceSchema = new mongoose.Schema({
  ratings: { type: Number, min: 0, max: 5, default: 0 },
  reviews_count: { type: Number, default: 0 },
  total_orders: { type: Number, default: 0 },
  on_time_delivery_rate: { type: Number, min: 0, max: 100 },
  cancellation_rate: { type: Number, min: 0, max: 100 },
  top_selling_products: [{ type: String }]
}, { _id: false });

const statusInfoSchema = new mongoose.Schema({
  status: { type: Number, enum: [0, 1, 2], default: 0 }, // 0=Pending, 1=Approved, 2=Rejected
  approved_at: Date,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: Date,
  rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejection_reason: String
}, { _id: false });



const metaSchema = new mongoose.Schema({
  agreed_to_terms: { type: Boolean, required: true },
  vendor_portal_access: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_login_at: Date
}, { _id: false });

// ==================== MAIN SCHEMA ====================

const vendorB2CSchema = new mongoose.Schema({
  name: {
    first_name: { type: String, required: true, trim: true, maxlength: 50 },
    last_name: { type: String, required: true, trim: true, maxlength: 50 }
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email']
  },
  password: { type: String, required: true, select: false },
  mobile: {
    country_code: { type: String, default: '+91', trim: true },
    number: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{8,15}$/, 'Mobile must be 8-15 digits']
    }
  },
  is_mobile_verified: { type: Boolean, default: false },
  is_email_verified: { type: Boolean, default: false },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },

  onboarding_status: {
    type: String,
    enum: ['registered', 'profile_incomplete', 'profile_submitted', 'under_review', 'approved', 'rejected', 'suspended'],
    default: 'registered'
  },


  store_details: { type: storeDetailsSchema, required: true, default: {} },
  registration: { type: registrationSchema, default: {} },
  bank_details: { type: bankDetailsSchema, default: {} },
  contacts: { type: contactsSchema, default: {} },
  documents: { type: documentsSchema, default: {} },
  operations: { type: operationsSchema, default: {} },
  performance: { type: performanceSchema, default: {} },
  status_info: { type: statusInfoSchema, default: () => ({ status: 0 }) },
    isActive: { type: Boolean, default: true },
  meta: { type: metaSchema, required: true }
},
{
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
vendorB2CSchema.index({ email: 1 });
vendorB2CSchema.index({ 'mobile.number': 1 });
vendorB2CSchema.index({ onboarding_status: 1 });
vendorB2CSchema.index({ 'store_details.store_name': 'text', 'store_details.city': 'text' });

// Virtuals
vendorB2CSchema.virtual('full_name').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`.trim();
});

vendorB2CSchema.virtual('is_fully_approved').get(function () {
  return this.onboarding_status === 'approved' && this.meta.vendor_portal_access;
});

// Export
module.exports = mongoose.model('VendorB2C', vendorB2CSchema);