const mongoose = require('mongoose');

const category_schema = new mongoose.Schema({
  name: { type: String, required: [true, 'Category name is required'], trim: true },
  sub_categories: [{ type: String, trim: true }]
});

const business_details_schema = new mongoose.Schema({
  business_name: { type: String, required: [true], trim: true },
  business_description: { type: String, trim: true },
  business_type: { type: String, enum: ['Individual', 'Private Limited', 'Partnership'], trim: true },
  business_address: { type: String, trim: true },
  pickup_address: { type: String, trim: true },
  pincode: { type: String, trim: true },
  website: { type: String, trim: true },
  logo: { type: String, trim: true },
  annual_turnover: { type: Number, min: 0 },
  categories: [category_schema],
});

const registration_schema = new mongoose.Schema({
  pan_number: { type: String, trim: true },
  gstin: { type: String, trim: true },
  company_registration_number: { type: String, trim: true },
  tax_identification_number: { type: String, trim: true },
  import_export_code: { type: String, trim: true },
  business_license_number: { type: String, trim: true }
});

const bank_details_schema = new mongoose.Schema({
  bank_account_number: { type: String, trim: true },
  ifsc_code: { type: String, trim: true },
  account_holder_name: { type: String, trim: true },
  preferred_currency: { type: String, default: 'INR', trim: true },
  credit_limit: { type: Number, min: 0 },
  payment_terms: { type: String, trim: true },
  payment_history: [{ type: mongoose.Schema.Types.Mixed }],
  average_payment_delay_days: { type: Number, min: 0 }
});

const contact_schema = new mongoose.Schema({
  type: { type: String, trim: true },
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  mobile: { type: String, trim: true }
});

const authorized_user_schema = new mongoose.Schema({
  user_id: { type: String, trim: true },
  name: { type: String, trim: true },
  role: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  last_login: { type: Date }
});

const contacts_schema = new mongoose.Schema({
  primary_contact: { type: contact_schema },
  support_contacts: [{ type: contact_schema }],
  authorized_users: [{ type: authorized_user_schema }]
});

const document_schema = new mongoose.Schema({
  type: { type: String, trim: true },
  path: { type: String, trim: true },
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true }, // why rejected
  suggestion: { type: String, trim: true }, // what to do next
  valid_till: { type: Date },
  start_date: { type: Date },
  end_date: { type: Date },
  date: { type: Date },
  score: { type: Number, min: 0 },
  uploaded_at: { type: Date, default: Date.now }
});


const documents_schema = new mongoose.Schema({
  identity_proof: { type: document_schema },
  address_proof: { type: document_schema },
  business_proof: { type: document_schema },
  gst_certificate: { type: document_schema },
  cancelled_cheque: { type: document_schema },
  compliance_documents: [{ type: document_schema }],
  contract_documents: [{ type: document_schema }],
  audit_documents: [{ type: document_schema }]
});

const insurance_schema = new mongoose.Schema({
  policy_number: { type: String, trim: true },
  provider: { type: String, trim: true },
  valid_till: { type: Date },
  coverage_type: { type: String, trim: true }
});

const compliance_schema = new mongoose.Schema({
  risk_rating: { type: String, trim: true },
  blacklist_status: { type: Boolean, default: false },
  sanction_check_status: { type: String, trim: true },
  insurance_details: { type: insurance_schema },
  esg_compliance: {
    environmental_policy: { type: Boolean, default: false },
    social_responsibility: { type: Boolean, default: false },
    governance_practices: { type: Boolean, default: false }
  }
});

const operations_schema = new mongoose.Schema({
  warehouses: [{ location: String, capacity: String }],
  delivery_modes: [{ type: String, trim: true }],
  lead_time_days: { type: Number, min: 0 },
  return_policy: { type: String, trim: true }
});

const status_info_schema = new mongoose.Schema({
  status: { type: Number, default: 0 }, // 0 = Pending, 1 = Approved, 2 = Rejected
  rejection_reason: { type: String, trim: true },
  approved_at: { type: Date },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  last_audit_date: { type: Date },
  audit_score: { type: Number, min: 0 }
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

const vendor_b2b_schema = new mongoose.Schema({
  email: { type: String, unique: true, required: [true], lowercase: true, trim: true },
  password: { type: String, required: [true] },
  full_name: { type: String, trim: true },
  mobile: { type: String, trim: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  is_mobile_verified: { type: Boolean, default: false },
  business_details: { type: business_details_schema, required: true },
  registration: { type: registration_schema },
  bank_details: { type: bank_details_schema },
  contacts: { type: contacts_schema },
  documents: { type: documents_schema },
  compliance: { type: compliance_schema },
  operations: { type: operations_schema },
  status_info: { type: status_info_schema },
  meta: { type: meta_schema, required: true }
});

// Add indexes for performance
vendor_b2b_schema.index({ mobile: 1 });
vendor_b2b_schema.index({ 'status_info.status': 1 });

module.exports = mongoose.model('VendorB2B', vendor_b2b_schema);