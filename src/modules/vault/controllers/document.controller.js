import Document from '../models/Document.js';
import Lead from '../models/VaultLead.js';
import HistoryService from '../services/history.service.js';
import crypto from 'crypto';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'User';
  if (roleId) {
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(roleId);
    if (roleDoc?.code === '18') userRole = 'Admin';
    else if (roleDoc?.code === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent') userRole = 'FreelanceAgent';
    else if (req.user?.agentType === 'PartnerAffiliatedAgent') userRole = 'PartnerAffiliatedAgent';
  }
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

/* =====================================
   UPLOAD DOCUMENT (JSON with URL)
===================================== */
export const uploadDocument = async (req, res) => {
  try {
    const { entityType, entityId, documentType, documentCategory, fileUrl, fileName, fileSizeMb, mimeType } = req.body;
    
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "fileUrl is required" });
    }
    
    const documentId = `DOC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
    
    const document = await Document.create({
      documentId,
      entityType,
      entityId,
      documentType,
      documentCategory,
      fileName: fileName || 'document',
      fileSizeMb: fileSizeMb || 0,
      fileUrl,
      fileHash,
      mimeType: mimeType || 'application/pdf',
      uploadedBy: {
        role: req.user?.agentType === 'FreelanceAgent' ? 'agent' : 'partner',
        userId: req.user._id,
        userName: req.user?.fullName || req.user?.email,
      },
      uploadedFromIp: req.ip,
      verificationStatus: 'pending',
      encryption: 'AES-256',
    });
    
    // Update lead document collection status if entity is Lead
    if (entityType === 'Lead') {
      const lead = await Lead.findOne({ leadId: entityId });
      if (lead) {
        const uploadedCount = await Document.countDocuments({ entityType: 'Lead', entityId, isDeleted: false });
        await lead.updateDocumentStatus(uploadedCount, lead.documentCollection.documentsVerified);
      }
    }
    
    await HistoryService.logDocumentActivity(document, 'DOCUMENT_UPLOADED', await getUserInfo(req), {
      description: `Document ${document.fileName} uploaded to ${entityType}`,
    });
    
    return res.status(201).json({ success: true, message: "Document uploaded", data: document });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   VERIFY DOCUMENT (Admin)
===================================== */
export const verifyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { qualityScore } = req.body;
    const document = await Document.findOne({ documentId: id });
    if (!document) return res.status(404).json({ success: false, message: "Document not found" });
    
    await document.verify(req.user._id, qualityScore);
    
    // Update lead document status
    if (document.entityType === 'Lead') {
      const lead = await Lead.findOne({ leadId: document.entityId });
      if (lead) {
        const verifiedCount = await Document.countDocuments({ 
          entityType: 'Lead', 
          entityId: document.entityId, 
          verificationStatus: 'verified',
          isDeleted: false 
        });
        await lead.updateDocumentStatus(lead.documentCollection.documentsUploaded, verifiedCount);
      }
    }
    
    await HistoryService.logDocumentActivity(document, 'DOCUMENT_VERIFIED', await getUserInfo(req), {
      description: `Document ${document.fileName} verified`,
    });
    
    return res.status(200).json({ success: true, message: "Document verified", data: document });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   REJECT DOCUMENT (Admin)
===================================== */
export const rejectDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const document = await Document.findOne({ documentId: id });
    if (!document) return res.status(404).json({ success: false, message: "Document not found" });
    
    await document.reject(req.user._id, reason);
    
    await HistoryService.logDocumentActivity(document, 'DOCUMENT_REJECTED', await getUserInfo(req), {
      description: `Document ${document.fileName} rejected`,
      notes: reason,
    });
    
    return res.status(200).json({ success: true, message: "Document rejected", data: document });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   DELETE DOCUMENT
===================================== */
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await Document.findOne({ documentId: id });
    if (!document) return res.status(404).json({ success: false, message: "Document not found" });
    
    await document.softDelete(req.user._id);
    
    return res.status(200).json({ success: true, message: "Document deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET CASE DOCUMENTS
===================================== */
export const getCaseDocuments = async (req, res) => {
  try {
    const { caseId } = req.params;
    const documents = await Document.find({ entityType: 'Case', entityId: caseId, isDeleted: false });
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET LEAD DOCUMENTS
===================================== */
export const getLeadDocuments = async (req, res) => {
  try {
    const { leadId } = req.params;
    const documents = await Document.find({ entityType: 'Lead', entityId: leadId, isDeleted: false });
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default { uploadDocument, verifyDocument, rejectDocument, deleteDocument, getCaseDocuments, getLeadDocuments };