const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema({
  // Personal Info
  first_name: {
    type: String,
    required: true,
    trim: true
  },
  last_name: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    trim: true
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
  
  // Phone
  country_code: {
    type: String,
    default: "+971"
  },
  phone_number: {
    type: String,
    required: true,
    unique: true
  },

  // 👇 YEH RAHA WO FIELD JO MISSING THA
  operating_city: {
    type: String,
    required: true,
    trim: true
  },

  // Agar aapko country bhi chahiye
  country: {
    type: String,
    default: ""
  },

  specialization: {
    type: String,
    required: true,
    trim: true
  },

  // Documents
  profile_photo: { type: String, default: "" },
  id_proof: { type: String, default: "" },
  rera_certificate: { type: String, default: "" },

  // Status & Verification
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
  default: true   // abhi frontend handle kar raha
},

is_mobile_verified: {
  type: Boolean,
  default: true
},


}, { timestamps: true });

// Auto Name Generation
AgentSchema.pre("save", function (next) {
  this.name = `${this.first_name} ${this.last_name}`;
  next();
});

// Model Export
module.exports = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);