const mongoose = require("mongoose");

const AgencySchema = new mongoose.Schema({
  agency_name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },

  profile_photo: String,
  country_code: String,
  mobile_number: String,
  letter_of_authority: String,

  is_email_verified: {
    type: Boolean,
    default: false
  },

  is_mobile_verified: {
    type: Boolean,
    default: false
  },

  onboarding_status: {
    type: String,
    enum: ["registered", "approved", "rejected"],
    default: "registered"
  },

  subscription_status: {
    type: String,
    enum: ["free", "paid"],
    default: "free"
  },

  is_active: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

module.exports = mongoose.model("Agency", AgencySchema);
