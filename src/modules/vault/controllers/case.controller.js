import Case from '../models/Case.js';
import Lead from '../models/VaultLead.js';
import Partner from '../models/Partner.js';
import Proposal from '../models/Proposal.js';
import mongoose from "mongoose";
import Document from '../models/Document.js';
import CaseDocumentRequirement from '../models/CaseDocumentRequirement.js';
import Ops from "../models/MortgageOps.js";
import HistoryService from '../services/history.service.js';
import BankDocumentRequirement  from '../../mortgages/models/Bankproductdocuments.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { initializeCaseDocuments, getCaseDocumentsByFilter } from '../utils/caseDocumentHelper.js';



const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'User';
  let partnerId = null;
  let advisorId = null;
  
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
    } else if (req.user?.employeeType === 'XotoAdvisor') {
      userRole = 'Advisor';
      advisorId = req.user._id;
    } else if (req.user?.employeeType === 'MortgageOps') {
      userRole = 'MortgageOps';
    }
  }
  
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    partnerId,
    advisorId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

export const createCase = async (req, res) => {
  try {
    const { 
      sourceLeadId, proposalId, caseReference, clientInfo, propertyInfo, 
      loanInfo, currentStatus, internalNotes, customerNotes 
    } = req.body;

    // Validation
    if (!sourceLeadId) return res.status(400).json({ success: false, message: "sourceLeadId is required" });
    if (!caseReference) return res.status(400).json({ success: false, message: "caseReference is required" });
    if (!clientInfo?.fullName) return res.status(400).json({ success: false, message: "clientInfo with fullName is required" });
    if (!propertyInfo?.propertyValue) return res.status(400).json({ success: false, message: "propertyInfo with propertyValue is required" });
    if (!loanInfo?.selectedBankProduct) return res.status(400).json({ success: false, message: "loanInfo with selectedBankProduct is required" });

    // Check duplicate case
    const existingCase = await Case.findOne({ sourceLeadId, isDeleted: false });
    if (existingCase) {
      return res.status(400).json({ success: false, message: "Case already exists for this lead", existingCaseId: existingCase._id });
    }

    // Check unique case reference
    const existingCaseRef = await Case.findOne({ caseReference, isDeleted: false });
    if (existingCaseRef) {
      return res.status(400).json({ success: false, message: "Case reference already exists" });
    }

    // Fetch lead
    const lead = await Lead.findById(sourceLeadId);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    // Check lead status
    if (lead.currentStatus !== 'Qualified') {
      return res.status(400).json({ success: false, message: `Lead must be Qualified to create a case. Current status: ${lead.currentStatus}` });
    }

    // User role & permission
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    const isAdvisor = roleDoc?.code === '26';

    if (!isAdmin && !isPartner && !isAdvisor) {
      return res.status(403).json({ success: false, message: "Not authorized to create case" });
    }

    // Get Bank Product Details
    const BankProduct = mongoose.model('BankMortgageProducts');
    const product = await BankProduct.findById(loanInfo.selectedBankProduct).populate('bank');
    
    if (!product) {
      return res.status(404).json({ success: false, message: "Bank product not found" });
    }

    // Set createdBy based on role
    let createdBy = {};
    if (isAdmin) {
      createdBy = { role: 'admin', userId: req.user._id, userName: req.user?.email || 'Admin', createdAt: new Date() };
    } else if (isAdvisor) {
      createdBy = { role: 'advisor', userId: req.user._id, userName: req.user?.fullName || req.user?.email, createdAt: new Date() };
    } else if (isPartner) {
      const partner = await Partner.findById(req.user._id);
      if (!partner || !partner.isActive()) {
        return res.status(403).json({ success: false, message: "Partner account not active" });
      }
      createdBy = { role: 'partner', userId: partner._id, userName: partner.companyName, createdAt: new Date() };
    }

    // Format notes
    const formattedInternalNotes = Array.isArray(internalNotes) 
      ? internalNotes.filter(n => typeof n === 'string')
      : (internalNotes && typeof internalNotes === 'string' && internalNotes.trim() 
          ? [internalNotes.trim()] : []);

    const formattedCustomerNotes = Array.isArray(customerNotes) 
      ? customerNotes.filter(n => typeof n === 'string')
      : (customerNotes && typeof customerNotes === 'string' && customerNotes.trim() 
          ? [customerNotes.trim()] : []);

    // Create case
    const caseData = await Case.create({
      caseReference,
      sourceLeadId,
      proposalId: proposalId || null,
      createdBy,
      
      clientInfo: {
        fullName: clientInfo.fullName,
        email: clientInfo.email || lead.customerInfo.email,
        mobile: clientInfo.mobile || lead.customerInfo.mobileNumber,
        nationality: clientInfo.nationality || lead.customerInfo.nationality,
        residencyStatus: clientInfo.residencyStatus || lead.customerInfo.residencyStatus,
        employmentStatus: clientInfo.employmentStatus || lead.customerInfo.employmentStatus
      },
      
      propertyInfo: {
        propertyValue: propertyInfo.propertyValue,
        loanAmount: propertyInfo.loanAmount || (propertyInfo.propertyValue - (propertyInfo.downPayment || 0)),
        propertyAddress: {
          area: propertyInfo.propertyAddress?.area || lead.propertyDetails.propertyAddress?.area || '',
          city: propertyInfo.propertyAddress?.city || lead.propertyDetails.propertyAddress?.city || 'Dubai'
        }
      },
      
      bankSelection: {
        bankId: product.bank._id,
        bankName: product.bank.bankName,
        productId: product._id,
        productName: product.productName,
        interestRate: parseFloat(product.interestRate),
        tenureYears: loanInfo.tenureYears || 25,
        monthlyEMI: loanInfo.monthlyEMI || 0
      },
      
      currentStatus: 'Draft',
      internalNotes: formattedInternalNotes,
      customerNotes: formattedCustomerNotes,
      
      amountTracking: {
        requestedAmount: propertyInfo.loanAmount || (propertyInfo.propertyValue - (propertyInfo.downPayment || 0)),
        amountStatus: 'Pending'
      },
      
      eligibilitySnapshot: {
        checkedAt: lead.eligibility?.checkedAt || null,
        isEligible: lead.eligibility?.isEligible || false,
        dbrPercentage: lead.eligibility?.dbrPercentage || 0,
        dbrStatus: lead.eligibility?.dbrStatus || 'Not Checked',
        estimatedLTV: lead.eligibility?.estimatedLTV || 0,
        eligibilityScore: lead.eligibility?.eligibilityScore || 0,
        riskGrade: lead.eligibility?.riskGrade || null,
        recommendedLoanAmount: lead.eligibility?.recommendedLoanAmount || 0,
        eligibilityNotes: lead.eligibility?.eligibilityNotes || null
      }
    });

    // ✅ Initialize documents using customer's employment and residency
    const employmentStatus = lead.customerInfo.employmentStatus;
    const residencyStatus = lead.customerInfo.residencyStatus;
    
    const documentResult = await initializeCaseDocuments({
      caseId: caseData._id,
      bankId: product.bank._id,
      employmentStatus: employmentStatus,
      residencyStatus: residencyStatus,
      mortgageType: product.mortgageType || 'Both'
    });

    // Update case document summary
    await caseData.updateDocumentSummary();

    // Update lead conversion info
    await Lead.findByIdAndUpdate(sourceLeadId, {
      'conversionInfo.convertedToApplication': true,
      'conversionInfo.applicationId': caseData._id,
      'conversionInfo.convertedAt': new Date(),
      'conversionInfo.convertedBy': req.user._id,
      'conversionInfo.convertedByName': createdBy.userName,
      currentStatus: 'Collecting Documents'
    });

    // Update proposal if provided
    if (proposalId) {
      await Proposal.findByIdAndUpdate(proposalId, {
        convertedToCase: true,
        convertedCaseId: caseData._id,
        convertedAt: new Date()
      });
    }

    // Log activity
    await HistoryService.logCaseActivity(caseData, 'CASE_CREATED', await getUserInfo(req), {
      description: `Case ${caseReference} created with ${documentResult.summary.total} document requirements`
    });

    return res.status(201).json({
      success: true,
      message: "Case created successfully",
      data: {
        case: caseData,
        documentSummary: caseData.documentSummary,
        documentRequirements: documentResult.documents,
        documentStats: documentResult.summary,
        filtersUsed: {
          employmentStatus: employmentStatus,
          residencyStatus: residencyStatus,
          bankId: product.bank._id,
          bankName: product.bank.bankName,
          productName: product.productName
        }
      }
    });

  } catch (error) {
    console.error("Create case error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get case documents
export const getCaseDocuments = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { source, handledBy, actionType } = req.query;
    
    const result = await getCaseDocumentsByFilter(caseId, { source, handledBy, actionType });
    
    return res.status(200).json({
      success: result.success,
      data: result.documents,
      summary: result.summary
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SUBMIT CASE TO XOTO (Enter Ops Queue) ====================
export const submitCaseToXoto = async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ success: false, message: `Case cannot be submitted. Current status: ${caseData.currentStatus}` });
    }
    
    // Check if all global documents are uploaded
    const allGlobalUploaded = caseData.documentStatus.globalDocuments?.every(d => d.isUploaded) ?? true;
    if (!allGlobalUploaded) {
      return res.status(400).json({ success: false, message: "All required documents must be uploaded before submitting" });
    }
    
    // Submit to Xoto and enter Ops Queue
    caseData.currentStatus = 'Submitted to Xoto';
    caseData.timeline.submittedToXotoAt = new Date();
    caseData.documentStatus.advisorSubmittedAt = new Date();
    await caseData.save();
    
    // Auto-enter Ops Queue
    await caseData.enterOpsQueue();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED_TO_XOTO', await getUserInfo(req), {
      description: `Case ${caseData.caseReference} submitted to Xoto and placed in Ops Queue`
    });
    
    return res.status(200).json({ success: true, message: "Case submitted to Xoto successfully", data: caseData });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== OPS QUEUE MANAGEMENT ====================

