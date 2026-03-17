const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema({
  // =========================
  // PERSONAL INFO
  // =========================
  first_name: {
    type: String,
    trim: true
  },
  last_name: {
    type: String,
    trim: true
  },

  // =========================
  // AUTH & ROLE
  // =========================
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: false,
    default: null
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    trim: true
  },
  
  password: {
    type: String,
    required: true,
    minlength: 6
  },

  // =========================
  // CONTACT
  // =========================
  country_code: {
    type: String,
    default: "+971"
  },
  
  phone_number: {
    type: String,
    required: true,
    unique: true
  },

  operating_city: {
    type: String,
    required: true,
    trim: true
  },

  country: {
    type: String,
    default: ""
  },

  // =========================
  // PROFESSIONAL
  // =========================
  specialization: {
    type: String,
    required: true,
    trim: true
  },

  // =========================
  // DOCUMENTS
  // =========================
  profile_photo: { type: String, default: "" },
  id_proof: { type: String, default: "" },
  rera_certificate: { type: String, default: "" },

  // =========================
  // STATUS & VERIFICATION
  // =========================
  onboarding_status: {
    type: String,
    enum: ["registered", "approved", "completed"],
    default: "registered"
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  is_email_verified: {
    type: Boolean,
    default: true
  },

  is_mobile_verified: {
    type: Boolean,
    default: true
  },

  // =========================
  // SUBSCRIPTION (Keep for later)
  // =========================
  subscriptionPlan: {
    type: String,
    enum: ["free", "paid"],
    default: "free",
    required: false
  },

  subscriptionExpiry: {
    type: Date,
    default: null,
    required: false
  },

  // =========================
  // NOTIFICATION SETTINGS (Keep for later)
  // =========================
  notificationSettings_email: {
    type: Boolean, 
    default: true,
    required: false
  },
  
  notificationSettings_sms: {
    type: Boolean, 
    default: false,
    required: false
  },
  
  notificationSettings_whatsapp: {
    type: Boolean, 
    default: true,
    required: false
  },

  // =========================
  // STATS FIELDS
  // =========================
  presentationsGenerated_count: {
    type: Number,
    default: 0,
    required: false
  },

  leadsCreated_count: {
    type: Number,
    default: 0,
    required: false
  },

  dealsClosed_count: {
    type: Number,
    default: 0,
    required: false
  }

}, { timestamps: true });

// =========================
// INDEXES (Optional but recommended)
// =========================
AgentSchema.index({ email: 1 });
AgentSchema.index({ phone_number: 1 });
AgentSchema.index({ operating_city: 1 });
AgentSchema.index({ onboarding_status: 1 });

// =========================
// REMOVE PASSWORD FROM RESPONSE
// =========================
AgentSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Model Export
module.exports = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);