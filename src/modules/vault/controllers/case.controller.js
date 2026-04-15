import Case from '../models/Case.js';
import Lead from '../models/VaultLead.js';
import Partner from '../models/Partner.js';
import Proposal from '../models/Proposal.js';
import Document from '../models/Document.js';
import HistoryService from '../services/history.service.js';
import { copyLeadDocsToCase } from '../models/document.helper.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';

export const updateCaseDocumentStatus = async (caseId) => {
  const caseData = await Case.findById(caseId);
  if (!caseData) return;

  const requiredDocs = caseData.documentStatus?.requiredDocuments || [];
  const uploadedDocs = await Document.find({
    entityType: 'Case',
    entityId: caseId,
    isDeleted: false
  });

  let uploadedCount = 0;
  let verifiedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;
  const pendingTypes = [];

  for (let doc of requiredDocs) {
    const found = uploadedDocs.find(d => d.documentType === doc.documentType);

    if (found) {
      doc.isUploaded = true;
      doc.documentId = found._id;
      doc.uploadedAt = found.uploadedAt;
      uploadedCount++;

      if (found.verificationStatus === 'verified') {
        doc.isVerified = true;
        verifiedCount++;
      } else if (found.verificationStatus === 'rejected') {
        rejectedCount++;
      } else {
        pendingCount++;
      }
    } else {
      doc.isUploaded = false;
      pendingTypes.push(doc.documentType);
      pendingCount++;
    }
  }

  caseData.documentStatus.documentsUploadedCount = uploadedCount;
  caseData.documentStatus.documentsVerifiedCount = verifiedCount;
  caseData.documentStatus.documentsRejectedCount = rejectedCount;
  caseData.documentStatus.documentsPendingCount = pendingCount;
  caseData.documentStatus.pendingDocumentTypes = pendingTypes;
  caseData.documentStatus.allDocumentsUploaded = pendingTypes.length === 0;
  caseData.documentStatus.allDocumentsVerified = pendingCount === 0 && rejectedCount === 0;
  caseData.documentStatus.completionPercentage = requiredDocs.length > 0 ? (uploadedCount / requiredDocs.length) * 100 : 0;

  await caseData.save();
};

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'User';
  let partnerId = null;
  
  if (roleId) {
    const roleDoc = await Role.findById(roleId);
    if (roleDoc?.code === '18') {
      userRole = 'Admin';
    } else if (roleDoc?.code === '21') {
      userRole = 'Partner';
      partnerId = req.user._id;
    } else if (req.user?.agentType === 'FreelanceAgent') {
      userRole = 'FreelanceAgent';
    } else if (req.user?.agentType === 'PartnerAffiliatedAgent') {
      userRole = 'PartnerAffiliatedAgent';
    }
  }
  
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    partnerId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

