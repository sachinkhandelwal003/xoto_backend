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


// ══════════════════════════════════════════════════════════════════
// HELPER: Update Lead Status from Case Status (PRD Section 5.3 & 6.1)
// ══════════════════════════════════════════════════════════════════
const updateLeadStatusFromCase = async (sourceLeadId, caseStatus, additionalData = {}) => {
  if (!sourceLeadId) return null;
  
  // Maps Case status → Lead status per PRD workflow
  const leadStatusMap = {
    // Draft/Submission phase → Lead: Collecting Documents
    'Draft': 'Collecting Documents',
    'Submitted to Xoto': 'Collecting Documents',
    'In Ops Queue - Pending Pick-up': 'Collecting Documents',
    'Assigned - Pending Review': 'Collecting Documents',
    'Under Review': 'Collecting Documents',
    'Resubmitted-After Correction': 'Collecting Documents',
    
    // Returned → Advisor needs more docs
    'Returned - Pending Correction': 'Collecting Documents',
    
    // Bank Application started → Lead: Application Opened
    'Submitted to Bank': 'Application Opened',
    'Pre-Approved': 'Application Opened',
    'Valuation': 'Application Opened',
    'FOL Processed': 'Application Opened',
    'FOL Issued': 'Application Opened',
    'FOL Signed': 'Application Opened',
    
    // Disbursed → Application complete
    'Disbursed': 'Application Opened',
    
    // Lost/Rejected → Lead closed
    'Rejected': 'Not Proceeding',
    'Lost': 'Not Proceeding'
  };
  
  const leadStatus = leadStatusMap[caseStatus];
  
  if (leadStatus && sourceLeadId) {
    const updateData = {
      currentStatus: leadStatus,
      updatedAt: new Date()
    };
    
    // Additional tracking for final states
    if (caseStatus === 'Disbursed') {
      updateData['conversionInfo.disbursedAt'] = new Date();
      updateData['conversionInfo.finalStatus'] = 'Disbursed';
    }
    
    if (caseStatus === 'Rejected' || caseStatus === 'Lost') {
      updateData['conversionInfo.closedAt'] = new Date();
      updateData['conversionInfo.closedReason'] = caseStatus;
      updateData['conversionInfo.closedNotes'] = additionalData.reason || null;
    }
    
    const updatedLead = await Lead.findByIdAndUpdate(sourceLeadId, updateData, { new: true });
    console.log(`✅ Lead ${sourceLeadId} status updated to: ${leadStatus} (from Case: ${caseStatus})`);
    return updatedLead;
  }
  
  return null;
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

    // ==================== FIX: Set createdBy based on role with proper userName ====================
    let createdBy = {};
    const now = new Date();

    if (isAdmin) {
      createdBy = { 
        role: 'admin', 
        userId: req.user._id, 
        userName: req.user?.name?.first_name 
          ? `${req.user.name.first_name} ${req.user.name.last_name || ''}`.trim() 
          : req.user?.email || 'Admin',
        createdAt: now 
      };
    } 
    else if (isAdvisor) {
      createdBy = { 
        role: 'advisor', 
        userId: req.user._id, 
        userName: req.user?.fullName || req.user?.name?.first_name 
          ? `${req.user.name.first_name} ${req.user.name.last_name || ''}`.trim()
          : req.user?.email || 'Advisor',
        createdAt: now 
      };
    } 
    else if (isPartner) {
      const partner = await Partner.findById(req.user._id);
      if (!partner) {
        return res.status(404).json({ success: false, message: "Partner not found" });
      }
      if (!partner.isActive()) {
        return res.status(403).json({ success: false, message: "Partner account not active" });
      }
      
      // ✅ FIX: Get proper userName for both company and individual partners
      let userName = '';
      if (partner.partnerCategory === 'company') {
        userName = partner.companyName || partner.dbaName || partner.email || 'Partner';
      } else {
        // Individual partner
        userName = partner.individualDetails 
          ? `${partner.individualDetails.firstName} ${partner.individualDetails.lastName}`.trim()
          : partner.email || 'Individual Partner';
      }
      
      createdBy = { 
        role: 'partner', 
        userId: partner._id, 
        userName: userName,
        createdAt: now 
      };
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

    // Initialize documents using customer's employment and residency
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
      'conversionInfo.convertedById': req.user._id,
      'conversionInfo.convertedByName': createdBy.userName,
      currentStatus: 'Collecting Documents'
    });

    // Update proposal if provided
    if (proposalId) {
      const Proposal = mongoose.model('Proposal');
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
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    
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
// ==================== SUBMIT CASE TO XOTO (Enter Ops Queue) ====================
export const submitCaseToXoto = async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // ✅ Check if user owns this case
    const roleDoc = await Role.findById(req.user.role);
    const roleCode = roleDoc?.code;
    const isAdvisor = roleCode === '26';
    const isPartner = roleCode === '21';
    
    if (isAdvisor && caseData.createdBy?.role !== 'advisor') {
      return res.status(403).json({ success: false, message: "You can only submit cases you created" });
    }
    
    if (isPartner && caseData.createdBy?.role !== 'partner') {
      return res.status(403).json({ success: false, message: "You can only submit cases you created" });
    }
    
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ 
        success: false, 
        message: `Case cannot be submitted. Current status: ${caseData.currentStatus}` 
      });
    }
    
    // ✅ Check if all required documents are uploaded
    const isReady = await caseData.isReadyForSubmission();
    if (!isReady) {
      return res.status(400).json({ 
        success: false, 
        message: 'All required documents must be uploaded before submitting to Xoto' 
      });
    }
    
    // Submit to Xoto
    caseData.currentStatus = 'Submitted to Xoto';
    caseData.timeline.submittedToXotoAt = new Date();
    await caseData.save();
    
    // Auto-enter Ops Queue
    caseData.currentStatus = 'In Ops Queue - Pending Pick-up';
    caseData.opsQueue.enteredQueueAt = new Date();
    caseData.opsQueue.returnCount = 0;
    await caseData.save();
    
    // Update lead status
    await updateLeadStatusFromCase(caseData.sourceLeadId, caseData.currentStatus);
    
    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED_TO_XOTO', await getUserInfo(req), {
      description: `Case ${caseData.caseReference} submitted to Xoto by ${isPartner ? 'Partner' : 'Advisor'}`
    });
    
    return res.status(200).json({ 
      success: true, 
      message: "Case submitted to Xoto successfully and added to Ops queue",
      data: caseData
    });
    
  } catch (error) {
    console.error("Submit case error:", error);
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
    
    // ✅ FIXED: Use 'opsQueue.pickedUpBy.opsId' instead of 'opsQueue.currentAssignment.opsId'
    let query = { 
      'opsQueue.pickedUpBy.opsId': opsId,  // ← This matches your schema
      isDeleted: false 
    };
    
    // Also include cases where Admin assigned (adminAssigned doesn't change pickedUpBy)
    // The schema already sets pickedUpBy during adminAssignToOps
    
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
    const cases = await Case.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    return res.status(200).json({ 
      success: true, 
      data: cases, 
      total, 
      pagination: { 
        currentPage: page, 
        totalPages: Math.ceil(total / limit), 
        limit 
      } 
    });
    
  } catch (error) {
    console.error("Get my assigned cases error:", error);
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
    
    if (isOps && caseData.opsQueue?.pickedUpBy?.opsId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only update cases assigned to you" });
    }
    
    const previousStatus = caseData.currentStatus;
    caseData.currentStatus = status;
    
    // Handle Pre-Approved with amount
    if (status === 'Pre-Approved' && approvedAmount) {
      if (typeof caseData.updateBankApproval === 'function') {
        await caseData.updateBankApproval(approvedAmount, null, bankReference, notes);
      }
    }
    
    // Handle Bank Application
    if (status === 'Submitted to Bank' && bankReference) {
      caseData.bankSubmission = { submittedToBankAt: new Date(), bankReferenceNumber: bankReference, bankNotes: notes };
      caseData.timeline.submittedToBankAt = new Date();
    }
    
    // Handle Disbursed
    if (status === 'Disbursed' && approvedAmount) {
      if (typeof caseData.updateDisbursement === 'function') {
        await caseData.updateDisbursement(approvedAmount, bankReference);
      }
    }
    
    // Handle Rejected
    if (status === 'Rejected') {
      if (typeof caseData.rejectCase === 'function') {
        await caseData.rejectCase(notes || 'Rejected by bank');
      }
    }
    
    // Add notes
    if (notes && !['Pre-Approved', 'Submitted to Bank', 'Disbursed', 'Rejected'].includes(status)) {
      caseData.internalNotes = caseData.internalNotes || [];
      caseData.internalNotes.push(`${previousStatus} → ${status}: ${notes}`);
    }
    
    await caseData.save();
    
    // ✅ UPDATE LEAD STATUS based on new case status
    await updateLeadStatusFromCase(caseData.sourceLeadId, status, { reason: notes });
    
    await HistoryService.logCaseActivity(caseData, 'CASE_STATUS_UPDATED', await getUserInfo(req), {
      description: `Case status changed from ${previousStatus} to ${status}`,
      notes: notes
    });
    
    return res.status(200).json({ 
      success: true, 
      message: `Case status updated from ${previousStatus} to ${status}`, 
      data: caseData 
    });
    
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
    caseData.internalNotes = caseData.internalNotes || [];
    caseData.internalNotes.push(`Resubmitted (#${caseData.resubmissionCount}): ${correctionNotes || 'Corrections done'}`);
    
    await caseData.save();
    
    // ✅ UPDATE LEAD STATUS - stays in Collecting Documents
    await updateLeadStatusFromCase(caseData.sourceLeadId, caseData.currentStatus);
    
    return res.status(200).json({ success: true, message: "Case resubmitted successfully", data: caseData });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET ALL CASES (Role-based filtering) ====================
export const getAllCases = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    // Get user role information
    const roleDoc = await Role.findById(req.user.role);
    const roleCode = roleDoc?.code;
    const userType = req.user.type; // 'partner', 'vaultadvisor', etc.
    
    // Base query - only non-deleted cases
    let query = { isDeleted: false };
    
    // ==================== ROLE-BASED FILTERING ====================
    
    // CASE 1: ADMIN (role code 18) - See ALL cases
    if (roleCode === '18' || userType === 'admin') {
      // Admin sees everything - no additional filters
      // query remains as is
    }
    
    // CASE 2: ADVISOR (role code 26 or type 'vaultadvisor')
    else if (roleCode === '26' || userType === 'vaultadvisor') {
      // Advisor sees ONLY cases they created
      query['createdBy.role'] = 'advisor';
      query['createdBy.userId'] = req.user._id;
    }
    
    // CASE 3: PARTNER (role code 21 or type 'partner')
    else if (roleCode === '21' || userType === 'partner') {
      // Partner sees ONLY cases they created
      query['createdBy.role'] = 'partner';
      query['createdBy.userId'] = req.user._id;
    }
    
    // CASE 4: AGENT (freelance or partner-affiliated)
    else if (req.user.agentType) {
      // Agents should NOT see cases directly
      // Cases are managed by partners/advisors
      return res.status(403).json({ 
        success: false, 
        message: 'Agents cannot access cases directly. Cases are managed by partners/advisors.' 
      });
    }
    
    // CASE 5: Unauthorized
    else {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to access cases' 
      });
    }
    
    // Apply status filter if provided
    if (status) {
      query.currentStatus = status;
    }
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);
    
    const [cases, total] = await Promise.all([
      Case.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('sourceLeadId', 'customerInfo.fullName customerInfo.mobileNumber currentStatus')
        .lean(),
      Case.countDocuments(query),
    ]);
    
    // Get summary counts based on role
    let summary = {};
    
    if (roleCode === '18' || userType === 'admin') {
      // Admin summary - all cases
      summary = {
        total: total,
        draft: await Case.countDocuments({ ...query, currentStatus: 'Draft' }),
        submittedToXoto: await Case.countDocuments({ ...query, currentStatus: 'Submitted to Xoto' }),
        inOpsQueue: await Case.countDocuments({ ...query, currentStatus: 'In Ops Queue - Pending Pick-up' }),
        assignedToOps: await Case.countDocuments({ ...query, currentStatus: 'Assigned - Pending Review' }),
        underReview: await Case.countDocuments({ ...query, currentStatus: 'Under Review' }),
        returned: await Case.countDocuments({ ...query, currentStatus: 'Returned - Pending Correction' }),
        submittedToBank: await Case.countDocuments({ ...query, currentStatus: 'Submitted to Bank' }),
        preApproved: await Case.countDocuments({ ...query, currentStatus: 'Pre-Approved' }),
        valuation: await Case.countDocuments({ ...query, currentStatus: 'Valuation' }),
        folProcessed: await Case.countDocuments({ ...query, currentStatus: 'FOL Processed' }),
        folIssued: await Case.countDocuments({ ...query, currentStatus: 'FOL Issued' }),
        folSigned: await Case.countDocuments({ ...query, currentStatus: 'FOL Signed' }),
        disbursed: await Case.countDocuments({ ...query, currentStatus: 'Disbursed' }),
        lost: await Case.countDocuments({ ...query, currentStatus: 'Lost' }),
        rejected: await Case.countDocuments({ ...query, currentStatus: 'Rejected' }),
      };
    } else {
      // Advisor/Partner summary - only their cases
      summary = {
        total: total,
        draft: await Case.countDocuments({ ...query, currentStatus: 'Draft' }),
        submittedToXoto: await Case.countDocuments({ ...query, currentStatus: 'Submitted to Xoto' }),
        inOpsQueue: await Case.countDocuments({ ...query, currentStatus: 'In Ops Queue - Pending Pick-up' }),
        assignedToOps: await Case.countDocuments({ ...query, currentStatus: 'Assigned - Pending Review' }),
        submittedToBank: await Case.countDocuments({ ...query, currentStatus: 'Submitted to Bank' }),
        preApproved: await Case.countDocuments({ ...query, currentStatus: 'Pre-Approved' }),
        valuation: await Case.countDocuments({ ...query, currentStatus: 'Valuation' }),
        folProcessed: await Case.countDocuments({ ...query, currentStatus: 'FOL Processed' }),
        folIssued: await Case.countDocuments({ ...query, currentStatus: 'FOL Issued' }),
        folSigned: await Case.countDocuments({ ...query, currentStatus: 'FOL Signed' }),
        disbursed: await Case.countDocuments({ ...query, currentStatus: 'Disbursed' }),
      };
    }
    
    return res.status(200).json({
      success: true,
      data: cases,
      total,
      summary,
      userRole: roleCode === '18' ? 'admin' : (roleCode === '26' ? 'advisor' : (roleCode === '21' ? 'partner' : 'unknown')),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
        hasNextPage: skip + limitNum < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    console.error('getAllCases error:', error);
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
    
    // ✅ UPDATE LEAD STATUS to Application Opened
    await updateLeadStatusFromCase(caseData.sourceLeadId, caseData.currentStatus);
    
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
    
    let updatedStatus = status;
    
    if (status === 'Pre-Approved' && approvedAmount) {
      if (typeof caseData.updateBankApproval === 'function') {
        await caseData.updateBankApproval(approvedAmount, null, null, notes);
      }
      updatedStatus = 'Pre-Approved';
    } else if (status === 'Disbursed' && approvedAmount) {
      if (typeof caseData.updateDisbursement === 'function') {
        await caseData.updateDisbursement(approvedAmount, null);
      }
      updatedStatus = 'Disbursed';
    } else if (status === 'Rejected') {
      if (typeof caseData.rejectCase === 'function') {
        await caseData.rejectCase(notes || 'Rejected by bank');
      }
      updatedStatus = 'Rejected';
    } else {
      caseData.currentStatus = status;
      if (notes) {
        caseData.internalNotes = caseData.internalNotes || [];
        caseData.internalNotes.push(notes);
      }
      await caseData.save();
      updatedStatus = status;
    }
    
    // ✅ UPDATE LEAD STATUS
    await updateLeadStatusFromCase(caseData.sourceLeadId, updatedStatus, { reason: notes });
    
    return res.status(200).json({ success: true, message: "Bank decision updated", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};