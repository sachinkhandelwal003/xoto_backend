const Document = require('./Document');

const copyLeadDocsToCase = async (leadId, caseId) => {
  try {
    // ✅ CHECK IF ALREADY COPIED
    const existingDocs = await Document.findOne({
      entityType: 'Case',
      entityId: caseId,
      isFromLead: true
    });

    // ❌ IF ALREADY EXISTS → STOP
    if (existingDocs) {
      return;
    }

    // ✅ GET LEAD DOCS
    const leadDocs = await Document.find({
      entityType: 'Lead',
      entityId: leadId,
      isDeleted: false
    });

    if (!leadDocs.length) return;

    // ✅ COPY ONLY ONCE
    const caseDocs = leadDocs.map(doc => ({
      entityType: 'Case',
      entityId: caseId,

      documentType: doc.documentType,
      documentCategory: doc.documentCategory,

      fileName: doc.fileName,
      fileSizeMb: doc.fileSizeMb,
      fileUrl: doc.fileUrl,
      fileHash: doc.fileHash,
      mimeType: doc.mimeType,

      uploadedBy: doc.uploadedBy,
      uploadedAt: doc.uploadedAt,

      verificationStatus: doc.verificationStatus,

      linkedFrom: {
        entityType: 'Lead',
        entityId: leadId
      },

      isFromLead: true
    }));

    await Document.insertMany(caseDocs);

  } catch (error) {
    console.error("Error copying documents:", error);
  }
};

module.exports = { copyLeadDocsToCase };