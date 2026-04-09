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
    const { documentType, documentCategory, fileUrl, fileName, fileSizeMb, mimeType } = req.body;
    const { leadId, caseId } = req.params;
    
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "fileUrl is required" });
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
        message: "Partner-Affiliated Agents cannot upload documents. Your role is only to create leads. Your Partner will handle document collection and case management." 
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
      
      // ✅ ADMIN - can upload for any lead
      if (isAdmin) {
        console.log(`Admin uploading document for lead ${leadId}`);
      }
      // ✅ FREELANCE AGENT - can upload ONLY for their own leads with Referral + Docs
      else if (isFreelanceAgent) {
        // Check if lead belongs to this agent
        if (lead.sourceInfo.createdById.toString() !== req.user._id.toString()) {
          return res.status(403).json({ success: false, message: "This lead does not belong to you" });
        }
        
        // Only Referral + Docs type allows agent to upload documents
        if (lead.referralType !== 'Referral + Docs') {
          return res.status(403).json({ 
            success: false, 
            message: "For Referral Only leads, only Admin can upload documents. You selected Referral Only, so documents will be collected by Xoto Admin." 
          });
        }
        
        // Check if lead status allows document upload
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
    }
    
    // ============================================
    // CASE 2: UPLOADING FOR A CASE
    // ============================================
    else if (caseId) {
      const caseData = await Case.findById(caseId);
      if (!caseData) {
        return res.status(404).json({ success: false, message: "Case not found" });
      }
      
      // ✅ ADMIN - can upload for any case
      if (isAdmin) {
        console.log(`Admin uploading document for case ${caseId}`);
      }
      // ✅ PARTNER - can upload for their own cases
      else if (isPartner) {
        if (caseData.createdBy.partnerId.toString() !== req.user._id.toString()) {
          return res.status(403).json({ success: false, message: "This case does not belong to your company" });
        }
      }
      // ❌ FREELANCE AGENT CANNOT UPLOAD CASE DOCUMENTS
      else if (isFreelanceAgent) {
        return res.status(403).json({ success: false, message: "Freelance Agents cannot upload documents for cases. Only Partner or Admin can." });
      }
      else {
        return res.status(403).json({ success: false, message: "Unauthorized to upload documents for this case" });
      }
    }
    else {
      return res.status(400).json({ success: false, message: "Either leadId or caseId is required" });
    }
    
    // ============================================
    // CREATE DOCUMENT
    // ============================================
    const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
    
    let uploadedByRole = 'admin';
    if (isFreelanceAgent) uploadedByRole = 'agent';
    else if (isPartner) uploadedByRole = 'partner';
    else if (isAdmin) uploadedByRole = 'admin';
    
    const document = await Document.create({
      entityType: leadId ? 'Lead' : 'Case',
      entityId: leadId || caseId,
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
    
    // Update lead document collection status
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) {
        const uploadedCount = await Document.countDocuments({ 
          entityType: 'Lead', 
          entityId: leadId, 
          isDeleted: false 
        });
        await lead.updateDocumentStatus(uploadedCount, lead.documentCollection.documentsVerified);
      }
    }
    
    await HistoryService.logDocumentActivity(document, 'DOCUMENT_UPLOADED', await getUserInfo(req), {
      description: `Document ${document.fileName} uploaded to ${leadId ? 'Lead' : 'Case'}`,
    });
    
    return res.status(201).json({ success: true, message: "Document uploaded", data: document });
  } catch (error) {
    console.error("Upload document error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   VERIFY DOCUMENT (Admin) - using MongoDB _id
===================================== */
export const verifyDocument = async (req, res) => {
  try {
    const { id } = req.params;  // This is MongoDB _id of the document
    const { qualityScore } = req.body;
    
    // ✅ Using findById with MongoDB _id
    const document = await Document.findById(id);
    if (!document) return res.status(404).json({ success: false, message: "Document not found" });
    
    await document.verify(req.user._id, qualityScore);
    
    // Update lead document status
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
   REJECT DOCUMENT (Admin) - using MongoDB _id
===================================== */
export const rejectDocument = async (req, res) => {
  try {
    const { id } = req.params;  // This is MongoDB _id of the document
    const { reason } = req.body;
    
    // ✅ Using findById with MongoDB _id
    const document = await Document.findById(id);
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
   DELETE DOCUMENT - using MongoDB _id
===================================== */
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;  // This is MongoDB _id of the document
    
    // ✅ Using findById with MongoDB _id
    const document = await Document.findById(id);
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
      entityId: leadId,  // leadId here is MongoDB _id
      isDeleted: false 
    });
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};