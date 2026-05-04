// commission.controller.js - WITHOUT hardcoded bank rates

import Commission from '../models/Commission.js';
import Case from '../models/Case.js';
import Lead from '../models/VaultLead.js';
import Partner from '../models/Partner.js';
import VaultAgent from '../models/Agent.js';
import BankMortgageProduct from '../../mortgages/models/BankProduct.js';
import HistoryService from '../services/history.service.js';
import mongoose from 'mongoose';

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

// ==================== HELPER: Get Bank Commission Rate ====================
const getBankCommissionRate = async (caseData) => {
  // Priority 1: From case data (if already set)
  if (caseData.loanInfo?.bankCommissionRate) {
    return {
      rate: caseData.loanInfo.bankCommissionRate,
      source: 'case_data',
      ratePercentage: `${(caseData.loanInfo.bankCommissionRate * 100).toFixed(2)}%`
    };
  }
  
  // Priority 2: From bank product (database)
  if (caseData.loanInfo?.selectedBankProduct) {
    try {
      const bankProduct = await BankMortgageProduct.findById(caseData.loanInfo.selectedBankProduct);
      if (bankProduct && bankProduct.commissionRate) {
        return {
          rate: bankProduct.commissionRate,
          source: 'bank_product',
          ratePercentage: `${(bankProduct.commissionRate * 100).toFixed(2)}%`,
          productName: bankProduct.productName,
          bankName: bankProduct.bankName
        };
      }
    } catch (err) {
      console.error("Error fetching bank product:", err);
    }
  }
  
  // ❌ REMOVED hardcoded bank rates
  // Now Admin must provide rate manually or from bank product
  
  // Priority 3: Return null - Admin must provide rate
  return {
    rate: null,
    source: 'required_from_admin',
    ratePercentage: 'Not set - Please provide bank commission rate',
    requiresManualInput: true
  };
};

// ==================== HELPER: Calculate Commission Core ====================
const calculateCommissionCore = (loanAmount, bankCommissionRate = null) => {
  if (!bankCommissionRate || bankCommissionRate <= 0) {
    return {
      loanAmount,
      loanTier: loanAmount <= 5000000 ? '≤5M AED' : '>5M AED',
      xotoCommissionFromBank: null,
      bankCommissionRate: null,
      bankCommissionPercentage: 'Requires manual input',
      error: 'Bank commission rate not provided'
    };
  }
  
  const xotoCommissionFromBank = loanAmount * bankCommissionRate;
  const loanTier = loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
  
  return {
    loanAmount,
    loanTier,
    xotoCommissionFromBank: Math.round(xotoCommissionFromBank),
    bankCommissionRate: bankCommissionRate,
    bankCommissionPercentage: `${(bankCommissionRate * 100).toFixed(2)}%`
  };
};

