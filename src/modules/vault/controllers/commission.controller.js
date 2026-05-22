// commission.controller.js - COMPLETE VERSION (No Bank Product Dependency)

import Commission from '../models/Commission.js';
import Case from '../models/Case.js';
import VaultLead from '../models/VaultLead.js';
import Partner from '../models/Partner.js';
import VaultAgent from '../models/Agent.js';
import HistoryService from '../services/history.service.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'System';
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

// ==================== HELPER: Calculate Xoto Commission (Fixed 1%) ====================
const calculateXotoCommission = (loanAmount) => {
  const xotoCommission = loanAmount * 0.01; // Fixed 1%
  return {
    xotoCommissionFromBank: Math.round(xotoCommission),
    bankCommissionRate: 0.01,
    bankCommissionPercentage: '1.00%',
    calculation: `${loanAmount.toLocaleString()} × 1% = ${Math.round(xotoCommission).toLocaleString()} AED`
  };
};

// ==================== HELPER: Determine Recipient Based on Lead Source ====================
const determineRecipient = async (caseData, xotoCommissionFromBank) => {
  const loanAmount = caseData.disbursementInfo?.disbursedAmount || 
                     caseData.amountTracking?.disbursedAmount ||
                     caseData.propertyInfo?.loanAmount || 0;
  
  if (!caseData.sourceLeadId) {
    return {
      recipientType: 'xoto_internal',
      recipientId: null,
      recipientName: 'Xoto (Internal)',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      note: 'No lead associated with this case. Commission retained by Xoto.'
    };
  }
  
  const lead = await VaultLead.findById(caseData.sourceLeadId);
  if (!lead || !lead.sourceInfo) {
    return {
      recipientType: 'xoto_internal',
      recipientId: null,
      recipientName: 'Lead Not Found',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      note: 'Lead not found. Commission retained by Xoto.'
    };
  }
  
  const leadSourceRole = lead.sourceInfo.createdByRole;
  const leadSourceId = lead.sourceInfo.createdById;
  
  // CASE 1: Lead from FREELANCE AGENT (40% / 50%)
  if (leadSourceRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(leadSourceId);
    if (agent && agent.agentType === 'FreelanceAgent') {
      const referralPercentage = loanAmount <= 5000000 ? 40 : 50;
      const commissionAmount = (xotoCommissionFromBank * referralPercentage) / 100;
      const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
      
      return {
        recipientType: 'freelance_agent',
        recipientId: agent._id,
        recipientName: agent.fullName,
        recipientPercentage: referralPercentage,
        commissionAmount: Math.round(commissionAmount),
        calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${referralPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
        xotoNetProfit: Math.round(xotoNetProfit),
        profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
        note: `Lead referred by Freelance Agent: ${agent.fullName}`
      };
    }
  }
  
  // CASE 2: Lead from PARTNER-AFFILIATED AGENT (80% / 85% to Partner)
  if (leadSourceRole === 'partner_affiliated_agent') {
    const agent = await VaultAgent.findById(leadSourceId);
    if (agent && agent.partnerId) {
      const partner = await Partner.findById(agent.partnerId);
      if (partner) {
        const partnerPercentage = loanAmount <= 5000000 ? 80 : 85;
        const commissionAmount = (xotoCommissionFromBank * partnerPercentage) / 100;
        const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
        
        return {
          recipientType: 'partner',
          recipientId: partner._id,
          recipientName: partner.displayName || partner.companyName,
          recipientPercentage: partnerPercentage,
          commissionAmount: Math.round(commissionAmount),
          calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${partnerPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
          xotoNetProfit: Math.round(xotoNetProfit),
          profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
          sourceAgentId: agent._id,
          sourceAgentName: agent.fullName,
          note: `Lead from Partner-Affiliated Agent (${agent.fullName}) → Commission to Partner: ${partner.displayName}`
        };
      }
    }
  }
  
  // CASE 3: Lead from INDIVIDUAL PARTNER (80% / 85%)
  if (leadSourceRole === 'individual_partner') {
    const partner = await Partner.findById(leadSourceId);
    if (partner) {
      const partnerPercentage = loanAmount <= 5000000 ? 80 : 85;
      const commissionAmount = (xotoCommissionFromBank * partnerPercentage) / 100;
      const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
      
      return {
        recipientType: 'partner',
        recipientId: partner._id,
        recipientName: partner.displayName,
        recipientPercentage: partnerPercentage,
        commissionAmount: Math.round(commissionAmount),
        calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${partnerPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
        xotoNetProfit: Math.round(xotoNetProfit),
        profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
        note: `Lead from Individual Partner: ${partner.displayName}`
      };
    }
  }
  
  // CASE 4: Lead from WEBSITE (✅ Create commission record with 0% for internal tracking)
 // CASE 4: Lead from WEBSITE (No commission - Just track Xoto earnings)
if (leadSourceRole === 'website') {
  return {
    recipientType: 'internal',      // ✅ Changed to 'internal'
    recipientId: null,
    recipientName: 'Xoto (Website Lead)',
    recipientPercentage: 0,
    commissionAmount: 0,
    calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
    xotoNetProfit: Math.round(xotoCommissionFromBank),
    profitMargin: '100%',
    note: `Lead from website. Xoto earns ${Math.round(xotoCommissionFromBank).toLocaleString()} AED. No commission paid.`,
    isInternal: true,               // ✅ Add this flag
    shouldCreateCommission: true    // ✅ Add this flag
  };
}
  
  // CASE 5: Lead from ADMIN (✅ Create commission record with 0% for internal tracking)
if (leadSourceRole === 'admin') {
  return {
    recipientType: 'internal',      // ✅ Changed to 'internal' (not 'none')
    recipientId: null,
    recipientName: 'Xoto (Admin Lead)',
    recipientPercentage: 0,
    commissionAmount: 0,
    calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
    xotoNetProfit: Math.round(xotoCommissionFromBank),
    profitMargin: '100%',
    note: `Lead created by Admin (internal). Xoto earns ${Math.round(xotoCommissionFromBank).toLocaleString()} AED. No commission paid.`,
    isInternal: true,               // ✅ Add this flag
    shouldCreateCommission: true    // ✅ Add this flag
  };
}

  
  // Default
  return {
    recipientType: 'xoto_internal',
    recipientId: null,
    recipientName: 'Xoto (Unknown Source)',
    recipientPercentage: 0,
    commissionAmount: 0,
    calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
    xotoNetProfit: Math.round(xotoCommissionFromBank),
    profitMargin: '100%',
    note: `Unknown lead source: ${leadSourceRole}. Commission retained by Xoto.`,
    shouldCreateCommission: true
  };
};

// ==================== HELPER: Validate Bank Details for Payment ====================
const validateRecipientBankDetails = async (recipientType, recipientId) => {
  if (recipientType === 'freelance_agent') {
    const agent = await VaultAgent.findById(recipientId);
    if (!agent) {
      return { valid: false, reason: 'Agent not found' };
    }
    
    if (!agent.bankDetails || !agent.bankDetails.iban) {
      return { valid: false, reason: 'Bank details not provided. Please update your profile with bank details.' };
    }
    
    if (!agent.bankDetails.beneficiaryName) {
      return { valid: false, reason: 'Beneficiary name missing in bank details.' };
    }
    
    if (!agent.bankDetails.bankName) {
      return { valid: false, reason: 'Bank name missing in bank details.' };
    }
    
    if (!agent.bankDetails.verified) {
      return { valid: false, reason: 'Bank details not verified by admin. Please contact support.' };
    }
    
    const eligibility = agent.getCommissionEligibilityStatus();
    if (!eligibility.eligible) {
      return { valid: false, reason: eligibility.reason };
    }
    
    return { 
      valid: true, 
      bankDetails: {
        beneficiaryName: agent.bankDetails.beneficiaryName,
        bankName: agent.bankDetails.bankName,
        iban: agent.bankDetails.iban,
        swiftCode: agent.bankDetails.swiftCode
      },
      recipientName: agent.fullName
    };
    
  } else if (recipientType === 'partner') {
    const partner = await Partner.findById(recipientId);
    if (!partner) {
      return { valid: false, reason: 'Partner not found' };
    }
    
    if (partner.status !== 'active') {
      return { valid: false, reason: `Partner account is ${partner.status}. Only active partners can receive commission.` };
    }
    
    if (!partner.bankDetails || !partner.bankDetails.iban) {
      return { valid: false, reason: 'Bank details not provided. Please update partner profile with bank details.' };
    }
    
    if (!partner.bankDetails.beneficiaryName) {
      return { valid: false, reason: 'Beneficiary name missing in bank details.' };
    }
    
    if (!partner.bankDetails.bankName) {
      return { valid: false, reason: 'Bank name missing in bank details.' };
    }
    
    if (!partner.bankDetails.verified) {
      return { valid: false, reason: 'Bank details not verified by admin. Please contact support.' };
    }
    
    if (!partner.agreementDetails || !partner.agreementDetails.signedDate) {
      return { valid: false, reason: 'Partnership agreement not signed. Please complete agreement.' };
    }
    
    if (partner.agreementDetails.endDate && new Date() > partner.agreementDetails.endDate) {
      return { valid: false, reason: 'Partnership agreement has expired. Please renew.' };
    }
    
    return { 
      valid: true, 
      bankDetails: {
        beneficiaryName: partner.bankDetails.beneficiaryName,
        bankName: partner.bankDetails.bankName,
        iban: partner.bankDetails.iban,
        swiftCode: partner.bankDetails.swiftCode
      },
      recipientName: partner.displayName || partner.companyName
    };
  }
  
  return { valid: false, reason: 'Unknown recipient type' };
};

// ==================== 1. PREVIEW COMMISSION ====================
export const previewCommission = async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    const loanAmount = caseData.disbursementInfo?.disbursedAmount || 
                       caseData.amountTracking?.disbursedAmount ||
                       caseData.propertyInfo?.loanAmount || 0;
    
    if (loanAmount <= 0) {
      return res.status(400).json({ success: false, message: "No valid loan amount found" });
    }
    
    // Calculate Xoto commission (1% fixed)
    const xotoCommissionInfo = calculateXotoCommission(loanAmount);
    
    // Determine recipient
    const recipientInfo = await determineRecipient(caseData, xotoCommissionInfo.xotoCommissionFromBank);
    
    return res.status(200).json({
      success: true,
      data: {
        caseId: caseData._id,
        caseReference: caseData.caseReference,
        currentStatus: caseData.currentStatus,
        loanAmount,
        xotoCommission: {
          rate: '1%',
          calculatedAmount: xotoCommissionInfo.xotoCommissionFromBank,
          formula: xotoCommissionInfo.calculation
        },
        recipient: {
          type: recipientInfo.recipientType,
          name: recipientInfo.recipientName,
          percentage: recipientInfo.recipientPercentage,
          commissionAmount: recipientInfo.commissionAmount,
          formula: recipientInfo.calculationFormula
        },
        xoto: {
          grossCommission: xotoCommissionInfo.xotoCommissionFromBank,
          netProfit: recipientInfo.xotoNetProfit,
          profitMargin: recipientInfo.profitMargin
        },
        note: recipientInfo.note,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Preview commission error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 2. CREATE COMMISSION FROM DISBURSED CASE ====================
export const createCommissionFromCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { notes } = req.body;
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    if (caseData.currentStatus !== 'Disbursed') {
      return res.status(400).json({ 
        success: false, 
        message: `Case status is ${caseData.currentStatus}. Commission can only be created for Disbursed cases.` 
      });
    }
    
    const existingCommission = await Commission.findOne({ caseId: caseData._id, isDeleted: false });
    if (existingCommission) {
      return res.status(400).json({ 
        success: false, 
        message: `Commission already exists. ID: ${existingCommission.commissionId}` 
      });
    }
    
    const loanAmount = caseData.disbursementInfo?.disbursedAmount || 
                       caseData.amountTracking?.disbursedAmount ||
                       caseData.propertyInfo?.loanAmount || 0;
    
    if (loanAmount <= 0) {
      return res.status(400).json({ success: false, message: "No valid loan amount found" });
    }
    
    // Calculate Xoto commission (1% fixed)
    const xotoCommissionInfo = calculateXotoCommission(loanAmount);
    
    // Determine recipient
    const recipientInfo = await determineRecipient(caseData, xotoCommissionInfo.xotoCommissionFromBank);
    
    // ✅ For internal leads (Admin/Website) - Just update case with Xoto earnings, no commission record
    if (recipientInfo.recipientType === 'internal' || recipientInfo.recipientType === 'xoto_internal') {
      // Update case with Xoto earnings info
      caseData.xotoEarnings = {
        loanAmount: loanAmount,
        xotoCommission: xotoCommissionInfo.xotoCommissionFromBank,
        commissionRate: '1%',
        source: recipientInfo.recipientType === 'internal' ? 'Xoto Internal' : recipientInfo.recipientName,
        note: recipientInfo.note,
        recordedAt: new Date()
      };
      await caseData.save();
      
      return res.status(200).json({
        success: true,
        message: `✅ Xoto earned ${xotoCommissionInfo.xotoCommissionFromBank.toLocaleString()} AED (1% of ${loanAmount.toLocaleString()} AED) from this case. No commission paid out.`,
        data: {
          caseId: caseData._id,
          caseReference: caseData.caseReference,
          loanAmount: loanAmount,
          xotoEarnings: {
            amount: xotoCommissionInfo.xotoCommissionFromBank,
            rate: '1%',
            calculation: xotoCommissionInfo.calculation
          },
          recipient: {
            type: 'Xoto (Internal)',
            name: recipientInfo.recipientName,
            percentage: 0,
            commissionAmount: 0
          },
          note: recipientInfo.note
        }
      });
    }
    
    // For external recipients (Freelance Agent or Partner) - Create commission record
    if (!recipientInfo.recipientId || recipientInfo.commissionAmount === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid recipient found for commission.",
        note: recipientInfo.note
      });
    }
    
    // Create commission record for external recipients
    const commissionId = `COM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const commissionData = {
      commissionId,
      caseId: caseData._id,
      caseReference: caseData.caseReference,
      leadId: caseData.sourceLeadId,
      proposalId: caseData.proposalId,
      customerId: caseData.customerId,
      customerName: caseData.clientInfo?.fullName,
      recipientRole: recipientInfo.recipientType,
      recipientId: recipientInfo.recipientId,
      recipientModel: recipientInfo.recipientType === 'partner' ? 'Partner' : 'VaultAgent',
      recipientName: recipientInfo.recipientName,
      loanAmount,
      loanTier: loanAmount <= 5000000 ? '≤5M AED' : '>5M AED',
      bankCommissionToXoto: xotoCommissionInfo.xotoCommissionFromBank,
      bankCommissionRate: 0.01,
      recipientPercentage: recipientInfo.recipientPercentage,
      commissionAmount: recipientInfo.commissionAmount,
      calculationFormula: recipientInfo.calculationFormula,
      percentageSource: recipientInfo.recipientType === 'freelance_agent' 
        ? 'freelance_commission.referralOnly' 
        : 'partner.commissionConfiguration',
      disbursedAt: new Date(),
      status: 'Pending',
      createdBy: { role: 'admin', adminId: req.user._id },
      notes: notes || `Commission created from disbursed case. Xoto commission: 1% of ${loanAmount.toLocaleString()} AED = ${xotoCommissionInfo.xotoCommissionFromBank.toLocaleString()} AED`
    };
    
    // Add source agent info if applicable
    if (recipientInfo.sourceAgentId) {
      commissionData.sourceAgentId = recipientInfo.sourceAgentId;
      commissionData.sourceAgentName = recipientInfo.sourceAgentName;
    }
    
    // Get payout bank details
    if (recipientInfo.recipientType === 'freelance_agent') {
      const agent = await VaultAgent.findById(recipientInfo.recipientId);
      if (agent && agent.bankDetails) {
        commissionData.payoutBankDetails = {
          beneficiaryName: agent.bankDetails.beneficiaryName || agent.fullName,
          bankName: agent.bankDetails.bankName,
          iban: agent.bankDetails.iban,
          swiftCode: agent.bankDetails.swiftCode
        };
      }
    } else if (recipientInfo.recipientType === 'partner') {
      const partner = await Partner.findById(recipientInfo.recipientId);
      if (partner && partner.bankDetails) {
        commissionData.payoutBankDetails = {
          beneficiaryName: partner.bankDetails.beneficiaryName || partner.displayName,
          bankName: partner.bankDetails.bankName,
          iban: partner.bankDetails.iban,
          swiftCode: partner.bankDetails.swiftCode
        };
      }
    }
    
    const commission = await Commission.create(commissionData);
    
    // Update case with commission info
    caseData.commissionInfo = {
      commissionId: commission.commissionId,
      loanAmount,
      loanTier: commission.loanTier,
      recipientPercentage: recipientInfo.recipientPercentage,
      xotoCommissionFromBank: xotoCommissionInfo.xotoCommissionFromBank,
      recipientCommissionAmount: recipientInfo.commissionAmount,
      calculation: recipientInfo.calculationFormula,
      status: 'Pending',
      bankCommissionRate: 0.01,
      createdAt: new Date()
    };
    await caseData.save();
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_CREATED', await getUserInfo(req), {
      description: `Commission ${commissionId} created for ${commission.recipientName}`,
      metadata: { loanAmount, xotoCommission: xotoCommissionInfo.xotoCommissionFromBank, percentage: recipientInfo.recipientPercentage }
    });
    
    return res.status(201).json({
      success: true,
      message: "Commission created successfully",
      data: {
        commission,
        summary: {
          commissionId: commission.commissionId,
          loanAmount: commission.loanAmount,
          xotoCommission: commission.bankCommissionToXoto,
          xotoCommissionRate: '1%',
          recipientType: recipientInfo.recipientType,
          recipientName: recipientInfo.recipientName,
          recipientPercentage: commission.recipientPercentage,
          commissionAmount: commission.commissionAmount,
          status: commission.status
        }
      }
    });
    
  } catch (error) {
    console.error("Create commission error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 3. CREATE COMMISSION (Auto) ====================
export const createCommission = async (req, res) => {
  try {
    const { caseId } = req.body;
    req.params = { caseId };
    return createCommissionFromCase(req, res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 4. CONFIRM COMMISSION ====================
export const confirmCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualBankCommission, notes } = req.body;
    
    const commission = await Commission.findOne({ _id: id, isDeleted: false });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    
    if (commission.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Commission already ${commission.status}` });
    }
    
    let amountAdjusted = false;
    let finalBankCommission = commission.bankCommissionToXoto;
    
    if (actualBankCommission && actualBankCommission > 0 && actualBankCommission !== commission.bankCommissionToXoto) {
      finalBankCommission = actualBankCommission;
      amountAdjusted = true;
      
      const newCommissionAmount = (actualBankCommission * commission.recipientPercentage) / 100;
      commission.commissionAmount = Math.round(newCommissionAmount);
      commission.calculationFormula = `${actualBankCommission.toLocaleString()} × ${commission.recipientPercentage}% = ${Math.round(newCommissionAmount).toLocaleString()} AED`;
      commission.bankCommissionToXoto = actualBankCommission;
      commission.notes = notes || `Bank commission adjusted from ${commission.bankCommissionToXoto} to ${actualBankCommission}`;
    }
    
    commission.status = 'Confirmed';
    commission.confirmedByAdminId = req.user._id;
    commission.confirmedAt = new Date();
    await commission.save();
    
    const caseData = await Case.findById(commission.caseId);
    if (caseData && caseData.commissionInfo) {
      caseData.commissionInfo.status = 'Confirmed';
      caseData.commissionInfo.xotoCommissionFromBank = finalBankCommission;
      caseData.commissionInfo.recipientCommissionAmount = commission.commissionAmount;
      await caseData.save();
    }
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_CONFIRMED', await getUserInfo(req), {
      description: `Commission ${commission.commissionId} confirmed`,
      metadata: { amountAdjusted, finalAmount: finalBankCommission }
    });
    
    return res.status(200).json({
      success: true,
      message: amountAdjusted ? "Commission confirmed with adjusted amount" : "Commission confirmed",
      data: {
        commission,
        amountAdjusted,
        estimatedAmount: commission.bankCommissionToXoto,
        actualAmount: finalBankCommission,
        recipientCommission: commission.commissionAmount
      }
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 5. MARK COMMISSION AS PAID ====================
export const markCommissionAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentMethod } = req.body;
    
    const commission = await Commission.findOne({ _id: id, isDeleted: false });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    
    if (commission.status === 'Paid') {
      return res.status(400).json({ success: false, message: "Commission already paid" });
    }
    
    if (commission.status !== 'Confirmed') {
      return res.status(400).json({ success: false, message: "Commission must be confirmed before marking as paid" });
    }
    
    commission.status = 'Paid';
    commission.paymentReference = paymentReference;
    commission.paymentMethod = paymentMethod || 'Bank Transfer';
    commission.paymentSentAt = new Date();
    commission.paymentCompletedAt = new Date();
    await commission.save();
    
    await commission.updateRecipientEarnings();
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_PAID', await getUserInfo(req), {
      description: `Commission ${commission.commissionId} paid to ${commission.recipientName}`,
      metadata: { paymentReference, amount: commission.commissionAmount }
    });
    
    return res.status(200).json({
      success: true,
      message: "Commission marked as paid",
      data: commission
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 6. PROCESS PAYMENT WITH BANK DETAILS VALIDATION ====================
export const processCommissionPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentMethod, notes } = req.body;
    
    const commission = await Commission.findOne({ _id: id, isDeleted: false });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    
    if (commission.status === 'Paid') {
      return res.status(400).json({ success: false, message: "Commission already paid" });
    }
    
    if (commission.status !== 'Confirmed') {
      return res.status(400).json({ success: false, message: "Commission must be confirmed before processing payment" });
    }
    
    // ✅ Validate bank details before payment
    const bankValidation = await validateRecipientBankDetails(commission.recipientRole, commission.recipientId);
    
    if (!bankValidation.valid) {
      return res.status(400).json({
        success: false,
        message: "Cannot process payment: " + bankValidation.reason,
        requiredAction: "Please update recipient profile with valid bank details and get them verified."
      });
    }
    
    // Update commission with fresh bank details
    commission.payoutBankDetails = bankValidation.bankDetails;
    commission.status = 'Paid';
    commission.paymentReference = paymentReference;
    commission.paymentMethod = paymentMethod || 'Bank Transfer';
    commission.paymentSentAt = new Date();
    commission.paymentCompletedAt = new Date();
    if (notes) commission.notes = notes;
    await commission.save();
    
    await commission.updateRecipientEarnings();
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_PAID', await getUserInfo(req), {
      description: `Commission ${commission.commissionId} paid to ${commission.recipientName}`,
      metadata: { 
        paymentReference, 
        amount: commission.commissionAmount,
        bankAccount: bankValidation.bankDetails.iban?.slice(-4)
      }
    });
    
    return res.status(200).json({
      success: true,
      message: "Commission payment processed successfully",
      data: {
        commissionId: commission.commissionId,
        amount: commission.commissionAmount,
        recipient: commission.recipientName,
        paymentReference,
        paymentDate: commission.paymentCompletedAt,
        bankDetails: {
          beneficiaryName: bankValidation.bankDetails.beneficiaryName,
          bankName: bankValidation.bankDetails.bankName,
          iban: bankValidation.bankDetails.iban?.slice(-4)
        }
      }
    });
    
  } catch (error) {
    console.error("Process commission payment error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
// ==================== 7. GET MY COMMISSIONS ====================
export const getMyCommissions = async (req, res) => {
  try {

    console.log('REQ.USER:', req.user);

    // ✅ Check agent type directly from DB-loaded user
    if (req.user.agentType !== 'FreelanceAgent') {

      return res.status(403).json({
        success: false,
        message:
          'Partner-Affiliated Agents do not receive direct commissions. Commission is paid to your partner company.'
      });
    }

    const commissions = await Commission.find({
      recipientRole: 'freelance_agent',
      recipientId: req.user._id,
      isDeleted: false
    })
      .populate('caseId', 'caseReference currentStatus')
      .sort({ createdAt: -1 });

    const summary = {
      totalEarned: commissions
        .filter(c => c.status === 'Paid')
        .reduce((s, c) => s + c.commissionAmount, 0),

      pending: commissions
        .filter(c => ['Pending', 'Confirmed'].includes(c.status))
        .reduce((s, c) => s + c.commissionAmount, 0),

      totalCount: commissions.length,

      paidCount: commissions.filter(c => c.status === 'Paid').length,

      pendingCount: commissions.filter(c =>
        ['Pending', 'Confirmed'].includes(c.status)
      ).length,

      confirmedCount: commissions.filter(
        c => c.status === 'Confirmed'
      ).length
    };

    return res.status(200).json({
      success: true,
      summary,
      data: commissions
    });

  } catch (error) {

    console.error('Get my commissions error:', error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// ==================== 8. GET PARTNER COMMISSIONS ====================
export const getPartnerCommissions = async (req, res) => {
  try {
    const partnerId = req.user._id;
    
    // Verify user is actually a partner
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(403).json({ success: false, message: "Access denied. Partner account not found." });
    }
    
    const commissions = await Commission.find({ 
      recipientId: partnerId, 
      recipientRole: 'partner', 
      isDeleted: false 
    }).populate('caseId', 'caseReference currentStatus').sort({ createdAt: -1 });
    
    const summary = {
      totalEarned: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0),
      pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0),
      totalCount: commissions.length,
      paidCount: commissions.filter(c => c.status === 'Paid').length,
      byAgent: {}
    };
    
    commissions.forEach(c => {
      if (c.sourceAgentName) {
        if (!summary.byAgent[c.sourceAgentName]) {
          summary.byAgent[c.sourceAgentName] = { count: 0, amount: 0 };
        }
        summary.byAgent[c.sourceAgentName].count++;
        summary.byAgent[c.sourceAgentName].amount += c.commissionAmount;
      }
    });
    
    return res.status(200).json({ success: true, summary, data: commissions });
    
  } catch (error) {
    console.error('Get partner commissions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 9. GET ALL COMMISSIONS (Admin) ====================
export const adminGetAllCommissions = async (req, res) => {
  try {
    const { status, role, page = 1, limit = 20, search } = req.query;
    let query = { isDeleted: false };
    if (status) query.status = status;
    if (role) query.recipientRole = role;
    if (search) {
      query.$or = [
        { recipientName: { $regex: search, $options: 'i' } },
        { caseReference: { $regex: search, $options: 'i' } },
        { commissionId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const commissions = await Commission.find(query)
      .populate('caseId', 'caseReference currentStatus clientInfo')
      .populate('recipientId', 'name companyName fullName')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Commission.countDocuments(query);
    
    const summary = {
      totalCommissionAmount: commissions.reduce((s, c) => s + c.commissionAmount, 0),
      totalBankCommission: commissions.reduce((s, c) => s + c.bankCommissionToXoto, 0),
      xotoNetProfit: commissions.reduce((s, c) => s + (c.bankCommissionToXoto - c.commissionAmount), 0),
      byStatus: {
        pending: commissions.filter(c => c.status === 'Pending').reduce((s, c) => s + c.commissionAmount, 0),
        confirmed: commissions.filter(c => c.status === 'Confirmed').reduce((s, c) => s + c.commissionAmount, 0),
        paid: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0),
        failed: commissions.filter(c => c.status === 'Failed').reduce((s, c) => s + c.commissionAmount, 0)
      },
      byRole: {
        freelance_agent: commissions.filter(c => c.recipientRole === 'freelance_agent').reduce((s, c) => s + c.commissionAmount, 0),
        partner: commissions.filter(c => c.recipientRole === 'partner').reduce((s, c) => s + c.commissionAmount, 0)
      }
    };
    
    return res.status(200).json({
      success: true,
      summary,
      data: commissions,
      total,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasNextPage: (parseInt(page) * parseInt(limit)) < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 10. GET COMMISSION BY ID ====================
export const getCommissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const commission = await Commission.findOne({ _id: id, isDeleted: false })
      .populate('caseId', 'caseReference currentStatus clientInfo propertyInfo')
      .populate('leadId', 'customerInfo sourceInfo')
      .populate('recipientId', 'name companyName fullName email');
    
    if (!commission) {
      return res.status(404).json({ success: false, message: "Commission not found" });
    }
    
    return res.status(200).json({ success: true, data: commission });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};