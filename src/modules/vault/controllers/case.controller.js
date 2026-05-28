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
import Commission from '../models/Commission.js';
import VaultAgent from '../models/Agent.js';
import { emitVaultNotification, dispatchVaultNotification } from '../services/vaultNotification.service.js';
import { logAudit, actorFromReq } from '../services/auditLog.service.js';
import { ENTITY_TYPES, AUDIT_ACTIONS } from '../models/AuditLog.js';



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
    } else if (req.user?.agentType === 'ReferralPartner') {
      userRole = 'ReferralPartner';
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
    // ==================== Lead: Application Opened (case exists, pre-bank stages) ====================
    'Draft':                        'Application Opened',
    'Submitted to Xoto':            'Application Opened',
    'In Ops Queue - Pending Pick-up': 'Application Opened',
    'Assigned - Pending Review':    'Application Opened',
    'Under Review':                 'Application Opened',
    'Resubmitted-After Correction': 'Application Opened',
    'Returned - Pending Correction':'Application Opened',

    // ==================== Lead: Bank Application ====================
    'Submitted to Bank': 'Bank Application',      // PRD Section 4.3
    'Pre-Approved': 'Pre-Approved',               // PRD Section 4.3
    'Valuation': 'Valuation',                     // PRD Section 4.3
    'FOL Processed': 'FOL Processed',             // PRD Section 4.3
    'FOL Issued': 'FOL Issued',                   // PRD Section 4.3
    'FOL Signed': 'FOL Signed',                   // PRD Section 4.3
    
    // ==================== Lead: Disbursed ====================
    'Disbursed': 'Disbursed',                     // PRD Section 4.3
    
    // ==================== Lead: Lost / Not Proceeding ====================
    'Rejected':       'Lost',            // PRD Section 4.3
    'Declined':       'Lost',            // PRD Section 4.3
    'Lost':           'Lost',            // PRD Section 4.3
    'Not Proceeding': 'Not Proceeding',  // PRD Section 4.3
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
      loanInfo, currentStatus, internalNotes, customerNotes,
      skipBankForm   // advisor-only: true = delegate bank forms to Ops
    } = req.body;

    // Validation — only sourceLeadId and caseReference are hard required
    if (!sourceLeadId) return res.status(400).json({ success: false, message: "sourceLeadId is required" });
    if (!caseReference) return res.status(400).json({ success: false, message: "caseReference is required" });

    // Duplicate check — allow re-application if previous case is in a terminal state
    const TERMINAL_STATUSES = ['Disbursed', 'Rejected', 'Declined', 'Lost', 'Not Proceeding'];
    const existingCase = await Case.findOne({ sourceLeadId, isDeleted: false });
    if (existingCase && !TERMINAL_STATUSES.includes(existingCase.currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `An active case already exists for this lead (${existingCase.currentStatus}). A new case can only be created after the existing one is closed.`,
        existingCaseId: existingCase._id,
      });
    }

    // Check unique case reference
    const existingCaseRef = await Case.findOne({ caseReference, isDeleted: false });
    if (existingCaseRef) {
      return res.status(400).json({ success: false, message: "Case reference already exists" });
    }

    // Fetch lead
    const lead = await Lead.findById(sourceLeadId);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    // PRD 6.1 — lead must be at Qualified stage or beyond (Collecting Documents / Documents Complete)
    const caseReadyStatuses = ['Qualified', 'Collecting Documents', 'Documents Complete'];
    if (!caseReadyStatuses.includes(lead.currentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Lead must be Qualified (or in document collection) to create a case. Current status: ${lead.currentStatus}. Run eligibility check first.`,
      });
    }

    // User role & permission
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    const isAdvisor = roleDoc?.code === '26';
    const isPartnerAffiliatedAgent = roleDoc?.code === '22' && req.user?.agentType === 'PartnerAffiliatedAgent';

    if (!isAdmin && !isPartner && !isAdvisor && !isPartnerAffiliatedAgent) {
      return res.status(403).json({ success: false, message: "Not authorized to create case" });
    }

    if (isPartnerAffiliatedAgent && lead.sourceInfo?.createdById?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only create cases for your own leads' });
    }

    // Get Bank Product Details (optional — can be selected later by Ops)
    const BankProduct = mongoose.model('BankMortgageProducts');
    let product = null;
    if (loanInfo?.selectedBankProduct) {
      product = await BankProduct.findById(loanInfo.selectedBankProduct).populate('bank');
    }

    // ==================== FIX: Set createdBy based on role with proper userName ====================
    let createdBy = {};
    let partnerIdVal = null;
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
      partnerIdVal = partner._id;
    }
    else if (isPartnerAffiliatedAgent) {
      const agent = await VaultAgent.findById(req.user._id);
      createdBy = {
        role: 'partner_affiliated_agent',
        userId: req.user._id,
        userName: req.user?.fullName || req.user?.email || 'Partner Affiliated Agent',
        createdAt: now,
      };
      partnerIdVal = agent?.partnerId || null;
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

    // Determine skip flag — only advisors can skip; all other roles always handle all docs
    const advisorSkipBankForm = isAdvisor ? (skipBankForm === true || skipBankForm === 'true') : false;

    // Create case
    // Auto-populate from lead where caller didn't provide values
    const leadCI = lead.customerInfo || {};
    const leadPD = lead.propertyDetails || {};
    const leadLR = lead.loanRequirements || {};

    const resolvedLoanAmount =
      propertyInfo?.loanAmount ||
      lead.eligibility?.recommendedLoanAmount ||
      (leadPD.propertyValue ? leadPD.propertyValue * 0.8 : null);   // 80% LTV fallback

    const caseData = await Case.create({
      caseReference,
      sourceLeadId,
      proposalId: proposalId || null,
      partnerId: partnerIdVal,
      createdBy,
      advisorSkipBankForm,

      // Client info — prefer caller payload, fall back to lead
      clientInfo: {
        fullName:         clientInfo?.fullName         || `${leadCI.firstName || ''} ${leadCI.lastName || ''}`.trim(),
        email:            clientInfo?.email            || leadCI.email            || null,
        mobile:           clientInfo?.mobile           || leadCI.mobileNumber     || null,
        nationality:      clientInfo?.nationality      || leadCI.nationality      || null,
        residencyStatus:  clientInfo?.residencyStatus  || leadCI.residencyStatus  || null,
        employmentStatus: clientInfo?.employmentStatus || leadCI.employmentStatus || null,
        dateOfBirth:      clientInfo?.dateOfBirth      || leadCI.dateOfBirth      || null,
        employer:         clientInfo?.employer         || leadCI.employer         || null,
        monthlySalary:    clientInfo?.monthlySalary    || leadCI.monthlySalary    || null,
      },

      // Property info — optional, fall back to lead's property details
      propertyInfo: {
        propertyValue:   propertyInfo?.propertyValue  || leadPD.propertyValue  || null,
        loanAmount:      resolvedLoanAmount            || null,
        downPayment:     propertyInfo?.downPayment     || leadPD.downPaymentAmount || null,
        tenureYears:     loanInfo?.tenureYears         || leadLR.preferredTenureYears || 25,
        propertyType:    propertyInfo?.propertyType    || leadPD.propertyType   || null,
        transactionType: propertyInfo?.transactionType || leadPD.transactionType || null,
        propertyAddress: {
          area: propertyInfo?.propertyAddress?.area || leadPD.propertyAddress?.area || '',
          city: propertyInfo?.propertyAddress?.city || leadPD.propertyAddress?.city || 'Dubai',
        },
      },

      // Bank selection — optional (Ops can fill later)
      ...(product ? {
        bankSelection: {
          bankId:       product.bank._id,
          bankName:     product.bank.bankName,
          productId:    product._id,
          productName:  product.productName,
          interestRate: parseFloat(product.interestRate),
          tenureYears:  loanInfo?.tenureYears || 25,
          monthlyEMI:   loanInfo?.monthlyEMI  || 0,
        },
      } : {}),

      currentStatus: 'Draft',
      internalNotes: formattedInternalNotes,
      customerNotes: formattedCustomerNotes,

      amountTracking: {
        requestedAmount: resolvedLoanAmount || null,
        amountStatus: 'Pending',
      },

      // Snapshot lead eligibility at case creation time
      eligibilitySnapshot: {
        checkedAt:             lead.eligibility?.checkedAt             || null,
        isEligible:            lead.eligibility?.isEligible            ?? false,
        dbrPercentage:         lead.eligibility?.dbrPercentage         || 0,
        dbrStatus:             lead.eligibility?.dbrStatus             || 'Not Checked',
        estimatedLTV:          lead.eligibility?.estimatedLTV          || 0,
        eligibilityScore:      lead.eligibility?.eligibilityScore      || 0,
        riskGrade:             lead.eligibility?.riskGrade             || null,
        recommendedLoanAmount: lead.eligibility?.recommendedLoanAmount || 0,
        eligibilityNotes:      lead.eligibility?.eligibilityNotes      || null,
        monthlySalary:         leadCI.monthlySalary                    || null,
        existingMonthlyDebt:   lead.eligibility?.existingMonthlyDebt   || null,
      },
    });

    // Initialize documents — use lead employment/residency; bank docs only when product is known
    const employmentStatus = lead.customerInfo.employmentStatus || 'Salaried';
    const residencyStatus  = lead.customerInfo.residencyStatus  || 'UAE Resident';

    const documentResult = await initializeCaseDocuments({
      caseId:           caseData._id,
      bankId:           product?.bank?._id || null,
      employmentStatus,
      residencyStatus,
      mortgageType:     product?.mortgageType || 'Both',
      creatorRole:      createdBy.role,
      skipBankForm:     advisorSkipBankForm,
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
      currentStatus: 'Application Opened'
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

    const resolvedClientName = caseData.clientInfo?.fullName || 'Unknown';

    await dispatchVaultNotification(req, {
      eventType:     'CASE_CREATED',
      title:         'New Case Created',
      message:       `Case ${caseReference} created for ${resolvedClientName} — by ${createdBy.role} ${createdBy.userName}`,
      entityId:      caseData._id,
      entityModel:   'Case',
      caseId:        caseData._id,
    });

    logAudit({
      entityType: ENTITY_TYPES.CASE,
      entityId:   caseData._id,
      entityRef:  caseData.caseReference,
      action:     AUDIT_ACTIONS.CASE_CREATED,
      newValue:   { caseReference, clientName: resolvedClientName, advisorSkipBankForm },
      ...actorFromReq(req, createdBy.role),
      metadata:   { sourceLeadId },
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
          employmentStatus,
          residencyStatus,
          bankId:      product?.bank?._id  || null,
          bankName:    product?.bank?.bankName || null,
          productName: product?.productName    || null,
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
    const isPartnerAffiliatedAgent = roleCode === '22' && req.user?.agentType === 'PartnerAffiliatedAgent';

    if (isAdvisor && caseData.createdBy?.role !== 'advisor') {
      return res.status(403).json({ success: false, message: "You can only submit cases you created" });
    }

    if (isPartner) {
      const isOwner = (caseData.partnerId?.toString() === req.user._id.toString()) || 
                      (caseData.createdBy?.role === 'partner' && caseData.createdBy?.userId?.toString() === req.user._id.toString());
      if (!isOwner) {
        return res.status(403).json({ success: false, message: "You can only submit cases belonging to your organization" });
      }
    }

    if (isPartnerAffiliatedAgent) {
      if (caseData.createdBy?.userId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only submit your own cases" });
      }
    } else if (!isAdvisor && !isPartner) {
      return res.status(403).json({ success: false, message: "Not authorized to submit cases" });
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
    
    const submitterRole = isPartner ? 'Partner' : isPartnerAffiliatedAgent ? 'Partner Affiliated Agent' : 'Advisor';
    const submitterRoleSlug = isPartner ? 'partner' : isPartnerAffiliatedAgent ? 'partner_affiliated_agent' : 'advisor';

    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED_TO_XOTO', await getUserInfo(req), {
      description: `Case ${caseData.caseReference} submitted to Xoto by ${submitterRole}`
    });

    // Notify Xoto Admin (Trigger #24)
    await emitVaultNotification({
      eventType:     'NEW_APPLICATION_SUBMITTED',
      title:         'New Application Submitted',
      message:       `Application ${caseData.caseReference} has been submitted by ${submitterRole} and requires review.`,
      entityId:      caseData._id,
      entityModel:   'Case',
      recipientRole: 'admin',
      sendToAllOfRole: true,
      createdByName: req.user?.fullName || req.user?.email || submitterRole,
      createdByRole: submitterRoleSlug,
    });

    // Notify ALL active Mortgage Ops (Trigger #29)
    await emitVaultNotification({
      eventType:     'CASE_SUBMITTED',
      title:         'New Application in Ops Queue',
      message:       `Application ${caseData.caseReference} is now available in the Ops Queue for pickup.`,
      entityId:      caseData._id,
      entityModel:   'Case',
      recipientRole: 'ops',
      sendToAllOfRole: true,
      createdByName: 'System',
      createdByRole: 'system',
    });

    logAudit({
      entityType: ENTITY_TYPES.CASE,
      entityId:   caseData._id,
      entityRef:  caseData.caseReference,
      action:     AUDIT_ACTIONS.CASE_SUBMITTED_TO_XOTO,
      newValue:   { status: 'In Ops Queue - Pending Pick-up' },
      ...actorFromReq(req, submitterRoleSlug),
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

    await dispatchVaultNotification(req, {
      eventType:     'CASE_PICKED_UP',
      title:         'Case Picked Up by Ops',
      message:       `Case ${caseData.caseReference} picked up by Ops: ${opsName}`,
      entityId:      caseData._id,
      entityModel:   'Case',
      caseId:        caseData._id,
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

    if (caseData.currentStatus === 'Under Review') {
      return res.status(400).json({
        success: false,
        message: "Cannot return a case to queue once substantive review has begun. Use 'Return Application' to send it back to the submitter instead.",
      });
    }

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

    await dispatchVaultNotification(req, {
      eventType:     'CASE_ASSIGNED_TO_OPS',
      title:         'Case Assigned to Ops',
      message:       `Case ${caseData.caseReference} manually assigned to Ops: ${opsName} by Admin`,
      entityId:      caseData._id,
      entityModel:   'Case',
      caseId:        caseData._id,
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

// ==================== HELPER: AUTO-CREATE COMMISSION ON DISBURSEMENT ====================
const autoCreateCommission = async (caseData, approvedAmount, bankReference, disbursedTo) => {
  try {
    const loanAmount = parseFloat(approvedAmount);
    if (!loanAmount || loanAmount <= 0) {
      console.warn(`[autoCreateCommission] Invalid loan amount: ${loanAmount}`);
      return { success: false, reason: "Invalid loan amount" };
    }

    // Prevent duplicate commission for same case
    const existingCommission = await Commission.findOne({ caseId: caseData._id, isDeleted: false });
    if (existingCommission) {
      console.warn(`[autoCreateCommission] Commission already exists for case ${caseData.caseReference}`);
      return { success: false, alreadyExists: true, data: existingCommission };
    }

    // Calculate bank commission to Xoto (1% fixed)
    const xotoCommissionFromBank = Math.round(loanAmount * 0.01);

    // Get lead to determine recipient
    const lead = await Lead.findById(caseData.sourceLeadId);
    let leadSourceRole = null;
    let leadSourceId = null;

    if (lead && lead.sourceInfo) {
      leadSourceRole = lead.sourceInfo.createdByRole;
      leadSourceId = lead.sourceInfo.createdById;
    }

    let recipientInfo = null;

    // CASE 1: Freelance Agent (40% / 50%)
    if (leadSourceRole === 'referral_partner') {
      const agent = await VaultAgent.findById(leadSourceId);
      if (agent && agent.agentType === 'ReferralPartner') {
        const percentage = loanAmount <= 5000000 ? 40 : 50;
        const commissionAmount = Math.round((xotoCommissionFromBank * percentage) / 100);

        recipientInfo = {
          recipientRole: 'referral_partner',
          recipientId: agent._id,
          recipientModel: 'VaultAgent',
          recipientName: agent.fullName,
          recipientPercentage: percentage,
          commissionAmount: commissionAmount,
          calculationFormula: `${xotoCommissionFromBank.toLocaleString()} × ${percentage}% = ${commissionAmount.toLocaleString()} AED`,
          percentageSource: 'freelance_commission.referralOnly',
          sourceAgentId: agent._id,
          sourceAgentName: agent.fullName,
          payoutBankDetails: agent.bankDetails?.iban ? {
            beneficiaryName: agent.bankDetails.beneficiaryName || agent.fullName,
            bankName: agent.bankDetails.bankName,
            iban: agent.bankDetails.iban,
            swiftCode: agent.bankDetails.swiftCode
          } : {}
        };
      }
    }

    // CASE 2: Partner-Affiliated Agent (Commission to Partner: 80% / 85%)
    else if (leadSourceRole === 'partner_affiliated_agent') {
      const agent = await VaultAgent.findById(leadSourceId);
      if (agent && agent.partnerId) {
        const partner = await Partner.findById(agent.partnerId);
        if (partner) {
          const percentage = loanAmount <= 5000000 ? 80 : 85;
          const commissionAmount = Math.round((xotoCommissionFromBank * percentage) / 100);

          recipientInfo = {
            recipientRole: 'partner',
            recipientId: partner._id,
            recipientModel: 'Partner',
            recipientName: partner.displayName || partner.companyName || 'Partner',
            recipientPercentage: percentage,
            commissionAmount: commissionAmount,
            calculationFormula: `${xotoCommissionFromBank.toLocaleString()} × ${percentage}% = ${commissionAmount.toLocaleString()} AED`,
            percentageSource: 'partner.commissionConfiguration',
            sourceAgentId: agent._id,
            sourceAgentName: agent.fullName,
            payoutBankDetails: partner.bankDetails?.iban ? {
              beneficiaryName: partner.bankDetails.beneficiaryName || partner.displayName || partner.companyName,
              bankName: partner.bankDetails.bankName,
              iban: partner.bankDetails.iban,
              swiftCode: partner.bankDetails.swiftCode
            } : {}
          };
        }
      }
    }

    // CASE 3: Partner (company or individual) (80% / 85%)
    else if (leadSourceRole === 'partner' || leadSourceRole === 'individual_partner') {
      const partner = await Partner.findById(leadSourceId);
      if (partner) {
        const percentage = loanAmount <= 5000000 ? 80 : 85;
        const commissionAmount = Math.round((xotoCommissionFromBank * percentage) / 100);

        recipientInfo = {
          recipientRole: 'partner',
          recipientId: partner._id,
          recipientModel: 'Partner',
          recipientName: partner.displayName || partner.companyName || 'Partner',
          recipientPercentage: percentage,
          commissionAmount: commissionAmount,
          calculationFormula: `${xotoCommissionFromBank.toLocaleString()} × ${percentage}% = ${commissionAmount.toLocaleString()} AED`,
          percentageSource: 'partner.commissionConfiguration',
          payoutBankDetails: partner.bankDetails?.iban ? {
            beneficiaryName: partner.bankDetails.beneficiaryName || partner.displayName || partner.companyName,
            bankName: partner.bankDetails.bankName,
            iban: partner.bankDetails.iban,
            swiftCode: partner.bankDetails.swiftCode
          } : {}
        };
      }
    }

    let commission = null;
    const commissionId = `COM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // If external recipient found, create a Pending commission record
    if (recipientInfo) {
      commission = await Commission.create({
        commissionId,
        caseId: caseData._id,
        caseReference: caseData.caseReference,
        leadId: caseData.sourceLeadId,
        proposalId: caseData.proposalId,
        customerId: caseData.customerId,
        customerName: caseData.clientInfo?.fullName,
        leadSource: leadSourceRole,
        isInternal: false,
        recipientRole: recipientInfo.recipientRole,
        recipientId: recipientInfo.recipientId,
        recipientModel: recipientInfo.recipientModel,
        recipientName: recipientInfo.recipientName,
        sourceAgentId: recipientInfo.sourceAgentId || null,
        sourceAgentName: recipientInfo.sourceAgentName || null,
        loanAmount,
        loanTier: loanAmount <= 5000000 ? '≤5M AED' : '>5M AED',
        bankCommissionToXoto: xotoCommissionFromBank,
        bankCommissionRate: 0.01,
        recipientPercentage: recipientInfo.recipientPercentage,
        commissionAmount: recipientInfo.commissionAmount,
        calculationFormula: recipientInfo.calculationFormula,
        referralType: recipientInfo.recipientRole === 'referral_partner' ? 'Referral Only' : null,
        percentageSource: recipientInfo.percentageSource,
        disbursedAt: new Date(),
        status: 'Pending',
        payoutBankDetails: recipientInfo.payoutBankDetails || {},
        xotoEarnings: {
          amount: xotoCommissionFromBank - recipientInfo.commissionAmount,
          rate: '1%',
          calculation: `${xotoCommissionFromBank.toLocaleString()} - ${recipientInfo.commissionAmount.toLocaleString()} = ${(xotoCommissionFromBank - recipientInfo.commissionAmount).toLocaleString()} AED`,
          note: `Paid ${recipientInfo.commissionAmount.toLocaleString()} AED to ${recipientInfo.recipientName}.`
        },
        createdBy: { role: 'system' },
        notes: `Commission auto-created from disbursed case.`
      });

      // Update case with commission info
      caseData.commissionInfo = {
        commissionId: commission.commissionId,
        loanAmount,
        loanTier: commission.loanTier,
        recipientPercentage: recipientInfo.recipientPercentage,
        xotoCommissionFromBank,
        recipientCommissionAmount: recipientInfo.commissionAmount,
        calculation: recipientInfo.calculationFormula,
        status: 'Pending',
        bankCommissionRate: 0.01,
        createdAt: new Date()
      };
      await caseData.save();

      return {
        success: true,
        commissionCreated: true,
        data: {
          id: commission.commissionId,
          amount: recipientInfo.commissionAmount,
          recipient: commission.recipientName,
          status: 'Pending',
          xotoEarning: xotoCommissionFromBank
        }
      };
    }

    // CASE 4: Internal Commission (Website, Admin, or no sourceInfo)
    const intCommissionId = `INT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const xotoEarning1Percent = Math.round(loanAmount * 0.01); // Internal leads still get 1% fixed calculated since no payout is needed

    commission = await Commission.create({
      commissionId: intCommissionId,
      caseId: caseData._id,
      caseReference: caseData.caseReference,
      leadId: caseData.sourceLeadId,
      proposalId: caseData.proposalId,
      customerId: caseData.customerId,
      customerName: caseData.clientInfo?.fullName,
      recipientRole: 'internal',
      recipientId: null,
      recipientModel: null,
      recipientName: 'Xoto (Internal)',
      leadSource: leadSourceRole || 'admin',
      isInternal: true,
      loanAmount,
      loanTier: loanAmount <= 5000000 ? '≤5M AED' : '>5M AED',
      bankCommissionToXoto: xotoEarning1Percent,
      bankCommissionRate: 0.01,
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${xotoEarning1Percent.toLocaleString()} × 0% = 0 AED`,
      percentageSource: 'internal',
      disbursedAt: new Date(),
      status: 'Completed', // internal leads are instantly marked Completed
      isDeleted: false,
      xotoEarnings: {
        amount: xotoEarning1Percent,
        rate: '1%',
        calculation: `${loanAmount.toLocaleString()} × 1% = ${xotoEarning1Percent.toLocaleString()} AED`,
        note: `Lead from ${leadSourceRole || 'admin/website'}. No commission paid. Xoto keeps full amount.`
      },
      createdBy: { role: 'system' },
      notes: `Internal record. Xoto earned AED ${xotoEarning1Percent.toLocaleString()} (1% of AED ${loanAmount.toLocaleString()}). No payout.`
    });

    // Update case with commission info (for internal)
    caseData.commissionInfo = {
      commissionId: commission.commissionId,
      loanAmount,
      loanTier: commission.loanTier,
      recipientPercentage: 0,
      xotoCommissionFromBank: xotoEarning1Percent,
      recipientCommissionAmount: 0,
      calculation: `${xotoEarning1Percent.toLocaleString()} × 0% = 0 AED`,
      status: 'Completed',
      bankCommissionRate: 0.01,
      createdAt: new Date()
    };
    await caseData.save();

    return {
      success: true,
      commissionCreated: true,
      data: {
        id: commission.commissionId,
        amount: 0,
        recipient: 'Xoto (Internal)',
        status: 'Completed',
        xotoEarning: xotoEarning1Percent
      }
    };

  } catch (error) {
    console.error("Error in autoCreateCommission helper:", error);
    return { success: false, reason: error.message };
  }
};

