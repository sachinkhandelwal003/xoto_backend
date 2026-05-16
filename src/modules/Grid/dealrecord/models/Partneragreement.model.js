const mongoose = require('mongoose');

// PartnerAgreement — signed once at onboarding, governs all deals
// per PRD §8.5: immutable after execution; versioning on term change

const partnerAgreementSchema = new mongoose.Schema(
  {
    // ── Who signed ────────────────────────────────────────────────────────────
    partyType: {
      type:     String,
      enum:     ['agency', 'agent', 'referral_partner'],
      required: true,
    },
    agencyId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Agency',
      default: null,
    },
    agentId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'GridAgent',
      default: null,
    },
    referralPartnerId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'GridReferralPartner',
      default: null,
    },

    // ── Agreement terms ───────────────────────────────────────────────────────
    commissionSplitPercent: {
      type:     Number,
      required: true,                 // % of gross commission going to partner
    },
    referralSplitPercent: {
      type:    Number,
      default: 0,                     // % for referral partners (25-30 per PRD)
    },
    platformAccessTerms: { type: String, default: '' },
    notes:               { type: String, default: '' },

    // ── Document storage ──────────────────────────────────────────────────────
    signedDocumentUrl: { type: String, default: '' },
    effectiveDate:     { type: Date, required: true },
    expiryDate:        { type: Date, default: null },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['active', 'expired', 'superseded'],
      default: 'active',
    },
    version:    { type: Number, default: 1 },
    supersededBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'PartnerAgreement',
      default: null,
    },

    // ── Expiry alert tracking ──────────────────────────────────────────────────
    expiryAlertSentAt: { type: Date, default: null },   // 30-day warning per PRD §8.5

    // ── Audit ─────────────────────────────────────────────────────────────────
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
  },
  { timestamps: true }
);

partnerAgreementSchema.index({ agencyId:          1 });
partnerAgreementSchema.index({ agentId:            1 });
partnerAgreementSchema.index({ referralPartnerId:  1 });
partnerAgreementSchema.index({ status:             1 });
partnerAgreementSchema.index({ expiryDate:         1 });

module.exports = mongoose.model('PartnerAgreement', partnerAgreementSchema);