const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema(
  {
    // ── Who Earns ─────────────────────────────────────────────────────────────
    recipientType: {
      type: String,
      enum: ['FreelanceAgent', 'Partner'],
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'recipientType',
      required: true,
    },

    // ── Source ────────────────────────────────────────────────────────────────
    sourceType: {
      type: String,
      enum: ['Lead', 'Case'],
      required: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'sourceType',
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },

    // ── Financial Details ─────────────────────────────────────────────────────
    propertyValue: { type: Number, required: true },         // AED
    loanAmount: { type: Number, default: null },             // AED — may differ from property value
    // PRD: commission on Xoto's received commission, not on loan value
    xotoCommissionReceived: { type: Number, default: null }, // AED — what Xoto received from bank
    commissionPercentage: { type: Number, required: true },  // e.g. 40, 45, 75, 80
    commissionAmount: { type: Number, default: null },       // AED = xotoCommissionReceived * %

    // ── Tier Applied ──────────────────────────────────────────────────────────
    // Per PRD: ≤5M AED → lower tier, >5M AED → higher tier
    tierApplied: {
      type: String,
      enum: ['upToFiveMillion', 'aboveFiveMillion'],
      required: true,
    },

    // ── Referral Type (for Freelance Agent only) ──────────────────────────────
    referralType: {
      type: String,
      enum: ['Referral Only', 'Referral + Document Submission', null],
      default: null,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Paid'],
      default: 'Pending',
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    confirmedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paymentReference: { type: String, default: null },

    // ── Notes ─────────────────────────────────────────────────────────────────
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

commissionSchema.index({ recipientId: 1, recipientType: 1 });
commissionSchema.index({ sourceId: 1, sourceType: 1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Commission', commissionSchema);