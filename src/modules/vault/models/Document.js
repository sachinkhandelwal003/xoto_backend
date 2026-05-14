// models/Document.js - Update documentType to accept any string
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['Lead', 'Case', 'Agent', 'Partner'], required: true },
    entityId: { type: String, required: true },
    linkedFrom: {
      entityType: { type: String, enum: ['Lead', 'Case'], default: null },
      entityId: { type: String, default: null }
    },
    isFromLead: { type: Boolean, default: false },
    documentType: {
      type: String,
      required: true,
      // ✅ REMOVED enum - any document type allowed
    },
    documentCategory: {
      type: String,
      enum: ['identity', 'financial', 'property', 'bank forms', 'other','employment'],
      required: true,
    },
    fileName: { type: String, required: true },
    fileSizeMb: { type: Number, required: true },
    fileUrl: { type: String, required: true },
    fileHash: { type: String, required: true },
    mimeType: { type: String, required: true },
    uploadedBy: {
      role: { type: String, enum: ['agent', 'partner', 'admin', 'client', 'advisor'], required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
    },
    uploadedAt: { type: Date, default: Date.now },
    uploadedFromIp: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'expired'],
      default: 'pending',
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    extractedData: { type: mongoose.Schema.Types.Mixed, default: null },
    qualityCheck: {
      isClear: { type: Boolean, default: false },
      isComplete: { type: Boolean, default: false },
      isAuthentic: { type: Boolean, default: false },
      qualityScore: { type: Number, min: 0, max: 100, default: 0 },
      notes: { type: String, default: null },
    },
    virusScanCompleted: { type: Boolean, default: false },
    virusScanResult: { type: String, enum: ['clean', 'infected', 'pending', null], default: null },
    virusScanAt: { type: Date, default: null },
    encryption: { type: String, default: 'AES-256' },
    expiresAt: { type: Date, default: null },
    isExpired: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    
    // ✅ ADD THESE FIELDS FOR BANK FORM TRACKING
    bankFormId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankForm', default: null },
    bankFormName: { type: String, default: null },
  },
  { timestamps: true }
);

// Indexes
documentSchema.index({ entityType: 1, entityId: 1 });
documentSchema.index({ documentType: 1 });
documentSchema.index({ verificationStatus: 1 });
documentSchema.index({ fileHash: 1 });
documentSchema.index({ uploadedAt: -1 });

// Virtuals
documentSchema.virtual('documentId').get(function () {
  return this._id.toString();
});

documentSchema.virtual('formattedFileSize').get(function () {
  return `${this.fileSizeMb} MB`;
});

// Methods
documentSchema.methods.verify = function (verifiedByAdminId, qualityScore) {
  this.verificationStatus = 'verified';
  this.verifiedBy = verifiedByAdminId;
  this.verifiedAt = new Date();
  if (qualityScore) {
    this.qualityCheck.qualityScore = qualityScore;
    this.qualityCheck.isClear = qualityScore >= 80;
    this.qualityCheck.isComplete = qualityScore >= 70;
  }
  return this.save();
};

documentSchema.methods.reject = function (verifiedByAdminId, reason) {
  this.verificationStatus = 'rejected';
  this.verifiedBy = verifiedByAdminId;
  this.verifiedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

documentSchema.methods.softDelete = function (deletedByUserId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedByUserId;
  return this.save();
};

documentSchema.set('toJSON', { virtuals: true });
documentSchema.set('toObject', { virtuals: true });

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
module.exports = Document;