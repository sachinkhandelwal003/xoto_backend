const mongoose = require("mongoose");

// ----------------------------
// Category Schema
// ----------------------------
const category_schema = new mongoose.Schema({
  name: { type: String, required: [true, "Category name is required"], trim: true },
  subcategories: [{ type: String, trim: true }]
});

// ----------------------------
// Store / Business Details
// ----------------------------
const store_details_schema = new mongoose.Schema({
  store_name: { type: String, required: [true], trim: true },
  tagline: { type: String, trim: true },
  store_description: { type: String, trim: true },
  store_type: {
    type: String,
    enum: ["Individual / Sole Proprietor", "Private Limited", "Partnership", "LLP", "Public Limited", "Others"],
    trim: true
  },
  year_of_establishment: { type: String, trim: true },
  employee_count: { type: Number, min: 0 },
  logo: { type: String, trim: true },
  gallery: [{ type: String }],
  videos: [{ type: String }],
  categories: [category_schema],

  // Address
  store_address: { type: String, trim: true },
  landmark: { type: String, trim: true },
  pincode: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true, default: "India" },
  geo_location: {
    lat: { type: Number },
    lng: { type: Number }
  },

  // Social Media
  social_links: {
    facebook: { type: String, trim: true },
    twitter: { type: String, trim: true },
    instagram: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    youtube: { type: String, trim: true }
  },

  // Website
  website: { type: String, trim: true }
});

// ----------------------------
// Registration Documents
// ----------------------------
const registration_schema = new mongoose.Schema({
  pan_number: { type: String, trim: true },
  gstin: { type: String, trim: true },
  business_license_number: { type: String, trim: true },
  shop_act_license: { type: String, trim: true },
  msme_number: { type: String, trim: true },
  fssai_number: { type: String, trim: true }
});

// ----------------------------
// Bank & Payment Details
// ----------------------------
const bank_details_schema = new mongoose.Schema({
  bank_account_number: { type: String, trim: true },
  ifsc_code: { type: String, trim: true },
  account_holder_name: { type: String, trim: true },
  upi_id: { type: String, trim: true },
  preferred_currency: { type: String, default: "INR", trim: true }
});

// ----------------------------
// Contact Persons
// ----------------------------
const contact_schema = new mongoose.Schema({
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  mobile: { type: String, trim: true },
  whatsapp: { type: String, trim: true },
  is_primary: { type: Boolean, default: false }
});

const contacts_schema = new mongoose.Schema({
  primary_contact: { type: contact_schema },
  support_contact: { type: contact_schema },
  sales_contact: { type: contact_schema }
});

// ----------------------------
// Uploaded Documents
// ----------------------------
const document_schema = new mongoose.Schema({
  type: { type: String, trim: true }, // Aadhaar, GST Cert, Shop License
  path: { type: String, trim: true },
  verified: { type: Boolean, default: false },
  reason: { type: String, trim: true }, // if rejected
  suggestion: { type: String, trim: true }, // guidance
  uploaded_at: { type: Date, default: Date.now }
});

const documents_schema = new mongoose.Schema({
  identity_proof: { type: document_schema },
  address_proof: { type: document_schema },
  gst_certificate: { type: document_schema },
  business_license: { type: document_schema }
});

// ----------------------------
// Operations (Cleaned - no delivery)
// ----------------------------
const operations_schema = new mongoose.Schema({
  operational_hours: {
    monday: { type: String, trim: true },
    tuesday: { type: String, trim: true },
    wednesday: { type: String, trim: true },
    thursday: { type: String, trim: true },
    friday: { type: String, trim: true },
    saturday: { type: String, trim: true },
    sunday: { type: String, trim: true }
  },
  return_policy: { type: String, trim: true }
});

