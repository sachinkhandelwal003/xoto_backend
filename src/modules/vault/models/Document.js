const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    documentId: { type: String, unique: true, required: true },
    
    entityType: { type: String, enum: ['Lead', 'Case', 'Agent', 'Partner'], required: true },
    entityId: { type: String, required: true },
    
    documentType: {
      type: String,
      enum: [
        'emirates_id_front', 'emirates_id_back', 'passport', 'visa',
        'bank_statements', 'salary_certificate', 'payslips',
        'trade_license', 'moa', 'company_bank_statements', 'audit_reports', 'vat_returns', 'employee_list',
        'sale_agreement', 'title_deed', 'ejari', 'noc',
        'bank_application_form', 'consent_form',
        'credit_report', 'other',
      ],
      required: true,
    },
    documentCategory: {
      type: String,
      enum: ['identity', 'financial', 'property', 'bank_form', 'other'],
      required: true,
    },
    
    fileName: { type: String, required: true },
    fileSizeMb: { type: Number, required: true },
    fileUrl: { type: String, required: true },
    fileHash: { type: String, required: true },
    mimeType: { type: String, required: true },
    
    uploadedBy: {
      role: { type: String, enum: ['agent', 'partner', 'admin', 'client'], required: true },
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
  },
  { timestamps: true }
);

documentSchema.index({ documentId: 1 }, { unique: true });
documentSchema.index({ entityType: 1, entityId: 1 });
documentSchema.index({ documentType: 1 });
documentSchema.index({ verificationStatus: 1 });
documentSchema.index({ fileHash: 1 });

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

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
module.exports = Document;