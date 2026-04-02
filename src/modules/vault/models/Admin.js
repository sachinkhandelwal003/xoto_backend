const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
      first_name: { type: String, required: true, trim: true },
      last_name: { type: String, required: true, trim: true },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      country_code: { type: String, default: '+971' },
      number: { type: String, default: null, trim: true },
    },
    profilePic: { type: String, default: null },

    // ── Auth ──────────────────────────────────────────────────────────────────
    password: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },

    // ── Role ──────────────────────────────────────────────────────────────────
    // SuperAdmin: full system access — all data, all config, all reports
    // Admin: case management, status updates, partner onboarding, bank library mgmt
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },

    // ── Password Reset ────────────────────────────────────────────────────────
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

adminSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Admin', adminSchema);