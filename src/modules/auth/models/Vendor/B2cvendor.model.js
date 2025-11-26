const mongoose = require('mongoose');


const store_details_schema = new mongoose.Schema({
  store_name: { type: String, required: [true], trim: true },
  store_description: { type: String, trim: true },
  store_type: { type: String, enum: ['Individual / Sole Proprietor', 'Private Limited', 'Partnership'], trim: true },
  store_address: { type: String, trim: true },
  pincode: { type: String, trim: true },
  website: { type: String, trim: true },
  logo: { type: String, trim: true },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }], // Reference Category model
  social_links: {
    facebook: { type: String, trim: true },
    twitter: { type: String, trim: true },
    instagram: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    youtube: { type: String, trim: true }
  }
});

const registration_schema = new mongoose.Schema({
  pan_number: { type: String, trim: true },
  gstin: { type: String, trim: true },
  business_license_number: { type: String, trim: true },
  shop_act_license: { type: String, trim: true } // path to document
});
const bank_details_schema = new mongoose.Schema({
  bank_account_number: { type: String, trim: true },
  ifsc_code: { type: String, trim: true },
  account_holder_name: { type: String, trim: true },
  upi_id: { type: String, trim: true },
  preferred_currency: { type: String, default: 'INR', trim: true }
});

const contact_schema = new mongoose.Schema({
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  mobile: { type: String, trim: true },
  whatsapp: { type: String, trim: true }
});

const contacts_schema = new mongoose.Schema({
  primary_contact: { type: contact_schema },
  support_contact: { type: contact_schema }
});

const document_schema = new mongoose.Schema({
  type: { type: String, trim: true },
  path: { type: String, trim: true },
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true }, // why rejected
  suggestion: { type: String, trim: true }, // what to do next
  uploaded_at: { type: Date, default: Date.now }
});

const documents_schema = new mongoose.Schema({
  identity_proof: { type: document_schema },
  address_proof: { type: document_schema },
  gst_certificate: { type: document_schema }
});
const operations_schema = new mongoose.Schema({
  delivery_modes: [{ type: String, trim: true }],
  return_policy: { type: String, trim: true },
  avg_delivery_time_days: { type: Number, min: 0 }
});

const performance_schema = new mongoose.Schema({
  ratings: { type: Number, min: 0, max: 5 },
  reviews_count: { type: Number, min: 0 },
  on_time_delivery_rate: { type: Number, min: 0, max: 100 },
  cancellation_rate: { type: Number, min: 0, max: 100 },
  top_selling_products: [{ type: String, trim: true }]
});

const status_info_schema = new mongoose.Schema({
  status: { type: Number, default: 0 }, // 0 = Pending, 1 = Approved, 2 = Rejected
  approved_at: { type: Date },
  approved_by: { type: String, trim: true }
});

const change_history_schema = new mongoose.Schema({
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now },
  changes: [{ type: String, trim: true }]
});
const meta_schema = new mongoose.Schema({
  agreed_to_terms: { type: Boolean, default: false },
  vendor_portal_access: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
    change_history: [{ type: change_history_schema }]

});

const vendor_b2c_schema = new mongoose.Schema({
  email: { type: String, unique: true, required: [true], lowercase: true, trim: true },
  password: { type: String, required: [true] },
  full_name: { type: String, trim: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  mobile: { type: String, trim: true },
  is_mobile_verified: { type: Boolean, default: false },
  store_details: { type: store_details_schema, required: true },
  registration: { type: registration_schema },
  bank_details: { type: bank_details_schema },
  contacts: { type: contacts_schema },
  documents: { type: documents_schema },
  operations: { type: operations_schema },
  performance: { type: performance_schema },
  status_info: { type: status_info_schema },
  meta: { type: meta_schema, required: true }
});
// Add indexes for performance
vendor_b2c_schema.index({ mobile: 1 });
vendor_b2c_schema.index({ 'status_info.status': 1 });
module.exports = mongoose.model('VendorB2C', vendor_b2c_schema);