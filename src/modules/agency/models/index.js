const mongoose = require("mongoose");

const AgencySchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
    default: "",
  },
  password: {
    type: String,
    required: false,
    default: "",
  },

  profile_photo: {
    type: String,
    required: false,
    default: "",
  },
  country_code: {
    type: String,
    required: false,
    default: "",
  },
  mobile_number: {
    type: String,
    required: false,
    default: "",
  },
  onboarding_status: {
    type: String,
    enum: ["registered", "approved", "completed"],
    default: "registered",
  },

  letter_of_authority: {
    type: String,
    required: false,
    default: "",
  },
  is_email_verified: {
    type: Boolean,
    default: true, // frontend hi kar raha hai
  },

  is_mobile_verified: {
    type: Boolean,
    default: true,
  },

  is_admin_approved: {
    type: Boolean,
    default: true,
  },

  status: {
    type: String,
    //   enum: ["pending", "approved", "rejected"],
    default: true,
  },

  subscription_status: {
    type: String,
    required: false,
    default: "free",
    enum: ["free", "paid"],
  },
  is_active: { type: Boolean, required: false, default: false },
});

module.exports = mongoose.model("Agency", AgencySchema);
