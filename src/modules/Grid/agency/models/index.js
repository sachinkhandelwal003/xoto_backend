const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const partnerAgreementSchema = new mongoose.Schema({
  fileUrl: { type: String },
  signedDate: { type: Date },
  expiryDate: { type: Date },
  version: { type: String },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired'],
    default: 'pending',
  },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  country:     { type: String, default: '' },
  state:       { type: String, default: '' },
  city:        { type: String, default: '' },
  zipCode:     { type: String, default: '' },
  addressLine: { type: String, default: '' },
}, { _id: false });

const operatingLocationSchema = new mongoose.Schema({
  country: { type: String, default: '' },
  city:    { type: String, default: '' },
}, { _id: false });

const agencySchema = new mongoose.Schema(
  {
    // ── Core Identity ──────────────────────────────────────────────
    companyName: {
      type: String,
      required: true,
      trim: true,
    },

    reraRegistrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // ── Documents & Media ──────────────────────────────────────────
    tradeLicenceUrl: {
      type: String,
      default: '',
    },

    reraLicenceUrl: {
      type: String,
      default: '',
    },

    letterOfAuthorityUrl: {
      type: String,
      default: '',
    },

    logo: {
      type: String,
      default: '',
    },

    profilePhoto: {
      type: String,
      default: '',
    },

    // ── Role ───────────────────────────────────────────────────────
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null,
    },

    // ── Primary Contact ────────────────────────────────────────────
    primaryContactName: {
      type: String,
      required: true,
      trim: true,
    },

    primaryContactEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    primaryContactPhone: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Location ───────────────────────────────────────────────────
    address: {
      type: addressSchema,
      default: () => ({}),
    },

    operatingLocation: {
      type: operatingLocationSchema,
      default: () => ({}),
    },

    // ── Auth ───────────────────────────────────────────────────────
    password: {
      type: String,
      select: false,
    },

    tempPassword: {
      type: Boolean,
      default: true,
    },

    // ── Subscription / Presentation Tier ──────────────────────────
    subscriptionTier: {
      type: String,
      enum: ['basic', 'standard', 'premium'],
      default: 'basic',
    },

    presentationQuota: {
      type: Number,
      default: 100,
    },

    presentationsUsed: {
      type: Number,
      default: 0,
    },

    // ── Stats (PRD 11.1 Dashboard) ─────────────────────────────────
    totalLeads: {
      type: Number,
      default: 0,
    },

    activeLeads: {
      type: Number,
      default: 0,
    },

    commissionEarned: {
      type: Number,
      default: 0,
    },

    commissionPending: {
      type: Number,
      default: 0,
    },

    totalDeals: {
      type: Number,
      default: 0,
    },

    // ── Partner Agreement (PRD 8.5) ────────────────────────────────
    partnerAgreement: {
      type: partnerAgreementSchema,
      default: () => ({}),
    },

    // ── Agency Team ────────────────────────────────────────────────
    agents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
      },
    ],

    // ── Status ────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },

    isSuspended: {
      type: Boolean,
      default: false,
    },

    // ── Created by Admin ───────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Pre-save: hash password ────────────────────────────────────────
agencySchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance Method: Compare Password ─────────────────────────────
agencySchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Virtual: Presentation Balance ─────────────────────────────────
agencySchema.virtual('presentationBalance').get(function () {
  return Math.max(0, this.presentationQuota - this.presentationsUsed);
});

agencySchema.set('toJSON', { virtuals: true });

const Agency = mongoose.models.Agency || mongoose.model('Agency', agencySchema);

module.exports = Agency;