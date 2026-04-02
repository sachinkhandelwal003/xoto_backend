const mongoose = require('mongoose');

// ─── Status history entry ─────────────────────────────────────────────────────
const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    updatedAt: { type: Date, default: Date.now },
    notes: { type: String, default: null },
  },
  { _id: false }
);

// ─── Main Lead/Referral Schema ────────────────────────────────────────────────
const leadSchema = new mongoose.Schema(
  {
    // ── Submitting Agent ──────────────────────────────────────────────────────
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },

    // ── Client Info (captured at submission time) ─────────────────────────────
    clientName: { type: String, required: true, trim: true },
    clientPhone: {
      country_code: { type: String, default: '+971' },
      number: { type: String, required: true, trim: true },
    },

    // ── Referral Type & Commission Tier ───────────────────────────────────────
    // Per PRD: Referral Only = 40%/50%, Referral + Docs = 45%/55%
    referralType: {
      type: String,
      enum: ['Referral Only', 'Referral + Document Submission'],
      required: true,
    },
    commissionTier: {
      // percentage based on loan ≤5M or >5M AED
      upToFiveMillion: { type: Number, default: null },    // 40 or 45
      aboveFiveMillion: { type: Number, default: null },   // 50 or 55
    },

    // ── Deduplication ─────────────────────────────────────────────────────────
    // PRD: same mobile number within 180 days = duplicate, block submission
    isDuplicate: { type: Boolean, default: false },
    duplicateOfLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },

    // ── Status Workflow ───────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'New',
        'Contacted',
        'Qualified',
        'Collecting Documentation',
        'Bank Application',
        'Pre-Approved',
        'Valuation',
        'FOL Processed',
        'FOL Issued',
        'FOL Signed',
        'Disbursed',
        'Lost',
      ],
      default: 'New',
    },
    statusHistory: [statusHistorySchema],

    // ── Input Method ──────────────────────────────────────────────────────────
    inputMethod: {
      type: String,
      enum: ['Manual Entry', 'Contact Import'],
      default: 'Manual Entry',
    },

    // ── Commission ────────────────────────────────────────────────────────────
    commissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Commission',
      default: null,
    },

    // ── Notes ─────────────────────────────────────────────────────────────────
    notes: { type: String, default: null },

    // ── Soft Delete ───────────────────────────────────────────────────────────
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

leadSchema.index({ agentId: 1 });
leadSchema.index({ 'clientPhone.number': 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: -1 });
// Compound index used for 180-day deduplication check
leadSchema.index({ 'clientPhone.number': 1, createdAt: -1 });

module.exports = mongoose.models.Lead || mongoose.model('Lead', leadSchema);