// ==================== HELPER: Determine Recipient Based ONLY on Lead Source (NO eligibility checks) ====================
const determineRecipient = async (caseData, xotoCommissionFromBank) => {
  const loanAmount = caseData.loanInfo?.disbursedAmount || 
                     caseData.loanInfo?.approvedAmount || 
                     caseData.loanInfo?.requestedAmount || 0;
  
  let result = {
    recipientType: null,
    recipientId: null,
    recipientName: null,
    recipientPercentage: 0,
    commissionAmount: 0,
    calculationFormula: '',
    xotoNetProfit: 0,
    profitMargin: '0%',
    note: null,
    sourceType: 'lead'
  };
  
  // ==================== ONLY CHECK LEAD SOURCE ====================
  // NO eligibility checks - just check who created the lead
  
  if (!caseData.sourceLeadId) {
    return {
      recipientType: 'none',
      recipientId: null,
      recipientName: 'No Lead Source',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      sourceType: 'none',
      note: 'No lead associated with this case. Commission retained by Xoto.'
    };
  }
  
  const lead = await VaultLead.findById(caseData.sourceLeadId);
  if (!lead || !lead.sourceInfo) {
    return {
      recipientType: 'none',
      recipientId: null,
      recipientName: 'Lead Not Found',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      sourceType: 'none',
      note: 'Lead not found. Commission retained by Xoto.'
    };
  }
  
  const leadSourceRole = lead.sourceInfo.createdByRole;
  const leadSourceId = lead.sourceInfo.createdById;
  
  // ==================== CASE 1: Lead from FREELANCE AGENT ====================
  // ✅ NO eligibility check - just give commission
  if (leadSourceRole === 'freelance_agent') {
    const agent = await VaultAgent.findById(leadSourceId);
    if (agent && agent.agentType === 'FreelanceAgent') {
      const referralPercentage = loanAmount <= 5000000 ? 40 : 50;
      const commissionAmount = (xotoCommissionFromBank * referralPercentage) / 100;
      const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
      
      result = {
        recipientType: 'freelance_agent',
        recipientId: agent._id,
        recipientName: agent.fullName,
        recipientPercentage: referralPercentage,
        commissionAmount: Math.round(commissionAmount),
        calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${referralPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
        xotoNetProfit: Math.round(xotoNetProfit),
        profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
        sourceType: 'lead',
        note: `Lead referred by Freelance Agent: ${agent.fullName}`
      };
      return result;
    }
  }
  
  // ==================== CASE 2: Lead from PARTNER-AFFILIATED AGENT ====================
  if (leadSourceRole === 'partner_affiliated_agent') {
    const agent = await VaultAgent.findById(leadSourceId);
    if (agent && agent.partnerId) {
      const partner = await Partner.findById(agent.partnerId);
      if (partner) {
        const partnerPercentage = loanAmount <= 5000000 ? 80 : 85;
        const commissionAmount = (xotoCommissionFromBank * partnerPercentage) / 100;
        const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
        
        result = {
          recipientType: 'partner',
          recipientId: partner._id,
          recipientName: partner.displayName || partner.companyName,
          recipientPercentage: partnerPercentage,
          commissionAmount: Math.round(commissionAmount),
          calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${partnerPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
          xotoNetProfit: Math.round(xotoNetProfit),
          profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
          sourceType: 'lead',
          sourceAgent: {
            id: agent._id,
            name: agent.fullName,
            type: 'PartnerAffiliatedAgent'
          },
          note: `Lead from Partner-Affiliated Agent (${agent.fullName}) → Commission to Partner: ${partner.displayName}`
        };
        return result;
      }
    }
  }
  
  // ==================== CASE 3: Lead from INDIVIDUAL PARTNER ====================
  if (leadSourceRole === 'individual_partner') {
    const partner = await Partner.findById(leadSourceId);
    if (partner) {
      const partnerPercentage = loanAmount <= 5000000 ? 80 : 85;
      const commissionAmount = (xotoCommissionFromBank * partnerPercentage) / 100;
      const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
      
      result = {
        recipientType: 'partner',
        recipientId: partner._id,
        recipientName: partner.displayName,
        recipientPercentage: partnerPercentage,
        commissionAmount: Math.round(commissionAmount),
        calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${partnerPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
        xotoNetProfit: Math.round(xotoNetProfit),
        profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
        sourceType: 'lead',
        note: `Lead from Individual Partner: ${partner.displayName}`
      };
      return result;
    }
  }
  
  // ==================== CASE 4: Lead from WEBSITE ====================
  if (leadSourceRole === 'website') {
    return {
      recipientType: 'none',
      recipientId: null,
      recipientName: 'Website Visitor',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      sourceType: 'lead',
      note: 'Lead from website. No commission paid. Commission retained by Xoto.'
    };
  }
  
  // ==================== CASE 5: Lead from ADMIN ====================
  if (leadSourceRole === 'admin') {
    return {
      recipientType: 'none',
      recipientId: null,
      recipientName: 'Admin Created',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      sourceType: 'lead',
      note: 'Lead created by Admin (internal). No commission paid.'
    };
  }
  
  // ==================== Default ====================
  return {
    recipientType: 'none',
    recipientId: null,
    recipientName: 'Unknown Source',
    recipientPercentage: 0,
    commissionAmount: 0,
    calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
    xotoNetProfit: Math.round(xotoCommissionFromBank),
    profitMargin: '100%',
    sourceType: 'lead',
    note: `Unknown lead source: ${leadSourceRole}. Commission retained by Xoto.`
  };
};

// ==================== PREVIEW COMMISSION (Before Creating) ====================
// ==================== PREVIEW COMMISSION (Before Creating) ====================
export const previewCommission = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { customBankRate, customBankCommission } = req.body;
    
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }
    
    const loanAmount = caseData.loanInfo?.disbursedAmount || 
                       caseData.loanInfo?.approvedAmount || 
                       caseData.loanInfo?.requestedAmount || 0;
    
    if (loanAmount <= 0) {
      return res.status(400).json({ success: false, message: "No valid loan amount found" });
    }
    
    // ==================== GET BANK COMMISSION RATE ====================
    let bankCommissionRate, xotoCommissionFromBank, bankCommissionSource;
    
    if (customBankCommission && customBankCommission > 0) {
      xotoCommissionFromBank = customBankCommission;
      bankCommissionRate = xotoCommissionFromBank / loanAmount;
      bankCommissionSource = { source: 'admin_manual', rate: bankCommissionRate, ratePercentage: `${(bankCommissionRate * 100).toFixed(2)}%` };
    } else if (customBankRate && customBankRate > 0) {
      bankCommissionRate = customBankRate / 100;
      xotoCommissionFromBank = loanAmount * bankCommissionRate;
      bankCommissionSource = { source: 'admin_custom_rate', rate: bankCommissionRate, ratePercentage: `${customBankRate}%` };
    } else {
      const bankRateInfo = await getBankCommissionRate(caseData);
      
      if (bankRateInfo.rate) {
        bankCommissionRate = bankRateInfo.rate;
        xotoCommissionFromBank = loanAmount * bankCommissionRate;
        bankCommissionSource = bankRateInfo;
      } else {
        return res.status(400).json({
          success: false,
          message: "Bank commission rate not configured. Please provide customBankRate or customBankCommission.",
          data: {
            loanAmount,
            requiresManualInput: true,
            availableSources: [
              "customBankRate: Provide rate percentage (e.g., 1.0 for 1%)",
              "customBankCommission: Provide exact commission amount in AED"
            ]
          }
        });
      }
    }
    
    // ==================== DETERMINE RECIPIENT BASED ONLY ON LEAD SOURCE ====================
    // Do NOT check case.createdBy - ONLY look at lead source
    let recipientInfo = {
      recipientType: 'none',
      recipientId: null,
      recipientName: 'No Lead Source',
      recipientPercentage: 0,
      commissionAmount: 0,
      calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × 0% = 0 AED`,
      xotoNetProfit: Math.round(xotoCommissionFromBank),
      profitMargin: '100%',
      note: null
    };
    
    // Check if case has a lead
    if (caseData.sourceLeadId) {
      const lead = await Lead.findById(caseData.sourceLeadId);
      if (lead && lead.sourceInfo) {
        const leadSourceRole = lead.sourceInfo.createdByRole;
        const leadSourceId = lead.sourceInfo.createdById;
        
        // CASE 1: Lead from FREELANCE AGENT (Referral Partner)
        if (leadSourceRole === 'freelance_agent') {
          const agent = await VaultAgent.findById(leadSourceId);
          if (agent && agent.agentType === 'FreelanceAgent') {
            const eligibility = agent.getCommissionEligibilityStatus();
            if (eligibility.eligible) {
              const referralPercentage = loanAmount <= 5000000 ? 40 : 50;
              const commissionAmount = (xotoCommissionFromBank * referralPercentage) / 100;
              const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
              
              recipientInfo = {
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
            } else {
              recipientInfo.note = `Lead from Freelance Agent but agent not eligible: ${eligibility.reason}. Commission retained by Xoto.`;
            }
          }
        }
        
        // CASE 2: Lead from PARTNER-AFFILIATED AGENT
        else if (leadSourceRole === 'partner_affiliated_agent') {
          const agent = await VaultAgent.findById(leadSourceId);
          if (agent && agent.partnerId) {
            const partner = await Partner.findById(agent.partnerId);
            if (partner && partner.isActive()) {
              const partnerPercentage = loanAmount <= 5000000 ? 80 : 85;
              const commissionAmount = (xotoCommissionFromBank * partnerPercentage) / 100;
              const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
              
              recipientInfo = {
                recipientType: 'partner',
                recipientId: partner._id,
                recipientName: partner.displayName || partner.companyName,
                recipientPercentage: partnerPercentage,
                commissionAmount: Math.round(commissionAmount),
                calculationFormula: `${Math.round(xotoCommissionFromBank).toLocaleString()} × ${partnerPercentage}% = ${Math.round(commissionAmount).toLocaleString()} AED`,
                xotoNetProfit: Math.round(xotoNetProfit),
                profitMargin: ((xotoNetProfit / xotoCommissionFromBank) * 100).toFixed(2) + '%',
                note: `Lead from Partner-Affiliated Agent (${agent.fullName}) → Commission to Partner: ${partner.displayName}`
              };
            }
          }
        }
        
        // CASE 3: Lead from INDIVIDUAL PARTNER
        else if (leadSourceRole === 'individual_partner') {
          const partner = await Partner.findById(leadSourceId);
          if (partner && partner.isActive()) {
            const partnerPercentage = loanAmount <= 5000000 ? 80 : 85;
            const commissionAmount = (xotoCommissionFromBank * partnerPercentage) / 100;
            const xotoNetProfit = xotoCommissionFromBank - commissionAmount;
            
            recipientInfo = {
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
        
        // CASE 4: Lead from WEBSITE
        else if (leadSourceRole === 'website') {
          recipientInfo.note = 'Lead from website. No commission paid. Commission retained by Xoto.';
        }
        
        // CASE 5: Lead from ADMIN
        else if (leadSourceRole === 'admin') {
          recipientInfo.note = 'Lead created by Admin (internal). No commission paid.';
        }
        
        // CASE 6: Unknown lead source
        else {
          recipientInfo.note = `Unknown lead source: ${leadSourceRole}. Commission retained by Xoto.`;
        }
      } else {
        recipientInfo.note = 'Lead found but no source info. Commission retained by Xoto.';
      }
    } else {
      recipientInfo.note = 'No lead associated with this case. Commission retained by Xoto.';
    }
    
    return res.status(200).json({
      success: true,
      data: {
        caseId: caseData._id,
        caseReference: caseData.caseReference,
        currentStatus: caseData.currentStatus,
        loanAmount,
        leadInfo: caseData.sourceLeadId ? {
          leadId: caseData.sourceLeadId,
          hasLead: true
        } : {
          hasLead: false
        },
        bankCommission: {
          rate: bankCommissionRate,
          ratePercentage: `${(bankCommissionRate * 100).toFixed(2)}%`,
          source: bankCommissionSource.source,
          calculatedAmount: Math.round(xotoCommissionFromBank)
        },
        recipient: {
          type: recipientInfo.recipientType,
          name: recipientInfo.recipientName,
          percentage: recipientInfo.recipientPercentage,
          commissionAmount: recipientInfo.commissionAmount,
          formula: recipientInfo.calculationFormula
        },
        xoto: {
          grossCommission: Math.round(xotoCommissionFromBank),
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

// ==================== CREATE COMMISSION FROM DISBURSED CASE ====================
export const createCommissionFromCase = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { actualBankCommission, customBankRate, notes } = req.body;
    
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
    
    const loanAmount = caseData.loanInfo?.disbursedAmount || 
                       caseData.loanInfo?.approvedAmount || 
                       caseData.loanInfo?.requestedAmount || 0;
    
    if (loanAmount <= 0) {
      return res.status(400).json({ success: false, message: "No valid loan amount found" });
    }
    
    // Get bank commission information - MUST be provided by Admin
    let bankCommissionRate, xotoCommissionFromBank, bankCommissionSource;
    
    if (actualBankCommission && actualBankCommission > 0) {
      xotoCommissionFromBank = actualBankCommission;
      bankCommissionRate = xotoCommissionFromBank / loanAmount;
      bankCommissionSource = { source: 'admin_manual', rate: bankCommissionRate };
    } else if (customBankRate && customBankRate > 0) {
      bankCommissionRate = customBankRate / 100;
      xotoCommissionFromBank = loanAmount * bankCommissionRate;
      bankCommissionSource = { source: 'admin_custom_rate', rate: bankCommissionRate };
    } else {
      // Try to get from bank product
      const bankRateInfo = await getBankCommissionRate(caseData);
      
      if (bankRateInfo.rate) {
        bankCommissionRate = bankRateInfo.rate;
        xotoCommissionFromBank = loanAmount * bankCommissionRate;
        bankCommissionSource = bankRateInfo;
      } else {
        return res.status(400).json({
          success: false,
          message: "Bank commission rate not configured. Please provide actualBankCommission or customBankRate.",
          requiredFields: {
            actualBankCommission: "Enter exact commission amount received from bank (in AED)",
            customBankRate: "Enter commission rate percentage (e.g., 1.0 for 1%)"
          }
        });
      }
    }
    
    // Update case with bank commission rate
    caseData.loanInfo.bankCommissionRate = bankCommissionRate;
    caseData.loanInfo.bankCommissionAmount = Math.round(xotoCommissionFromBank);
    await caseData.save();
    
    // Determine recipient
    const recipientInfo = await determineRecipient(caseData, xotoCommissionFromBank);
    
    // Create commission record
    const commissionId = `COM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const commission = await Commission.create({
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
      bankCommissionToXoto: Math.round(xotoCommissionFromBank),
      bankCommissionRate: bankCommissionRate,
      recipientPercentage: recipientInfo.recipientPercentage,
      commissionAmount: recipientInfo.commissionAmount,
      calculationFormula: recipientInfo.calculationFormula,
      disbursedAt: new Date(),
      status: 'Pending',
      createdBy: { role: 'admin', adminId: req.user._id },
      notes: notes || `Commission created manually by Admin. Bank rate: ${(bankCommissionRate * 100).toFixed(2)}%`
    });
    
    // Update case commission info
    caseData.commissionInfo = {
      loanAmount,
      loanTier: loanAmount <= 5000000 ? '≤5M AED' : '>5M AED',
      partnerPercentage: recipientInfo.recipientPercentage,
      xotoCommissionFromBank: Math.round(xotoCommissionFromBank),
      partnerCommissionAmount: recipientInfo.commissionAmount,
      calculation: recipientInfo.calculationFormula,
      status: 'Pending Disbursement',
      bankCommissionRate: bankCommissionRate,
      createdAt: new Date()
    };
    await caseData.save();
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_CREATED_MANUALLY', await getUserInfo(req), {
      description: `Commission ${commissionId} manually created for case ${caseData.caseReference}`,
      metadata: { loanAmount, bankCommission: xotoCommissionFromBank, bankRate: bankCommissionRate, recipientPercentage: recipientInfo.recipientPercentage }
    });
    
    return res.status(201).json({
      success: true,
      message: "Commission created successfully",
      data: {
        commission,
        summary: {
          loanAmount: commission.loanAmount,
          bankCommission: commission.bankCommissionToXoto,
          bankCommissionRate: `${(bankCommissionRate * 100).toFixed(2)}%`,
          recipientType: recipientInfo.recipientType,
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

// ==================== CREATE COMMISSION (Auto - Original) ====================
export const createCommission = async (req, res) => {
  try {
    const { caseId } = req.body;
    const caseData = await Case.findOne({ _id: caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    if (caseData.currentStatus !== 'Disbursed') return res.status(400).json({ success: false, message: "Case not disbursed" });
    if (caseData.commissionInfo) return res.status(400).json({ success: false, message: "Commission already created" });
    
    const loanAmount = caseData.loanInfo?.approvedAmount || caseData.loanInfo?.requestedAmount;
    
    // Try to get bank commission rate from bank product
    const bankRateInfo = await getBankCommissionRate(caseData);
    
    let bankCommissionToXoto;
    let bankCommissionRate;
    let requiresManualInput = false;
    
    if (bankRateInfo.rate) {
      bankCommissionRate = bankRateInfo.rate;
      bankCommissionToXoto = loanAmount * bankCommissionRate;
    } else {
      // Auto commission requires rate from bank product
      return res.status(400).json({
        success: false,
        message: "Auto commission requires bank commission rate configured in bank product. Please use manual commission creation.",
        suggestion: "Use POST /admin/create-from-case/:caseId with customBankRate or actualBankCommission"
      });
    }
    
    const recipientInfo = await determineRecipient(caseData, bankCommissionToXoto);
    
    const commissionId = `COM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const commission = await Commission.create({
      commissionId, caseId: caseData._id, caseReference: caseData.caseReference,
      leadId: caseData.sourceLeadId, proposalId: caseData.proposalId,
      customerName: caseData.clientInfo?.fullName,
      recipientRole: recipientInfo.recipientType,
      recipientId: recipientInfo.recipientId,
      recipientModel: recipientInfo.recipientType === 'partner' ? 'Partner' : 'VaultAgent',
      recipientName: recipientInfo.recipientName,
      loanAmount, loanTier: Commission.getLoanTier(loanAmount),
      bankCommissionToXoto: Math.round(bankCommissionToXoto),
      bankCommissionRate: bankCommissionRate,
      recipientPercentage: recipientInfo.recipientPercentage,
      commissionAmount: recipientInfo.commissionAmount,
      calculationFormula: recipientInfo.calculationFormula,
      disbursedAt: new Date(), status: 'Pending',
      createdBy: { role: 'system' }
    });
    
    caseData.commissionInfo = {
      loanAmount, loanTier: commission.loanTier,
      partnerPercentage: recipientInfo.recipientPercentage,
      xotoCommissionFromBank: Math.round(bankCommissionToXoto),
      partnerCommissionAmount: recipientInfo.commissionAmount,
      calculation: recipientInfo.calculationFormula,
      status: 'Pending Disbursement'
    };
    await caseData.save();
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_CREATED', await getUserInfo(req), {
      description: `Commission ${commissionId} created for ${commission.recipientName}`
    });
    
    return res.status(201).json({ success: true, message: "Commission created", data: commission });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== CONFIRM COMMISSION ====================
export const confirmCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualBankCommission, notes } = req.body;
    
    const commission = await Commission.findOne({ _id: id });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    
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
      caseData.commissionInfo.partnerCommissionAmount = commission.commissionAmount;
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
        partnerCommission: commission.commissionAmount
      }
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== MARK COMMISSION AS PAID ====================
export const markCommissionAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentMethod } = req.body;
    
    const commission = await Commission.findOne({ _id: id });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    
    commission.status = 'Paid';
    commission.paymentReference = paymentReference;
    commission.paymentMethod = paymentMethod || 'Bank Transfer';
    commission.paymentSentAt = new Date();
    commission.paymentCompletedAt = new Date();
    await commission.save();
    
    await commission.updateRecipientEarnings();
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_PAID', await getUserInfo(req), {
      description: `Commission ${commission.commissionId} paid`,
      metadata: { paymentReference }
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

// ==================== GET MY COMMISSIONS ====================
export const getMyCommissions = async (req, res) => {
  try {
    const userId = req.user._id;
    const roleId = req.user.role;
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(roleId);
    
    let query = { isDeleted: false };
    if (roleDoc.code === '21') query = { recipientRole: 'partner', recipientId: userId };
    else if (req.user.agentType === 'FreelanceAgent') query = { recipientRole: 'freelance_agent', recipientId: userId };
    else return res.status(403).json({ success: false, message: "Access denied" });
    
    const commissions = await Commission.find(query).sort({ createdAt: -1 });
    const summary = {
      totalEarned: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0),
      pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0),
      totalCount: commissions.length,
      paidCount: commissions.filter(c => c.status === 'Paid').length,
      pendingCount: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).length
    };
    
    return res.status(200).json({ success: true, summary, data: commissions });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET PARTNER COMMISSIONS ====================
export const getPartnerCommissions = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const commissions = await Commission.find({ recipientId: partnerId, recipientRole: 'partner', isDeleted: false }).sort({ createdAt: -1 });
    
    const summary = {
      totalEarned: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0),
      pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0),
      totalCount: commissions.length
    };
    
    return res.status(200).json({ success: true, summary, data: commissions });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET ALL COMMISSIONS (Admin) ====================
export const adminGetAllCommissions = async (req, res) => {
  try {
    const { status, role, page = 1, limit = 20 } = req.query;
    let query = { isDeleted: false };
    if (status) query.status = status;
    if (role) query.recipientRole = role;
    
    const commissions = await Commission.find(query)
      .populate('caseId', 'caseReference currentStatus')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Commission.countDocuments(query);
    
    const summary = {
      totalCommission: commissions.reduce((s, c) => s + c.commissionAmount, 0),
      totalBankCommission: commissions.reduce((s, c) => s + c.bankCommissionToXoto, 0),
      pendingAmount: commissions.filter(c => c.status === 'Pending').reduce((s, c) => s + c.commissionAmount, 0),
      confirmedAmount: commissions.filter(c => c.status === 'Confirmed').reduce((s, c) => s + c.commissionAmount, 0),
      paidAmount: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0)
    };
    
    return res.status(200).json({
      success: true,
      summary,
      data: commissions,
      total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit: parseInt(limit) }
    });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET COMMISSION BY ID ====================
export const getCommissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const commission = await Commission.findOne({ _id: id, isDeleted: false })
      .populate('caseId', 'caseReference currentStatus clientInfo');
    
    if (!commission) {
      return res.status(404).json({ success: false, message: "Commission not found" });
    }
    
    return res.status(200).json({ success: true, data: commission });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

