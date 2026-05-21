// models/CaseDocumentRequirement.js
const mongoose = require('mongoose');

const caseDocumentRequirementSchema = new mongoose.Schema(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
    documentRequirementId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankDocumentRequirement', required: true },
    
    // Document info
    documentKey: { type: String, required: true, index: true },
    documentName: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, required: true },
    actionType: { type: String, enum: ['direct_upload', 'template_download', 'sample_view'], required: true },
    isMandatory: { type: Boolean, default: true },
    
    // Source
    source: { type: String, enum: ['Global', 'Bank'], required: true },
    
    // Template info
    templateUrl: { type: String, default: null },
    templateFileName: { type: String, default: null },
    sampleUrl: { type: String, default: null },
    
    // Handler
    handledBy: { type: String, enum: ['Advisor', 'Ops'], required: true },
    toggleState: {
      handledByAdvisor: { type: Boolean, default: false },
      assignedToOps: { type: Boolean, default: true },
      toggledAt: { type: Date, default: null }
    },
    
    // Upload status
    isUploaded: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    uploadedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    
    // Validation rules
    requiresFrontBack: { type: Boolean, default: false },
    requiresSignature: { type: Boolean, default: false },
    requiresStamp: { type: Boolean, default: false },
    requiresAttestation: { type: Boolean, default: false },
    requiresTranslation: { type: Boolean, default: false },
    maxFileSizeMB: { type: Number, default: 10 },
    allowedFileTypes: [{ type: String }],
    
    // UI hints
    placeholderText: { type: String, default: '' },
    helperText: { type: String, default: '' },
    instructions: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Indexes
caseDocumentRequirementSchema.index({ caseId: 1, documentKey: 1 });
caseDocumentRequirementSchema.index({ caseId: 1, handledBy: 1 });
caseDocumentRequirementSchema.index({ caseId: 1, isUploaded: 1 });

// Virtuals
caseDocumentRequirementSchema.virtual('canSkip').get(function() {
  return this.actionType === 'template_download' && this.handledBy === 'Ops';
});

caseDocumentRequirementSchema.virtual('isTemplateDownload').get(function() {
  return this.actionType === 'template_download';
});

caseDocumentRequirementSchema.virtual('isDirectUpload').get(function() {
  return this.actionType === 'direct_upload';
});

// Methods
caseDocumentRequirementSchema.methods.markUploaded = async function(documentId) {
  this.isUploaded = true;
  this.documentId = documentId;
  this.uploadedAt = new Date();
  return this.save();
};

caseDocumentRequirementSchema.methods.markVerified = async function() {
  this.isVerified = true;
  this.verifiedAt = new Date();
  return this.save();
};

caseDocumentRequirementSchema.methods.markRejected = async function(reason) {
  this.isVerified = false;
  this.rejectionReason = reason;
  return this.save();
};

const CaseDocumentRequirement = mongoose.models.CaseDocumentRequirement || 
  mongoose.model('CaseDocumentRequirement', caseDocumentRequirementSchema);

module.exports = CaseDocumentRequirement;