'use strict';
const mongoose = require('mongoose');

/**
 * CUSTOMER MODEL
 * ─────────────────────────────────────────────────────────────────
 * Top-level entity. Every lead belongs to a customer.
 * One customer can have many leads (multiple enquiries over time).
 *
 * Dedup match logic (PRD):
 *   High   → phone + email match  → link to existing
 *   Medium → phone only match     → link to existing
 *   Low    → email only match     → link (flagged for review)
 *   None   → create new customer
 * ─────────────────────────────────────────────────────────────────
 */

const customerSchema = new mongoose.Schema(
  {
    firstName:      { type: String, trim: true, default: null },
    lastName:       { type: String, trim: true, default: null },

    // Indexed for fast dedup lookup
    phone:          { type: String, trim: true, sparse: true, default: null },
    email:          { type: String, trim: true, lowercase: true, sparse: true, default: null },

    isRegistered:   { type: Boolean, default: false },

    // GDPR
    piiScrubbedAt:  { type: Date, default: null },
    isDeleted:      { type: Boolean, default: false },
    deletedAt:      { type: Date, default: null },
  },
  {
    timestamps: true,     // createdAt, updatedAt
    collection: 'customers',
  }
);

// Indexes for dedup queries
customerSchema.index({ phone: 1 }, { sparse: true });
customerSchema.index({ email: 1 }, { sparse: true });
customerSchema.index({ phone: 1, email: 1 }, { sparse: true });

// Default scope: exclude deleted/scrubbed
customerSchema.pre(/^find/, function () {
  if (!this._conditions.isDeleted) {
    this.where({ isDeleted: false, piiScrubbedAt: null });
  }
});

// PII masking helpers
customerSchema.methods.maskedPhone = function () {
  if (!this.phone) return null;
  return this.phone.slice(0, 4) + '****' + this.phone.slice(-2);
};
customerSchema.methods.maskedEmail = function () {
  if (!this.email) return null;
  const [user, domain] = this.email.split('@');
  return user[0] + '***@' + domain;
};

module.exports = mongoose.model('Customer', customerSchema);