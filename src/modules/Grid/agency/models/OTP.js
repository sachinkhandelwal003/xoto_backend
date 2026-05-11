const mongoose = require('mongoose');

/**
 * OTP — used for Agency login via phone/email OTP when admin issues temporary credentials.
 * 6-digit code, 5-minute expiry, max 3 attempts (per PRD 14.2).
 */
const otpSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      trim: true,
      // phone number or email of the agency's primary contact
    },
    identifierType: {
      type: String,
      enum: ['phone', 'email'],
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['login', 'password_reset'],
      default: 'login',
    },
    // Reference to the Agency this OTP belongs to
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
    },
    attempts: {
      type: Number,
      default: 0,
      max: 3,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  },
  { timestamps: true },
);

// Auto-delete expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── Instance method: check if OTP is valid ─────────────────────────
otpSchema.methods.isValid = function (inputOtp) {
  if (this.isUsed)               return { valid: false, reason: 'OTP already used' };
  if (this.attempts >= 3)        return { valid: false, reason: 'Max attempts reached. Request a new OTP.' };
  if (new Date() > this.expiresAt) return { valid: false, reason: 'OTP expired' };
  if (this.otp !== inputOtp)     return { valid: false, reason: 'Invalid OTP' };
  return { valid: true };
};

module.exports = mongoose.model('AgencyOTP', otpSchema);