// ==================== CREATE CASE ====================
export const createCase = async (req, res) => {
  try {
    const { proposalId, sourceLeadId, clientInfo, currentAddress, employmentDetails, 
            incomeDetails, expenseDetails, propertyInfo, loanInfo } = req.body;

    // Prevent duplicate case for same lead
    if (sourceLeadId) {
      const existingCase = await Case.findOne({
        sourceLeadId: sourceLeadId,
        isDeleted: false
      });

      if (existingCase) {
        return res.status(400).json({
          success: false,
          message: "Case already exists for this lead",
          existingCaseId: existingCase._id,
          existingCaseReference: existingCase.caseReference
        });
      }
    }
    
    // Get user role
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    
    if (!isAdmin && !isPartner) {
      return res.status(403).json({ success: false, message: "Only Partner or Admin can create case" });
    }
    
    // Generate case reference (no caseId field anymore)
    const caseReference = `XOTO-CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;
    
    // Calculate DBR
    const totalMonthlyLiabilities =
      (expenseDetails?.monthlyRent || 0) +
      (expenseDetails?.monthlyOtherLoanInstallments || 0) +
      (expenseDetails?.monthlyCreditCardPayments || 0) +
      (expenseDetails?.monthlyLivingExpenses || 0) +
      (expenseDetails?.existingLoans || []).reduce((sum, loan) => sum + (loan.monthlyInstallment || 0), 0);

    const income = incomeDetails.totalMonthlyIncome || 0;
    const dbrPercentage = income > 0 ? (totalMonthlyLiabilities / income) * 100 : 0; 

    let caseData;
    
    // Admin creating case
    if (isAdmin) {
      caseData = await Case.create({
        caseReference,
        proposalId: proposalId || null,
        sourceLeadId: sourceLeadId || null,
        createdBy: {
          role: 'admin',
          adminId: req.user._id,
          adminName: req.user?.email || 'Admin',
          createdAt: new Date(),
        },
        clientInfo,
        currentAddress: currentAddress || null,
        employmentDetails,
        incomeDetails,
        expenseDetails: { 
          ...expenseDetails, 
          totalMonthlyLiabilities, 
          dbrPercentage, 
          dbrStatus: dbrPercentage <= 50 ? 'Eligible' : dbrPercentage <= 60 ? 'Borderline' : 'Ineligible' 
        },
        propertyInfo,
        loanInfo,
        currentStatus: 'Draft',
      });
      
      if (sourceLeadId && !caseData.documentsCopiedFromLead) {
        await copyLeadDocsToCase(sourceLeadId, caseData._id);
        caseData.documentsCopiedFromLead = true;
        await caseData.save();
      }
      
      await caseData.initializeRequiredDocuments();
      await updateCaseDocumentStatus(caseData._id);
      
      // Update lead conversion info
      if (sourceLeadId) {
        await Lead.findOneAndUpdate({ _id: sourceLeadId }, {
          'conversionInfo.convertedToCase': true,
          'conversionInfo.caseId': caseData._id,
          'conversionInfo.convertedAt': new Date(),
          'conversionInfo.convertedByRole': 'admin',
          'conversionInfo.convertedById': req.user._id,
          'conversionInfo.convertedByName': req.user?.email
        });
      }
      
      // Update proposal conversion info
      if (proposalId) {
        await Proposal.findOneAndUpdate({ _id: proposalId }, {
          convertedToCase: true,
          convertedCaseId: caseData._id,
          convertedCaseReference: caseReference,
          convertedAt: new Date()
        });
      }
      
      await HistoryService.logCaseActivity(caseData, 'CASE_CREATED', await getUserInfo(req), {
        description: `Case ${caseData._id} created by Admin`,
      });
      
      return res.status(201).json({ success: true, message: "Case created by Admin", data: caseData });
    }
    
    // Partner creating case
    else if (isPartner) {
      const partner = await Partner.findById(req.user._id);
      if (!partner || !partner.isActive()) {
        return res.status(403).json({ success: false, message: "Partner account not active" });
      }
      
      caseData = await Case.create({
        caseReference,
        proposalId: proposalId || null,
        sourceLeadId: sourceLeadId || null,
        createdBy: {
          role: 'partner',
          partnerId: partner._id,
          partnerName: partner.companyName,
          createdAt: new Date(),
        },
        clientInfo,
        currentAddress: currentAddress || null,
        employmentDetails,
        incomeDetails,
        expenseDetails: { 
          ...expenseDetails, 
          totalMonthlyLiabilities, 
          dbrPercentage, 
          dbrStatus: dbrPercentage <= 50 ? 'Eligible' : dbrPercentage <= 60 ? 'Borderline' : 'Ineligible' 
        },
        propertyInfo,
        loanInfo,
        currentStatus: 'Draft',
      });
      
      if (sourceLeadId && !caseData.documentsCopiedFromLead) {
        await copyLeadDocsToCase(sourceLeadId, caseData._id);
        caseData.documentsCopiedFromLead = true;
        await caseData.save();
      }
      
      await caseData.initializeRequiredDocuments();
      await updateCaseDocumentStatus(caseData._id);
      
      // Update lead conversion info
      if (sourceLeadId) {
        await Lead.findOneAndUpdate({ _id: sourceLeadId }, {
          'conversionInfo.convertedToCase': true,
          'conversionInfo.caseId': caseData._id,
          'conversionInfo.convertedAt': new Date(),
          'conversionInfo.convertedByRole': 'partner',
          'conversionInfo.convertedById': partner._id,
          'conversionInfo.convertedByName': partner.companyName
        });
      }
      
      // Update proposal conversion info
      if (proposalId) {
        await Proposal.findOneAndUpdate({ _id: proposalId }, {
          convertedToCase: true,
          convertedCaseId: caseData._id,
          convertedCaseReference: caseReference,
          convertedAt: new Date()
        });
      }
      
      // Update partner metrics
      partner.performanceMetrics.totalCasesSubmitted += 1;
      await partner.save();
      
      await HistoryService.logCaseActivity(caseData, 'CASE_CREATED', await getUserInfo(req), {
        description: `Case ${caseData._id} created by Partner ${partner.companyName}`,
      });
      
      return res.status(201).json({ success: true, message: "Case created by Partner", data: caseData });
    }
    
  } catch (error) {
    console.error("Create case error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET ALL CASES ====================
export const getAllCases = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    
    const { status, page = 1, limit = 20, search } = req.query;
    
    let query = { isDeleted: false };
    if (status) query.currentStatus = status;
    
    // Partner sees only their own cases
    if (isPartner) {
      query['createdBy.partnerId'] = req.user._id;
    }
    
    // Search by client name or email
    if (search) {
      query.$or = [
        { 'clientInfo.fullName': { $regex: search, $options: 'i' } },
        { 'clientInfo.email': { $regex: search, $options: 'i' } },
        { caseReference: { $regex: search, $options: 'i' } }
      ];
    }
    
    const cases = await Case.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Case.countDocuments(query);
    
    return res.status(200).json({ 
      success: true, 
      data: cases, 
      total, 
      pagination: { 
        totalPages: Math.ceil(total / limit), 
        currentPage: parseInt(page), 
        limit 
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET CASE BY ID ====================
export const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Get associated documents
    const documents = await Document.find({ 
      entityType: 'Case', 
      entityId: id, 
      isDeleted: false 
    });
    
    return res.status(200).json({ 
      success: true, 
      data: {
        case: caseData,
        documents
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== UPDATE CASE ====================
export const updateCase = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    
    let query = { _id: id, isDeleted: false };
    
    // Partner can only update their own cases
    if (isPartner) {
      query['createdBy.partnerId'] = req.user._id;
    }
    
    const caseData = await Case.findOne(query);
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Only draft cases can be updated
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ success: false, message: "Only draft cases can be updated" });
    }
    
    const updatedCase = await Case.findOneAndUpdate(
      { _id: id },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );
    
    await HistoryService.logCaseActivity(updatedCase, 'CASE_UPDATED', await getUserInfo(req), {
      description: `Case ${id} updated`,
    });
    
    return res.status(200).json({ success: true, message: "Case updated", data: updatedCase });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SUBMIT CASE TO XOTO ====================
export const submitCaseToXoto = async (req, res) => {
  try {
    const { id } = req.params;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    
    let query = { _id: id, isDeleted: false };
    
    if (isPartner) {
      query['createdBy.partnerId'] = req.user._id;
    }
    
    const caseData = await Case.findOne(query);
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ success: false, message: "Case already submitted" });
    }
    
    // Check if all required documents are uploaded
    if (!caseData.documentStatus.allDocumentsUploaded) {
      return res.status(400).json({ 
        success: false, 
        message: "Please upload all required documents before submitting",
        missingDocuments: caseData.documentStatus.pendingDocumentTypes
      });
    }
    
    caseData.currentStatus = 'Submitted to Xoto';
    caseData.submittedToXotoAt = new Date();
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED', await getUserInfo(req), {
      description: `Case ${id} submitted to Xoto`,
    });
    
    return res.status(200).json({ success: true, message: "Case submitted to Xoto successfully", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== UPDATE CASE STATUS (Admin only) ====================
export const updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Only Admin can update case status" });
    }
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    const previousStatus = caseData.currentStatus;
    
    // Validate status transition
    const validTransitions = {
      'Draft': ['Submitted to Xoto'],
      'Submitted to Xoto': ['Bank Application', 'Collecting Documentation', 'Lost'],
      'Bank Application': ['Pre-Approved', 'Collecting Documentation', 'Rejected'],
      'Collecting Documentation': ['Bank Application', 'Lost'],
      'Pre-Approved': ['Valuation', 'Rejected'],
      'Valuation': ['FOL Processed', 'Rejected'],
      'FOL Processed': ['FOL Issued', 'Rejected'],
      'FOL Issued': ['FOL Signed', 'Rejected'],
      'FOL Signed': ['Disbursed', 'Rejected'],
      'Disbursed': [],
      'Rejected': [],
      'Lost': []
    };
    
    if (!validTransitions[previousStatus]?.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status transition from ${previousStatus} to ${status}` 
      });
    }
    
    // Special validations
    if (status === 'Bank Application' && !caseData.documentStatus.allDocumentsVerified) {
      return res.status(400).json({ 
        success: false, 
        message: "All documents must be verified before bank submission" 
      });
    }
    
    caseData.currentStatus = status;
    
    // Update bank submission info if applicable
    if (status === 'Bank Application') {
      caseData.bankSubmission = {
        submittedToBankAt: new Date(),
        bankName: caseData.loanInfo.selectedBank,
        bankNotes: notes
      };
    }
    
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_STATUS_CHANGED', await getUserInfo(req), {
      description: `Case status changed from ${previousStatus} to ${status}`,
      notes,
    });
    
    return res.status(200).json({ success: true, message: "Case status updated", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ADD CASE NOTE ====================
export const addCaseNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, isInternal } = req.body;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    
    let query = { _id: id, isDeleted: false };
    
    if (isPartner) {
      query['createdBy.partnerId'] = req.user._id;
    }
    
    const caseData = await Case.findOne(query);
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    const userName = req.user?.companyName || req.user?.email || 'User';
    
    if (isInternal) {
      caseData.internalNotes.push({ note, addedBy: userName, addedAt: new Date() });
    } else {
      caseData.customerNotes.push({ note, addedBy: userName, addedAt: new Date() });
    }
    
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'NOTE_ADDED', await getUserInfo(req), {
      description: `Note added to case ${id}`,
      notes: note,
    });
    
    return res.status(200).json({ success: true, message: "Note added", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET CASES BY LEAD ====================
export const getCasesByLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    
    const cases = await Case.find({ sourceLeadId: leadId, isDeleted: false });
    
    return res.status(200).json({ success: true, data: cases });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET CASES BY PROPOSAL ====================
export const getCasesByProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    
    const cases = await Case.find({ proposalId: proposalId, isDeleted: false });
    
    return res.status(200).json({ success: true, data: cases });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET CASE DOCUMENT STATUS ====================
export const getCaseDocumentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    return res.status(200).json({ 
      success: true, 
      data: {
        allDocumentsUploaded: caseData.documentStatus.allDocumentsUploaded,
        allDocumentsVerified: caseData.documentStatus.allDocumentsVerified,
        uploadedCount: caseData.documentStatus.documentsUploadedCount,
        verifiedCount: caseData.documentStatus.documentsVerifiedCount,
        pendingCount: caseData.documentStatus.documentsPendingCount,
        requiredDocuments: caseData.documentStatus.requiredDocuments,
        pendingDocumentTypes: caseData.documentStatus.pendingDocumentTypes
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DELETE CASE (Admin only) ====================
export const deleteCase = async (req, res) => {
  try {
    const { id } = req.params;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Only Admin can delete cases" });
    }
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    caseData.isDeleted = true;
    caseData.deletedAt = new Date();
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_DELETED', await getUserInfo(req), {
      description: `Case ${id} deleted`,
    });
    
    return res.status(200).json({ success: true, message: "Case deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET CASE STATS (Admin only) ====================
export const getCaseStats = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    
    const stats = {
      total: await Case.countDocuments({ isDeleted: false }),
      draft: await Case.countDocuments({ currentStatus: 'Draft', isDeleted: false }),
      submitted: await Case.countDocuments({ currentStatus: 'Submitted to Xoto', isDeleted: false }),
      bankApplication: await Case.countDocuments({ currentStatus: 'Bank Application', isDeleted: false }),
      preApproved: await Case.countDocuments({ currentStatus: 'Pre-Approved', isDeleted: false }),
      valuation: await Case.countDocuments({ currentStatus: 'Valuation', isDeleted: false }),
      folIssued: await Case.countDocuments({ currentStatus: 'FOL Issued', isDeleted: false }),
      folSigned: await Case.countDocuments({ currentStatus: 'FOL Signed', isDeleted: false }),
      disbursed: await Case.countDocuments({ currentStatus: 'Disbursed', isDeleted: false }),
      rejected: await Case.countDocuments({ currentStatus: 'Rejected', isDeleted: false }),
      lost: await Case.countDocuments({ currentStatus: 'Lost', isDeleted: false }),
    };
    
    const totalLoanAmount = await Case.aggregate([
      { $match: { currentStatus: 'Disbursed', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$loanInfo.approvedAmount' } } }
    ]);
    
    return res.status(200).json({ 
      success: true, 
      data: {
        ...stats,
        totalDisbursedLoanAmount: totalLoanAmount[0]?.total || 0
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};