import Proposal from '../models/Proposal.js';
import Lead from '../models/VaultLead.js';
import BankProduct from '../../mortgages/models/BankProduct.js';
import HistoryService from '../services/history.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import sendEmail from '../../../utils/sendEmail.js';

// ==================== HELPER FUNCTIONS ====================

/**
 * Get user info for history logging
 */
const getUserInfo = async (req) => {
  // Get role from user object
  const roleId = req.user?.role;
  let userRole = 'Agent'; // ✅ DEFAULT TO 'Agent'
  let partnerId = null;
  
  try {
    if (roleId) {
      const roleDoc = await Role.findById(roleId);
      const roleCode = roleDoc?.code;
      
      if (roleCode === '18') {
        userRole = 'Admin';
      } else if (roleCode === '21') {
        userRole = 'Partner';
        partnerId = req.user._id;
      } 
      // Check for Agent types
      else if (req.user?.agentType === 'FreelanceAgent') {
        userRole = 'Agent';
      } 
      else if (req.user?.agentType === 'PartnerAffiliatedAgent') {
        userRole = 'Agent';
      }
      // Check for Vault roles
      else if (req.user?.employeeType === 'XotoAdvisor') {
        userRole = 'Agent';
      }
      else if (req.user?.type === 'vaultadvisor') {
        userRole = 'Agent';
      }
      else if (req.user?.type === 'vaultagent') {
        userRole = 'Agent';
      }
      else {
        userRole = 'Agent'; // ✅ FALLBACK
      }
    }
  } catch (error) {
    console.error("Error getting user role:", error);
    userRole = 'Agent'; // ✅ FALLBACK ON ERROR
  }
  
  return {
    userId: req.user?._id,
    userRole: userRole, // ✅ 'Admin', 'Partner', or 'Agent'
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    partnerId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

/**
 * Calculate LTV (Loan to Value)
 */
const calculateLTV = (propertyValue, downPayment) => {
  const loanAmount = propertyValue - (downPayment || 0);
  const ltv = (loanAmount / propertyValue) * 100;
  return { loanAmount, ltv: Math.round(ltv * 100) / 100 };
};

/**
 * Calculate EMI
 */
const calculateEMI = (principal, annualRate, tenureYears) => {
  const monthlyRate = annualRate / 100 / 12;
  const months = tenureYears * 12;
  if (monthlyRate === 0) return principal / months;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
              (Math.pow(1 + monthlyRate, months) - 1);
  return Math.round(emi);
};

/**
 * Calculate DBR (Debt Burden Ratio)
 * UAE Standard: 50% for Expats, 55% for UAE Nationals
 */
const calculateDBR = (emi, monthlySalary, nationality) => {
  if (!monthlySalary || monthlySalary === 0) {
    return { dbr: 0, isEligible: false, maxAllowed: 50 };
  }
  const dbr = (emi / monthlySalary) * 100;
  const isUAE = nationality === 'United Arab Emirates' || nationality === 'UAE';
  const maxDBR = isUAE ? 55 : 50;
  return {
    dbr: Math.round(dbr * 100) / 100,
    isEligible: dbr <= maxDBR,
    maxAllowed: maxDBR
  };
};

// ==================== EMAIL SERVICE ====================
const sendProposalEmail = async (toEmail, data) => {
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Your Mortgage Proposal</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #4CAF50;">
          <h2 style="color: #4CAF50;">🏠 Mortgage Proposal</h2>
        </div>
        
        <div style="padding: 20px 0;">
          <p>Dear ${data.customerName},</p>
          
          <p>Thank you for choosing Xoto VAULT. Based on your requirements, we have prepared a personalized mortgage proposal for you.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center;">
            <p style="margin: 0; font-weight: bold;">Click the button below to view your proposal:</p>
            <a href="${data.secureLink}" 
               style="display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
               View Your Proposal
            </a>
          </div>
          
          <p>Or copy this link to your browser:</p>
          <p style="background: #eee; padding: 10px; border-radius: 5px; word-break: break-all;">${data.secureLink}</p>
          
          <p><strong>⚠️ Important:</strong> This proposal will expire on <strong>${new Date(data.expiryDate).toDateString()}</strong>.</p>
          
          <p>If you have any questions, please contact your dedicated mortgage advisor.</p>
        </div>
        
        <div style="padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; text-align: center;">
          <p>Xoto VAULT - Your trusted mortgage partner</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: toEmail,
    subject: "Your Mortgage Proposal from Xoto VAULT",
    html: emailHtml
  });
};

// ==================== PROPOSAL CRUD OPERATIONS ====================

