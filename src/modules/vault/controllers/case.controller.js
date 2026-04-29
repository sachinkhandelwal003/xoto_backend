import Case from '../models/Case.js';
import Lead from '../models/VaultLead.js';
import Partner from '../models/Partner.js';
import Proposal from '../models/Proposal.js';
import Document from '../models/Document.js';
import Ops from "../models/MortgageOps.js"
import HistoryService from '../services/history.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';

// ==================== HELPER FUNCTIONS ====================

export const updateCaseDocumentStatus = async (caseId) => {
  const caseData = await Case.findById(caseId);
  if (!caseData) return;
  await caseData.updateDocumentStatus();
};

// Copy documents from Lead to Case
const copyLeadDocsToCase = async (leadId, caseId) => {
  try {
    const leadDocs = await Document.find({
      entityType: 'Lead',
      entityId: leadId,
      isDeleted: false
    });

    const copiedDocs = [];
    
    for (const doc of leadDocs) {
      // Check if document already exists for this case
      const existingDoc = await Document.findOne({
        entityType: 'Case',
        entityId: caseId,
        documentType: doc.documentType,
        isDeleted: false
      });

      if (!existingDoc) {
        const newDoc = await Document.create({
          entityType: 'Case',
          entityId: caseId.toString(),
          linkedFrom: { 
            entityType: 'Lead', 
            entityId: leadId.toString() 
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
          verificationStatus: 'pending',
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          extractedData: doc.extractedData || null,
          qualityCheck: doc.qualityCheck || {
            isClear: false,
            isComplete: false,
            isAuthentic: false,
            qualityScore: 0,
            notes: null
          },
          encryption: doc.encryption || 'AES-256'
        });
        copiedDocs.push(newDoc);
      } else {
        copiedDocs.push(existingDoc);
      }
    }
    
    return copiedDocs;
  } catch (error) {
    console.error("Error copying documents:", error);
    return [];
  }
};

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

// ==================== CREATE CASE ====================
export const createCase = async (req, res) => {
  try {
    const { 
      sourceLeadId,
      proposalId,
      caseReference,
      clientInfo,
      currentAddress,
      previousAddress,
      employmentDetails,
      incomeDetails,
      expenseDetails,
      propertyInfo,
      loanInfo,
      currentStatus,
      internalNotes,
      customerNotes
    } = req.body;

    // Validation
    if (!sourceLeadId) {
      return res.status(400).json({ success: false, message: "sourceLeadId is required" });
    }

    if (!caseReference) {
      return res.status(400).json({ success: false, message: "caseReference is required" });
    }

    if (!clientInfo || !clientInfo.fullName) {
      return res.status(400).json({ success: false, message: "clientInfo with fullName is required" });
    }

    if (!propertyInfo || !propertyInfo.propertyValue) {
      return res.status(400).json({ success: false, message: "propertyInfo with propertyValue is required" });
    }

    if (!loanInfo || !loanInfo.selectedBankProduct) {
      return res.status(400).json({ success: false, message: "loanInfo with selectedBankProduct is required" });
    }

    // Check for duplicate case
    const existingCase = await Case.findOne({ sourceLeadId, isDeleted: false });
    if (existingCase) {
      return res.status(400).json({
        success: false,
        message: "Case already exists for this lead",
        existingCaseId: existingCase._id
      });
    }

    // Check if case reference is unique
    const existingCaseRef = await Case.findOne({ caseReference, isDeleted: false });
    if (existingCaseRef) {
      return res.status(400).json({
        success: false,
        message: "Case reference already exists"
      });
    }

    // Fetch Lead (just to verify it exists)
    const lead = await Lead.findById(sourceLeadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    // Get user role
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    const isAdvisor = roleDoc?.code === '26';

    if (!isAdmin && !isPartner && !isAdvisor) {
      return res.status(403).json({ success: false, message: "Not authorized to create case" });
    }

    // Set createdBy based on role
    let createdBy = {};
    if (isAdmin) {
      createdBy = { 
        role: 'admin', 
        adminId: req.user._id, 
        adminName: req.user?.email || 'Admin', 
        createdAt: new Date() 
      };
    } else if (isAdvisor) {
      createdBy = { 
        role: 'advisor', 
        advisorId: req.user._id, 
        advisorName: req.user?.fullName || req.user?.email, 
        createdAt: new Date() 
      };
    } else if (isPartner) {
      const partner = await Partner.findById(req.user._id);
      if (!partner || !partner.isActive()) {
        return res.status(403).json({ success: false, message: "Partner account not active" });
      }
      createdBy = { 
        role: 'partner', 
        partnerId: partner._id, 
        partnerName: partner.companyName, 
        createdAt: new Date() 
      };
    }

    // Calculate tenure months
    const tenureMonths = (loanInfo.tenureYears || 25) * 12;

    // Get user name for notes
    const userName = req.user?.fullName || req.user?.email || 'System';

    // Format internalNotes and customerNotes properly
    const formattedInternalNotes = Array.isArray(internalNotes) 
      ? internalNotes 
      : (internalNotes && typeof internalNotes === 'string' && internalNotes.trim() 
          ? [{ note: internalNotes, addedBy: userName, addedAt: new Date() }] 
          : []);

    const formattedCustomerNotes = Array.isArray(customerNotes) 
      ? customerNotes 
      : (customerNotes && typeof customerNotes === 'string' && customerNotes.trim() 
          ? [{ note: customerNotes, addedBy: userName, addedAt: new Date() }] 
          : []);

    // Create Case with data provided from frontend
    const caseData = await Case.create({
      caseReference,
      sourceLeadId: sourceLeadId,
      proposalId: proposalId || null,
      createdBy,
      
      clientInfo: {
        fullName: clientInfo.fullName,
        preferredName: clientInfo.preferredName || null,
        gender: clientInfo.gender || 'Male',
        dateOfBirth: clientInfo.dateOfBirth ? new Date(clientInfo.dateOfBirth) : null,
        nationality: clientInfo.nationality,
        maritalStatus: clientInfo.maritalStatus || 'Single',
        numberOfDependents: clientInfo.numberOfDependents || 0,
        email: clientInfo.email,
        mobile: clientInfo.mobile,
        homePhone: clientInfo.homePhone || null,
        workPhone: clientInfo.workPhone || null,
        whatsapp: clientInfo.whatsapp || null,
      },
      
      currentAddress: currentAddress || null,
      previousAddress: previousAddress || null,
      
      employmentDetails: {
        employerName: employmentDetails.employerName,
        industry: employmentDetails.industry || null,
        designation: employmentDetails.designation,
        employmentType: employmentDetails.employmentType || 'Salaried',
        yearsWithEmployer: employmentDetails.yearsWithEmployer,
        monthsWithEmployer: employmentDetails.monthsWithEmployer || 0,
        probationPeriod: employmentDetails.probationPeriod || 'Completed',
        workAddress: employmentDetails.workAddress || null,
        workPhone: employmentDetails.workPhone || null,
        employerEmail: employmentDetails.employerEmail || null,
      },
      
      incomeDetails: {
        basicSalary: incomeDetails.basicSalary || 0,
        housingAllowance: incomeDetails.housingAllowance || 0,
        transportAllowance: incomeDetails.transportAllowance || 0,
        otherAllowances: incomeDetails.otherAllowances || 0,
        totalMonthlySalary: incomeDetails.totalMonthlySalary || 0,
        annualBonus: incomeDetails.annualBonus || 0,
        otherIncome: incomeDetails.otherIncome || 0,
        totalMonthlyIncome: incomeDetails.totalMonthlyIncome || 0,
        salaryTransferBank: incomeDetails.salaryTransferBank || null,
        salaryTransferType: incomeDetails.salaryTransferType || null,
      },
      
      expenseDetails: {
        monthlyRent: expenseDetails?.monthlyRent || 0,
        monthlyOtherLoanInstallments: expenseDetails?.monthlyOtherLoanInstallments || 0,
        monthlyCreditCardPayments: expenseDetails?.monthlyCreditCardPayments || 0,
        monthlyLivingExpenses: expenseDetails?.monthlyLivingExpenses || 0,
        totalMonthlyLiabilities: expenseDetails?.totalMonthlyLiabilities || 0,
        dbrPercentage: expenseDetails?.dbrPercentage || 0,
        dbrStatus: expenseDetails?.dbrStatus || 'Eligible',
        existingLoans: expenseDetails?.existingLoans || [],
      },
      
      propertyInfo: {
        propertyType: propertyInfo.propertyType || 'Ready',
        propertySubtype: propertyInfo.propertySubtype || 'Apartment',
        propertyValue: propertyInfo.propertyValue,
        valuationAmount: propertyInfo.valuationAmount || null,
        ltvPercentage: propertyInfo.ltvPercentage || null,
        loanAmount: propertyInfo.loanAmount || (propertyInfo.propertyValue - (propertyInfo.downPayment || 0)),
        downPayment: propertyInfo.downPayment || 0,
        downPaymentSource: propertyInfo.downPaymentSource || null,
        propertyAddress: {
          building: propertyInfo.propertyAddress?.building || '',
          apartment: propertyInfo.propertyAddress?.apartment || null,
          floor: propertyInfo.propertyAddress?.floor || null,
          area: propertyInfo.propertyAddress?.area || '',
          city: propertyInfo.propertyAddress?.city || 'Dubai',
          emirate: propertyInfo.propertyAddress?.emirate || 'Dubai',
        },
        propertyDetails: {
          bedrooms: propertyInfo.propertyDetails?.bedrooms || null,
          bathrooms: propertyInfo.propertyDetails?.bathrooms || null,
          areaSqft: propertyInfo.propertyDetails?.areaSqft || null,
          areaSqm: propertyInfo.propertyDetails?.areaSqm || null,
          yearBuilt: propertyInfo.propertyDetails?.yearBuilt || null,
          view: propertyInfo.propertyDetails?.view || null,
          furnishing: propertyInfo.propertyDetails?.furnishing || null,
          parkingSpaces: propertyInfo.propertyDetails?.parkingSpaces || 0,
        },
        ownershipDetails: {
          currentOwner: propertyInfo.ownershipDetails?.currentOwner || clientInfo.fullName,
          ownerType: propertyInfo.ownershipDetails?.ownerType || 'Individual',
          titleDeedNumber: propertyInfo.ownershipDetails?.titleDeedNumber || null,
          titleDeedUrl: propertyInfo.ownershipDetails?.titleDeedUrl || null,
          nocAvailable: propertyInfo.ownershipDetails?.nocAvailable || false,
        },
        transactionDetails: {
          purchasePrice: propertyInfo.transactionDetails?.purchasePrice || propertyInfo.propertyValue,
          agreementDate: propertyInfo.transactionDetails?.agreementDate ? new Date(propertyInfo.transactionDetails.agreementDate) : new Date(),
          handoverDate: propertyInfo.transactionDetails?.handoverDate ? new Date(propertyInfo.transactionDetails.handoverDate) : null,
          depositPaid: propertyInfo.transactionDetails?.depositPaid || 0,
          depositPaidDate: propertyInfo.transactionDetails?.depositPaidDate ? new Date(propertyInfo.transactionDetails.depositPaidDate) : null,
          agentCommission: propertyInfo.transactionDetails?.agentCommission || 0,
          dldFees: propertyInfo.transactionDetails?.dldFees || 0,
          registrationFees: propertyInfo.transactionDetails?.registrationFees || 0,
          totalClosingCosts: propertyInfo.transactionDetails?.totalClosingCosts || 0,
        },
      },
      
      loanInfo: {
        requestedAmount: loanInfo.requestedAmount || (propertyInfo.propertyValue - (propertyInfo.downPayment || 0)),
        approvedAmount: loanInfo.approvedAmount || null,
        tenureYears: loanInfo.tenureYears || 25,
        tenureMonths: loanInfo.tenureMonths || tenureMonths,
        interestRateType: loanInfo.interestRateType || 'Fixed',
        interestRatePercentage: loanInfo.interestRatePercentage,
        processingFee: loanInfo.processingFee || 0,
        valuationFee: loanInfo.valuationFee || 2500,
        earlySettlementFeePercentage: loanInfo.earlySettlementFeePercentage || 1,
        earlySettlementAllowedAfterYears: loanInfo.earlySettlementAllowedAfterYears || 3,
        lifeInsuranceRequired: loanInfo.lifeInsuranceRequired !== undefined ? loanInfo.lifeInsuranceRequired : true,
        propertyInsuranceRequired: loanInfo.propertyInsuranceRequired !== undefined ? loanInfo.propertyInsuranceRequired : true,
        monthlyInstallment: {
          principalAndInterest: loanInfo.monthlyInstallment?.principalAndInterest || 0,
          lifeInsurance: loanInfo.monthlyInstallment?.lifeInsurance || 0,
          propertyInsurance: loanInfo.monthlyInstallment?.propertyInsurance || 0,
          totalMonthlyPayment: loanInfo.monthlyInstallment?.totalMonthlyPayment || 0,
        },
        selectedBank: loanInfo.selectedBank,
        selectedBankProduct: loanInfo.selectedBankProduct,
      },
      
      currentStatus: currentStatus || 'Draft',
      internalNotes: formattedInternalNotes,
      customerNotes: formattedCustomerNotes,
    });

    // Copy documents from Lead to Case
    const copiedDocuments = await copyLeadDocsToCase(sourceLeadId, caseData._id);
    
    caseData.documentsCopiedFromLead = copiedDocuments.length > 0;
    
    // Initialize required documents based on employment type
    await caseData.initializeRequiredDocuments();
    await caseData.calculateFinancialMetrics();
    await caseData.updateDocumentStatus();
    await caseData.save();

    // Update Lead conversion info
    await Lead.findByIdAndUpdate(sourceLeadId, {
      'conversionInfo.convertedToCase': true,
      'conversionInfo.caseId': caseData._id,
      'conversionInfo.convertedAt': new Date(),
      'conversionInfo.convertedByRole': createdBy.role,
      'conversionInfo.convertedById': req.user._id,
      'conversionInfo.convertedByName': createdBy.adminName || createdBy.advisorName || createdBy.partnerName
    });

    // Update Proposal conversion info if proposalId provided
    if (proposalId) {
      await Proposal.findByIdAndUpdate(proposalId, {
        convertedToCase: true,
        convertedCaseId: caseData._id,
        convertedCaseReference: caseReference,
        convertedAt: new Date()
      });
    }

    await HistoryService.logCaseActivity(caseData, 'CASE_CREATED', await getUserInfo(req), {
      description: `Case ${caseReference} created with ${copiedDocuments.length} documents copied from lead`,
    });

    // Return created case with populated data
    const populatedCase = await Case.findById(caseData._id)
      .populate('loanInfo.selectedBankProduct')
      .populate('assignedTo.opsId')
      .lean();

    // Get all documents for this case
    const caseDocuments = await Document.find({
      entityType: 'Case',
      entityId: caseData._id.toString(),
      isDeleted: false
    });

    return res.status(201).json({
      success: true,
      message: "Case created successfully",
      data: {
        case: populatedCase,
        documents: caseDocuments,
        documentsCopiedFromLead: copiedDocuments.length,
        totalDocuments: caseDocuments.length
      }
    });

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
    const isAdvisor = roleDoc?.code === '26';
    const isOps = req.user?.employeeType === 'MortgageOps';
    
    const { status, page = 1, limit = 20, search } = req.query;
    
    let query = { isDeleted: false };
    if (status) query.currentStatus = status;
    
    if (isPartner) {
      query['createdBy.partnerId'] = req.user._id;
    } else if (isAdvisor) {
      query['createdBy.advisorId'] = req.user._id;
    } else if (isOps) {
      query['assignedTo.opsId'] = req.user._id;
    }
    
    if (search) {
      query.$or = [
        { 'clientInfo.fullName': { $regex: search, $options: 'i' } },
        { 'clientInfo.email': { $regex: search, $options: 'i' } },
        { caseReference: { $regex: search, $options: 'i' } }
      ];
    }
    
    const cases = await Case.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Case.countDocuments(query);
    
    return res.status(200).json({ 
      success: true, 
      data: cases, 
      total, 
      pagination: { 
        totalPages: Math.ceil(total / parseInt(limit)), 
        currentPage: parseInt(page), 
        limit: parseInt(limit) 
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
    
    const documents = await Document.find({ 
      entityType: 'Case', 
      entityId: id, 
      isDeleted: false 
    });
    
    return res.status(200).json({ 
      success: true, 
      data: { case: caseData, documents } 
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
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ success: false, message: "Only draft cases can be updated" });
    }
    
    const updatedCase = await Case.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    await HistoryService.logCaseActivity(updatedCase, 'CASE_UPDATED', await getUserInfo(req), {
      description: `Case ${updatedCase.caseReference} updated`,
    });
    
    return res.status(200).json({ success: true, message: "Case updated", data: updatedCase });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SUBMIT CASE TO XOTO ====================
// ==================== SUBMIT CASE TO XOTO ====================
export const submitCaseToXoto = async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Check if case is in Draft status
    if (caseData.currentStatus !== 'Draft') {
      return res.status(400).json({ 
        success: false, 
        message: `Case cannot be submitted. Current status: ${caseData.currentStatus}` 
      });
    }
    
    
    // ✅ Change status to 'Submitted to Xoto' first
    caseData.currentStatus = 'Submitted to Xoto';
    await caseData.save();
    
    // ✅ Then move to Ops Queue (or let Admin do it manually)
    // Option 1: Auto-move to Ops Queue
    caseData.currentStatus = 'In Ops Queue - Pending Pick-up';
    await caseData.save();
    
    // OR Option 2: Keep as 'Submitted to Xoto' and let Admin move it
    // For now, I'll use Option 1 (auto-move)
    
    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED_TO_XOTO', await getUserInfo(req), {
      description: `Case ${caseData.caseReference} submitted to Xoto and placed in Ops Queue`,
    });
    
    return res.status(200).json({ 
      success: true, 
      message: "Case submitted to Xoto successfully and added to Ops Queue", 
      data: caseData 
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
// ==================== UPDATE CASE STATUS ====================
export const updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isOps = roleDoc?.code === '23';
    
    if (!isAdmin && !isOps) {
      return res.status(403).json({ success: false, message: "Only Admin or Mortgage Ops can update case status" });
    }
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    if (isOps && caseData.assignedTo?.opsId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only update cases assigned to you" });
    }
    
    const validTransitions = {
      'Draft': ['Submitted to Xoto'],
      'Submitted to Xoto': ['In Ops Queue - Pending Pick-up', 'Bank Application', 'Lost'],
      'In Ops Queue - Pending Pick-up': ['Assigned - Pending Review'],
      'Assigned - Pending Review': ['Under Review', 'Returned - Pending Correction'],
      'Under Review': ['Bank Application', 'Returned - Pending Correction'],
      'Returned - Pending Correction': ['Under Review'],
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
    
    if (!validTransitions[caseData.currentStatus]?.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status transition from ${caseData.currentStatus} to ${status}` 
      });
    }
    
    if (status === 'Bank Application' && !caseData.documentStatus.allDocumentsVerified) {
      return res.status(400).json({ 
        success: false, 
        message: "All documents must be verified before bank submission" 
      });
    }
    
    const previousStatus = caseData.currentStatus;
    caseData.currentStatus = status;
    
    if (status === 'Bank Application') {
      caseData.bankSubmission = {
        submittedToBankAt: new Date(),
        bankName: caseData.loanInfo.selectedBank,
        bankNotes: notes
      };
    }
    
    if (notes) {
      caseData.internalNotes.push({ note: notes, addedBy: req.user?.email || 'System', addedAt: new Date() });
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
    
    const caseData = await Case.findOne({ _id: id, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    const userName = req.user?.fullName || req.user?.companyName || req.user?.email || 'User';
    
    if (isInternal) {
      caseData.internalNotes.push({ note, addedBy: userName, addedAt: new Date() });
    } else {
      caseData.customerNotes.push({ note, addedBy: userName, addedAt: new Date() });
    }
    
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'NOTE_ADDED', await getUserInfo(req), {
      description: `Note added to case ${caseData.caseReference}`,
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
        completionPercentage: caseData.documentStatus.completionPercentage,
        requiredDocuments: caseData.documentStatus.requiredDocuments,
        pendingDocumentTypes: caseData.documentStatus.pendingDocumentTypes
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DELETE CASE ====================
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
      description: `Case ${caseData.caseReference} deleted`,
    });
    
    return res.status(200).json({ success: true, message: "Case deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET CASE STATS ====================
export const getCaseStats = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    
    const stats = await Case.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
    ]);
    
    const statsMap = {};
    stats.forEach(s => { statsMap[s._id] = s.count; });
    
    const totalLoanAmount = await Case.aggregate([
      { $match: { currentStatus: 'Disbursed', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$loanInfo.approvedAmount' } } }
    ]);
    
    return res.status(200).json({ 
      success: true, 
      data: {
        draft: statsMap['Draft'] || 0,
        submitted: statsMap['Submitted to Xoto'] || 0,
        inQueue: statsMap['In Ops Queue - Pending Pick-up'] || 0,
        assigned: statsMap['Assigned - Pending Review'] || 0,
        underReview: statsMap['Under Review'] || 0,
        returned: statsMap['Returned - Pending Correction'] || 0,
        bankApplication: statsMap['Bank Application'] || 0,
        preApproved: statsMap['Pre-Approved'] || 0,
        valuation: statsMap['Valuation'] || 0,
        folIssued: statsMap['FOL Issued'] || 0,
        folSigned: statsMap['FOL Signed'] || 0,
        disbursed: statsMap['Disbursed'] || 0,
        rejected: statsMap['Rejected'] || 0,
        lost: statsMap['Lost'] || 0,
        totalDisbursedLoanAmount: totalLoanAmount[0]?.total || 0
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



// ==================== OPS QUEUE MANAGEMENT ====================

// Get Ops Queue (All unassigned submitted applications)
// Get Ops Queue (All unassigned submitted applications)
export const getOpsQueue = async (req, res) => {
  try {
    // Check if user is Admin or Mortgage Ops
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isOps = roleDoc?.code === '23';
    
    if (!isAdmin && !isOps) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filter parameters
    const { search, bank, urgent, overdue, hoursMin, hoursMax, sortBy, sortOrder } = req.query;
    
    // Build query - Looking for cases in Ops Queue
    let query = {
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    };
    
    // Search by caseReference or client name, email, mobile
    if (search) {
      query.$or = [
        { caseReference: { $regex: search, $options: 'i' } },
        { 'clientInfo.fullName': { $regex: search, $options: 'i' } },
        { 'clientInfo.email': { $regex: search, $options: 'i' } },
        { 'clientInfo.mobile': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by selected bank
    if (bank && bank !== 'all') {
      query['loanInfo.selectedBank'] = { $regex: bank, $options: 'i' };
    }
    
    // First, get all matching cases to calculate hours in queue
    let allMatchingCases = await Case.find(query)
      .populate('createdBy', 'advisorName partnerName adminName')
      .populate('assignedTo', 'opsName')
      .sort({ createdAt: 1 }) // Oldest first
      .lean();
    
    // Calculate hours in queue for each case
    const casesWithQueueTime = allMatchingCases.map(c => ({
      ...c,
      hoursInQueue: Math.floor((Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60)),
      // Extract additional calculated fields for frontend
      clientFullName: c.clientInfo?.fullName,
      clientEmail: c.clientInfo?.email,
      clientMobile: c.clientInfo?.mobile,
      clientNationality: c.clientInfo?.nationality,
      selectedBank: c.loanInfo?.selectedBank,
      requestedLoanAmount: c.loanInfo?.requestedAmount,
      interestRate: c.loanInfo?.interestRatePercentage,
      monthlyEMI: c.loanInfo?.monthlyInstallment?.principalAndInterest,
      ltvPercentage: c.propertyInfo?.ltvPercentage,
      propertyValue: c.propertyInfo?.propertyValue,
      documentCompletion: c.documentStatus?.completionPercentage || 0,
      documentsUploaded: c.documentStatus?.documentsUploadedCount || 0,
      documentsTotal: c.documentStatus?.requiredDocuments?.length || 0,
      submittedByRole: c.createdBy?.role,
      submittedByName: c.createdBy?.advisorName || c.createdBy?.partnerName || c.createdBy?.adminName,
      daysInQueue: Math.floor((Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24))
    }));
    
    // Apply hour-based filters (client-side filtering after calculation)
    let filteredCases = casesWithQueueTime;
    
    if (urgent === 'true') {
      filteredCases = filteredCases.filter(c => c.hoursInQueue > 48);
    } else if (overdue === 'true') {
      filteredCases = filteredCases.filter(c => c.hoursInQueue >= 24 && c.hoursInQueue < 48);
    }
    
    // Custom hour range filter
    if (hoursMin) {
      filteredCases = filteredCases.filter(c => c.hoursInQueue >= parseInt(hoursMin));
    }
    if (hoursMax) {
      filteredCases = filteredCases.filter(c => c.hoursInQueue <= parseInt(hoursMax));
    }
    
    // Sorting
    if (sortBy) {
      filteredCases.sort((a, b) => {
        let aVal = a[sortBy];
        let bVal = b[sortBy];
        
        // Handle special fields from nested objects
        if (sortBy === 'clientFullName') {
          aVal = a.clientInfo?.fullName || '';
          bVal = b.clientInfo?.fullName || '';
        }
        if (sortBy === 'selectedBank') {
          aVal = a.loanInfo?.selectedBank || '';
          bVal = b.loanInfo?.selectedBank || '';
        }
        if (sortBy === 'requestedLoanAmount') {
          aVal = a.loanInfo?.requestedAmount || 0;
          bVal = b.loanInfo?.requestedAmount || 0;
        }
        
        if (sortOrder === 'desc') {
          return aVal > bVal ? -1 : 1;
        }
        return aVal < bVal ? -1 : 1;
      });
    }
    
    // Get total count before pagination
    const totalCount = filteredCases.length;
    
    // Apply pagination
    const paginatedCases = filteredCases.slice(skip, skip + limit);
    
    // Calculate counts for different categories
    const urgentCount = casesWithQueueTime.filter(c => c.hoursInQueue > 48).length;
    const overdueCount = casesWithQueueTime.filter(c => c.hoursInQueue >= 24 && c.hoursInQueue < 48).length;
    const normalCount = casesWithQueueTime.filter(c => c.hoursInQueue < 24).length;
    
    // Get unique banks for filter dropdown
    const uniqueBanks = [...new Set(casesWithQueueTime.map(c => c.loanInfo?.selectedBank).filter(Boolean))];
    
    // Calculate average queue time
    const avgQueueHours = casesWithQueueTime.length > 0 
      ? Math.round(casesWithQueueTime.reduce((sum, c) => sum + c.hoursInQueue, 0) / casesWithQueueTime.length)
      : 0;
    
    return res.status(200).json({
      success: true,
      data: paginatedCases.map(c => ({
        _id: c._id,
        caseReference: c.caseReference,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        // Client Info
        clientInfo: c.clientInfo,
        // Loan Info
        loanInfo: c.loanInfo,
        // Property Info
        propertyInfo: {
          propertyValue: c.propertyInfo?.propertyValue,
          propertyType: c.propertyInfo?.propertyType,
          ltvPercentage: c.propertyInfo?.ltvPercentage,
          propertyAddress: c.propertyInfo?.propertyAddress
        },
        // Document Status
        documentStatus: {
          documentsUploadedCount: c.documentStatus?.documentsUploadedCount,
          requiredDocuments: c.documentStatus?.requiredDocuments,
          completionPercentage: c.documentStatus?.completionPercentage,
          pendingDocumentTypes: c.documentStatus?.pendingDocumentTypes
        },
        // Created By Info
        createdBy: c.createdBy,
        // Queue Info
        hoursInQueue: c.hoursInQueue,
        daysInQueue: c.daysInQueue,
        // Status
        currentStatus: c.currentStatus,
        // Extracted fields for table display
        clientFullName: c.clientFullName,
        clientEmail: c.clientEmail,
        clientMobile: c.clientMobile,
        selectedBank: c.selectedBank,
        requestedLoanAmount: c.requestedLoanAmount,
        interestRate: c.interestRate,
        monthlyEMI: c.monthlyEMI,
        documentCompletion: c.documentCompletion,
        documentsUploaded: c.documentsUploaded,
        documentsTotal: c.documentsTotal,
        submittedByRole: c.submittedByRole,
        submittedByName: c.submittedByName,
        queueStatus: c.hoursInQueue > 48 ? 'urgent' : (c.hoursInQueue >= 24 ? 'overdue' : 'normal')
      })),
      count: paginatedCases.length,
      total: totalCount,
      summary: {
        urgentCount,
        overdueCount,
        normalCount,
        totalInQueue: casesWithQueueTime.length,
        avgQueueHours
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        limit: limit,
      
      },
      filters: {
        availableBanks: uniqueBanks
      }
    });
    
  } catch (error) {
    console.error("Get Ops Queue error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Ops Pick Up Case from Queue
export const opsPickUpCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const opsId = req.user._id;
    
    // Check if user is Mortgage Ops
    const roleDoc = await Role.findById(req.user.role);
    const isOps = roleDoc?.code === '23';
    
    if (!isOps) {
      return res.status(403).json({ success: false, message: "Only Mortgage Ops can pick up cases" });
    }
    
    const caseData = await Case.findOne({
      _id: caseId,
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    });
    
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found or already picked up" });
    }
    
    // Get Ops from database using imported Ops model
    const ops = await Ops.findById(opsId);
    
    if (!ops) {
      return res.status(404).json({ success: false, message: "Mortgage Ops user not found" });
    }
    
    // Check if ops can take more cases (if max capacity is set)
    const currentWorkload = ops.workload?.currentApplications || 0;
    const maxCapacity = ops.workload?.maxCapacity || 999;
    
    if (currentWorkload >= maxCapacity) {
      return res.status(400).json({ 
        success: false, 
        message: `You have reached your maximum capacity (${maxCapacity} cases). Please complete some cases before picking up new ones.` 
      });
    }
    
    // Get ops name - handle different possible name structures
    let opsName = 'Ops User';
    if (ops.fullName) {
      opsName = ops.fullName;
    } else if (ops.name) {
      opsName = `${ops.name.first_name || ''} ${ops.name.last_name || ''}`.trim();
    } else if (ops.email) {
      opsName = ops.email;
    }
    
    // Update case with ops assignment
    caseData.assignedTo = {
      opsId: opsId,
      opsName: opsName,
      assignedAt: new Date(),
      assignedBy: null // No admin assigned, ops self-picked
    };
    caseData.currentStatus = 'Assigned - Pending Review';
    await caseData.save();
    
    // Update Ops workload
    ops.workload = ops.workload || {};
    ops.workload.currentApplications = currentWorkload + 1;
    
    // Initialize queueStatus if not exists
    if (!ops.queueStatus) {
      ops.queueStatus = {};
    }
    ops.queueStatus.pendingReview = (ops.queueStatus.pendingReview || 0) + 1;
    
    await ops.save();
    
    // Log activity
    await HistoryService.logCaseActivity(caseData, 'CASE_PICKED_UP', await getUserInfo(req), {
      description: `Case picked up by Ops ${opsName}`
    });
    
    return res.status(200).json({
      success: true,
      message: "Case picked up successfully",
      data: {
        case: caseData,
        opsWorkload: {
          currentApplications: ops.workload.currentApplications,
          maxCapacity: ops.workload.maxCapacity,
          remainingCapacity: ops.workload.maxCapacity - ops.workload.currentApplications
        }
      }
    });
    
  } catch (error) {
    console.error("Pick up case error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin Manually Assign Case to Ops
export const adminAssignCaseToOps = async (req, res) => {
  try {
    const { caseId, opsId } = req.body;
    
    // Check if user is Admin
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    
    const caseData = await Case.findOne({
      _id: caseId,
      isDeleted: false
    });
    
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    const MortgageOps = mongoose.model('MortgageOps');
    const ops = await MortgageOps.findById(opsId);
    
    if (!ops) {
      return res.status(404).json({ success: false, message: "Ops not found" });
    }
    
    // If case was previously assigned to someone else, decrement their workload
    if (caseData.assignedTo?.opsId) {
      const previousOps = await MortgageOps.findById(caseData.assignedTo.opsId);
      if (previousOps) {
        previousOps.workload.currentApplications = Math.max(0, (previousOps.workload.currentApplications || 0) - 1);
        await previousOps.save();
      }
    }
    
    caseData.assignedTo = {
      opsId: opsId,
      opsName: ops.fullName || ops.name?.first_name + ' ' + ops.name?.last_name,
      assignedAt: new Date(),
      assignedBy: req.user._id
    };
    caseData.currentStatus = 'Assigned - Pending Review';
    await caseData.save();
    
    // Increment new Ops workload
    ops.workload.currentApplications = (ops.workload.currentApplications || 0) + 1;
    await ops.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_MANUALLY_ASSIGNED', await getUserInfo(req), {
      description: `Case manually assigned to Ops ${ops.fullName} by Admin`
    });
    
    return res.status(200).json({
      success: true,
      message: `Case assigned to ${ops.fullName}`,
      data: caseData
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get My Assigned Cases (for Ops)
// Get My Assigned Cases (for Ops)
export const getMyAssignedCases = async (req, res) => {
  try {
    const opsId = req.user._id;
    
    // Check if user is Mortgage Ops
    const roleDoc = await Role.findById(req.user.role);
    const isOps = roleDoc?.code === '23';
    
    if (!isOps) {
      return res.status(403).json({ success: false, message: "Access denied. Only Mortgage Ops can access." });
    }
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filter parameters
    const { search, caseStatus, sortBy, sortOrder } = req.query;
    
    // Build query
    let query = {
      'assignedTo.opsId': opsId,
      isDeleted: false
    };
    
    // Exclude completed cases unless specifically requested
    const showCompleted = req.query.showCompleted === 'true';
    if (!showCompleted) {
      query.currentStatus = { $nin: ['Disbursed', 'Rejected', 'Lost'] };
    }
    
    // Filter by specific status
    if (caseStatus && caseStatus !== 'all') {
      query.currentStatus = caseStatus;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { caseReference: { $regex: search, $options: 'i' } },
        { 'clientInfo.fullName': { $regex: search, $options: 'i' } },
        { 'clientInfo.email': { $regex: search, $options: 'i' } },
        { 'clientInfo.mobile': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Build sort object
    let sortObject = { updatedAt: -1 }; // default
    if (sortBy) {
      const sortOrderValue = sortOrder === 'desc' ? -1 : 1;
      const sortFields = {
        'caseReference': 'caseReference',
        'createdAt': 'createdAt',
        'updatedAt': 'updatedAt',
        'loanAmount': 'loanInfo.requestedAmount',
        'clientName': 'clientInfo.fullName',
        'bank': 'loanInfo.selectedBank',
        'status': 'currentStatus'
      };
      if (sortFields[sortBy]) {
        sortObject = { [sortFields[sortBy]]: sortOrderValue };
      }
    }
    
    // Get total count
    const total = await Case.countDocuments(query);
    
    // Get paginated cases
    const cases = await Case.find(query)
      .populate('createdBy', 'advisorName partnerName adminName')
      .populate('sourceLeadId', 'customerInfo')
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Enhance cases with additional computed fields
    const enhancedCases = cases.map(c => ({
      ...c,
      clientFullName: c.clientInfo?.fullName,
      clientEmail: c.clientInfo?.email,
      clientMobile: c.clientInfo?.mobile,
      selectedBank: c.loanInfo?.selectedBank,
      requestedLoanAmount: c.loanInfo?.requestedAmount,
      interestRate: c.loanInfo?.interestRatePercentage,
      monthlyEMI: c.loanInfo?.monthlyInstallment?.principalAndInterest,
      documentCompletion: c.documentStatus?.completionPercentage || 0,
      documentsUploaded: c.documentStatus?.documentsUploadedCount || 0,
      documentsTotal: c.documentStatus?.requiredDocuments?.length || 0,
      allDocumentsVerified: c.documentStatus?.allDocumentsVerified || false,
      assignedDays: Math.floor((Date.now() - new Date(c.assignedTo?.assignedAt || c.createdAt)) / (1000 * 60 * 60 * 24)),
      assignedHours: Math.floor((Date.now() - new Date(c.assignedTo?.assignedAt || c.createdAt)) / (1000 * 60 * 60))
    }));
    
    // Calculate summary statistics
    const allAssigned = await Case.find({ 'assignedTo.opsId': opsId, isDeleted: false }).lean();
    
    const summary = {
      total: allAssigned.filter(c => !['Disbursed', 'Rejected', 'Lost'].includes(c.currentStatus)).length,
      totalAllTime: allAssigned.length,
      pendingReview: allAssigned.filter(c => c.currentStatus === 'Assigned - Pending Review').length,
      underReview: allAssigned.filter(c => c.currentStatus === 'Under Review').length,
      returned: allAssigned.filter(c => c.currentStatus === 'Returned - Pending Correction').length,
      bankApplication: allAssigned.filter(c => c.currentStatus === 'Bank Application').length,
      preApproved: allAssigned.filter(c => c.currentStatus === 'Pre-Approved').length,
      valuation: allAssigned.filter(c => c.currentStatus === 'Valuation').length,
      folIssued: allAssigned.filter(c => c.currentStatus === 'FOL Issued').length,
      folSigned: allAssigned.filter(c => c.currentStatus === 'FOL Signed').length,
      disbursed: allAssigned.filter(c => c.currentStatus === 'Disbursed').length,
      rejected: allAssigned.filter(c => c.currentStatus === 'Rejected').length,
      lost: allAssigned.filter(c => c.currentStatus === 'Lost').length
    };
    
    // Get unique banks for filter
    const uniqueBanks = [...new Set(allAssigned.map(c => c.loanInfo?.selectedBank).filter(Boolean))];
    
    return res.status(200).json({
      success: true,
      summary,
      data: enhancedCases,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        limit: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      filters: {
        availableBanks: uniqueBanks,
        availableStatuses: [
          'Assigned - Pending Review',
          'Under Review',
          'Returned - Pending Correction',
          'Bank Application',
          'Pre-Approved',
          'Valuation',
          'FOL Processed',
          'FOL Issued',
          'FOL Signed',
          'Disbursed',
          'Rejected',
          'Lost'
        ]
      }
    });
    
  } catch (error) {
    console.error("Get my assigned cases error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Return Case to Submitter (with correction notes)
export const returnCaseForCorrection = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { correctionNotes, rejectedDocuments } = req.body;
    
    const caseData = await Case.findOne({
      _id: caseId,
      isDeleted: false
    });
    
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Check if user has permission (Ops assigned to this case or Admin)
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isAssignedOps = caseData.assignedTo?.opsId?.toString() === req.user._id.toString();
    
    if (!isAdmin && !isAssignedOps) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    
    // Add correction notes
    const correctionNote = {
      note: `RETURNED FOR CORRECTION: ${correctionNotes}`,
      addedBy: req.user?.fullName || req.user?.email || 'System',
      addedAt: new Date()
    };
    
    caseData.internalNotes.push(correctionNote);
    caseData.currentStatus = 'Returned - Pending Correction';
    
    // If specific documents rejected, mark them
    if (rejectedDocuments && rejectedDocuments.length > 0) {
      caseData.documentStatus.verificationNotes = JSON.stringify(rejectedDocuments);
    }
    
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_RETURNED', await getUserInfo(req), {
      description: `Case returned for correction: ${correctionNotes}`,
      rejectedDocuments
    });
    
    return res.status(200).json({
      success: true,
      message: "Case returned for correction",
      data: caseData
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Submit Case to Bank (Ops action)
export const submitCaseToBank = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { bankName, bankReference, notes } = req.body;
    
    const caseData = await Case.findOne({
      _id: caseId,
      isDeleted: false
    });
    
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Check permission
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isAssignedOps = caseData.assignedTo?.opsId?.toString() === req.user._id.toString();
    
    if (!isAdmin && !isAssignedOps) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    
    // Verify all documents are verified
    if (!caseData.documentStatus.allDocumentsVerified) {
      return res.status(400).json({
        success: false,
        message: "All documents must be verified before bank submission",
        pendingVerification: caseData.documentStatus.pendingDocumentTypes
      });
    }
    
    caseData.currentStatus = 'Bank Application';
    caseData.bankSubmission = {
      submittedToBankAt: new Date(),
      bankName: bankName || caseData.loanInfo.selectedBank,
      bankReferenceNumber: bankReference,
      bankNotes: notes
    };
    
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED_TO_BANK', await getUserInfo(req), {
      description: `Case submitted to ${bankName || caseData.loanInfo.selectedBank}`,
      bankReference
    });
    
    return res.status(200).json({
      success: true,
      message: "Case submitted to bank successfully",
      data: caseData
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update Bank Decision Status
export const updateBankDecision = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { status, approvedAmount, interestRate, notes } = req.body;
    
    const validBankStatuses = ['Pre-Approved', 'Valuation', 'FOL Processed', 'FOL Issued', 'FOL Signed', 'Disbursed', 'Rejected'];
    
    if (!validBankStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid bank status" });
    }
    
    const caseData = await Case.findOne({
      _id: caseId,
      isDeleted: false
    });
    
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    // Check permission
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isAssignedOps = caseData.assignedTo?.opsId?.toString() === req.user._id.toString();
    
    if (!isAdmin && !isAssignedOps) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    
    const previousStatus = caseData.currentStatus;
    caseData.currentStatus = status;
    
    // Update bank decision fields
    if (status === 'Pre-Approved' || status === 'Disbursed') {
      caseData.bankDecision = {
        status: status === 'Disbursed' ? 'Approved' : 'Pending',
        approvedAmount: approvedAmount || caseData.loanInfo.requestedAmount,
        interestRate: interestRate || caseData.loanInfo.interestRatePercentage,
        decisionAt: new Date()
      };
    }
    
    if (status === 'Disbursed') {
      caseData.loanInfo.approvedAmount = approvedAmount || caseData.loanInfo.requestedAmount;
    }
    
    if (status === 'Rejected') {
      caseData.bankDecision.status = 'Rejected';
      caseData.bankDecision.decisionAt = new Date();
    }
    
    if (notes) {
      caseData.internalNotes.push({
        note: `Bank Update (${previousStatus} → ${status}): ${notes}`,
        addedBy: req.user?.fullName || req.user?.email || 'System',
        addedAt: new Date()
      });
    }
    
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'BANK_DECISION_UPDATED', await getUserInfo(req), {
      description: `Bank decision updated: ${previousStatus} → ${status}`,
      notes
    });
    
    return res.status(200).json({
      success: true,
      message: "Bank decision updated successfully",
      data: caseData
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};