// ----------------------------
// Performance & Analytics
// ----------------------------
const performance_schema = new mongoose.Schema({
  ratings: { type: Number, min: 0, max: 5, default: 0 },
  reviews_count: { type: Number, min: 0, default: 0 },
  total_views: { type: Number, default: 0 },
  total_leads: { type: Number, default: 0 },
  conversion_rate: { type: Number, default: 0 },
  top_selling_products: [{ type: String, trim: true }]
});

// ----------------------------
// Reviews
// ----------------------------
const review_schema = new mongoose.Schema({
  review_id: { type: String },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  user_name: { type: String, trim: true },
  rating: { type: Number, min: 1, max: 5 },
  comment: { type: String, trim: true },
  reply: { type: String, trim: true },
  created_at: { type: Date, default: Date.now }
});

// ----------------------------
// Status Info
// ----------------------------
const status_info_schema = new mongoose.Schema({
  status: { type: Number, default: 0 }, // 0 = Pending, 1 = Approved, 2 = Rejected, 3 = Suspended
  approved_at: { type: Date },
  approved_by: { type: String, trim: true },
  remarks: { type: String, trim: true }
});

// ----------------------------
// Change History / Audit
// ----------------------------
const change_history_schema = new mongoose.Schema({
  action: { type: String, trim: true }, // created, updated, approved
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updated_at: { type: Date, default: Date.now },
  changes: [{ type: String, trim: true }]
});

// ----------------------------
// Meta Data
// ----------------------------
const meta_schema = new mongoose.Schema({
  agreed_to_terms: { type: Boolean, default: false },
  vendor_portal_access: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  change_history: [{ type: change_history_schema }]
});

// ----------------------------
// SEO Schema
// ----------------------------
const seo_schema = new mongoose.Schema({
  meta_title: { type: String, trim: true },
  meta_description: { type: String, trim: true },
  keywords: [{ type: String, trim: true }],
  slug: { type: String, trim: true, unique: true }
});

// ----------------------------
// Products & Services
// ----------------------------
const service_schema = new mongoose.Schema({
  name: { type: String, trim: true },
  description: { type: String, trim: true },
  price_range: { type: String, trim: true },
  images: [{ type: String }]
});

const product_schema = new mongoose.Schema({
  name: { type: String, trim: true },
  description: { type: String, trim: true },
  price: { type: Number },
  images: [{ type: String }],
  stock_status: { type: String, trim: true } // In Stock, Out of Stock
});

// ----------------------------
// AI Insights
// ----------------------------
const ai_insights_schema = new mongoose.Schema({
  recommended_category: { type: String, trim: true },
  sentiment_score: { type: Number, default: 0 },
  fraud_risk_score: { type: Number, default: 0 },
  priority_score: { type: Number, default: 0 }
});

// ----------------------------
// Main Business Schema
// ----------------------------
const business_registration_schema = new mongoose.Schema(
  {
    // Account Info
    email: { type: String, unique: true, required: [true], lowercase: true, trim: true },
    password: { type: String, required: [true] }, // hashed
    full_name: { type: String, trim: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    mobile: { type: String, trim: true },
    is_mobile_verified: { type: Boolean, default: false },

    // Core Business Details
    store_details: { type: store_details_schema, required: true },
    registration: { type: registration_schema },
    bank_details: { type: bank_details_schema },
    contacts: { type: contacts_schema },
    documents: { type: documents_schema },
    operations: { type: operations_schema },
    performance: { type: performance_schema },
    reviews: [review_schema],
    services: [service_schema],
    products: [product_schema],

    // Management
    status_info: { type: status_info_schema },
    meta: { type: meta_schema, required: true },
    seo: { type: seo_schema },
    ai_insights: { type: ai_insights_schema }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// ----------------------------
// Indexes
// ----------------------------
business_registration_schema.index({ mobile: 1 });
business_registration_schema.index({ "status_info.status": 1 });
business_registration_schema.index({ "store_details.store_name": "text", "store_details.categories.name": "text" });
business_registration_schema.index({ "store_details.geo_location": "2dsphere" });

module.exports = mongoose.model("BusinessRegistration", business_registration_schema);