/**
 * CREATE PROPOSAL (Advisor/Partner/Admin)
 */
export const createProposal = async (req, res) => {
  try {
    const { leadId, selectedBankProducts, coverNote } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ success: false, message: "leadId is required" });
    }
    
    if (!selectedBankProducts || selectedBankProducts.length === 0) {
      return res.status(400).json({ success: false, message: "selectedBankProducts are required" });
    }
    
    if (selectedBankProducts.length > 3) {
      return res.status(400).json({ success: false, message: "Maximum 3 bank products can be selected" });
    }
    
    // Verify bank products exist and get bank names
    for (const product of selectedBankProducts) {
      const bankProduct = await BankProduct.findById(product.bankProductId);
      if (!bankProduct) {
        return res.status(400).json({ success: false, message: `Bank product ${product.bankProductId} not found` });
      }
      // Add bank name to product
      product.bankName = bankProduct.bankInfo?.bankName || 'Unknown Bank';
    }
    
    const userInfo = await getUserInfo(req);
    
    const proposal = await Proposal.createFromLead(leadId, selectedBankProducts, coverNote, userInfo);
    
    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_CREATED', userInfo, {
      description: `Proposal created for lead ${leadId}`,
    });
    
    return res.status(201).json({ 
      success: true, 
      message: "Proposal created successfully", 
      data: proposal 
    });
    
  } catch (error) {
    console.error("Create proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET MY PROPOSALS (Advisor/Partner/Admin)
 */
export const getMyProposals = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status } = req.query;

    let query = {
      isDeleted: false,
      'createdBy.userId': userId
    };

    if (status) {
      query.status = status;
    }

    const proposals = await Proposal.find(query)
      .populate('leadId', 'customerInfo propertyDetails currentStatus')
      .populate('selectedBankProducts.bankProductId', 'bankInfo offerSummary')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Proposal.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: proposals,
      total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    console.error("Get my proposals error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET PROPOSAL BY ID
 */
export const getProposalById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const proposal = await Proposal.findById(id)
      .populate('leadId')
      .populate('selectedBankProducts.bankProductId');

    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    const clientInfo = await proposal.getClientInfo();
    
    return res.status(200).json({ 
      success: true, 
      data: {
        proposal,
        clientInfo,
      } 
    });
    
  } catch (error) {
    console.error("Get proposal by ID error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * UPDATE PROPOSAL (Only Draft status)
 */
export const updateProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user._id;
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    if (proposal.status !== 'Draft') {
      return res.status(400).json({ success: false, message: "Only draft proposals can be updated" });
    }
    
    if (!isAdmin && proposal.createdBy.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only update your own proposals" });
    }
    
    const updatedProposal = await Proposal.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    return res.status(200).json({ 
      success: true, 
      message: "Proposal updated successfully", 
      data: updatedProposal 
    });
    
  } catch (error) {
    console.error("Update proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE PROPOSAL (Soft Delete)
 */
export const deleteProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    if (!isAdmin && proposal.createdBy.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only delete your own proposals" });
    }
    
    proposal.isDeleted = true;
    proposal.deletedAt = new Date();
    proposal.deletedBy = userId;
    await proposal.save();
    
    return res.status(200).json({ success: true, message: "Proposal deleted successfully" });
    
  } catch (error) {
    console.error("Delete proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SEND PROPOSAL TO CUSTOMER ====================

/**
 * SEND PROPOSAL to Customer Email
 */
export const sendProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientEmail, clientName } = req.body;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }

    if (!clientEmail) {
      return res.status(400).json({
        success: false,
        message: "Client email is required",
      });
    }
    
    // Get client name from lead if not provided
    let customerName = clientName;
    if (!customerName) {
      const lead = await Lead.findById(proposal.leadId);
      customerName = lead?.customerInfo?.fullName || 'Customer';
    }
    
    // Step 1: Update status to Sent
    await proposal.send(clientEmail);
    
    // Step 2: Generate secure link
    await proposal.generateSecureLink();
    
    // Step 3: Build full secure link
    const fullSecureLink = `${frontendUrl}/proposal/view/${proposal._id}?token=${proposal.secureLink}`;
    proposal.fullSecureLink = fullSecureLink;
    await proposal.save();
    
    // Step 4: Send email to customer
    await sendProposalEmail(clientEmail, {
      customerName: customerName,
      secureLink: fullSecureLink,
      expiryDate: proposal.expiresAt,
    });
    
    return res.status(200).json({
      success: true,
      message: "Proposal sent successfully",
      data: {
        secureLink: fullSecureLink,
        expiresAt: proposal.expiresAt
      }
    });

  } catch (error) {
    console.error("Send proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== PUBLIC CUSTOMER ROUTES ====================

/**
 * GET PROPOSAL BY SECURE LINK (Customer viewing)
 */
export const getProposalBySecureLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: token,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    })
      .populate('leadId', 'customerInfo propertyDetails currentStatus')
      .populate('selectedBankProducts.bankProductId', 'bankInfo offerSummary loanDetails costBreakdown features isPopular');
    
    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid or expired proposal link" 
      });
    }
    
    // Check if proposal has expired
    if (proposal.expiresAt && new Date() > proposal.expiresAt) {
      proposal.status = 'Expired';
      await proposal.save();
      return res.status(400).json({
        success: false,
        message: "This proposal has expired"
      });
    }
    
    // Mark as viewed if not already
    await proposal.markViewed();
    
    return res.status(200).json({ 
      success: true, 
      data: proposal 
    });
    
  } catch (error) {
    console.error("Get proposal by secure link error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/*
 * ACCEPT PROPOSAL (Customer via secure link)
 */
export const acceptProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: token,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    });
    
    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid or expired proposal link" 
      });
    }
    
    if (proposal.status !== 'Viewed' && proposal.status !== 'Sent') {
      return res.status(400).json({
        success: false,
        message: `You cannot ${proposal.status === 'Accepted' ? 'accept again' : 'accept this proposal at this stage'}`
      });
    }
    
    await proposal.accept();
    
    return res.status(200).json({ 
      success: true, 
      message: "Proposal accepted successfully", 
      data: proposal 
    });
    
  } catch (error) {
    console.error("Accept proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * REJECT PROPOSAL (Customer via secure link)
 */
export const rejectProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { token, reason } = req.query;
    
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: token,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    });
    
    if (!proposal) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid or expired proposal link" 
      });
    }
    
    if (proposal.status !== 'Viewed' && proposal.status !== 'Sent') {
      return res.status(400).json({
        success: false,
        message: `You cannot reject this proposal at this stage`
      });
    }
    
    await proposal.reject(reason || 'Client rejected');
    
    return res.status(200).json({ 
      success: true, 
      message: "Proposal rejected", 
      data: proposal 
    });
    
  } catch (error) {
    console.error("Reject proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ELIGIBILITY & CALCULATION APIs ====================

/**
 * GET ELIGIBLE BANKS FOR LEAD (Preview before creating proposal)
 * Advisor calls this to see which banks customer is eligible for
 */
export const getEligibleBanksForLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    
    // Get customer data
    const monthlySalary = lead.customerInfo.monthlySalary || 0;
    const nationality = lead.customerInfo.nationality;
    const propertyValue = lead.propertyDetails.propertyValue;
    const downPayment = lead.propertyDetails.downPaymentAmount || 0;
    const preferredTenure = lead.loanRequirements.preferredTenureYears || 25;
    
    // Calculate LTV
    const { loanAmount, ltv } = calculateLTV(propertyValue, downPayment);
    
    // Get all active bank products
    const bankProducts = await BankProduct.find({ 
      'meta.isActive': true,
      'meta.isDeleted': false 
    });
    
    const eligibleBanks = [];
    
    for (const bank of bankProducts) {
      // Check LTV eligibility
      const maxLTV = bank.loanDetails?.maxLoanToValue || 80;
      const ltvEligible = ltv <= maxLTV;
      
      // Calculate EMI
      const interestRate = bank.offerSummary?.initialRate || 5;
      const emi = calculateEMI(loanAmount, interestRate, preferredTenure);
      
      // Calculate DBR
      let dbrResult = null;
      let dbrEligible = true;
      if (monthlySalary > 0) {
        dbrResult = calculateDBR(emi, monthlySalary, nationality);
        dbrEligible = dbrResult.isEligible;
      }
      
      // Check minimum salary requirement
      const minSalary = bank.eligibility?.minSalary || 0;
      const salaryEligible = monthlySalary >= minSalary;
      
      eligibleBanks.push({
        bankProductId: bank._id,
        bankName: bank.bankInfo?.bankName || 'Unknown Bank',
        logo: bank.bankInfo?.logo || '',
        interestRate: interestRate,
        interestType: bank.offerSummary?.productType || 'FIXED',
        emi,
        monthlyPayment: emi,
        ltv: {
          current: ltv,
          maxAllowed: maxLTV,
          eligible: ltvEligible
        },
        dbr: dbrResult ? {
          value: dbrResult.dbr,
          maxAllowed: dbrResult.maxAllowed,
          eligible: dbrResult.isEligible
        } : null,
        salaryCheck: {
          minRequired: minSalary,
          current: monthlySalary,
          eligible: salaryEligible
        },
        processingFee: bank.costBreakdown?.bankProcessingFee || 0,
        valuationFee: bank.costBreakdown?.valuationFee || 2500,
        features: bank.features?.keyFeatures || [],
        isPopular: bank.isPopular || false
      });
    }
    
    // Filter only eligible banks (LTV + Salary + DBR all pass)
    const filteredBanks = eligibleBanks.filter(bank => 
      bank.ltv.eligible && bank.salaryCheck.eligible && (bank.dbr ? bank.dbr.eligible : true)
    );
    
    // Sort by interest rate (lowest first)
    filteredBanks.sort((a, b) => a.interestRate - b.interestRate);
    
    // Calculate summary
    const bestRate = filteredBanks.length > 0 ? filteredBanks[0].interestRate : null;
    const bestEMI = filteredBanks.length > 0 ? filteredBanks[0].emi : null;
    const dbrStatus = monthlySalary > 0 && bestEMI ? calculateDBR(bestEMI, monthlySalary, nationality) : null;
    
    return res.status(200).json({
      success: true,
      data: {
        leadId,
        customerName: lead.customerInfo.fullName,
        monthlySalary,
        nationality,
        propertyValue,
        downPayment,
        loanAmount,
        ltv: Math.round(ltv),
        preferredTenure,
        summary: {
          totalEligibleBanks: filteredBanks.length,
          bestRate,
          bestEMI,
          dbrStatus
        },
        eligibleBanks: filteredBanks.slice(0, 10) // Top 10 banks
      }
    });
    
  } catch (error) {
    console.error("Get eligible banks error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CALCULATE SPECIFIC BANK OFFER (Detailed breakdown for selected bank)
 */
export const calculateBankOffer = async (req, res) => {
  try {
    const { leadId, bankProductId, tenureYears, propertyValue, downPayment } = req.body;
    
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    
    const bank = await BankProduct.findById(bankProductId);
    if (!bank) {
      return res.status(404).json({ success: false, message: "Bank product not found" });
    }
    
    const finalPropertyValue = propertyValue || lead.propertyDetails.propertyValue;
    const finalDownPayment = downPayment || lead.propertyDetails.downPaymentAmount || 0;
    const finalTenure = tenureYears || lead.loanRequirements.preferredTenureYears || 25;
    const monthlySalary = lead.customerInfo.monthlySalary || 0;
    const nationality = lead.customerInfo.nationality;
    
    // Calculate LTV
    const { loanAmount, ltv } = calculateLTV(finalPropertyValue, finalDownPayment);
    const maxLTV = bank.loanDetails?.maxLoanToValue || 80;
    const ltvEligible = ltv <= maxLTV;
    
    // Calculate EMI
    const interestRate = bank.offerSummary?.initialRate || 5;
    const emi = calculateEMI(loanAmount, interestRate, finalTenure);
    
    // Calculate DBR
    let dbrResult = null;
    let dbrEligible = true;
    if (monthlySalary > 0) {
      dbrResult = calculateDBR(emi, monthlySalary, nationality);
      dbrEligible = dbrResult.isEligible;
    }
    
    // Calculate upfront costs
    const dldFee = finalPropertyValue * 0.04;
    const registrationFee = loanAmount * 0.0025;
    const valuationFee = bank.costBreakdown?.valuationFee || 2500;
    const processingFee = bank.costBreakdown?.bankProcessingFee || 0;
    const totalUpfront = dldFee + registrationFee + valuationFee + processingFee;
    
    return res.status(200).json({
      success: true,
      data: {
        bankName: bank.bankInfo?.bankName,
        bankLogo: bank.bankInfo?.logo,
        interestRate,
        interestType: bank.offerSummary?.productType,
        tenureYears: finalTenure,
        loanAmount,
        emi,
        ltv: {
          value: Math.round(ltv),
          maxAllowed: maxLTV,
          eligible: ltvEligible,
          difference: maxLTV - ltv
        },
        dbr: dbrResult,
        upfrontCosts: {
          dldFee: Math.round(dldFee),
          registrationFee: Math.round(registrationFee),
          valuationFee,
          processingFee,
          total: Math.round(totalUpfront)
        },
        monthlyBreakdown: {
          principalAndInterest: emi,
          totalMonthly: emi
        },
        features: bank.features?.keyFeatures || [],
        isPopular: bank.isPopular || false
      }
    });
    
  } catch (error) {
    console.error("Calculate bank offer error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};