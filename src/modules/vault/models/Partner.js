const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema(
  {
    // ── Company Info ──────────────────────────────────────────────────────────
    companyName: { type: String, required: true, trim: true },
    tradeLicenseNumber: { type: String, required: true, trim: true, unique: true },

    // ── Primary Contact ───────────────────────────────────────────────────────
    primaryContact: {
      name: { type: String, required: true, trim: true },
      designation: { type: String, default: null },
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
      number: { type: String, required: true, trim: true },
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    password: { type: String, required: true },
    isFirstLogin: { type: Boolean, default: true },  // force password change on first login
    lastLoginAt: { type: Date, default: null },

    // ── Role ──────────────────────────────────────────────────────────────────
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },

    // ── Commission Tiers (from PRD) ───────────────────────────────────────────
    // 75% for loans ≤5M AED, 80% for loans >5M AED (on Xoto's received commission)
    commissionTier: {
      upToFiveMillion: { type: Number, default: 75 },    // percentage
      aboveFiveMillion: { type: Number, default: 80 },   // percentage
    },

    // ── Onboarding ────────────────────────────────────────────────────────────
    onboardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    onboardedAt: { type: Date, default: Date.now },
    commercialAgreementDate: { type: Date, default: null },
    commercialAgreementNotes: { type: String, default: null },

    // ── Status ────────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    suspensionReason: { type: String, default: null },

    // ── Password Reset ────────────────────────────────────────────────────────
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

partnerSchema.index({ email: 1 }, { unique: true });
partnerSchema.index({ tradeLicenseNumber: 1 }, { unique: true });
partnerSchema.index({ isActive: 1 });

module.exports = mongoose.model('Partner', partnerSchema);