// ==================== UPDATE CASE STATUS (WITH AUTO-COMMISSION) ====================
// ==================== UPDATE CASE STATUS (WITH AUTO-COMMISSION) ====================
export const updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, approvedAmount, approvedRate, bankReference, disbursedTo } = req.body;

    if (!status)
      return res.status(400).json({ success: false, message: 'status is required' });

    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isOps   = roleDoc?.code === '23';
    if (!isAdmin && !isOps)
      return res.status(403).json({ success: false, message: 'Only Admin or Ops can update case status' });

    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData)
      return res.status(404).json({ success: false, message: 'Case not found' });

    if (isOps && caseData.opsQueue?.pickedUpBy?.opsId?.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'You can only update cases assigned to you' });

    const previousStatus = caseData.currentStatus;
    let commissionCreated = false;
    let commissionData = null;

    // ── Under Review ──────────────────────────────────────────────
    if (status === 'Under Review') {
      await caseData.startReview();
    }

    // ── Return to Advisor ─────────────────────────────────────────
    else if (status === 'Returned - Pending Correction') {
      if (!notes?.trim())
        return res.status(400).json({ success: false, message: 'Reason required' });
      await caseData.returnToAdvisor(notes);
    }

    // ── Submit to Bank ────────────────────────────────────────────
    else if (status === 'Submitted to Bank') {
      if (!caseData.documentSummary.allVerified)
        return res.status(400).json({ success: false, message: 'All documents must be verified before submitting to bank' });
      await caseData.submitToBank(bankReference, notes);
    }

    // ── Pre-Approved — uses updateBankStatus ✅ ───────────────────
    else if (status === 'Pre-Approved') {
      await caseData.updateBankStatus('Pre-Approved', {
        approvedAmount: approvedAmount ? parseFloat(approvedAmount) : null,
        approvedRate: approvedRate ? parseFloat(approvedRate) : null,
        notes,
      });
    }

    // ── Other bank stages ─────────────────────────────────────────
    else if (['Bank Application', 'Valuation', 'FOL Processed', 'FOL Issued', 'FOL Signed'].includes(status)) {
      await caseData.updateBankStatus(status, { 
        notes,
        approvedAmount: approvedAmount ? parseFloat(approvedAmount) : null,
        approvedRate: approvedRate ? parseFloat(approvedRate) : null
      });
    }

    // ── Terminal — Lost / Declined / Rejected (PRD 7.1) ──────────
    else if (['Lost', 'Declined', 'Rejected'].includes(status)) {
      if (!notes?.trim())
        return res.status(400).json({ success: false, message: 'Reason/notes required to close case' });
      caseData.currentStatus = status;
      if (notes) caseData.internalNotes.push(`[${status}] ${notes}`);
      await caseData.save();
    }

    // ── Disbursed — AUTO-CREATE COMMISSION ✅ ─────────────────────
    else if (status === 'Disbursed') {
      if (!approvedAmount)
        return res.status(400).json({ success: false, message: 'Disbursed amount is required' });
      
      // Mark case as disbursed
      await caseData.markDisbursed(parseFloat(approvedAmount), bankReference, disbursedTo);
      
      if (approvedRate) {
        caseData.bankDecision.approvedRate = parseFloat(approvedRate);
        await caseData.save();
      }
      
      // Auto-create commission record
      const result = await autoCreateCommission(caseData, approvedAmount, bankReference, disbursedTo);
      if (result.success && result.commissionCreated) {
        commissionCreated = true;
        commissionData = result.data;
      } else if (result.alreadyExists) {
        commissionData = {
          alreadyExists: true,
          id: result.data.commissionId,
          amount: result.data.commissionAmount,
          recipient: result.data.recipientName,
          status: result.data.status
        };
      }
    }

    // ── Rejected ──────────────────────────────────────────────────
    else if (status === 'Rejected') {
      caseData.currentStatus            = 'Rejected';
      caseData.bankDecision.status      = 'Rejected';
      caseData.bankDecision.rejectionReason = notes || 'Rejected by bank';
      caseData.bankDecision.decisionDate    = new Date();
      if (notes) caseData.internalNotes.push(notes);
      await caseData.save();
    }

    // ── Lost ──────────────────────────────────────────────────────
    else if (status === 'Lost') {
      caseData.currentStatus = 'Lost';
      if (notes) caseData.internalNotes.push(notes);
      await caseData.save();
    }

    else {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
    }

    // Update lead status
    await updateLeadStatusFromCase(caseData.sourceLeadId, status, { reason: notes });
    
    await HistoryService.logCaseActivity(caseData, 'CASE_STATUS_UPDATED', await getUserInfo(req), {
      description: `Status: ${previousStatus} → ${status}`,
      notes,
    });

    // Prepare response
    const responseData = {
      success: true,
      message: `Status updated: ${previousStatus} → ${status}`,
      data: {
        _id: caseData._id,
        caseReference: caseData.caseReference,
        previousStatus,
        currentStatus: caseData.currentStatus,
        timeline: caseData.timeline,
        disbursementInfo: caseData.disbursementInfo
      },
    };

    if (commissionCreated) {
      responseData.message += ` ✅ Commission auto-created: ${commissionData.amount.toLocaleString()} AED for ${commissionData.recipient}`;
      responseData.commission = commissionData;
    } else if (commissionData?.alreadyExists) {
      responseData.message += ` ℹ️ Commission already existed: ${commissionData.amount.toLocaleString()} AED for ${commissionData.recipient} (${commissionData.status})`;
      responseData.commission = commissionData;
    }

    await dispatchVaultNotification(req, {
      eventType:     'CASE_STATUS_UPDATED',
      title:         `Case Status: ${status}`,
      message:       `Case ${caseData.caseReference} — ${previousStatus} → ${status}`,
      entityId:      caseData._id,
      entityModel:   'Case',
      caseId:        caseData._id,
    });

    logAudit({
      entityType: ENTITY_TYPES.APPLICATION,
      entityId:   caseData._id,
      entityRef:  caseData.caseReference,
      action:     AUDIT_ACTIONS.CASE_STATUS_CHANGED,
      oldValue:   { status: previousStatus },
      newValue:   { status },
      ...actorFromReq(req, isAdmin ? 'admin' : 'ops'),
      metadata:   { notes },
    });

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('updateCaseStatus error:', error);
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

    // Ownership check for PartnerAffiliatedAgent
    if (req.user?.agentType === 'PartnerAffiliatedAgent') {
      if (caseData.createdBy?.role !== 'partner_affiliated_agent' ||
          caseData.createdBy?.userId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'You can only resubmit your own cases' });
      }
    }

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
      // Partner sees their own cases + cases created by their affiliated agents
      const affiliatedAgents = await VaultAgent.find(
        { partnerId: req.user._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false },
        '_id'
      );
      const agentIds = affiliatedAgents.map(a => a._id);
      query.$or = [
        { partnerId: req.user._id },
        { 'createdBy.role': 'partner', 'createdBy.userId': req.user._id },
        { 'createdBy.role': 'partner_affiliated_agent', 'createdBy.userId': { $in: agentIds } },
      ];
    }

    // CASE 4a: PARTNER-AFFILIATED AGENT — can see their own cases
    else if (req.user?.agentType === 'PartnerAffiliatedAgent') {
      query['createdBy.role'] = 'partner_affiliated_agent';
      query['createdBy.userId'] = req.user._id;
    }

    // CASE 4b: FREELANCE AGENT — cannot access cases directly
    else if (req.user?.agentType === 'ReferralPartner') {
      return res.status(403).json({
        success: false,
        message: 'Agents cannot access cases directly. Cases are managed by partners/advisors.',
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
      userRole: roleCode === '18' ? 'admin' : roleCode === '26' ? 'advisor' : roleCode === '21' ? 'partner' : req.user?.agentType === 'PartnerAffiliatedAgent' ? 'partner_affiliated_agent' : 'unknown',
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
    let commissionCreated = false;
    let commissionData = null;
    
    if (status === 'Pre-Approved' && approvedAmount) {
      if (typeof caseData.updateBankApproval === 'function') {
        await caseData.updateBankApproval(approvedAmount, null, null, notes);
      }
      updatedStatus = 'Pre-Approved';
    } else if (status === 'Disbursed' && approvedAmount) {
      // Mark case as disbursed
      caseData.currentStatus = 'Disbursed';
      caseData.timeline.disbursedAt = new Date();
      caseData.disbursementInfo = caseData.disbursementInfo || {};
      caseData.disbursementInfo.disbursedAmount = parseFloat(approvedAmount);
      caseData.disbursementInfo.disbursementDate = new Date();
      caseData.disbursementInfo.confirmedByOps = true;
      caseData.disbursementInfo.confirmedByOpsAt = new Date();
      caseData.amountTracking = caseData.amountTracking || {};
      caseData.amountTracking.disbursedAmount = parseFloat(approvedAmount);
      caseData.amountTracking.amountStatus = 'Disbursed';
      await caseData.save();
      
      updatedStatus = 'Disbursed';
      
      // Auto-create commission record
      const result = await autoCreateCommission(caseData, approvedAmount, null, null);
      if (result.success && result.commissionCreated) {
        commissionCreated = true;
        commissionData = result.data;
      } else if (result.alreadyExists) {
        commissionData = {
          alreadyExists: true,
          id: result.data.commissionId,
          amount: result.data.commissionAmount,
          recipient: result.data.recipientName,
          status: result.data.status
        };
      }
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
    
    const responseData = {
      success: true,
      message: "Bank decision updated",
      data: caseData
    };

    if (commissionCreated) {
      responseData.message += ` ✅ Commission auto-created: ${commissionData.amount.toLocaleString()} AED for ${commissionData.recipient}`;
      responseData.commission = commissionData;
    } else if (commissionData?.alreadyExists) {
      responseData.message += ` ℹ️ Commission already existed: ${commissionData.amount.toLocaleString()} AED for ${commissionData.recipient} (${commissionData.status})`;
      responseData.commission = commissionData;
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('updateBankDecision error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};