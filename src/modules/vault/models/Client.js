const mongoose = require('mongoose');

// ─── Sub-schema: Portal Access ───────────────────────────────────────────────
const portalAccessSchema = new mongoose.Schema(
  {
    hasAccess: { type: Boolean, default: false },
    tempPassword: { type: String, default: null },          // hashed
    isPasswordChanged: { type: Boolean, default: false },   // forced on first login
    accessGeneratedAt: { type: Date, default: null },
    accessGeneratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'portalAccess.generatedByType',
      default: null,
    },
    generatedByType: {
      type: String,
      enum: ['Agent', 'Partner'],
      default: null,
    },
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'portalAccess.revokedByType',
      default: null,
    },
    revokedByType: {
      type: String,
      enum: ['Agent', 'Partner'],
      default: null,
    },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { _id: false }
);

// ─── Main Client Schema ──────────────────────────────────────────────────────
const clientSchema = new mongoose.Schema(
  {
    // ── Personal Info ─────────────────────────────────────────────────────────
    name: {
      first_name: { type: String, required: true, trim: true },
      last_name: { type: String, required: true, trim: true },
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      country_code: { type: String, default: '+971' },
      number: { type: String, required: true, trim: true },
    },
    dateOfBirth: { type: Date, default: null },
    nationality: { type: String, default: null },
    residencyStatus: {
      type: String,
      enum: ['UAE Resident', 'Non-Resident'],
      default: null,
    },

    // ── Employment & Financial ─────────────────────────────────────────────────
    employmentStatus: {
      type: String,
      enum: ['Salaried', 'Self-Employed', null],
      default: null,
    },
    monthlySalary: { type: Number, default: null },
    salarybankName: { type: String, default: null },       // salary account bank

    // ── Role ──────────────────────────────────────────────────────────────────
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    password: { type: String, default: null },             // set via portal access

    // ── Ownership — who created this client record ────────────────────────────
    createdByType: {
      type: String,
      enum: ['Agent', 'Partner'],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'createdByType',
      required: true,
    },
    partnerId: {
      // always set — either the partner directly or the affiliated agent's partner
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
    },

    // ── Portal Access (provisioned by partner/agent) ──────────────────────────
    portalAccess: { type: portalAccessSchema, default: () => ({}) },

    // ── Status ────────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

clientSchema.index({ email: 1 });
clientSchema.index({ 'phone.number': 1 });
clientSchema.index({ partnerId: 1 });
clientSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Client', clientSchema);