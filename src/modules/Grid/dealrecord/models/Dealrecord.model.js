// models/dealRecord.model.js
// PRD §8.5 §12.5 — fully aligned

const mongoose = require('mongoose');
require('./Counter.model');

// ─── Evidence sub-schema ──────────────────────────────────────────────────────
const evidenceSchema = new mongoose.Schema(
  {
    docType: {
      type:     String,
      enum:     ['spa', 'booking_form', 'title_deed', 'noc', 'other'],
      required: true,
    },
    url:        { type: String, required: true },
    uploadedAt: { type: Date,   default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

// ─── Commission split sub-schema ──────────────────────────────────────────────
const commissionSplitSchema = new mongoose.Schema(
  {
    grossAmount:     { type: Number, default: 0 },
    grossPercent:    { type: Number, default: 0 },
    xotoRetained:    { type: Number, default: 0 },
    xotoPercent:     { type: Number, default: 0 },
    partnerShare:    { type: Number, default: 0 },
    partnerPercent:  { type: Number, default: 0 },
    referralShare:   { type: Number, default: 0 },
    referralPercent: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── Status history log sub-schema (PRD audit trail §14.2) ───────────────────
const statusLogSchema = new mongoose.Schema(
  {
    from:      { type: String },
    to:        { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note:      { type: String, default: '' },
    at:        { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─── Main DealRecord schema ───────────────────────────────────────────────────
const dealRecordSchema = new mongoose.Schema(
  {
    // ── Reference Number ───────────────────────────────────────────────────────
    dealReference: {
      type:   String,
      unique: true,
      sparse: true,
    },

    // ── Core Links ─────────────────────────────────────────────────────────────
    leadId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'GridLead',
      required: true,
    },
    propertyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Properties',
      required: true,
    },
    inventoryUnitId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'PropertyInventory',
      default: null,
    },
    customerId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Customer',
      required: true,
    },

    // ── Who closed ────────────────────────────────────────────────────────────
    advisorId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'GridAdvisor',
      default: null,
    },
    agentId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'GridAgent',
      default: null,
    },
    agencyId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Agency',
      default: null,
    },
    referralPartnerId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'GridReferralPartner',
      default: null,
    },

    // ── Agreement linking ─────────────────────────────────────────────────────
    partnerAgreementId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'PartnerAgreement',
      default: null,
    },

    // ── Deal Details ──────────────────────────────────────────────────────────
    dealType: {
      type:     String,
      enum:     ['sale', 'lease'],
      required: true,
    },
    transactionValue: { type: Number, required: true },
    currency:         { type: String, default: 'AED' },

    // ── Commission ────────────────────────────────────────────────────────────
    commission:       { type: commissionSplitSchema, default: () => ({}) },
    commissionStatus: {
      type:    String,
      enum:    ['pending', 'confirmed', 'paid'],
      default: 'pending',
    },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paidAt:      { type: Date, default: null },
    paidBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Evidence ──────────────────────────────────────────────────────────────
    evidenceDocuments: { type: [evidenceSchema], default: [] },
    evidenceUploaded:  { type: Boolean, default: false },

    // ── Status History (PRD §14.2 audit trail) ────────────────────────────────
    statusHistory: { type: [statusLogSchema], default: [] },

    // ── Admin edit log (before confirmation) ─────────────────────────────────
    // PRD §12.3: admin can flag, void, escalate
    editHistory: [
      {
        editedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        editedAt:  { type: Date, default: Date.now },
        fields:    { type: mongoose.Schema.Types.Mixed },   // snapshot of changed fields
        reason:    { type: String, default: '' },
      }
    ],

    // ── Admin flags (PRD §12.3) ───────────────────────────────────────────────
    isFlagged:   { type: Boolean, default: false },
    flagReason:  { type: String,  default: '' },
    flaggedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    flaggedAt:   { type: Date,    default: null },

    isVoided:    { type: Boolean, default: false },
    voidReason:  { type: String,  default: '' },
    voidedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    voidedAt:    { type: Date,    default: null },

    isEscalated:    { type: Boolean, default: false },
    escalationNote: { type: String,  default: '' },
    escalatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    escalatedAt:    { type: Date,    default: null },

    // ── Referral commission payout tracking ───────────────────────────────────
    referralCommissionStatus: {
      type:    String,
      enum:    ['not_applicable', 'pending', 'confirmed', 'paid'],
      default: 'not_applicable',
    },
    referralPaidAt: { type: Date, default: null },
    referralPaidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Audit ─────────────────────────────────────────────────────────────────
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    // ── Immutability lock ─────────────────────────────────────────────────────
    isLocked: { type: Boolean, default: false },

    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

// ─── Atomic deal reference generation ────────────────────────────────────────
// Uses findOneAndUpdate on a counter collection to avoid race conditions
dealRecordSchema.pre('save', async function (next) {
  if (this.dealReference) return next();

  try {
    const Counter = mongoose.model('Counter');
    const counter = await Counter.findOneAndUpdate(
      { name: 'dealRecord' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.dealReference = `DR-${String(counter.seq).padStart(5, '0')}`;
  } catch (err) {
    // Fallback: timestamp-based ref (still unique, not sequential)
    this.dealReference = `DR-${Date.now()}`;
  }
  next();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
dealRecordSchema.index({ leadId:           1 });
dealRecordSchema.index({ propertyId:       1 });
dealRecordSchema.index({ customerId:       1 });
dealRecordSchema.index({ advisorId:        1 });
dealRecordSchema.index({ agentId:          1 });
dealRecordSchema.index({ agencyId:         1 });
dealRecordSchema.index({ referralPartnerId:1 });
dealRecordSchema.index({ commissionStatus: 1 });
dealRecordSchema.index({ isFlagged:        1 });
dealRecordSchema.index({ isVoided:         1 });
dealRecordSchema.index({ createdAt:       -1 });

module.exports = mongoose.model('DealRecord', dealRecordSchema);
