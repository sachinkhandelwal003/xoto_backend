import Lead from '../models/VaultLead.js';
import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import VaultAdvisor from '../models/XotoAdvisor.js';
import Customer from '../../../modules/auth/models/user/customer.model.js';
import HistoryService from '../services/history.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import xlsx from 'xlsx';
import path from 'path';

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
const getUserInfo = async (req) => {
  let userRole = 'System';
  try {
    const doc = await Role.findById(req.user?.role);
    const code = doc?.code;
    if (code === '18') userRole = 'Admin';
    else if (code === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent') userRole = 'ReferralPartner';
    else if (req.user?.agentType === 'PartnerAffiliatedAgent') userRole = 'PartnerAffiliatedAgent';
    else if (req.user?.employeeType === 'XotoAdvisor') userRole = 'XotoAdvisor';
  } catch (_) {}
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.fullName || req.user?.name?.first_name || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

const createOrGetCustomer = async (lead) => {
  try {
    const { firstName, lastName, email, mobileNumber, countryCode, nationality, dateOfBirth } = lead.customerInfo;
    const orConds = [];
    if (email) orConds.push({ email: email.toLowerCase() });
    if (mobileNumber) orConds.push({ 'mobile.number': mobileNumber.replace(/^\+971/, '') });
    if (!orConds.length) return null;
    
    let customer = await Customer.findOne({ $or: orConds, is_deleted: false });
    if (!customer) {
      const roleDoc = await Role.findOne({ name: 'Customer' });
      customer = await Customer.create({
        name: { first_name: firstName || '', last_name: lastName || '' },
        email: email ? email.toLowerCase() : `${mobileNumber}@vault.xoto.ae`,
        mobile: { country_code: countryCode || '+971', number: mobileNumber.replace(/^\+971/, '') },
        dateOfBirth: dateOfBirth || null,
        nationality: nationality || null,
        role: roleDoc?._id,
        source: 'vault',
        isActive: true,
      });
      return { _id: customer._id, message: 'Customer created' };
    }
    return { _id: customer._id, message: 'Existing customer linked' };
  } catch (e) {
    console.error('createOrGetCustomer:', e);
    return null;
  }
};

const getNextActions = (status) => {
  const map = {
    'Assigned': ['Contact customer within 4 hours'],
    'Contacted': ['Run eligibility check', 'Mark Qualified if eligible'],
    'Qualified': ['Start collecting documents from customer'],
    'Collecting Documents': ['Collect documents — upload in Application'],
  };
  return map[status] || ['Update lead notes'];
};

const buildCustomerInfo = (c) => {
  let nationality = c.nationality || null;
  if (c.residencyStatus === 'UAE National' && !nationality) nationality = 'UAE';
  return {
    firstName: c.firstName || '',
    lastName: c.lastName || '',
    countryCode: c.countryCode || '+971',
    mobileNumber: c.mobileNumber,
    email: c.email || null,
    nationality,
    residencyStatus: c.residencyStatus || null,
    employmentStatus: c.employmentStatus || null,
    monthlySalary: c.monthlySalary || null,
    existingMonthlyLiabilities: c.existingMonthlyLiabilities || 0,
    dateOfBirth: c.dateOfBirth || null,
  };
};

const buildPropertyDetails = (p) => {
  if (!p) return {};
  return {
    transactionType: p.transactionType || null,
    propertyFound: p.propertyFound ?? null,
    approxPropertyValue: p.approxPropertyValue || null,
    propertyValue: p.propertyValue || null,
    downPaymentAmount: p.downPaymentAmount || null,
    loanAmountRequired: p.loanAmountRequired || null,
    propertyAddress: {
      area: p.propertyAddress?.area || null,
      city: p.propertyAddress?.city || 'Dubai',
    },
  };
};

const buildLoanRequirements = (l) => {
  if (!l) return {};
  return {
    timeline: l.timeline || null,
    preferredTenureYears: l.preferredTenureYears || 25,
    preferredInterestRateType: l.preferredInterestRateType || 'Fixed',
    feeFinancingPreference: l.feeFinancingPreference ?? true,
  };
};

// ══════════════════════════════════════════════════════════════════
// 1. CREATE LEAD — Referral Partner (FreelanceAgent)
// ══════════════════════════════════════════════════════════════════
export const createLead = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id);
    if (!agent || !agent.isActiveAgent())
      return res.status(403).json({ success: false, message: 'Agent account not active' });
    
    if (agent.agentType === 'FreelanceAgent' && !agent.isVerified)
      return res.status(403).json({ success: false, message: 'Account not verified by admin' });

    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    // Required fields validation
    if (!customerInfo?.firstName || !customerInfo?.lastName || !customerInfo?.mobileNumber)
      return res.status(400).json({ success: false, message: 'firstName, lastName and mobileNumber are required' });
    if (!customerInfo?.residencyStatus)
      return res.status(400).json({ success: false, message: 'residencyStatus is required' });
    if (!customerInfo?.employmentStatus)
      return res.status(400).json({ success: false, message: 'employmentStatus is required' });
    if (!propertyDetails?.transactionType)
      return res.status(400).json({ success: false, message: 'transactionType is required' });
    if (propertyDetails?.propertyFound === undefined)
      return res.status(400).json({ success: false, message: 'propertyFound is required' });
    if (!loanRequirements?.timeline)
      return res.status(400).json({ success: false, message: 'timeline is required' });

    if (!/^[0-9]{9,15}$/.test(customerInfo.mobileNumber.replace(/\s/g, '')))
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });

    // Duplicate check
    const duplicate = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      currentStatus: { $nin: ['Lost', 'Disbursed'] },
      isDeleted: false,
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 3600 * 1000) },
    });
    if (duplicate)
      return res.status(400).json({ success: false, message: "This customer's application is currently open with Xoto." });

    const lead = await Lead.create({
      sourceInfo: {
        source: agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdByRole: agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdById: agent._id,
        createdByModel: 'VaultAgent',
        createdByName: `${agent.name.first_name} ${agent.name.last_name}`,
        submissionMethod: 'manual_entry',
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
      },
      customerInfo: buildCustomerInfo(customerInfo),
      propertyDetails: buildPropertyDetails(propertyDetails),
      loanRequirements: buildLoanRequirements(loanRequirements),
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });

    await agent.updateOne({ $inc: { 'earnings.totalLeadsSubmitted': 1 } });
    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED', await getUserInfo(req), {
      description: `Lead created for ${customerInfo.firstName} ${customerInfo.lastName}`,
    });

    return res.status(201).json({
      success: true,
      message: agent.agentType === 'FreelanceAgent'
        ? 'Lead submitted. Awaiting admin assignment.'
        : 'Lead created. Your partner can view this.',
      data: lead,
    });
  } catch (err) {
    console.error('createLead:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 2. CREATE WEBSITE LEAD — Public (Mortgage Calculator)
// ══════════════════════════════════════════════════════════════════
export const createWebsiteLead = async (req, res) => {
  try {
    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    if (!customerInfo?.firstName || !customerInfo?.lastName || !customerInfo?.mobileNumber)
      return res.status(400).json({ success: false, message: 'firstName, lastName and mobileNumber are required' });

    const dup = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      'sourceInfo.source': 'website',
      isDeleted: false,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    });
    if (dup)
      return res.status(400).json({ success: false, message: 'Already submitted. Our team will contact you soon.' });

    const lead = await Lead.create({
      sourceInfo: {
        source: 'website', 
        createdByRole: 'website',
        createdByName: 'Website Visitor',
        submissionMethod: 'website_form',
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
      },
      customerInfo: buildCustomerInfo(customerInfo),
      propertyDetails: buildPropertyDetails(propertyDetails),
      loanRequirements: buildLoanRequirements(loanRequirements),
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });

    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED_FROM_WEBSITE', await getUserInfo(req), {
      description: `Website lead: ${customerInfo.firstName} ${customerInfo.lastName}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you! Our advisor will contact you within 24 hours.',
      data: { leadId: lead._id },
    });
  } catch (err) {
    console.error('createWebsiteLead:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 3. CALCULATE ELIGIBILITY — Simple DBR check (Same as Calculator)
//    Uses same DBR logic as Mortgage Calculator (DSR = 50%)
// ══════════════════════════════════════════════════════════════════
// In lead.controller.js - calculateLeadEligibility function

export const calculateLeadEligibility = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { 
      monthlySalary, 
      existingMonthlyLiabilities,
      propertyValue,
      downpayment,
      loanAmount,
      interestRate,
      tenureYears 
    } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    
    // Update lead with provided data
    if (monthlySalary !== undefined) lead.customerInfo.monthlySalary = monthlySalary;
    if (existingMonthlyLiabilities !== undefined) lead.customerInfo.existingMonthlyLiabilities = existingMonthlyLiabilities;
    if (propertyValue !== undefined) lead.propertyDetails.propertyValue = propertyValue;
    if (downpayment !== undefined) lead.propertyDetails.downPaymentAmount = downpayment;
    if (loanAmount !== undefined) lead.propertyDetails.loanAmountRequired = loanAmount;
    if (tenureYears !== undefined) lead.loanRequirements.preferredTenureYears = tenureYears;
    await lead.save();

    // Get values
    const salary = lead.customerInfo.monthlySalary || 0;
    const liabilities = lead.customerInfo.existingMonthlyLiabilities || 0;
    const residencyStatus = lead.customerInfo.residencyStatus;
    const propValue = lead.propertyDetails.propertyValue || 0;
    const loanAmt = lead.propertyDetails.loanAmountRequired || 0;
    const tenure = lead.loanRequirements.preferredTenureYears || 25;
    const rate = interestRate || 4.19;

    // DBR Calculation
    const maxDBR = residencyStatus === 'UAE National' ? 55 : 50;
    const maxAllowedDebt = (salary * maxDBR) / 100;
    const currentDBR = salary > 0 ? (liabilities / salary) * 100 : 0;
    const availableForMortgage = maxAllowedDebt - liabilities;
    const dbrEligible = availableForMortgage > 0;

    // EMI Calculation
    const calculateEMI = (principal, annualRate, years) => {
      if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
      const r = annualRate / 100 / 12;
      const n = years * 12;
      return Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
    };
    const calculatedEMI = calculateEMI(loanAmt, rate, tenure);
    const emiEligible = calculatedEMI <= availableForMortgage;

    // LTV Calculation
    const ltv = propValue > 0 ? (loanAmt / propValue) * 100 : 0;
    const ltvEligible = ltv <= 80;

    // Final Eligibility
    const isEligible = dbrEligible && emiEligible && ltvEligible;

    // Calculate eligibility score (0-100)
    let eligibilityScore = 0;
    let riskGrade = "Good";
    
    if (isEligible) {
      // Score based on DBR (lower is better)
      if (currentDBR <= 30) eligibilityScore = 90;
      else if (currentDBR <= 40) eligibilityScore = 75;
      else if (currentDBR <= 50) eligibilityScore = 60;
      else eligibilityScore = 50;
      
      // Adjust for LTV (lower is better)
      if (ltv <= 60) eligibilityScore += 5;
      else if (ltv <= 70) eligibilityScore += 3;
      else if (ltv <= 80) eligibilityScore += 0;
      
      // Risk grade
      if (eligibilityScore >= 80) riskGrade = "Excellent";
      else if (eligibilityScore >= 60) riskGrade = "Good";
      else if (eligibilityScore >= 40) riskGrade = "Average";
      else riskGrade = "Risky";
    } else {
      eligibilityScore = Math.max(0, Math.min(40, Math.round((availableForMortgage / salary) * 100)));
      riskGrade = "Risky";
    }

    // ✅ STORE ALL VALUES in lead eligibility
    lead.eligibility = {
      checked: true,
      isEligible: isEligible,
      checkedAt: new Date(),
      checkedBy: req.user._id,
      eligibilityScore: Math.round(eligibilityScore),
      riskGrade: riskGrade,
      dbrPercentage: Math.round(currentDBR),
      dbrStatus: dbrEligible ? 'Eligible' : 'Ineligible',
      estimatedLTV: Math.round(ltv),
      recommendedLoanAmount: Math.round(availableForMortgage * 12 * tenure),
      eligibilityNotes: isEligible 
        ? `Customer eligible. DBR: ${Math.round(currentDBR)}%, LTV: ${Math.round(ltv)}%, EMI: AED ${calculatedEMI}`
        : `Customer not eligible. ${!dbrEligible ? `DBR exceeds ${maxDBR}% limit` : ''} ${!emiEligible ? `EMI exceeds available capacity` : ''} ${!ltvEligible ? `LTV exceeds 80% limit` : ''}`,
    };
    await lead.save();

    return res.status(200).json({
      success: true,
      message: isEligible ? 'Customer is ELIGIBLE. Mark lead as Qualified.' : 'Customer is NOT ELIGIBLE.',
      data: {
        isEligible,
        eligibilityScore: Math.round(eligibilityScore),
        riskGrade,
        dbrPercentage: Math.round(currentDBR),
        dbrStatus: dbrEligible ? 'Eligible' : 'Ineligible',
        estimatedLTV: Math.round(ltv),
        recommendedLoanAmount: Math.round(availableForMortgage * 12 * tenure),
        proposedEMI: calculatedEMI,
        maxAllowedDBR: maxDBR,
        eligibilityNotes: lead.eligibility.eligibilityNotes,
        checks: {
          dbr: {
            eligible: dbrEligible,
            monthlySalary: salary,
            existingLiabilities: liabilities,
            maxDSR: `${maxDBR}%`,
            maxAllowedDebt: maxAllowedDebt,
            availableForMortgage: availableForMortgage,
            current: Math.round(currentDBR)
          },
          emi: {
            eligible: emiEligible,
            loanAmount: loanAmt,
            interestRate: `${rate}%`,
            loanTenure: `${tenure} years`,
            calculatedEMI: calculatedEMI
          },
          ltv: {
            eligible: ltvEligible,
            propertyValue: propValue,
            downpayment: downpayment || 0,
            loanAmount: loanAmt,
            ltvPercentage: `${Math.round(ltv)}%`,
            maxLTV: '80%'
          }
        },
        nextActions: isEligible
          ? ['Mark lead as Qualified', 'Start collecting documents']
          : ['Review eligibility issues', 'Adjust loan amount or downpayment'],
      },
    });
  } catch (err) {
    console.error('calculateLeadEligibility:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 4. GET ELIGIBILITY — Return only isEligible flag
// ══════════════════════════════════════════════════════════════════
export const getLeadEligibility = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    
    return res.status(200).json({
      success: true,
      data: {
        checked: lead.eligibility?.checked || false,
        isEligible: lead.eligibility?.isEligible || false,
        checkedAt: lead.eligibility?.checkedAt || null,
        notes: lead.eligibility?.notes || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 5. GET MY LEADS — Agent
// ══════════════════════════════════════════════════════════════════
export const getMyLeads = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { 'sourceInfo.createdById': req.user._id, isDeleted: false };
    if (status) query.currentStatus = status;
    
    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);
    
    return res.status(200).json({
      success: true, data: leads, total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 6. GET LEAD BY ID
// ══════════════════════════════════════════════════════════════════
export const getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 7. GET PARTNER LEADS
// ══════════════════════════════════════════════════════════════════
export const getPartnerLeads = async (req, res) => {
  try {
    const partner = await Partner.findById(req.user._id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    
    let leads = [];
    if (partner.partnerCategory === 'company') {
      const agents = await VaultAgent.find({ partnerId: partner._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false });
      if (agents.length)
        leads = await Lead.find({ 'sourceInfo.createdById': { $in: agents.map(a => a._id) }, isDeleted: false }).sort({ createdAt: -1 });
    } else {
      leads = await Lead.find({
        'sourceInfo.createdById': partner._id,
        'sourceInfo.createdByModel': 'Partner',
        isDeleted: false,
      }).sort({ createdAt: -1 });
    }
    return res.status(200).json({ success: true, data: leads, total: leads.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 8. ADMIN — GET ALL LEADS
// ══════════════════════════════════════════════════════════════════
export const adminGetAllLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const { status, source, assigned, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false };

    if (status) query.currentStatus = status;
    if (source) query['sourceInfo.source'] = source;
    if (assigned === 'true') query['assignedTo.advisorId'] = { $ne: null };
    if (assigned === 'false') query['assignedTo.advisorId'] = null;

    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true, data: leads, total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 9. ADMIN — GET UNASSIGNED LEADS
// ══════════════════════════════════════════════════════════════════
export const getUnassignedLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') return res.status(403).json({ success: false, message: 'Admin only' });
    
    const query = { isDeleted: false, currentStatus: 'New', 'assignedTo.advisorId': null };
    const leads = await Lead.find(query).sort({ createdAt: 1 });
    
    return res.status(200).json({ success: true, data: leads, total: leads.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 10. ADMIN — ASSIGN LEAD TO ADVISOR
// ══════════════════════════════════════════════════════════════════
export const assignLeadToXotoAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const { leadIds, advisorId } = req.body;
    if (!Array.isArray(leadIds) || !leadIds.length || !advisorId)
      return res.status(400).json({ success: false, message: 'leadIds array and advisorId required' });

    const advisor = await VaultAdvisor.findById(advisorId);
    if (!advisor || !advisor.isActiveAdvisor())
      return res.status(404).json({ success: false, message: 'Advisor not found or inactive' });

    const assignedAt = new Date();
    const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

    await Lead.updateMany(
      { _id: { $in: leadIds } },
      {
        $set: {
          assignedTo: { advisorId: advisor._id, advisorName: advisor.fullName, assignedAt, assignedBy: req.user._id },
          sla: { deadline: slaDeadline, breached: false },
          currentStatus: 'Assigned',
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: `${leadIds.length} lead(s) assigned to ${advisor.fullName}`,
      data: { assignedLeadCount: leadIds.length, slaDeadline },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 11. ADVISOR — GET ASSIGNED LEADS
// ══════════════════════════════════════════════════════════════════
export const getAdvisorAssignedLeads = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false, 'assignedTo.advisorId': req.user._id };
    if (status) query.currentStatus = status;

    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);

    const base = { isDeleted: false, 'assignedTo.advisorId': req.user._id };
    const summary = {
      total: await Lead.countDocuments(base),
      assigned: await Lead.countDocuments({ ...base, currentStatus: 'Assigned' }),
      contacted: await Lead.countDocuments({ ...base, currentStatus: 'Contacted' }),
      qualified: await Lead.countDocuments({ ...base, currentStatus: 'Qualified' }),
      collectingDocs: await Lead.countDocuments({ ...base, currentStatus: 'Collecting Documents' }),
    };

    return res.status(200).json({ success: true, data: leads, total, summary });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 12. ADVISOR — UPDATE LEAD STATUS
// ══════════════════════════════════════════════════════════════════
export const advisorUpdateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes } = req.body;

    const lead = await Lead.findOne({ _id: leadId, 'assignedTo.advisorId': req.user._id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found or not assigned to you' });

    const allowed = ['Assigned', 'Contacted', 'Qualified', 'Collecting Documents', 'Lost'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });

    const prevStatus = lead.currentStatus;
    lead.currentStatus = status;
    if (notes) lead.notesToXoto = notes;

    if (status === 'Contacted') {
      lead.sla.firstContactAt = new Date();
      const hrs = (lead.sla.firstContactAt - new Date(lead.assignedTo?.assignedAt || lead.createdAt)) / 3600000;
      lead.sla.responseTimeHours = Math.round(hrs * 10) / 10;
    }

    if (status === 'Qualified') {
      if (!lead.eligibility?.checked)
        return res.status(400).json({ success: false, message: 'Cannot qualify: Run eligibility check first.' });
      if (!lead.eligibility?.isEligible)
        return res.status(400).json({ success: false, message: 'Cannot qualify: Customer is not eligible.' });
      
      lead.sla.qualificationAt = new Date();
      const customer = await createOrGetCustomer(lead);
      if (customer) lead.customerId = customer._id;
    }

    await lead.save();
    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `${prevStatus} → ${status}`,
    });

    return res.status(200).json({
      success: true,
      message: 'Lead status updated',
      data: { leadId: lead._id, previousStatus: prevStatus, currentStatus: status },
      nextActions: getNextActions(status),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 13. ADVISOR — UPDATE LEAD INFO
// ══════════════════════════════════════════════════════════════════
export const advisorUpdateLeadInfo = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { customerInfo, propertyDetails, loanRequirements } = req.body;

    const lead = await Lead.findOne({ _id: leadId, 'assignedTo.advisorId': req.user._id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (customerInfo) {
      Object.keys(customerInfo).forEach(key => {
        if (customerInfo[key] !== undefined) lead.customerInfo[key] = customerInfo[key];
      });
    }
    if (propertyDetails) {
      Object.keys(propertyDetails).forEach(key => {
        if (propertyDetails[key] !== undefined) lead.propertyDetails[key] = propertyDetails[key];
      });
    }
    if (loanRequirements) {
      Object.keys(loanRequirements).forEach(key => {
        if (loanRequirements[key] !== undefined) lead.loanRequirements[key] = loanRequirements[key];
      });
    }

    await lead.save();
    return res.status(200).json({ success: true, message: 'Lead info updated', data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 14. ADMIN — UPDATE LEAD STATUS
// ══════════════════════════════════════════════════════════════════
export const updateLeadStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const lead = await Lead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const valid = ['New', 'Assigned', 'Contacted', 'Qualified', 'Collecting Documents', 'Bank Application', 'Pre-Approved', 'Valuation', 'FOL Processed', 'FOL Issued', 'FOL Signed', 'Disbursed', 'Lost'];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    lead.currentStatus = status;
    if (notes) lead.notesToXoto = notes;
    await lead.save();

    return res.status(200).json({ success: true, message: 'Status updated', data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 15. CREATE PARTNER LEAD
// ══════════════════════════════════════════════════════════════════
export const createPartnerLead = async (req, res) => {
  try {
    const partner = await Partner.findById(req.user._id);
    if (!partner || !partner.isActive())
      return res.status(403).json({ success: false, message: 'Partner account not active' });

    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    if (!customerInfo?.firstName || !customerInfo?.lastName || !customerInfo?.mobileNumber)
      return res.status(400).json({ success: false, message: 'firstName, lastName and mobileNumber required' });

    const lead = await Lead.create({
      sourceInfo: {
        source: 'individual_partner',
        createdByRole: 'individual_partner',
        createdById: partner._id,
        createdByModel: 'Partner',
        createdByName: partner.displayName || partner.companyName,
        submissionMethod: 'manual_entry',
      },
      customerInfo: buildCustomerInfo(customerInfo),
      propertyDetails: buildPropertyDetails(propertyDetails),
      loanRequirements: buildLoanRequirements(loanRequirements),
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
    });

    return res.status(201).json({ success: true, message: 'Lead created', data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};