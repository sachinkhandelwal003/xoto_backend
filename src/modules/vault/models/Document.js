// models/Document.js
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['Case'], required: true },  // Only Case now
entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    documentKey: { type: String, required: true },  // passport, emirates_id, etc.
    documentName: { type: String, required: true },
    documentCategory: { type: String, required: true },
    fileName: { type: String, required: true },
    fileSizeMb: { type: Number, required: true },
    fileUrl: { type: String, required: true },
    fileHash: { type: String, required: true },
    mimeType: { type: String, required: true },
    uploadedBy: {
      role: { type: String, enum: ['admin', 'advisor', 'ops', 'other'], required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      userName: { type: String, required: true },
    },
    uploadedAt: { type: Date, default: Date.now },
    uploadedFromIp: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
documentSchema.index({ entityType: 1, entityId: 1 });
documentSchema.index({ documentKey: 1 });
documentSchema.index({ verificationStatus: 1 });

// Virtuals
documentSchema.virtual('formattedFileSize').get(function () {
  return `${this.fileSizeMb} MB`;
});

// Methods
documentSchema.methods.verify = function (verifiedByAdminId, qualityScore) {
  this.verificationStatus = 'verified';
  this.verifiedBy = verifiedByAdminId;
  this.verifiedAt = new Date();
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

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
export default Document;
