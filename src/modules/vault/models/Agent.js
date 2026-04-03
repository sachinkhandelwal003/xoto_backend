const mongoose = require('mongoose');

const dependentSchema = new mongoose.Schema(
  {
    age: { type: Number, required: true },
    location: {
      type: String,
      enum: ['In UAE', 'Outside UAE'],
      required: true,
    },
    schoolingStatus: {
      type: String,
      enum: ['Currently in school', 'Not in school'],
      required: true,
    },
  },
  { _id: false }
);

const emiratesIdSchema = new mongoose.Schema(
  {
    number: { type: String, default: null },
    frontImageUrl: { type: String, default: null },
    backImageUrl: { type: String, default: null },
  },
  { _id: false }
);

const bankDetailsSchema = new mongoose.Schema(
  {
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    iban: { type: String, default: null },
    accountHolderName: { type: String, default: null },
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    name: {
      first_name: { type: String, required: true, trim: true },
      last_name:  { type: String, required: true, trim: true },
    },
    phone: {
      country_code: { type: String, default: '+971' },
      number: { type: String, required: true, unique: true, trim: true },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    profilePic:  { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    nationality: { type: String, default: null },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', null],
      default: null,
    },
    maritalStatus: {
      type: String,
      enum: ['Single', 'Married', 'Divorced', 'Widowed', null],
      default: null,
    },
    numberOfDependents: { type: Number, default: 0 },
    dependents: [dependentSchema],

    agentType: {
      type: String,
      enum: ['FreelanceAgent', 'PartnerAffiliatedAgent'],
      default: 'FreelanceAgent',
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      default: null,
    },
    affiliationStatus: {
      type: String,
      enum: ['none', 'pending', 'verified', 'rejected'],
      default: 'none',
    },
    affiliationVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    affiliationVerifiedAt: { type: Date, default: null },

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    password: { type: String, required: true },

    emiratesId:                  { type: emiratesIdSchema, default: () => ({}) },
    bankDetails:                 { type: bankDetailsSchema, default: () => ({}) },
    isProfileComplete:           { type: Boolean, default: false },
    profileCompletionPercentage: { type: Number, default: 0 },
    commissionEligible:          { type: Boolean, default: false },

    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt:     { type: Date, default: null },

    isActive:          { type: Boolean, default: true },
    is_deleted:        { type: Boolean, default: false },
    suspendedAt:       { type: Date, default: null },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    suspensionReason: { type: String, default: null },

    resetPasswordToken:   { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

agentSchema.index({ 'phone.number': 1 }, { unique: true });
agentSchema.index({ email: 1 });
agentSchema.index({ partnerId: 1 });
agentSchema.index({ agentType: 1 });
agentSchema.index({ affiliationStatus: 1 });

// ✅ KEY FIX: "VaultAgent" naam use karo — Xoto ke "Agent" model se conflict nahi hoga
const VaultAgent = mongoose.models.VaultAgent || mongoose.model('VaultAgent', agentSchema);
module.exports = VaultAgent;