import Document from '../models/Document.js';
import Partner from "../models/Partner.js";
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
    else if (req.user?.employeeType === 'XotoAdvisor') userRole = 'XotoAdvisor';
    else if (req.user?.employeeType === 'MortgageOps') userRole = 'MortgageOps';
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

// Helper function to update case document status
const updateCaseDocumentStatus = async (caseId) => {
  const caseData = await Case.findById(caseId);
  if (caseData && caseData.updateDocumentStatus) {
    const uploadedCount = await Document.countDocuments({ 
      entityType: 'Case', 
      entityId: caseId, 
      isDeleted: false 
    });
    const verifiedCount = await Document.countDocuments({ 
      entityType: 'Case', 
      entityId: caseId, 
      verificationStatus: 'verified',
      isDeleted: false 
    });
    await caseData.updateDocumentStatus(uploadedCount, verifiedCount);
  }
};

// ✅ NEW: Helper function to copy documents from Lead to Case
export const copyLeadDocumentsToCase = async (leadId, caseId) => {
  try {
    const leadDocs = await Document.find({
      entityType: 'Lead',
      entityId: leadId,
      isDeleted: false
    });

    for (const doc of leadDocs) {
      // ✅ When copying, set verificationStatus to 'pending' for Mortgage Ops review
      // Even if it was verified in Lead, Ops needs to re-verify for Case
      await Document.create({
        entityType: 'Case',
        entityId: caseId,
        linkedFrom: {
          entityType: 'Lead',
          entityId: leadId
        },
        isFromLead: true,
        documentType: doc.documentType,
        documentCategory: doc.documentCategory,
        fileName: doc.fileName,
        fileSizeMb: doc.fileSizeMb,
        fileUrl: doc.fileUrl,
        fileHash: doc.fileHash,
        mimeType: doc.mimeType,
        uploadedBy: doc.uploadedBy,
        uploadedAt: doc.uploadedAt,
        uploadedFromIp: doc.uploadedFromIp,
        verificationStatus: 'pending', // ✅ Always pending for Ops review
        verifiedBy: null,
        verifiedAt: null,
        encryption: doc.encryption
      });
    }
    
    console.log(`✅ Copied ${leadDocs.length} documents from Lead ${leadId} to Case ${caseId}`);
    return leadDocs.length;
  } catch (error) {
    console.error('Error copying documents from lead to case:', error);
    return 0;
  }
};

// Helper function to get document category
function getDocumentCategory(documentType) {
  const identityDocs = ['emirates_id_front', 'emirates_id_back', 'passport', 'visa'];
  const financialDocs = ['bank_statements', 'salary_certificate', 'payslips', 'credit_report'];
  const propertyDocs = ['title_deed', 'ejari', 'sale_agreement', 'noc'];
  const bankForms = ['bank_application_form', 'consent_form'];
  
  if (identityDocs.includes(documentType)) return 'identity';
  if (financialDocs.includes(documentType)) return 'financial';
  if (propertyDocs.includes(documentType)) return 'property';
  if (bankForms.includes(documentType)) return 'bank_form';
  return 'other';
}

