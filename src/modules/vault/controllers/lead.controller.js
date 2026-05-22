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
    if (!partner.isActive()) return res.status(403).json({ success: false, message: 'Partner account not active' });

    const { status, page = 1, limit = 10 } = req.query;
    
    // Build base query
    let query = { isDeleted: false };
    
    if (partner.partnerCategory === 'company') {
      const agents = await VaultAgent.find({ 
        partnerId: partner._id, 
        agentType: 'PartnerAffiliatedAgent', 
        isDeleted: false 
      });
      const agentIds = agents.map(a => a._id);
      query['sourceInfo.createdById'] = { $in: [...agentIds, partner._id] };
    } else {
      query['sourceInfo.createdById'] = partner._id;
      query['sourceInfo.createdByModel'] = 'Partner';
    }

    // Apply status filter
    if (status) query.currentStatus = status;

    // Execute query with pagination
    const [leads, total] = await Promise.all([
      Lead.find(query)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      total,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 8. ADMIN — GET ALL LEADS
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// ADMIN — GET ALL LEADS (Only Website, Freelance Agent, and Admin Sources)
// GET /admin/all?status=xxx&assigned=true&page=1&limit=10
// ══════════════════════════════════════════════════════════════════
export const adminGetAllLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { 
      status, 
      assigned, 
      page = 1, 
      limit = 10,
      search,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Only include leads from sources that need Xoto advisor management
    const query = { 
      isDeleted: false,
      'sourceInfo.source': { 
        $in: ['website', 'freelance_agent', 'admin'] 
      }
    };

    // Status filter
    if (status) {
      if (status.includes(',')) {
        query.currentStatus = { $in: status.split(',') };
      } else {
        query.currentStatus = status;
      }
    }

    // Assignment filter
    if (assigned === 'true') {
      query['assignedTo.advisorId'] = { $ne: null };
    } else if (assigned === 'false') {
      query['assignedTo.advisorId'] = null;
    }

    // Search filter
    if (search) {
      query.$or = [
        { 'customerInfo.firstName': { $regex: search, $options: 'i' } },
        { 'customerInfo.lastName': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { 'customerInfo.mobileNumber': { $regex: search, $options: 'i' } },
        { 'sourceInfo.createdByName': { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // ✅ Get leads WITHOUT problematic populate
    const leads = await Lead.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const total = await Lead.countDocuments(query);

    // ✅ Manually enrich leads with creator and advisor info
    const enrichedLeads = await Promise.all(leads.map(async (lead) => {
      const enriched = { ...lead };
      
      // Enrich assignedTo advisor info
      if (lead.assignedTo?.advisorId) {
        try {
          const advisor = await VaultAdvisor.findById(lead.assignedTo.advisorId)
            .select('fullName firstName lastName email')
            .lean();
          if (advisor) {
            enriched.assignedTo = {
              ...lead.assignedTo,
              advisorDetails: {
                fullName: advisor.fullName || `${advisor.firstName || ''} ${advisor.lastName || ''}`.trim(),
                email: advisor.email
              }
            };
          }
        } catch (err) {
          console.error(`Error fetching advisor for lead ${lead._id}:`, err.message);
        }
      }
      
      // Enrich sourceInfo creator info based on model type
      if (lead.sourceInfo?.createdById && lead.sourceInfo?.createdByModel) {
        try {
          if (lead.sourceInfo.createdByModel === 'VaultAgent') {
            const agent = await VaultAgent.findById(lead.sourceInfo.createdById)
              .select('name firstName lastName email agentType')
              .lean();
            if (agent) {
              enriched.sourceInfo = {
                ...lead.sourceInfo,
                creatorDetails: {
                  type: 'agent',
                  name: agent.name ? `${agent.name.first_name} ${agent.name.last_name}` : agent.firstName,
                  email: agent.email,
                  agentType: agent.agentType
                }
              };
            }
          } else if (lead.sourceInfo.createdByModel === 'Partner') {
            const partner = await Partner.findById(lead.sourceInfo.createdById)
              .select('companyName dbaName partnerCategory')
              .lean();
            if (partner) {
              enriched.sourceInfo = {
                ...lead.sourceInfo,
                creatorDetails: {
                  type: 'partner',
                  name: partner.companyName || partner.dbaName,
                  category: partner.partnerCategory
                }
              };
            }
          } else if (lead.sourceInfo.createdByModel === 'Admin') {
            // Admin model - use stored name
            enriched.sourceInfo = {
              ...lead.sourceInfo,
              creatorDetails: {
                type: 'admin',
                name: lead.sourceInfo.createdByName || 'Admin'
              }
            };
          }
        } catch (err) {
          console.error(`Error fetching creator for lead ${lead._id}:`, err.message);
          enriched.sourceInfo = {
            ...lead.sourceInfo,
            creatorDetails: {
              type: lead.sourceInfo.createdByModel,
              name: lead.sourceInfo.createdByName || 'Unknown'
            }
          };
        }
      }
      
      return enriched;
    }));

    // Get summary statistics
    const summary = {
      totalLeads: total,
      byStatus: {
        new: await Lead.countDocuments({ ...query, currentStatus: 'New' }),
        assigned: await Lead.countDocuments({ ...query, currentStatus: 'Assigned' }),
        contacted: await Lead.countDocuments({ ...query, currentStatus: 'Contacted' }),
        qualified: await Lead.countDocuments({ ...query, currentStatus: 'Qualified' }),
        collectingDocs: await Lead.countDocuments({ ...query, currentStatus: 'Collecting Documents' }),
        documentsComplete: await Lead.countDocuments({ ...query, currentStatus: 'Documents Complete' }),
        applicationOpened: await Lead.countDocuments({ ...query, currentStatus: 'Application Opened' }),
        notProceeding: await Lead.countDocuments({ ...query, currentStatus: 'Not Proceeding' })
      },
      bySource: {
        website: await Lead.countDocuments({ ...query, 'sourceInfo.source': 'website' }),
        freelance_agent: await Lead.countDocuments({ ...query, 'sourceInfo.source': 'freelance_agent' }),
        admin: await Lead.countDocuments({ ...query, 'sourceInfo.source': 'admin' })
      },
      assignment: {
        assigned: await Lead.countDocuments({ ...query, 'assignedTo.advisorId': { $ne: null } }),
        unassigned: await Lead.countDocuments({ ...query, 'assignedTo.advisorId': null })
      }
    };

    return res.status(200).json({
      success: true, 
      data: enrichedLeads, 
      total,
      summary,
      filters: {
        status: status || null,
        assigned: assigned || null,
        search: search || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        sortBy,
        sortOrder
      },
      pagination: { 
        totalPages: Math.ceil(total / limitNum), 
        currentPage: parseInt(page), 
        limit: limitNum,
        hasNextPage: skip + limitNum < total,
        hasPrevPage: parseInt(page) > 1
      },
    });
  } catch (err) {
    console.error('adminGetAllLeads error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
// ══════════════════════════════════════════════════════════════════
// 9. ADMIN — GET UNASSIGNED LEADS
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// ADMIN — GET UNASSIGNED LEADS (Excludes Partner & Partner-Affiliated)
// GET /admin/unassigned
// ══════════════════════════════════════════════════════════════════
export const getUnassignedLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    
    // Query for unassigned leads that need advisor assignment
    const query = { 
      isDeleted: false, 
      currentStatus: 'New', 
      'assignedTo.advisorId': null,
      'sourceInfo.source': { 
        $in: ['website', 'freelance_agent', 'admin'] 
      }
    };
    
    // Get leads WITHOUT populate
    const leads = await Lead.find(query)
      .sort({ createdAt: 1 })
      .lean();
    
    // Enrich leads with creator info
    const enrichedLeads = await Promise.all(leads.map(async (lead) => {
      const enriched = { ...lead };
      
      if (lead.sourceInfo?.createdById && lead.sourceInfo?.createdByModel) {
        try {
          if (lead.sourceInfo.createdByModel === 'VaultAgent') {
            const agent = await VaultAgent.findById(lead.sourceInfo.createdById)
              .select('name firstName lastName email')
              .lean();
            if (agent) {
              enriched.sourceInfo = {
                ...lead.sourceInfo,
                creatorDetails: {
                  type: 'agent',
                  name: agent.name ? `${agent.name.first_name} ${agent.name.last_name}` : agent.firstName,
                  email: agent.email
                }
              };
            }
          } else if (lead.sourceInfo.createdByModel === 'Partner') {
            const partner = await Partner.findById(lead.sourceInfo.createdById)
              .select('companyName dbaName')
              .lean();
            if (partner) {
              enriched.sourceInfo = {
                ...lead.sourceInfo,
                creatorDetails: {
                  type: 'partner',
                  name: partner.companyName || partner.dbaName
                }
              };
            }
          } else if (lead.sourceInfo.createdByModel === 'Admin') {
            enriched.sourceInfo = {
              ...lead.sourceInfo,
              creatorDetails: {
                type: 'admin',
                name: lead.sourceInfo.createdByName || 'Admin'
              }
            };
          }
        } catch (err) {
          console.error(`Error fetching creator for lead ${lead._id}:`, err.message);
        }
      }
      
      return enriched;
    }));
    
    const totalUnassigned = enrichedLeads.length;
    
    const partnerLeadsCount = await Lead.countDocuments({
      isDeleted: false,
      currentStatus: 'New',
      'assignedTo.advisorId': null,
      'sourceInfo.source': { $in: ['individual_partner', 'partner_affiliated_agent'] }
    });
    
    return res.status(200).json({ 
      success: true, 
      data: enrichedLeads, 
      total: totalUnassigned,
      excludedPartnerLeads: partnerLeadsCount,
      message: `${totalUnassigned} leads need assignment. ${partnerLeadsCount} partner leads are managed separately.`
    });
  } catch (err) {
    console.error('getUnassignedLeads error:', err);
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
export const AdvisororPartnerUpdateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes } = req.body;

    const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
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
// ══════════════════════════════════════════════════════════════════
// ADVISOR OR PARTNER — UPDATE LEAD INFO
// ══════════════════════════════════════════════════════════════════
export const AdvisororPartnerUpdateLeadInfo = async (req, res) => {
  try {
    const { leadId } = req.params;
    let { customerInfo, propertyDetails, loanRequirements } = req.body;

    const lead = await Lead.findOne({ _id: leadId, isDeleted: false });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    // Helper to sanitize empty strings to null
    const sanitize = (obj) => {
      if (!obj) return obj;
      Object.keys(obj).forEach(key => {
        if (obj[key] === '') obj[key] = null;
        if (typeof obj[key] === 'object' && obj[key] !== null) sanitize(obj[key]);
      });
      return obj;
    };

    customerInfo = sanitize(customerInfo);
    propertyDetails = sanitize(propertyDetails);
    loanRequirements = sanitize(loanRequirements);

    // Handle customerInfo - Convert fullName to firstName & lastName if needed
    if (customerInfo) {
      // If fullName is provided but firstName/lastName are not, split it
      if (customerInfo.fullName && !customerInfo.firstName && !customerInfo.lastName) {
        const nameParts = customerInfo.fullName.trim().split(' ');
        customerInfo.firstName = nameParts[0] || '';
        customerInfo.lastName = nameParts.slice(1).join(' ') || '';
        delete customerInfo.fullName; // Remove fullName as it's not in schema
      }

      // Update each field
      Object.keys(customerInfo).forEach(key => {
        if (customerInfo[key] !== undefined && key !== 'fullName') {
          lead.customerInfo[key] = customerInfo[key];
        }
      });
    }

    // Update property details
    if (propertyDetails) {
      Object.keys(propertyDetails).forEach(key => {
        if (propertyDetails[key] !== undefined) {
          if (key === 'propertyAddress' && typeof propertyDetails[key] === 'object') {
            if (!lead.propertyDetails.propertyAddress) {
              lead.propertyDetails.propertyAddress = {};
            }
            Object.keys(propertyDetails[key]).forEach(addrKey => {
              lead.propertyDetails.propertyAddress[addrKey] = propertyDetails[key][addrKey];
            });
          } else {
            lead.propertyDetails[key] = propertyDetails[key];
          }
        }
      });
    }

    // Update loan requirements
    if (loanRequirements) {
      Object.keys(loanRequirements).forEach(key => {
        if (loanRequirements[key] !== undefined) {
          lead.loanRequirements[key] = loanRequirements[key];
        }
      });
    }

    await lead.save();
    
    return res.status(200).json({ 
      success: true, 
      message: 'Lead info updated', 
      data: lead 
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// PARTNER — UPDATE LEAD STATUS (No SLA, No Advisor restrictions)
// PUT /partner/lead/:leadId/status
// ══════════════════════════════════════════════════════════════════
export const partnerUpdateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes, rejectionReason } = req.body;

    // Get partner info
    const partner = await Partner.findById(req.user._id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    if (!partner.isActive()) return res.status(403).json({ success: false, message: 'Partner account not active' });

    // Find lead based on partner category
    let lead;
    if (partner.partnerCategory === 'company') {
      const agents = await VaultAgent.find({ 
        partnerId: partner._id, 
        agentType: 'PartnerAffiliatedAgent', 
        isDeleted: false 
      });
      const agentIds = agents.map(a => a._id);
      lead = await Lead.findOne({
        _id: leadId,
        $or: [
          { 'sourceInfo.createdById': partner._id },
          { 'sourceInfo.createdById': { $in: agentIds } }
        ],
        isDeleted: false,
      });
    } else {
      lead = await Lead.findOne({
        _id: leadId,
        'sourceInfo.createdById': partner._id,
        isDeleted: false,
      });
    }

    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead not found or not authorized' 
      });
    }

    // Partner-specific allowed statuses (Simplified - No SLA)
    const allowedStatuses = [
      'New',                   // Initial status
      'Contacted',             // Partner contacted customer
      'Qualified',             // Customer eligible
      'Collecting Documents',  // Gathering documents
      'Documents Complete',    // All documents received
      'Application Opened',    // Application submitted to bank
      'Pre-Approved',          // Bank pre-approval
      'Valuation',             // Property valuation
      'FOL Issued',            // Formal offer letter issued
      'FOL Signed',            // Customer signed
      'Disbursed',             // Loan disbursed
      'Not Proceeding'         // Lead lost
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` 
      });
    }

    const prevStatus = lead.currentStatus;

    // Validation for Qualified status
    if (status === 'Qualified') {
      // Optional: Check eligibility if data available
      if (lead.customerInfo?.monthlySalary && lead.propertyDetails?.loanAmountRequired) {
        // Basic eligibility check can be added here
        // But partners can qualify without strict eligibility check
      }
      
      // Create customer record when qualified
      if (!lead.customerId) {
        const customer = await createOrGetCustomer(lead);
        if (customer) lead.customerId = customer._id;
      }
    }

    // Validation for Not Proceeding status
    if (status === 'Not Proceeding' && !rejectionReason && !notes) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a reason when marking lead as Not Proceeding' 
      });
    }

    // Update lead status
    lead.currentStatus = status;
    if (notes) lead.notesToXoto = notes;
    if (status === 'Not Proceeding' && rejectionReason) {
      lead.rejectionReason = rejectionReason;
    }

    // Track qualification date
    if (status === 'Qualified' && !lead.qualifiedAt) {
      lead.qualifiedAt = new Date();
    }

    // Track disbursement
    if (status === 'Disbursed' && prevStatus !== 'Disbursed') {
      lead.disbursedAt = new Date();
      
      // Calculate commission for partner
      const loanAmount = lead.propertyDetails?.loanAmountRequired || 0;
      const commissionPercent = partner.getCommissionPercentage(loanAmount);
      const commissionAmount = (loanAmount * commissionPercent) / 100;
      
      // Update partner metrics
      await partner.updateMetricsFromCommission(commissionAmount, true);
      
      // Update agent commission if lead came from affiliated agent
      if (lead.sourceInfo?.createdById && lead.sourceInfo.createdByModel === 'VaultAgent') {
        const agent = await VaultAgent.findById(lead.sourceInfo.createdById);
        if (agent && agent.agentType === 'PartnerAffiliatedAgent') {
          // Affiliated agents get commission from partner, not directly from Xoto
          // So partner handles their commission separately
          await agent.updateOne({ 
            $inc: { 
              'earnings.successfulDisbursals': 1,
              'earnings.totalCommissionEarned': commissionAmount * 0.3 // Example: 30% to agent
            } 
          });
        }
      }
    }

    await lead.save();

    // Log activity
    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `${prevStatus} → ${status} (Partner: ${partner.displayName})${rejectionReason ? ` - Reason: ${rejectionReason}` : ''}`,
    });

    // Partner-specific next actions
    const partnerNextActions = {
      'New': ['📞 Contact customer', '📋 Verify customer details', '💰 Run basic eligibility'],
      'Contacted': ['📊 Check eligibility', '📄 Request initial documents', '✅ Mark Qualified if eligible'],
      'Qualified': ['📄 Collect required documents', '🏦 Prepare bank application', '📅 Schedule document signing'],
      'Collecting Documents': ['✅ Verify document completeness', '📋 Organize application package', '🏦 Submit to bank'],
      'Documents Complete': ['🏦 Submit application to bank', '📊 Track bank processing', '📞 Keep customer updated'],
      'Application Opened': ['⏰ Follow up with bank weekly', '📞 Update customer on progress', '📋 Prepare for approval'],
      'Pre-Approved': ['📄 Arrange property valuation', '💰 Confirm final terms', '📋 Prepare for FOL'],
      'Valuation': ['📊 Review valuation report', '💰 Confirm loan amount', '📋 Prepare formal offer'],
      'FOL Issued': ['📅 Schedule signing with customer', '✅ Review terms with customer', '📋 Prepare for disbursement'],
      'FOL Signed': ['💰 Coordinate disbursement', '📞 Confirm transfer with customer', '✅ Update records'],
      'Disbursed': ['🎉 Lead converted!', '📊 Update commission records', '📋 Close file'],
      'Not Proceeding': ['📝 Document reason', '🔄 Consider future follow-up', '📊 Update metrics']
    };

    return res.status(200).json({
      success: true,
      message: `Lead status updated from ${prevStatus} to ${status}`,
      data: {
        leadId: lead._id,
        previousStatus: prevStatus,
        currentStatus: status,
        customerId: lead.customerId,
        qualifiedAt: lead.qualifiedAt,
        disbursedAt: lead.disbursedAt
      },
      nextActions: partnerNextActions[status] || ['📋 Update lead notes', '📞 Maintain communication with customer'],
    });
  } catch (err) {
    console.error('partnerUpdateLeadStatus error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// PARTNER — UPDATE LEAD INFO (Full access to their leads)
// PUT /partner/lead/:leadId/info
// ══════════════════════════════════════════════════════════════════
export const partnerUpdateLeadInfo = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { customerInfo, propertyDetails, loanRequirements, notes } = req.body;

    // Get partner info
    const partner = await Partner.findById(req.user._id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    if (!partner.isActive()) return res.status(403).json({ success: false, message: 'Partner account not active' });

    // Find lead based on partner category
    let lead;
    if (partner.partnerCategory === 'company') {
      const agents = await VaultAgent.find({ 
        partnerId: partner._id, 
        agentType: 'PartnerAffiliatedAgent', 
        isDeleted: false 
      });
      const agentIds = agents.map(a => a._id);
      lead = await Lead.findOne({
        _id: leadId,
        $or: [
          { 'sourceInfo.createdById': partner._id },
          { 'sourceInfo.createdById': { $in: agentIds } }
        ],
        isDeleted: false,
      });
    } else {
      lead = await Lead.findOne({
        _id: leadId,
        'sourceInfo.createdById': partner._id,
        isDeleted: false,
      });
    }

    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead not found or not authorized' 
      });
    }

    // Track updated fields for logging
    const updatedFields = [];

    // Update customer info
    if (customerInfo) {
      const allowedFields = [
        'firstName', 'lastName', 'email', 'mobileNumber', 'countryCode',
        'nationality', 'residencyStatus', 'employmentStatus', 'monthlySalary',
        'existingMonthlyLiabilities', 'dateOfBirth', 'gender', 'maritalStatus',
        'numberOfDependents', 'occupation', 'employer', 'alternativePhone',
        'whatsappNumber', 'preferredName'
      ];
      
      Object.keys(customerInfo).forEach(key => {
        if (allowedFields.includes(key) && customerInfo[key] !== undefined) {
          if (lead.customerInfo[key] !== customerInfo[key]) {
            lead.customerInfo[key] = customerInfo[key];
            updatedFields.push(`customerInfo.${key}`);
          }
        }
      });
    }

    // Update property details
    if (propertyDetails) {
      const allowedFields = [
        'transactionType', 'propertyFound', 'propertyType', 'propertySubtype',
        'propertyValue', 'downPaymentAmount', 'loanAmountRequired', 'propertyAddress',
        'isOffPlan', 'completionDate', 'approxPropertyValue', 'area'
      ];
      
      Object.keys(propertyDetails).forEach(key => {
        if (allowedFields.includes(key) && propertyDetails[key] !== undefined) {
          if (lead.propertyDetails[key] !== propertyDetails[key]) {
            lead.propertyDetails[key] = propertyDetails[key];
            updatedFields.push(`propertyDetails.${key}`);
          }
        }
      });
    }

    // Update loan requirements
    if (loanRequirements) {
      const allowedFields = [
        'timeline', 'preferredTenureYears', 'preferredInterestRateType',
        'preferredBanks', 'feeFinancingPreference', 'lifeInsurancePreference',
        'propertyInsurancePreference', 'specialRequirements'
      ];
      
      Object.keys(loanRequirements).forEach(key => {
        if (allowedFields.includes(key) && loanRequirements[key] !== undefined) {
          if (lead.loanRequirements[key] !== loanRequirements[key]) {
            lead.loanRequirements[key] = loanRequirements[key];
            updatedFields.push(`loanRequirements.${key}`);
          }
        }
      });
    }

    // Update notes
    if (notes) {
      lead.notesToXoto = notes;
      updatedFields.push('notesToXoto');
    }

    // If no changes
    if (updatedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update or no changes detected'
      });
    }

    await lead.save();

    // Log activity
    await HistoryService.logLeadActivity(lead, 'LEAD_INFO_UPDATED', await getUserInfo(req), {
      description: `Updated fields: ${updatedFields.join(', ')} (Partner: ${partner.displayName})`,
    });

    return res.status(200).json({
      success: true,
      message: `Lead info updated successfully (${updatedFields.length} field(s) changed)`,
      data: {
        leadId: lead._id,
        updatedFields,
        lead: {
          customerInfo: lead.customerInfo,
          propertyDetails: lead.propertyDetails,
          loanRequirements: lead.loanRequirements,
          notesToXoto: lead.notesToXoto
        }
      }
    });
  } catch (err) {
    console.error('partnerUpdateLeadInfo error:', err);
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





// ══════════════════════════════════════════════════════════════════
// 16. ADMIN CREATE SINGLE LEAD (Manual Entry)
// POST /admin/create
// ══════════════════════════════════════════════════════════════════
export const createAdminLead = async (req, res) => {
  try {
    // Check Admin role
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { customerInfo, propertyDetails, loanRequirements, notesToXoto, assignToAdvisorId } = req.body;

    // Validate required fields
    if (!customerInfo?.firstName || !customerInfo?.lastName || !customerInfo?.mobileNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'firstName, lastName and mobileNumber are required' 
      });
    }

    // Validate phone format
    if (!/^[0-9]{9,15}$/.test(customerInfo.mobileNumber.replace(/\s/g, ''))) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    // Duplicate check (active leads only)
    const duplicate = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      currentStatus: { $nin: ['Lost', 'Not Proceeding', 'Disbursed'] },
      isDeleted: false,
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 3600 * 1000) },
    });

    if (duplicate) {
      return res.status(400).json({ 
        success: false, 
        message: `Lead already exists with status: ${duplicate.currentStatus}` 
      });
    }

    // Prepare lead data
    const leadData = {
      sourceInfo: {
        source: 'admin',
        createdByRole: 'admin',
        createdById: req.user._id,
        createdByModel: 'Admin',
        createdByName: req.user?.fullName || req.user?.email || 'Admin',
        submissionMethod: 'manual_entry',
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
      },
      customerInfo: {
        firstName: customerInfo.firstName,
        lastName: customerInfo.lastName,
        countryCode: customerInfo.countryCode || '+971',
        mobileNumber: customerInfo.mobileNumber,
        email: customerInfo.email || null,
        nationality: customerInfo.nationality || null,
        residencyStatus: customerInfo.residencyStatus || null,
        employmentStatus: customerInfo.employmentStatus || null,
        monthlySalary: customerInfo.monthlySalary || null,
        dateOfBirth: customerInfo.dateOfBirth || null,
        gender: customerInfo.gender || null,
        maritalStatus: customerInfo.maritalStatus || null,
      },
      propertyDetails: {
        transactionType: propertyDetails?.transactionType || null,
        propertyValue: propertyDetails?.propertyValue || null,
        loanAmountRequired: propertyDetails?.loanAmountRequired || null,
        propertyAddress: {
          area: propertyDetails?.propertyAddress?.area || null,
          city: propertyDetails?.propertyAddress?.city || 'Dubai',
        },
      },
      loanRequirements: {
        timeline: loanRequirements?.timeline || null,
        preferredTenureYears: loanRequirements?.preferredTenureYears || 25,
      },
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    };

    // If assign to advisor immediately
    if (assignToAdvisorId) {
      const advisor = await VaultAdvisor.findById(assignToAdvisorId);
      if (advisor && advisor.isActiveAdvisor()) {
        const assignedAt = new Date();
        const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);
        leadData.assignedTo = {
          advisorId: advisor._id,
          advisorName: advisor.fullName,
          assignedAt,
          assignedBy: req.user._id,
        };
        leadData.sla = { deadline: slaDeadline, breached: false };
        leadData.currentStatus = 'Assigned';
      }
    }

    const lead = await Lead.create(leadData);

    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED_BY_ADMIN', await getUserInfo(req), {
      description: `Admin created lead for ${customerInfo.firstName} ${customerInfo.lastName}`,
    });

    return res.status(201).json({
      success: true,
      message: assignToAdvisorId ? 'Lead created and assigned to advisor' : 'Lead created successfully',
      data: lead,
    });

  } catch (err) {
    console.error('createAdminLead error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 17. ADMIN BULK UPLOAD LEADS (CSV/Excel)
// POST /admin/bulk-upload
// ══════════════════════════════════════════════════════════════════
// Updated bulkUploadLeads function - Handles both CSV and Excel

export const bulkUploadLeads = async (req, res) => {
  try {
    // Check Admin role
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a CSV or Excel file' });
    }

    // Check file type
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(fileExt)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Unsupported file type. Please upload .csv, .xlsx, or .xls file' 
      });
    }

    // Parse file - FIX for CSV
    let data = [];
    
    try {
      if (fileExt === '.csv') {
        // ✅ FIX: Proper CSV parsing
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split(/\r?\n/);
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '') continue;
          
          const values = lines[i].split(',').map(v => v.trim());
          const row = {};
          
          for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j] || '';
          }
          data.push(row);
        }
      } else {
        // Excel file parsing
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = xlsx.utils.sheet_to_json(worksheet);
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Failed to parse file. Please check file format.',
        error: parseError.message
      });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'The uploaded file contains no lead records. Please add data and re-upload.' 
      });
    }

    // Define required columns (case-insensitive)
    const requiredColumns = ['first_name', 'last_name', 'mobile_number'];
    const firstRow = data[0];
    const headers = Object.keys(firstRow).map(h => h.toLowerCase());
    
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingColumns.join(', ')}. Please use the template.`,
        template: {
          required: ['first_name', 'last_name', 'mobile_number'],
          optional: ['email', 'nationality', 'residency_status', 'employment_status', 'monthly_salary', 'property_value', 'loan_amount', 'timeline', 'notes', 'advisor_email']
        }
      });
    }

    // Process rows
    const results = {
      success: [],
      failed: [],
      duplicateInFile: [],
      duplicateInSystem: [],
      total: data.length,
      created: 0,
      failedCount: 0
    };

    const processedPhones = new Set();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        // Get values with case-insensitive keys
        const firstName = row.first_name || row['First Name'] || row['firstName'] || '';
        const lastName = row.last_name || row['Last Name'] || row['lastName'] || '';
        let mobileNumber = row.mobile_number || row['Mobile Number'] || row['mobileNumber'] || row['phone_number'] || '';
        
        // Validate required fields
        if (!firstName || !lastName || !mobileNumber) {
          results.failed.push({
            row: rowNumber,
            reason: 'Missing required fields: first_name, last_name, or mobile_number',
            data: row
          });
          results.failedCount++;
          continue;
        }

        // Clean phone number
        mobileNumber = String(mobileNumber).replace(/\s/g, '');
        if (mobileNumber.startsWith('+971')) mobileNumber = mobileNumber.substring(3);
        if (mobileNumber.startsWith('971')) mobileNumber = mobileNumber.substring(2);
        if (!/^[0-9]{9,15}$/.test(mobileNumber)) {
          results.failed.push({
            row: rowNumber,
            reason: 'Invalid phone number format. Use numbers only (e.g., 501234567)',
            data: row
          });
          results.failedCount++;
          continue;
        }

        // Check duplicate within same file
        if (processedPhones.has(mobileNumber)) {
          results.duplicateInFile.push({
            row: rowNumber,
            reason: 'Duplicate within upload file',
            mobileNumber: mobileNumber,
            data: row
          });
          results.failedCount++;
          continue;
        }

        // Check duplicate in system
        const existingLead = await Lead.findOne({
          'customerInfo.mobileNumber': mobileNumber,
          currentStatus: { $nin: ['Lost', 'Not Proceeding', 'Disbursed'] },
          isDeleted: false,
        });

        if (existingLead) {
          results.duplicateInSystem.push({
            row: rowNumber,
            reason: `Lead already exists with status: ${existingLead.currentStatus}`,
            existingLeadId: existingLead._id,
            existingAdvisor: existingLead.assignedTo?.advisorName || 'Unassigned',
            data: row
          });
          results.failedCount++;
          continue;
        }

        processedPhones.add(mobileNumber);

        // Get advisor if specified
        let advisorId = null;
        let advisorName = null;
        const advisorEmail = row.advisor_email || row['Advisor Email'] || row['advisorEmail'] || '';
        
        if (advisorEmail) {
          const advisor = await VaultAdvisor.findOne({ email: advisorEmail });
          if (advisor && advisor.isActiveAdvisor()) {
            advisorId = advisor._id;
            advisorName = advisor.fullName;
          }
        }

        // Build lead object
        const leadData = {
          sourceInfo: {
            source: 'admin',
            createdByRole: 'admin',
            createdById: req.user._id,
            createdByModel: 'Admin',
            createdByName: req.user?.fullName || req.user?.email || 'Admin',
            submissionMethod: 'bulk_upload',
            sourceIp: req.ip,
            userAgent: req.headers['user-agent'],
          },
          customerInfo: {
            firstName: firstName,
            lastName: lastName,
            countryCode: row.country_code || row['Country Code'] || '+971',
            mobileNumber: mobileNumber,
            email: row.email || row['Email'] || null,
            nationality: row.nationality || null,
            residencyStatus: row.residency_status || row['Residency Status'] || null,
            employmentStatus: row.employment_status || row['Employment Status'] || null,
            monthlySalary: row.monthly_salary ? parseFloat(row.monthly_salary) : null,
            dateOfBirth: row.date_of_birth || row['Date of Birth'] ? new Date(row.date_of_birth || row['Date of Birth']) : null,
            gender: row.gender || null,
            maritalStatus: row.marital_status || row['Marital Status'] || null,
          },
          propertyDetails: {
            transactionType: row.transaction_type || row['Transaction Type'] || null,
            propertyValue: row.property_value ? parseFloat(row.property_value) : null,
            loanAmountRequired: row.loan_amount ? parseFloat(row.loan_amount) : null,
            propertyAddress: {
              area: row.property_area || row['Property Area'] || null,
              city: 'Dubai'
            }
          },
          loanRequirements: {
            timeline: row.timeline || null,
          },
          notesToXoto: row.notes || null,
          currentStatus: 'New',
          duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() }
        };

        // Assign to advisor if specified
        if (advisorId) {
          const assignedAt = new Date();
          const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);
          leadData.assignedTo = {
            advisorId: advisorId,
            advisorName: advisorName,
            assignedAt,
            assignedBy: req.user._id,
          };
          leadData.sla = { deadline: slaDeadline, breached: false };
          leadData.currentStatus = 'Assigned';
        }

        const lead = await Lead.create(leadData);
        results.success.push({
          row: rowNumber,
          leadId: lead._id,
          customerName: `${firstName} ${lastName}`,
          mobileNumber: mobileNumber,
          assignedTo: advisorName || 'Unassigned'
        });
        results.created++;

      } catch (rowError) {
        console.error(`Row ${rowNumber} error:`, rowError);
        results.failed.push({
          row: rowNumber,
          reason: rowError.message,
          data: row
        });
        results.failedCount++;
      }
    }

    const response = {
      success: results.created > 0,
      summary: {
        total: results.total,
        created: results.created,
        failed: results.failedCount,
        duplicateInFile: results.duplicateInFile.length,
        duplicateInSystem: results.duplicateInSystem.length
      },
      message: `${results.created} leads created successfully, ${results.failedCount} failed.`,
      details: {
        success: results.success,
        failed: results.failed,
        duplicateInFile: results.duplicateInFile,
        duplicateInSystem: results.duplicateInSystem
      }
    };

    return res.status(results.created > 0 ? 201 : 400).json(response);

  } catch (error) {
    console.error('bulkUploadLeads error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 18. DOWNLOAD BULK UPLOAD TEMPLATE
// GET /admin/bulk-upload/template
// ══════════════════════════════════════════════════════════════════
// export const downloadBulkUploadTemplate = async (req, res) => {
//   try {
//     const roleDoc = await Role.findById(req.user.role);
//     if (!roleDoc || roleDoc.code !== '18') {
//       return res.status(403).json({ success: false, message: 'Admin only' });
//     }

//     const templateData = [
//       {
//         first_name: 'Ahmed',
//         last_name: 'Al Mansoori',
//         mobile_number: '501234567',
//         email: 'ahmed@example.com',
//         country_code: '+971',
//         nationality: 'UAE',
//         residency_status: 'UAE National',
//         employment_status: 'Salaried',
//         monthly_salary: '25000',
//         property_value: '1500000',
//         loan_amount: '1200000',
//         timeline: 'Immediately',
//         notes: 'Interested in Dubai Hills',
//         advisor_email: 'advisor@xoto.ae'
//       },
//       {
//         first_name: 'Sarah',
//         last_name: 'Khan',
//         mobile_number: '507654321',
//         email: 'sarah@example.com',
//         country_code: '+971',
//         nationality: 'India',
//         residency_status: 'UAE Resident',
//         employment_status: 'Salaried',
//         monthly_salary: '35000',
//         property_value: '2500000',
//         loan_amount: '2000000',
//         timeline: '1-3 months',
//         notes: 'Prefers fixed rate',
//         advisor_email: ''
//       }
//     ];

//     const worksheet = xlsx.utils.json_to_sheet(templateData);
//     const workbook = xlsx.utils.book_new();
//     xlsx.utils.book_append_sheet(workbook, worksheet, 'Lead_Template');
    
//     const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
//     res.setHeader('Content-Disposition', 'attachment; filename=lead_bulk_upload_template.xlsx');
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
//     return res.send(buffer);
//   } catch (err) {
//     console.error('downloadBulkUploadTemplate error:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };