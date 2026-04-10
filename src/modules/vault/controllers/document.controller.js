import Document from '../models/Document.js';
import Lead from '../models/VaultLead.js';
import Case from '../models/Case.js';
import VaultAgent from '../models/Agent.js';
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
   CHECK IF DOCUMENT CAN BE UPLOADED
   - Can upload if: 
     1. No document exists for this type OR
     2. Previous document was REJECTED (update existing)
   - Cannot upload if:
     1. Document already exists and is PENDING
     2. Document already exists and is VERIFIED
===================================== */
const canUploadDocument = async (entityType, entityId, documentType, userId) => {
  // Check if a document of this type already exists
  const existingDocument = await Document.findOne({
    entityType,
    entityId,
    documentType,
    isDeleted: false
  });
  
  if (!existingDocument) {
    return { allowed: true, action: 'create', message: "No existing document" };
  }
  
  // If document exists and is REJECTED, allow UPDATE (not create new)
  if (existingDocument.verificationStatus === 'rejected') {
    return { 
      allowed: true, 
      action: 'update', 
      existingDocument: existingDocument,
      message: "Previous rejected document found. Will update existing document." 
    };
  }
  
  // If document exists and is PENDING or VERIFIED, do NOT allow
  if (existingDocument.verificationStatus === 'pending') {
    return { allowed: false, message: `Document ${documentType} is already uploaded and pending verification. Please wait for admin verification.` };
  }
  
  if (existingDocument.verificationStatus === 'verified') {
    return { allowed: false, message: `Document ${documentType} is already verified. Cannot upload again.` };
  }
  
  return { allowed: true, action: 'create', message: "Can upload" };
};

