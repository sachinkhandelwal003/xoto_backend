const mongoose = require('mongoose');

const agreementDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    originalName: { type: String, trim: true, default: '' },
    url: { type: String, required: true, trim: true },
    path: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    remarks: { type: String, trim: true, default: '' },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const agreementPartySchema = new mongoose.Schema(
  {
    partyType: {
      type: String,
      enum: ['developer', 'agency', 'agent', 'admin', 'xoto'],
      required: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const adminAgreementSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ['developer', 'agency', 'agent'],
      required: true,
      index: true,
    },
    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Developer',
      default: null,
      index: true,
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      default: null,
      index: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GridAgent',
      default: null,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: 'Agreement',
    },
    agreementType: {
      type: String,
      enum: [
        'main_agreement',
        'commercial_agreement',
        'commission_schedule',
        'agency_master_agreement',
        'agent_a2a_agreement',
        'addendum',
        'other',
      ],
      default: 'main_agreement',
    },
    parties: {
      type: [agreementPartySchema],
      default: [],
    },
    documents: {
      type: [agreementDocumentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['uploaded', 'verified', 'changes_requested', 'archived'],
      default: 'uploaded',
      index: true,
    },
    effectiveDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, default: null },
    version: { type: Number, default: 1 },
    notes: { type: String, trim: true, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

adminAgreementSchema.pre('validate', function validateTarget(next) {
  const targetMap = {
    developer: this.developerId,
    agency: this.agencyId,
    agent: this.agentId,
  };

  if (!targetMap[this.targetType]) {
    return next(new Error(`${this.targetType} target id is required`));
  }

  return next();
});

adminAgreementSchema.index({ targetType: 1, status: 1, createdAt: -1 });
adminAgreementSchema.index({ expiryDate: 1 });

module.exports = mongoose.models.AdminAgreement ||
  mongoose.model('AdminAgreement', adminAgreementSchema);
