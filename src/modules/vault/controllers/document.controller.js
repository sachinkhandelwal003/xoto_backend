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
   UPLOAD DOCUMENT - COMPLETE FIXED VERSION
===================================== */
export const uploadDocument = async (req, res) => {
  try {
    const { documentType, documentCategory, fileUrl, fileName, fileSizeMb, mimeType } = req.body;
    const { leadId, caseId } = req.params;
    
    // Validation
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
    
    // Partner-Affiliated Agents CANNOT upload
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
      
      // ========== PERMISSION CHECK ==========
      let hasPermission = false;
      
      // ADMIN - can upload any lead
      if (isAdmin) {
        hasPermission = true;
      }
      // FREELANCE AGENT - only their own leads with Referral + Docs
      else if (isFreelanceAgent) {
        if (lead.sourceInfo.createdById.toString() === req.user._id.toString() && 
            lead.referralType === 'Referral + Docs') {
          hasPermission = true;
        }
      }
      // PARTNER - leads from their affiliated agents
      else if (isPartner) {
        const agent = await VaultAgent.findById(lead.sourceInfo.createdById);
        if (agent && agent.partnerId && agent.partnerId.toString() === req.user._id.toString()) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        return res.status(403).json({ 
          success: false, 
          message: "You don't have permission to upload documents for this lead" 
        });
      }
      
      // ========== DUPLICATE CHECK ==========
      const existingDoc = await Document.findOne({ 
        entityType: 'Lead', 
        entityId: leadId, 
        documentType, 
        isDeleted: false 
      });
      
      let document;
      let isUpdate = false;
      
      // If document exists and is REJECTED - update it
      if (existingDoc && existingDoc.verificationStatus === 'rejected') {
        existingDoc.fileUrl = fileUrl;
        existingDoc.fileName = fileName || existingDoc.fileName;
        existingDoc.fileSizeMb = fileSizeMb || existingDoc.fileSizeMb;
        existingDoc.mimeType = mimeType || existingDoc.mimeType;
        existingDoc.verificationStatus = 'pending';
        existingDoc.rejectionReason = null;
        existingDoc.uploadedBy = {
          role: isAdmin ? 'admin' : (isFreelanceAgent ? 'agent' : 'partner'),
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.companyName || req.user?.email,
        };
        existingDoc.uploadedAt = new Date();
        await existingDoc.save();
        document = existingDoc;
        isUpdate = true;
      }
      // If no document exists - create new
      else if (!existingDoc) {
        const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
        
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
            role: isAdmin ? 'admin' : (isFreelanceAgent ? 'agent' : 'partner'),
            userId: req.user._id,
            userName: req.user?.fullName || req.user?.companyName || req.user?.email,
          },
          uploadedFromIp: req.ip,
          verificationStatus: 'pending',
          encryption: 'AES-256',
        });
      }
      // Document exists and is PENDING or VERIFIED - block
      else {
        return res.status(400).json({ 
          success: false, 
          message: `Document ${documentType} is already ${existingDoc.verificationStatus}. Cannot upload again.` 
        });
      }
      
      // Update lead document collection status
      const uploadedCount = await Document.countDocuments({ 
        entityType: 'Lead', 
        entityId: leadId, 
        isDeleted: false 
      });
      await lead.updateDocumentStatus(uploadedCount, lead.documentCollection.documentsVerified);
      
      // Log history
      await HistoryService.logDocumentActivity(document, isUpdate ? 'DOCUMENT_REUPLOADED' : 'DOCUMENT_UPLOADED', await getUserInfo(req), {
        description: `Document ${document.fileName} ${isUpdate ? 're-uploaded' : 'uploaded'} to Lead`,
      });
      
      return res.status(201).json({ 
        success: true, 
        message: isUpdate ? "Document re-uploaded successfully" : "Document uploaded successfully", 
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
      
      // Permission check for case
      let hasPermission = false;
      
      if (isAdmin) {
        hasPermission = true;
      } else if (isPartner) {
        if (caseData.createdBy.partnerId.toString() === req.user._id.toString()) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        return res.status(403).json({ 
          success: false, 
          message: "You don't have permission to upload documents for this case" 
        });
      }
      
      // Duplicate check
      const existingDoc = await Document.findOne({ 
        entityType: 'Case', 
        entityId: caseId, 
        documentType, 
        isDeleted: false 
      });
      
      let document;
      let isUpdate = false;
      
      if (existingDoc && existingDoc.verificationStatus === 'rejected') {
        existingDoc.fileUrl = fileUrl;
        existingDoc.fileName = fileName || existingDoc.fileName;
        existingDoc.verificationStatus = 'pending';
        existingDoc.rejectionReason = null;
        existingDoc.uploadedBy = {
          role: isAdmin ? 'admin' : 'partner',
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.companyName || req.user?.email,
        };
        existingDoc.uploadedAt = new Date();
        await existingDoc.save();
        document = existingDoc;
        isUpdate = true;
      } else if (!existingDoc) {
        const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
        
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
            role: isAdmin ? 'admin' : 'partner',
            userId: req.user._id,
            userName: req.user?.fullName || req.user?.companyName || req.user?.email,
          },
          uploadedFromIp: req.ip,
          verificationStatus: 'pending',
          encryption: 'AES-256',
        });
      } else {
        return res.status(400).json({ 
          success: false, 
          message: `Document ${documentType} is already ${existingDoc.verificationStatus}` 
        });
      }
      
      await HistoryService.logDocumentActivity(document, isUpdate ? 'DOCUMENT_REUPLOADED' : 'DOCUMENT_UPLOADED', await getUserInfo(req), {
        description: `Document ${document.fileName} ${isUpdate ? 're-uploaded' : 'uploaded'} to Case`,
      });
      
      return res.status(201).json({ 
        success: true, 
        message: isUpdate ? "Document re-uploaded successfully" : "Document uploaded successfully", 
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