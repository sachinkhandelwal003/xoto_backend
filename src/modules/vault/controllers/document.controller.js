// controllers/document.controller.js
import Document from '../models/Document.js';
import Case from '../models/Case.js';
import CaseDocumentRequirement from '../models/CaseDocumentRequirement.js';
import HistoryService from '../services/history.service.js';
import crypto from 'crypto';
import { Role } from '../../../modules/auth/models/role/role.model.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'User';
  if (roleId) {
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

// Update case document summary
const updateCaseDocumentSummary = async (caseId) => {
  const caseData = await Case.findById(caseId);
  if (caseData && caseData.updateDocumentSummary) {
    await caseData.updateDocumentSummary();
  }
};

/* =====================================
   UPLOAD DOCUMENT FOR CASE
===================================== */
export const uploadCaseDocument = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { documentKey, fileUrl, fileName, fileSizeMb, mimeType } = req.body;
    
    // Validation
    if (!caseId) {
      return res.status(400).json({ success: false, message: "caseId is required" });
    }
    if (!documentKey) {
      return res.status(400).json({ success: false, message: "documentKey is required" });
    }
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "fileUrl is required" });
    }
    
    // Get user role
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isXotoAdvisor = req.user?.employeeType === 'XotoAdvisor' || req.user?.role?.code === '26';
    const isMortgageOps = roleDoc?.code === '23';
    
    let userRoleName = 'Unknown';
    if (isAdmin) userRoleName = 'admin';
    else if (isXotoAdvisor) userRoleName = 'advisor';
    else if (isMortgageOps) userRoleName = 'ops';
    
    // Find the case
    const caseData = await Case.findById(caseId);
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Check case status (only draft cases can be updated)
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot upload documents. Case status: ${caseData.currentStatus}` 
      });
    }
    
    // Find document requirement for this case
    const docRequirement = await CaseDocumentRequirement.findOne({
      caseId: caseId,
      documentKey: documentKey,
      isDeleted: false
    });
    
    if (!docRequirement) {
      return res.status(404).json({ 
        success: false, 
        message: `Document "${documentKey}" is not required for this case` 
      });
    }
    
    // Check if already uploaded
    if (docRequirement.isUploaded) {
      return res.status(400).json({ 
        success: false, 
        message: `Document "${docRequirement.documentName}" is already uploaded` 
      });
    }
    
    // Permission check based on handler
    if (docRequirement.handledBy === 'Advisor' && !isXotoAdvisor && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: `This document must be uploaded by Advisor` 
      });
    }
    
    if (docRequirement.handledBy === 'Ops' && !isMortgageOps && !isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: `This document must be uploaded by Mortgage Ops` 
      });
    }
    
    // File size validation
    const fileSizeMB = fileSizeMb || 0;
    if (fileSizeMB > docRequirement.maxFileSizeMB) {
      return res.status(400).json({ 
        success: false, 
        message: `File size exceeds ${docRequirement.maxFileSizeMB}MB limit` 
      });
    }
    
    // File type validation
    const fileExt = fileName?.split('.').pop().toLowerCase();
    if (docRequirement.allowedFileTypes?.length && !docRequirement.allowedFileTypes.includes(fileExt)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid file type. Allowed: ${docRequirement.allowedFileTypes.join(', ')}` 
      });
    }
    
    // Check for existing document (re-upload after rejection)
    const existingDoc = await Document.findOne({
      entityType: 'Case',
      entityId: caseId,
      documentKey: documentKey,
      isDeleted: false
    });
    
    let document;
    let isUpdate = false;
    
    if (existingDoc && existingDoc.verificationStatus === 'rejected') {
      // Update existing rejected document
      existingDoc.fileUrl = fileUrl;
      existingDoc.fileName = fileName || existingDoc.fileName;
      existingDoc.fileSizeMb = fileSizeMB;
      existingDoc.mimeType = mimeType || existingDoc.mimeType;
      existingDoc.verificationStatus = 'pending';
      existingDoc.rejectionReason = null;
      existingDoc.uploadedBy = {
        role: userRoleName,
        userId: req.user._id,
        userName: req.user?.fullName || req.user?.email || 'System'
      };
      existingDoc.uploadedAt = new Date();
      await existingDoc.save();
      document = existingDoc;
      isUpdate = true;
    } 
    else if (!existingDoc) {
      // Create new document
      const fileHash = crypto.createHash('md5').update(fileUrl).digest('hex');
      
      document = await Document.create({
        entityType: 'Case',
        entityId: caseId,
        documentKey: documentKey,
        documentName: docRequirement.documentName,
        documentCategory: docRequirement.category,
        fileName: fileName || `${documentKey}.pdf`,
        fileSizeMb: fileSizeMB,
        fileUrl: fileUrl,
        fileHash: fileHash,
        mimeType: mimeType || 'application/pdf',
        uploadedBy: {
          role: userRoleName,
          userId: req.user._id,
          userName: req.user?.fullName || req.user?.email || 'System'
        },
        uploadedFromIp: req.ip,
        verificationStatus: 'pending'
      });
    } 
    else {
      return res.status(400).json({ 
        success: false, 
        message: `Document already uploaded and is ${existingDoc.verificationStatus}` 
      });
    }
    
    // Update CaseDocumentRequirement
    docRequirement.isUploaded = true;
    docRequirement.documentId = document._id;
    docRequirement.uploadedAt = new Date();
    await docRequirement.save();
    
    // Update case document summary
    await updateCaseDocumentSummary(caseId);
    
    // Log activity
    await HistoryService.logDocumentActivity(document, isUpdate ? 'DOCUMENT_REUPLOADED' : 'DOCUMENT_UPLOADED', await getUserInfo(req), {
      description: `Document ${document.fileName} ${isUpdate ? 're-uploaded' : 'uploaded'} to Case ${caseData.caseReference}`,
    });
    
    return res.status(201).json({
      success: true,
      message: isUpdate ? "Document re-uploaded successfully" : "Document uploaded successfully",
      data: {
        document: {
          _id: document._id,
          documentKey: document.documentKey,
          documentName: docRequirement.documentName,
          category: docRequirement.category,
          fileUrl: document.fileUrl,
          fileName: document.fileName,
          uploadedAt: document.uploadedAt
        },
        documentRequirement: {
          _id: docRequirement._id,
          isUploaded: docRequirement.isUploaded,
          handledBy: docRequirement.handledBy,
          uploadedAt: docRequirement.uploadedAt
        }
      }
    });
    
  } catch (error) {
    console.error("Upload case document error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET CASE DOCUMENTS
===================================== */
export const getCaseDocuments = async (req, res) => {
  try {
    const { caseId } = req.params;
    
    // Get all document requirements for this case
    const requirements = await CaseDocumentRequirement.find({
      caseId: caseId,
      isDeleted: false
    }).sort({ source: -1, handledBy: 1, displayOrder: 1, documentKey: 1 });
    
    // Get uploaded documents
    const uploadedDocs = await Document.find({
      entityType: 'Case',
      entityId: caseId,
      isDeleted: false
    });
    
    // Merge data
    const documents = requirements.map(req => {
      const uploaded = uploadedDocs.find(ud => ud.documentKey === req.documentKey);
      return {
        ...req.toObject(),
        fileUrl: uploaded?.fileUrl || null,
        uploadedDocId: uploaded?._id || null,
        verificationStatus: uploaded?.verificationStatus || 'pending',
        uploadedAt: uploaded?.uploadedAt || null,
        uploadedBy: uploaded?.uploadedBy || null
      };
    });
    
    // Calculate summary
    const total = requirements.length;
    const uploaded = requirements.filter(r => r.isUploaded).length;
    const pending = total - uploaded;
    const verified = requirements.filter(r => r.isVerified).length;
    const global = requirements.filter(r => r.source === 'Global').length;
    const bank = requirements.filter(r => r.source === 'Bank').length;
    const advisorHandled = requirements.filter(r => r.handledBy === 'Advisor').length;
    const opsHandled = requirements.filter(r => r.handledBy === 'Ops').length;
    
    return res.status(200).json({
      success: true,
      data: documents,
      summary: {
        total,
        uploaded,
        pending,
        verified,
        global,
        bank,
        advisorHandled,
        opsHandled
      }
    });
    
  } catch (error) {
    console.error("Get case documents error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   TOGGLE DOCUMENT HANDLER (Advisor can take bank forms)
===================================== */
export const toggleDocumentHandler = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { documentKey, handledByAdvisor } = req.body;
    
    const caseData = await Case.findById(caseId);
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Check if user is Advisor
    const roleDoc = await Role.findById(req.user.role);
    const isAdvisor = roleDoc?.code === '26';
    
    if (!isAdvisor) {
      return res.status(403).json({ success: false, message: 'Only Advisor can update document assignment' });
    }
    
    // Check if case is in draft
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot change handler after case is submitted' 
      });
    }
    
    // Find the document requirement
    const docRequirement = await CaseDocumentRequirement.findOne({
      caseId: caseId,
      documentKey: documentKey,
      source: 'Bank',  // Only bank documents can be toggled
      isDeleted: false
    });
    
    if (!docRequirement) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found or cannot be toggled' 
      });
    }
    
    if (docRequirement.isUploaded) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot change handler after document is uploaded' 
      });
    }
    
    // Toggle handler
    docRequirement.handledBy = handledByAdvisor ? 'Advisor' : 'Ops';
    docRequirement.toggleState = {
      handledByAdvisor: handledByAdvisor,
      assignedToOps: !handledByAdvisor,
      toggledAt: new Date()
    };
    await docRequirement.save();
    
    return res.status(200).json({
      success: true,
      message: handledByAdvisor 
        ? '✅ You will handle this form. Please upload before submission.'
        : '✅ Ops team will handle this form. You can skip.',
      data: {
        documentKey: docRequirement.documentKey,
        handledBy: docRequirement.handledBy,
        canSkip: !handledByAdvisor
      }
    });
    
  } catch (error) {
    console.error("Toggle document handler error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   VERIFY DOCUMENT (Admin/Ops)
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
        message: `Document is already ${document.verificationStatus}` 
      });
    }
    
    await document.verify(req.user._id, qualityScore);
    
    // Update case document requirement
    const docRequirement = await CaseDocumentRequirement.findOne({
      caseId: document.entityId,
      documentKey: document.documentKey,
      isDeleted: false
    });
    
    if (docRequirement) {
      docRequirement.isVerified = true;
      docRequirement.verifiedAt = new Date();
      await docRequirement.save();
      
      // Update case summary
      await updateCaseDocumentSummary(document.entityId);
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
   REJECT DOCUMENT (Admin/Ops)
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
        message: `Document is already ${document.verificationStatus}` 
      });
    }
    
    await document.reject(req.user._id, reason || 'Document rejected');
    
    // Update case document requirement
    const docRequirement = await CaseDocumentRequirement.findOne({
      caseId: document.entityId,
      documentKey: document.documentKey,
      isDeleted: false
    });
    
    if (docRequirement) {
      docRequirement.isVerified = false;
      docRequirement.rejectionReason = reason;
      await docRequirement.save();
    }
    
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
    
    // Update case document requirement
    const docRequirement = await CaseDocumentRequirement.findOne({
      caseId: document.entityId,
      documentKey: document.documentKey,
      isDeleted: false
    });
    
    if (docRequirement) {
      docRequirement.isUploaded = false;
      docRequirement.documentId = null;
      docRequirement.uploadedAt = null;
      await docRequirement.save();
      
      // Update case summary
      await updateCaseDocumentSummary(document.entityId);
    }
    
    return res.status(200).json({ success: true, message: "Document deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};