/* =====================================
   UPLOAD DOCUMENT - COMPLETE WITH ADVISOR SUPPORT
===================================== */
export const uploadDocument = async (req, res) => {
  try {
    const { documentType, documentCategory, fileUrl, fileName, fileSizeMb, mimeType, isVerified } = req.body;
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
    const isXotoAdvisor = req.user?.employeeType === 'XotoAdvisor' || 
                          req.user?.type === 'vaultadvisor' || 
                          req.user?.role?.code === '26';
    const isMortgageOps = req.user?.employeeType === 'MortgageOps';
    
    // Get partner type if partner
    let isCompanyPartner = false;
    let isIndividualPartner = false;
    if (isPartner) {
      const partner = await Partner.findById(req.user._id);
      isCompanyPartner = partner?.partnerCategory === 'company';
      isIndividualPartner = partner?.partnerCategory === 'individual';
    }
    
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
      
      // XOTO ADVISOR - can upload for leads assigned to them
      else if (isXotoAdvisor) {
        if (lead.assignedTo?.advisorId?.toString() === req.user._id.toString()) {
          hasPermission = true;
        }
      }
      
      // FREELANCE AGENT - only their own leads with Referral + Docs
      else if (isFreelanceAgent) {
        if (lead.sourceInfo.createdById.toString() === req.user._id.toString() && 
            lead.referralType === 'Referral + Docs') {
          hasPermission = true;
          
          // Restrict document types for Freelance Agent
          const allowedDocTypes = ['emirates_id_front', 'emirates_id_back', 'passport', 'visa'];
          if (!allowedDocTypes.includes(documentType)) {
            return res.status(403).json({ 
              success: false, 
              message: `Freelance agents can only upload: ${allowedDocTypes.join(', ')}` 
            });
          }
        }
      }
      
      // INDIVIDUAL PARTNER - can upload for their OWN leads
      else if (isIndividualPartner) {
        if (lead.sourceInfo.createdById.toString() === req.user._id.toString() &&
            lead.sourceInfo.createdByModel === 'Partner') {
          hasPermission = true;
        }
      }
      
      // COMPANY PARTNER - leads from their affiliated agents
      else if (isCompanyPartner) {
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
      
      if (existingDoc && existingDoc.verificationStatus === 'rejected') {
        existingDoc.fileUrl = fileUrl;
        existingDoc.fileName = fileName || existingDoc.fileName;
        existingDoc.fileSizeMb = fileSizeMb || existingDoc.fileSizeMb;
        existingDoc.mimeType = mimeType || existingDoc.mimeType;
        existingDoc.verificationStatus = isVerified ? 'verified' : 'pending';
        existingDoc.rejectionReason = null;
        existingDoc.uploadedBy = {
          role: isAdmin ? 'admin' : (isFreelanceAgent ? 'agent' : (isPartner ? 'partner' : (isXotoAdvisor ? 'advisor' : 'client'))),
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.companyName || req.user?.email,
        };
        existingDoc.uploadedAt = new Date();
        if (isVerified) {
          existingDoc.verifiedBy = req.user._id;
          existingDoc.verifiedAt = new Date();
        }
        await existingDoc.save();
        document = existingDoc;
        isUpdate = true;
      }
      else if (!existingDoc) {
        const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
        
        document = await Document.create({
          entityType: 'Lead',
          entityId: leadId,
          documentType,
          documentCategory: documentCategory || getDocumentCategory(documentType),
          fileName: fileName || 'document',
          fileSizeMb: fileSizeMb || 0,
          fileUrl,
          fileHash,
          mimeType: mimeType || 'application/pdf',
          uploadedBy: {
            role: isAdmin ? 'admin' : (isFreelanceAgent ? 'agent' : (isPartner ? 'partner' : (isXotoAdvisor ? 'advisor' : 'client'))),
            userId: req.user._id,
            userName: req.user?.fullName || req.user?.companyName || req.user?.email,
          },
          uploadedFromIp: req.ip,
          verificationStatus: isVerified ? 'verified' : 'pending',
          verifiedBy: isVerified ? req.user._id : null,
          verifiedAt: isVerified ? new Date() : null,
          encryption: 'AES-256',
        });
      }
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
      const verifiedCount = await Document.countDocuments({ 
        entityType: 'Lead', 
        entityId: leadId, 
        verificationStatus: 'verified',
        isDeleted: false 
      });
      await lead.updateDocumentStatus(uploadedCount, verifiedCount);
      
      await HistoryService.logDocumentActivity(document, isUpdate ? 'DOCUMENT_REUPLOADED' : 'DOCUMENT_UPLOADED', await getUserInfo(req), {
        description: `Document ${document.fileName} ${isUpdate ? 're-uploaded' : 'uploaded'} to Lead`,
      });
      
      return res.status(201).json({ 
        success: true, 
        message: isUpdate ? "Document re-uploaded successfully" : "Document uploaded successfully",
        data: {
          document,
          documentCollection: lead.documentCollection,
          allDocumentsVerified: lead.documentCollection.readyForSubmission
        }
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
      
      // ========== PERMISSION CHECK FOR CASE ==========
      let hasPermission = false;
      
      if (isAdmin) {
        hasPermission = true;
      }
      // XOTO ADVISOR - can upload for cases they created
      else if (isXotoAdvisor && caseData.createdBy?.advisorId?.toString() === req.user._id.toString()) {
        hasPermission = true;
      }
      // ✅ MORTGAGE OPS - can upload bank forms to cases assigned to them
      else if (isMortgageOps) {
        // Ops can upload bank forms to cases assigned to them
        if (!caseData.assignedTo?.opsId || caseData.assignedTo.opsId.toString() === req.user._id.toString()) {
          // Only allow bank forms
          const allowedDocTypes = ['bank_application_form', 'consent_form'];
          if (allowedDocTypes.includes(documentType)) {
            hasPermission = true;
          } else {
            return res.status(403).json({
              success: false,
              message: `Mortgage Ops can only upload bank forms: ${allowedDocTypes.join(', ')}`
            });
          }
        }
      }
      // INDIVIDUAL PARTNER - can upload for their own cases
      else if (isIndividualPartner && caseData.createdBy?.partnerId?.toString() === req.user._id.toString()) {
        hasPermission = true;
      }
      // COMPANY PARTNER - can upload for cases from their company
      else if (isCompanyPartner && caseData.createdBy?.partnerId?.toString() === req.user._id.toString()) {
        hasPermission = true;
      }
      
      if (!hasPermission) {
        return res.status(403).json({ 
          success: false, 
          message: "You don't have permission to upload documents for this case" 
        });
      }
      
      // ========== DUPLICATE CHECK FOR CASE ==========
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
        existingDoc.fileSizeMb = fileSizeMb || existingDoc.fileSizeMb;
        existingDoc.mimeType = mimeType || existingDoc.mimeType;
        existingDoc.verificationStatus = isVerified ? 'verified' : 'pending';
        existingDoc.rejectionReason = null;
        existingDoc.uploadedBy = {
          role: isAdmin ? 'admin' : (isPartner ? 'partner' : (isXotoAdvisor ? 'advisor' : 'client')),
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.companyName || req.user?.email,
        };
        existingDoc.uploadedAt = new Date();
        if (isVerified) {
          existingDoc.verifiedBy = req.user._id;
          existingDoc.verifiedAt = new Date();
        }
        await existingDoc.save();
        document = existingDoc;
        isUpdate = true;
        await updateCaseDocumentStatus(caseId);
      } 
      else if (!existingDoc) {
        const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
        
        document = await Document.create({
          entityType: 'Case',
          entityId: caseId,
          documentType,
          documentCategory: documentCategory || getDocumentCategory(documentType),
          fileName: fileName || 'document',
          fileSizeMb: fileSizeMb || 0,
          fileUrl,
          fileHash,
          mimeType: mimeType || 'application/pdf',
          uploadedBy: {
            role: isAdmin ? 'admin' : (isPartner ? 'partner' : (isXotoAdvisor ? 'advisor' : 'client')),
            userId: req.user._id,
            userName: req.user?.fullName || req.user?.companyName || req.user?.email,
          },
          uploadedFromIp: req.ip,
          verificationStatus: isVerified ? 'verified' : 'pending',
          verifiedBy: isVerified ? req.user._id : null,
          verifiedAt: isVerified ? new Date() : null,
          encryption: 'AES-256',
        });
        await updateCaseDocumentStatus(caseId);
      } 
      else {
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
        data: {
          document,
          documentCollection: caseData.documentStatus,
          allDocumentsVerified: caseData.documentStatus?.allDocumentsVerified || false
        }
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
    } else if (document.entityType === 'Case') {
      await updateCaseDocumentStatus(document.entityId);
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
      message: "Document rejected. User can re-upload.", 
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
    
    if (document.entityType === 'Case') {
      await updateCaseDocumentStatus(document.entityId);
    }
    
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

/* =====================================
   ADVISOR VERIFY DOCUMENT
===================================== */
export const advisorVerifyDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { qualityScore, isVerified, reason } = req.body;
    const advisorId = req.user._id;
    
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    
    // Check if advisor has permission
    let hasPermission = false;
    
    if (document.entityType === 'Lead') {
      const lead = await Lead.findOne({
        _id: document.entityId,
        'assignedTo.advisorId': advisorId,
        isDeleted: false
      });
      if (lead) hasPermission = true;
    } else if (document.entityType === 'Case') {
      const caseData = await Case.findOne({
        _id: document.entityId,
        'createdBy.advisorId': advisorId,
        isDeleted: false
      });
      if (caseData) hasPermission = true;
    }
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: "You don't have permission to verify this document" 
      });
    }
    
    if (isVerified) {
      document.verificationStatus = 'verified';
      document.verifiedBy = advisorId;
      document.verifiedAt = new Date();
      if (qualityScore) {
        document.qualityCheck.qualityScore = qualityScore;
        document.qualityCheck.isClear = qualityScore >= 80;
        document.qualityCheck.isComplete = qualityScore >= 70;
      }
    } else {
      document.verificationStatus = 'rejected';
      document.rejectionReason = reason || "Document rejected by advisor";
    }
    
    await document.save();
    
    // Update document counts
    if (document.entityType === 'Lead') {
      const lead = await Lead.findById(document.entityId);
      if (lead) {
        const uploadedCount = await Document.countDocuments({ 
          entityType: 'Lead', 
          entityId: document.entityId, 
          isDeleted: false 
        });
        const verifiedCount = await Document.countDocuments({ 
          entityType: 'Lead', 
          entityId: document.entityId, 
          verificationStatus: 'verified',
          isDeleted: false 
        });
        await lead.updateDocumentStatus(uploadedCount, verifiedCount);
      }
    } else if (document.entityType === 'Case') {
      await updateCaseDocumentStatus(document.entityId);
    }
    
    await HistoryService.logDocumentActivity(document, isVerified ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED', await getUserInfo(req), {
      description: `Document ${document.fileName} ${isVerified ? 'verified' : 'rejected'} by Advisor`,
      notes: reason,
    });
    
    return res.status(200).json({ 
      success: true, 
      message: `Document ${isVerified ? 'verified' : 'rejected'} successfully`,
      data: document
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};