/* =====================================
   UPLOAD DOCUMENT (JSON with URL)
===================================== */
export const uploadDocument = async (req, res) => {
  try {
    const { documentType, documentCategory, fileUrl, fileName, fileSizeMb, mimeType } = req.body;
    const { leadId, caseId } = req.params;
    
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "fileUrl is required" });
    }
    
    if (!documentType) {
      return res.status(400).json({ success: false, message: "documentType is required" });
    }
    
    // Get user role
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    const isFreelanceAgent = req.user?.agentType === 'FreelanceAgent';
    const isPartnerAffiliatedAgent = req.user?.agentType === 'PartnerAffiliatedAgent';
    
    // ❌ PARTNER-AFFILIATED AGENT - CANNOT UPLOAD ANY DOCUMENTS
    if (isPartnerAffiliatedAgent) {
      return res.status(403).json({ 
        success: false, 
        message: "Partner-Affiliated Agents cannot upload documents. Your role is only to create leads." 
      });
    }
    
    // ============================================
    // CASE 1: UPLOADING FOR A LEAD
    // ============================================
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        return res.status(404).json({ success: false, message: "Lead not found" });
      }
      
      // ✅ Check for duplicate document (only one per document type)
      const { allowed, action, existingDocument, message } = await canUploadDocument('Lead', leadId, documentType, req.user._id);
      if (!allowed) {
        return res.status(400).json({ success: false, message });
      }
      
      // ✅ ADMIN - can upload for any lead
      if (isAdmin) {
        console.log(`Admin uploading document for lead ${leadId}`);
      }
      // ✅ FREELANCE AGENT - can upload ONLY for their own leads with Referral + Docs
      else if (isFreelanceAgent) {
        if (lead.sourceInfo.createdById.toString() !== req.user._id.toString()) {
          return res.status(403).json({ success: false, message: "This lead does not belong to you" });
        }
        
        if (lead.referralType !== 'Referral + Docs') {
          return res.status(403).json({ 
            success: false, 
            message: "For Referral Only leads, only Admin can upload documents." 
          });
        }
        
        const allowedStatuses = ['New', 'Collecting Documentation'];
        if (!allowedStatuses.includes(lead.currentStatus)) {
          return res.status(403).json({ success: false, message: `Cannot upload documents when lead status is ${lead.currentStatus}` });
        }
      }
      // ✅ PARTNER - can upload for leads from their affiliated agents
      else if (isPartner) {
        const affiliatedAgents = await VaultAgent.find({ 
          partnerId: req.user._id, 
          agentType: 'PartnerAffiliatedAgent', 
          isDeleted: false 
        });
        const agentIds = affiliatedAgents.map(a => a._id);
        
        if (!agentIds.includes(lead.sourceInfo.createdById)) {
          return res.status(403).json({ success: false, message: "This lead does not belong to your affiliated agents" });
        }
      }
      else {
        return res.status(403).json({ success: false, message: "Unauthorized to upload documents for this lead" });
      }
      
      // ============================================
      // CREATE OR UPDATE DOCUMENT
      // ============================================
      const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
      
      let uploadedByRole = 'admin';
      if (isFreelanceAgent) uploadedByRole = 'agent';
      else if (isPartner) uploadedByRole = 'partner';
      else if (isAdmin) uploadedByRole = 'admin';
      
      let document;
      let isUpdate = false;
      
      if (action === 'update' && existingDocument) {
        // ✅ UPDATE existing rejected document
        existingDocument.fileUrl = fileUrl;
        existingDocument.fileHash = fileHash;
        existingDocument.fileName = fileName || existingDocument.fileName;
        existingDocument.fileSizeMb = fileSizeMb || existingDocument.fileSizeMb;
        existingDocument.mimeType = mimeType || existingDocument.mimeType;
        existingDocument.verificationStatus = 'pending';
        existingDocument.verifiedBy = null;
        existingDocument.verifiedAt = null;
        existingDocument.rejectionReason = null;
        existingDocument.uploadedBy = {
          role: uploadedByRole,
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.companyName || req.user?.email,
        };
        existingDocument.uploadedAt = new Date();
        existingDocument.uploadedFromIp = req.ip;
        
        await existingDocument.save();
        document = existingDocument;
        isUpdate = true;
        
        await HistoryService.logDocumentActivity(document, 'DOCUMENT_REUPLOADED', await getUserInfo(req), {
          description: `Document ${document.fileName} re-uploaded (rejected document updated) for ${leadId ? 'Lead' : 'Case'}`,
        });
      } else {
        // ✅ CREATE new document
        document = await Document.create({
          entityType: 'Lead',
          entityId: leadId,
          documentType,
          documentCategory,
          fileName: fileName || 'document',
          fileSizeMb: fileSizeMb || 0,
          fileUrl,
          fileHash,
          mimeType: mimeType || 'application/pdf',
          uploadedBy: {
            role: uploadedByRole,
            userId: req.user._id,
            userName: req.user?.fullName || req.user?.companyName || req.user?.email,
          },
          uploadedFromIp: req.ip,
          verificationStatus: 'pending',
          encryption: 'AES-256',
        });
        
        await HistoryService.logDocumentActivity(document, 'DOCUMENT_UPLOADED', await getUserInfo(req), {
          description: `Document ${document.fileName} uploaded to ${leadId ? 'Lead' : 'Case'}`,
        });
      }
      
      // Update lead document collection status
      const uploadedCount = await Document.countDocuments({ 
        entityType: 'Lead', 
        entityId: leadId, 
        isDeleted: false 
      });
      await lead.updateDocumentStatus(uploadedCount, lead.documentCollection.documentsVerified);
      
      return res.status(201).json({ 
        success: true, 
        message: isUpdate ? "Document re-uploaded successfully (replaced rejected document)" : "Document uploaded", 
        data: document 
      });
    }
    
    // ============================================
    // CASE 2: UPLOADING FOR A CASE
    // ============================================
    else if (caseId) {
      const caseData = await Case.findById(caseId);
      if (!caseData) {
        return res.status(404).json({ success: false, message: "Case not found" });
      }
      
      const { allowed, action, existingDocument, message } = await canUploadDocument('Case', caseId, documentType, req.user._id);
      if (!allowed) {
        return res.status(400).json({ success: false, message });
      }
      
      if (isAdmin) {
        console.log(`Admin uploading document for case ${caseId}`);
      }
      else if (isPartner) {
        if (caseData.createdBy.partnerId.toString() !== req.user._id.toString()) {
          return res.status(403).json({ success: false, message: "This case does not belong to your company" });
        }
      }
      else if (isFreelanceAgent) {
        return res.status(403).json({ success: false, message: "Freelance Agents cannot upload documents for cases." });
      }
      else {
        return res.status(403).json({ success: false, message: "Unauthorized to upload documents for this case" });
      }
      
      const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
      
      let uploadedByRole = 'admin';
      if (isFreelanceAgent) uploadedByRole = 'agent';
      else if (isPartner) uploadedByRole = 'partner';
      else if (isAdmin) uploadedByRole = 'admin';
      
      let document;
      let isUpdate = false;
      
      if (action === 'update' && existingDocument) {
        existingDocument.fileUrl = fileUrl;
        existingDocument.fileHash = fileHash;
        existingDocument.fileName = fileName || existingDocument.fileName;
        existingDocument.fileSizeMb = fileSizeMb || existingDocument.fileSizeMb;
        existingDocument.mimeType = mimeType || existingDocument.mimeType;
        existingDocument.verificationStatus = 'pending';
        existingDocument.verifiedBy = null;
        existingDocument.verifiedAt = null;
        existingDocument.rejectionReason = null;
        existingDocument.uploadedBy = {
          role: uploadedByRole,
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.companyName || req.user?.email,
        };
        existingDocument.uploadedAt = new Date();
        existingDocument.uploadedFromIp = req.ip;
        
        await existingDocument.save();
        document = existingDocument;
        isUpdate = true;
      } else {
        document = await Document.create({
          entityType: 'Case',
          entityId: caseId,
          documentType,
          documentCategory,
          fileName: fileName || 'document',
          fileSizeMb: fileSizeMb || 0,
          fileUrl,
          fileHash,
          mimeType: mimeType || 'application/pdf',
          uploadedBy: {
            role: uploadedByRole,
            userId: req.user._id,
            userName: req.user?.fullName || req.user?.companyName || req.user?.email,
          },
          uploadedFromIp: req.ip,
          verificationStatus: 'pending',
          encryption: 'AES-256',
        });
      }
      
      await HistoryService.logDocumentActivity(document, isUpdate ? 'DOCUMENT_REUPLOADED' : 'DOCUMENT_UPLOADED', await getUserInfo(req), {
        description: `Document ${document.fileName} ${isUpdate ? 're-uploaded' : 'uploaded'} to Case`,
      });
      
      return res.status(201).json({ 
        success: true, 
        message: isUpdate ? "Document re-uploaded successfully (replaced rejected document)" : "Document uploaded", 
        data: document 
      });
    }
    else {
      return res.status(400).json({ success: false, message: "Either leadId or caseId is required" });
    }
  } catch (error) {
    console.error("Upload document error:", error);
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
    
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    
    if (document.verificationStatus !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Document is already ${document.verificationStatus}. Cannot verify again.` 
      });
    }
    
    await document.verify(req.user._id, qualityScore);
    
    if (document.entityType === 'Lead') {
      const lead = await Lead.findById(document.entityId);
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
    
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    
    if (document.verificationStatus !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Document is already ${document.verificationStatus}. Cannot reject.` 
      });
    }
    
    await document.reject(req.user._id, reason || 'Document rejected by admin');
    
    await HistoryService.logDocumentActivity(document, 'DOCUMENT_REJECTED', await getUserInfo(req), {
      description: `Document ${document.fileName} rejected`,
      notes: reason,
    });
    
    return res.status(200).json({ 
      success: true, 
      message: "Document rejected. User can now re-upload a new document (same document will be updated).", 
      data: document 
    });
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
    
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    
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
    const documents = await Document.find({ 
      entityType: 'Case', 
      entityId: caseId, 
      isDeleted: false 
    });
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
    const documents = await Document.find({ 
      entityType: 'Lead', 
      entityId: leadId, 
      isDeleted: false 
    });
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};