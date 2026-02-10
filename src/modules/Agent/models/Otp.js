const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  otp: {
    type: Number,
    required: false
  },
  purpose: {
    type: String,
    default: ""
  },
  country_code: {
    type: String,
    default: ""
  },
  phone_number: {
    type: String,
    default: ""
  },
  email: {
    type: String,
    default: ""
  },
  expiresAt: {
    type: Date
  }
}, { timestamps: true });

module.exports =
  mongoose.models.OTP ||
  mongoose.model("OTP", otpSchema);