export const getOpsQueue = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isOps = roleDoc?.code === '23';
    
    if (!isAdmin && !isOps) return res.status(403).json({ success: false, message: "Access denied" });
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let query = { currentStatus: 'In Ops Queue - Pending Pick-up', isDeleted: false };
    
    if (req.query.search) {
      query.$or = [
        { caseReference: { $regex: req.query.search, $options: 'i' } },
        { 'clientInfo.fullName': { $regex: req.query.search, $options: 'i' } },
        { 'clientInfo.email': { $regex: req.query.search, $options: 'i' } },
        { 'clientInfo.mobile': { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.bank && req.query.bank !== 'all') {
      query['bankSelection.bankName'] = { $regex: req.query.bank, $options: 'i' };
    }
    
    const total = await Case.countDocuments(query);
    const cases = await Case.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const casesWithQueueTime = cases.map(c => ({
      ...c,
      hoursInQueue: Math.floor((Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60)),
      daysInQueue: Math.floor((Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24)),
      returnCount: c.opsQueue?.returnCount || 0,
      lastReturnReason: c.opsQueue?.lastReturnReason || null
    }));
    
    return res.status(200).json({
      success: true,
      data: casesWithQueueTime,
      total,
      pagination: { currentPage: page, totalPages: Math.ceil(total / limit), limit }
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const opsPickUpCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const opsId = req.user._id;
    
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '23') return res.status(403).json({ success: false, message: "Only Mortgage Ops can pick up cases" });
    
    const caseData = await Case.findOne({ _id: caseId, currentStatus: 'In Ops Queue - Pending Pick-up', isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found or already picked up" });
    
    const ops = await Ops.findById(opsId);
    if (!ops) return res.status(404).json({ success: false, message: "Mortgage Ops user not found" });
    
    const currentWorkload = ops.workload?.currentApplications || 0;
    const maxCapacity = ops.workload?.maxCapacity || 999;
    if (currentWorkload >= maxCapacity) {
      return res.status(400).json({ success: false, message: `You have reached your maximum capacity (${maxCapacity} cases)` });
    }
    
    let opsName = ops.fullName || ops.email || 'Ops User';
    
    await caseData.pickUpFromQueue(opsId, opsName);
    
    ops.workload.currentApplications = currentWorkload + 1;
    ops.queueStatus.pendingReview = (ops.queueStatus.pendingReview || 0) + 1;
    await ops.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_PICKED_UP', await getUserInfo(req), {
      description: `Case picked up by Ops ${opsName}`
    });
    
    return res.status(200).json({ success: true, message: "Case picked up successfully", data: caseData });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const returnCaseToQueue = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: "Valid reason required to return case to queue" });
    }
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    const opsId = req.user._id;
    const ops = await Ops.findById(opsId);
    let opsName = ops?.fullName || ops?.email || 'Ops User';
    
    await caseData.returnToQueue(opsId, opsName, reason);
    
    // Decrease workload
    if (ops) {
      ops.workload.currentApplications = Math.max(0, (ops.workload.currentApplications || 0) - 1);
      ops.queueStatus.pendingReview = Math.max(0, (ops.queueStatus.pendingReview || 0) - 1);
      await ops.save();
    }
    
    await HistoryService.logCaseActivity(caseData, 'CASE_RETURNED_TO_QUEUE', await getUserInfo(req), {
      description: `Case returned to queue. Reason: ${reason}`
    });
    
    return res.status(200).json({ success: true, message: "Case returned to queue", data: caseData });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminAssignCaseToOps = async (req, res) => {
  try {
    const { caseId, opsId } = req.body;
    
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') return res.status(403).json({ success: false, message: "Admin only" });
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (caseData.currentStatus !== 'In Ops Queue - Pending Pick-up') {
      return res.status(400).json({ success: false, message: "Case must be in queue for manual assignment" });
    }
    
    const ops = await Ops.findById(opsId);
    if (!ops) return res.status(404).json({ success: false, message: "Ops not found" });
    
    let opsName = ops.fullName || ops.email || 'Ops User';
    const adminName = req.user?.email || 'Admin';
    
    await caseData.adminAssignToOps(opsId, opsName, adminName);
    
    ops.workload.currentApplications = (ops.workload.currentApplications || 0) + 1;
    await ops.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_MANUALLY_ASSIGNED', await getUserInfo(req), {
      description: `Case manually assigned to Ops ${opsName} by Admin`
    });
    
    return res.status(200).json({ success: true, message: `Case assigned to ${opsName}`, data: caseData });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyAssignedCases = async (req, res) => {
  try {
    const opsId = req.user._id;
    
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '23') return res.status(403).json({ success: false, message: "Access denied" });
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let query = { 'opsQueue.currentAssignment.opsId': opsId, isDeleted: false };
    
    if (req.query.search) {
      query.$or = [
        { caseReference: { $regex: req.query.search, $options: 'i' } },
        { 'clientInfo.fullName': { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.caseStatus && req.query.caseStatus !== 'all') {
      query.currentStatus = req.query.caseStatus;
    }
    
    const total = await Case.countDocuments(query);
    const cases = await Case.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
    
    return res.status(200).json({ success: true, data: cases, total, pagination: { currentPage: page, totalPages: Math.ceil(total / limit), limit } });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== UPDATE CASE STATUS ====================
export const updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, approvedAmount, bankReference } = req.body;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isOps = roleDoc?.code === '23';
    
    if (!isAdmin && !isOps) return res.status(403).json({ success: false, message: "Only Admin or Mortgage Ops can update case status" });
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (isOps && caseData.opsQueue?.currentAssignment?.opsId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only update cases assigned to you" });
    }
    
    const previousStatus = caseData.currentStatus;
    caseData.currentStatus = status;
    
    // Handle Pre-Approved with amount
    if (status === 'Pre-Approved' && approvedAmount) {
      await caseData.updateBankApproval(approvedAmount, null, bankReference, notes);
    }
    
    // Handle Bank Application
    if (status === 'Submitted to Bank' && bankReference) {
      caseData.bankSubmission = { submittedToBankAt: new Date(), bankReferenceNumber: bankReference, bankNotes: notes };
      caseData.timeline.submittedToBankAt = new Date();
    }
    
    // Handle Disbursed
    if (status === 'Disbursed' && approvedAmount) {
      await caseData.updateDisbursement(approvedAmount, bankReference);
    }
    
    // Handle Rejected
    if (status === 'Rejected') {
      await caseData.rejectCase(notes || 'Rejected by bank');
    }
    
    // Add notes
    if (notes && !['Pre-Approved', 'Submitted to Bank', 'Disbursed', 'Rejected'].includes(status)) {
      caseData.internalNotes = caseData.internalNotes || [];
      caseData.internalNotes.push(`${previousStatus} → ${status}: ${notes}`);
    }
    
    await caseData.save();
    
    return res.status(200).json({ success: true, message: `Case status updated from ${previousStatus} to ${status}`, data: caseData });
    
  } catch (error) {
    console.error("Update case status error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== RESUBMIT CASE AFTER CORRECTION ====================
export const resubmitCaseAfterCorrection = async (req, res) => {
  try {
    const { id } = req.params;
    const { correctionNotes } = req.body;
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (caseData.currentStatus !== 'Returned - Pending Correction') {
      return res.status(400).json({ success: false, message: `Invalid status: ${caseData.currentStatus}` });
    }
    
    caseData.currentStatus = 'Resubmitted-After Correction';
    caseData.resubmissionCount = (caseData.resubmissionCount || 0) + 1;
    caseData.internalNotes.push(`Resubmitted (#${caseData.resubmissionCount}): ${correctionNotes || 'Corrections done'}`);
    
    await caseData.save();
    
    return res.status(200).json({ success: true, message: "Case resubmitted successfully", data: caseData });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== BASIC CRUD ====================
export const getAllCases = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { isDeleted: false };
    if (status) query.currentStatus = status;
    
    const cases = await Case.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Case.countDocuments(query);
    
    return res.status(200).json({ success: true, data: cases, total, pagination: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), limit: parseInt(limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCaseById = async (req, res) => {
  try {
    const caseData = await Case.findOne({ _id: req.params.id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    return res.status(200).json({ success: true, data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCase = async (req, res) => {
  try {
    const caseData = await Case.findOne({ _id: req.params.id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    if (caseData.currentStatus !== 'Draft') return res.status(400).json({ success: false, message: "Only draft cases can be updated" });
    
    const updatedCase = await Case.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json({ success: true, data: updatedCase });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCase = async (req, res) => {
  try {
    const caseData = await Case.findOne({ _id: req.params.id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    caseData.isDeleted = true;
    caseData.deletedAt = new Date();
    await caseData.save();
    
    return res.status(200).json({ success: true, message: "Case deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const addCaseNote = async (req, res) => {
  try {
    const caseData = await Case.findOne({ _id: req.params.id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    caseData.internalNotes = caseData.internalNotes || [];
    caseData.internalNotes.push(req.body.note);
    await caseData.save();
    
    return res.status(200).json({ success: true, data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCaseStats = async (req, res) => {
  try {
    const stats = await Case.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$currentStatus', count: { $sum: 1 } } }]);
    const statsMap = {};
    stats.forEach(s => { statsMap[s._id] = s.count; });
    
    return res.status(200).json({ success: true, data: statsMap });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCaseDocumentStatus = async (req, res) => {
  try {
    const caseData = await Case.findOne({ _id: req.params.id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    return res.status(200).json({ success: true, data: caseData.documentStatus });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCasesByLead = async (req, res) => {
  try {
    const cases = await Case.find({ sourceLeadId: req.params.leadId, isDeleted: false });
    return res.status(200).json({ success: true, data: cases });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCasesByProposal = async (req, res) => {
  try {
    const cases = await Case.find({ proposalId: req.params.proposalId, isDeleted: false });
    return res.status(200).json({ success: true, data: cases });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCaseAmountDetails = async (req, res) => {
  try {
    const caseData = await Case.findOne({ _id: req.params.caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    return res.status(200).json({
      success: true,
      data: {
        requestedAmount: caseData.amountTracking?.requestedAmount || 0,
        approvedAmount: caseData.amountTracking?.approvedAmount || null,
        disbursedAmount: caseData.amountTracking?.disbursedAmount || null,
        amountStatus: caseData.amountTracking?.amountStatus || 'Pending',
        interestRate: caseData.bankSelection?.interestRate || 0,
        tenureYears: caseData.bankSelection?.tenureYears || 25,
        monthlyEMI: caseData.bankSelection?.monthlyEMI || 0,
        propertyValue: caseData.propertyInfo?.propertyValue || 0,
        currentStatus: caseData.currentStatus
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitCaseToBank = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { bankReference, notes } = req.body;
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (caseData.currentStatus !== 'Assigned - Pending Review' && caseData.currentStatus !== 'Under Review') {
      return res.status(400).json({ success: false, message: `Cannot submit to bank. Current status: ${caseData.currentStatus}` });
    }
    
    caseData.currentStatus = 'Submitted to Bank';
    caseData.bankSubmission = { submittedToBankAt: new Date(), bankReferenceNumber: bankReference, bankNotes: notes };
    caseData.timeline.submittedToBankAt = new Date();
    await caseData.save();
    
    return res.status(200).json({ success: true, message: "Case submitted to bank", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBankDecision = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { status, approvedAmount, notes } = req.body;
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (status === 'Pre-Approved' && approvedAmount) {
      await caseData.updateBankApproval(approvedAmount, null, null, notes);
    } else if (status === 'Disbursed' && approvedAmount) {
      await caseData.updateDisbursement(approvedAmount, null);
    } else if (status === 'Rejected') {
      await caseData.rejectCase(notes || 'Rejected by bank');
    } else {
      caseData.currentStatus = status;
      if (notes) caseData.internalNotes.push(notes);
      await caseData.save();
    }
    
    return res.status(200).json({ success: true, message: "Bank decision updated", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};