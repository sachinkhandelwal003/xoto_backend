import Lead                  from '../models/VaultLead.js';
import VaultAgent             from '../models/Agent.js';
import Partner                from '../models/Partner.js';
import VaultAdvisor           from '../models/XotoAdvisor.js';
import Customer               from '../../../modules/auth/models/user/customer.model.js';
import LeadEligibilityCheck   from '../models/LeadEligibilityCheck.js';
import { calculateEligibility } from '../models/eligibilityService.js'; // ✅ fixed path
import HistoryService          from '../services/history.service.js';
import { Role }                from '../../../modules/auth/models/role/role.model.js';
import BankDocumentRequirement   from '../../mortgages/models/Bankproductdocuments.js'


// import multer  from 'multer';
// import xlsx    from 'xlsx';
// import path    from 'path';

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
const getUserInfo = async (req) => {
  let userRole = 'System';
  try {
    const doc  = await Role.findById(req.user?.role);
    const code = doc?.code;
    if      (code === '18')                                      userRole = 'Admin';
    else if (code === '21')                                      userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent')           userRole = 'FreelanceAgent';
    else if (req.user?.agentType === 'PartnerAffiliatedAgent')   userRole = 'PartnerAffiliatedAgent';
    else if (req.user?.employeeType === 'XotoAdvisor')           userRole = 'XotoAdvisor';
  } catch (_) {}
  return {
    userId:    req.user?._id,
    userRole,
    userName:  req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

// Auto-create Customer when lead is Qualified (PRD 6.1)
const createOrGetCustomer = async (lead) => {
  try {
    const { email, mobileNumber, fullName, nationality, dateOfBirth } = lead.customerInfo;
    const orConds = [];
    if (email)        orConds.push({ email: email.toLowerCase() });
    if (mobileNumber) orConds.push({ 'mobile.number': mobileNumber.replace(/^\+971/, '') });
    if (!orConds.length) return null;

    let customer = await Customer.findOne({ $or: orConds, is_deleted: false });
    if (!customer) {
      const [firstName, ...rest] = fullName.split(' ');
      const roleDoc = await Role.findOne({ name: 'Customer' });
      customer = await Customer.create({
        name:        { first_name: firstName, last_name: rest.join(' ') || '' },
        email:       email ? email.toLowerCase() : `${mobileNumber}@vault.xoto.ae`,
        mobile:      { country_code: '+971', number: mobileNumber.replace(/^\+971/, '') },
        dateOfBirth: dateOfBirth || null,
        nationality: nationality || null,
        role:        roleDoc?._id,
        source:      'vault',
        isActive:    true,
      });
      return { _id: customer._id, message: `Customer created for ${fullName}` };
    }
    return { _id: customer._id, message: 'Existing customer linked' };
  } catch (e) {
    console.error('createOrGetCustomer:', e);
    return null;
  }
};

// Next action hints for advisor UI
const getNextActions = (status, docs = {}) => {
  const up    = docs.documentsUploaded      || 0;
  const total = docs.totalDocumentsRequired || 7;
  const map = {
    'Contacted':             ['Run eligibility check', 'Mark Qualified after check'],
    'Qualified':             ['Start collecting documents from customer'],
    'Collecting Documents':  [`${up}/${total} docs uploaded — keep going`],
    'Documents Complete':    ['Open Application/Case now'],
    'Application Opened':    ['Track via Applications section'],
    'Not Proceeding':        ['Lead closed — record reason'],
  };
  return map[status] || ['Update lead notes'];
};

// ══════════════════════════════════════════════════════════════════
// 1. CREATE LEAD — FreelanceAgent (Referral Partner)
//    POST /leads/create
//    PRD 4.3 — name + phone only required
// ══════════════════════════════════════════════════════════════════
export const createLead = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id);
    if (!agent || !agent.isActiveAgent())
      return res.status(403).json({ success: false, message: 'Agent account not active' });
    if (agent.agentType === 'FreelanceAgent' && !agent.isVerified)
      return res.status(403).json({ success: false, message: 'Agent not verified by admin' });

    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    if (!customerInfo?.fullName || !customerInfo?.mobileNumber)
      return res.status(400).json({ success: false, message: 'fullName and mobileNumber are required' });

    if (!/^[0-9]{9,15}$/.test(customerInfo.mobileNumber.replace(/\s/g, '')))
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });

    // Duplicate check — active leads only (180 days)
    const duplicate = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      currentStatus:               { $nin: ['Not Proceeding'] },
      isDeleted:                   false,
      createdAt:                   { $gte: new Date(Date.now() - 180 * 24 * 3600 * 1000) },
    });
    if (duplicate)
      return res.status(400).json({ success: false, message: "This customer's application is currently open with Xoto." });

    const lead = await Lead.create({
      sourceInfo: {
        source:           agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdByRole:    agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdById:      agent._id,
        createdByModel:   'VaultAgent',
        createdByName:    agent.fullName,
        submissionMethod: 'manual_entry',
        sourceIp:         req.ip,
        userAgent:        req.headers['user-agent'],
      },
      customerInfo: {
        fullName:           customerInfo.fullName,
        mobileNumber:       customerInfo.mobileNumber,
        email:              customerInfo.email              || null,
        gender:             customerInfo.gender             || null,
        dateOfBirth:        customerInfo.dateOfBirth        || null,
        nationality:        customerInfo.nationality        || null,
        residencyStatus:    customerInfo.residencyStatus    || null,
        maritalStatus:      customerInfo.maritalStatus      || null,
        numberOfDependents: customerInfo.numberOfDependents || 0,
        occupation:         customerInfo.occupation         || null,
        employer:           customerInfo.employer           || null,
        monthlySalary:      customerInfo.monthlySalary      || null,
        employmentStatus:   customerInfo.employmentStatus   || null,
      },
      propertyDetails:  propertyDetails  || {},
      loanRequirements: loanRequirements ? {
        preferredTenureYears:      loanRequirements.preferredTenureYears      || 25,
        preferredInterestRateType: loanRequirements.preferredInterestRateType || 'Fixed',
        preferredBanks:            loanRequirements.preferredBanks            || [],
        feeFinancingPreference:    loanRequirements.feeFinancingPreference     ?? true,
        specialRequirements:       loanRequirements.specialRequirements        || null,
      } : {},
      notesToXoto:    notesToXoto || null,
      currentStatus:  'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });

    await agent.updateOne({ $inc: { 'earnings.totalLeadsSubmitted': 1 } });
    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED', await getUserInfo(req), {
      description: `Lead created for ${customerInfo.fullName}`,
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
// 2. CREATE WEBSITE LEAD — Public
//    POST /leads/website
// ══════════════════════════════════════════════════════════════════
export const createWebsiteLead = async (req, res) => {
  try {
    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    if (!customerInfo?.fullName || !customerInfo?.mobileNumber)
      return res.status(400).json({ success: false, message: 'fullName and mobileNumber are required' });

    const dup = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      'sourceInfo.source':         'website',
      isDeleted:                   false,
      createdAt:                   { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    });
    if (dup)
      return res.status(400).json({ success: false, message: 'Already submitted. Our team will contact you soon.' });

    const lead = await Lead.create({
      sourceInfo: {
        source: 'website', createdByRole: 'website',
        createdByName:    'Website Visitor',
        submissionMethod: 'website_form',
        sourceIp:         req.ip,
        userAgent:        req.headers['user-agent'],
      },
      customerInfo: {
        fullName:         customerInfo.fullName,
        mobileNumber:     customerInfo.mobileNumber,
        email:            customerInfo.email            || null,
        gender:           customerInfo.gender           || null,
        dateOfBirth:      customerInfo.dateOfBirth      || null,
        nationality:      customerInfo.nationality      || null,
        residencyStatus:  customerInfo.residencyStatus  || null,
        monthlySalary:    customerInfo.monthlySalary    || null,
        employmentStatus: customerInfo.employmentStatus || null,
        maritalStatus:    customerInfo.maritalStatus    || null,
      },
      propertyDetails:  propertyDetails  || {},
      loanRequirements: loanRequirements || {},
      notesToXoto:    notesToXoto || null,
      currentStatus:  'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });

    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED_FROM_WEBSITE', await getUserInfo(req), {
      description: `Website lead: ${customerInfo.fullName}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you! Our advisor will contact you within 24 hours.',
      data: { leadId: lead._id },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 3. CREATE PARTNER LEAD — Individual Partner only
//    POST /leads/partner/create
//    PRD 5.1 — name + phone required, property optional
// ══════════════════════════════════════════════════════════════════
export const createPartnerLead = async (req, res) => {
  try {
    const partner = await Partner.findById(req.user._id);
    if (!partner || !partner.isActive())
      return res.status(403).json({ success: false, message: 'Partner account not active' });
    if (partner.partnerCategory !== 'individual')
      return res.status(403).json({ success: false, message: 'Company partners manage leads via affiliated agents' });

    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    if (!customerInfo?.fullName || !customerInfo?.mobileNumber)
      return res.status(400).json({ success: false, message: 'fullName and mobileNumber are required' });

    const dup = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      currentStatus:               { $nin: ['Not Proceeding'] },
      isDeleted:                   false,
      createdAt:                   { $gte: new Date(Date.now() - 180 * 24 * 3600 * 1000) },
    });
    if (dup)
      return res.status(400).json({ success: false, message: "This customer's application is currently open with Xoto." });

    const lead = await Lead.create({
      sourceInfo: {
        source:           'individual_partner',
        createdByRole:    'individual_partner',
        createdById:      partner._id,
        createdByModel:   'Partner',
        createdByName:    partner.displayName || partner.companyName,
        submissionMethod: 'manual_entry',
        sourceIp:         req.ip,
        userAgent:        req.headers['user-agent'],
      },
      customerInfo: {
        fullName:         customerInfo.fullName,
        mobileNumber:     customerInfo.mobileNumber,
        email:            customerInfo.email            || null,
        nationality:      customerInfo.nationality      || null,
        residencyStatus:  customerInfo.residencyStatus  || null,
        gender:           customerInfo.gender           || null,
        dateOfBirth:      customerInfo.dateOfBirth      || null,
        maritalStatus:    customerInfo.maritalStatus    || null,
        monthlySalary:    customerInfo.monthlySalary    || null,
        employmentStatus: customerInfo.employmentStatus || null,
      },
      propertyDetails:  propertyDetails  || {},
      loanRequirements: loanRequirements || {},
      notesToXoto:    notesToXoto || null,
      currentStatus:  'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });

    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED_BY_PARTNER', await getUserInfo(req), {
      description: `Partner lead by ${partner.displayName} for ${customerInfo.fullName}`,
    });

    return res.status(201).json({ success: true, message: 'Lead created', data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 4. GET MY LEADS — Agent
//    GET /leads/my-leads
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
// 5. GET LEAD BY ID
//    GET /leads/:id
// ══════════════════════════════════════════════════════════════════
export const getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, isDeleted: false })
      .populate('sourceInfo.createdById', 'name email');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 6. GET PARTNER LEADS
//    GET /leads/partner/get
// ══════════════════════════════════════════════════════════════════
export const getPartnerLeads = async (req, res) => {
  try {
    const partner = await Partner.findById(req.user._id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });

    let leads = [];
    if (partner.partnerCategory === 'company') {
      const agents   = await VaultAgent.find({ partnerId: partner._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false });
      const agentIds = agents.map(a => a._id);
      if (agentIds.length) {
        leads = await Lead.find({ 'sourceInfo.createdById': { $in: agentIds }, isDeleted: false }).sort({ createdAt: -1 });
      }
    } else {
      leads = await Lead.find({
        'sourceInfo.createdById':    partner._id,
        'sourceInfo.createdByModel': 'Partner',
        isDeleted:                   false,
      }).sort({ createdAt: -1 });
    }

    return res.status(200).json({ success: true, data: leads, total: leads.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 7. ADMIN — GET ALL LEADS
//    GET /leads/admin/all
// ══════════════════════════════════════════════════════════════════
export const adminGetAllLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') return res.status(403).json({ success: false, message: 'Admin only' });

    const { status, source, agentId, advisorId, assigned, search, fromDate, toDate, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false };

    if (source) query['sourceInfo.source'] = source;
    else        query['sourceInfo.source'] = { $in: ['freelance_agent', 'website', 'admin'] };
    if (status)    query.currentStatus              = status;
    if (agentId)   query['sourceInfo.createdById']  = agentId;
    if (advisorId) query['assignedTo.advisorId']    = advisorId;
    if (assigned === 'true')  query['assignedTo.advisorId'] = { $ne: null };
    if (assigned === 'false') query['assignedTo.advisorId'] = null;
    if (fromDate)  query.createdAt = { ...query.createdAt, $gte: new Date(fromDate) };
    if (toDate)    query.createdAt = { ...query.createdAt, $lte: new Date(toDate) };
    if (search) {
      query.$or = [
        { 'customerInfo.fullName':     { $regex: search, $options: 'i' } },
        { 'customerInfo.email':        { $regex: search, $options: 'i' } },
        { 'customerInfo.mobileNumber': { $regex: search, $options: 'i' } },
      ];
    }

    const [leads, total] = await Promise.all([
      Lead.find(query)
        .populate('sourceInfo.createdById', 'name email agentType')
        .populate('assignedTo.advisorId',   'name email')
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);

    const unassigned = await Lead.countDocuments({
      isDeleted:              false,
      'assignedTo.advisorId': null,
      currentStatus:          'New',
    });

    return res.status(200).json({
      success: true, data: leads, total,
      summary: { totalLeads: total, unassignedCount: unassigned },
      pagination: { totalPages: Math.ceil(total / parseInt(limit)), currentPage: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 8. ADMIN — GET UNASSIGNED LEADS
//    GET /leads/admin/unassigned
// ══════════════════════════════════════════════════════════════════
export const getUnassignedLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') return res.status(403).json({ success: false, message: 'Admin only' });

    const { page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false, currentStatus: 'New', 'assignedTo.advisorId': null };

    const [leads, total] = await Promise.all([
      Lead.find(query)
        .populate('sourceInfo.createdById', 'name email')
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
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
// 9. ADMIN — ASSIGN LEAD TO ADVISOR
//    POST /leads/admin/assign-to-advisor
//    PRD 8.3 — SLA 4 hours starts at assignment
// ══════════════════════════════════════════════════════════════════
export const assignLeadToXotoAdvisor = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') return res.status(403).json({ success: false, message: 'Admin only' });

    const { leadId, advisorId } = req.body;
    if (!leadId || !advisorId)
      return res.status(400).json({ success: false, message: 'leadId and advisorId are required' });

    const [advisor, lead] = await Promise.all([
      VaultAdvisor.findById(advisorId),
      Lead.findOne({ _id: leadId, isDeleted: false }),
    ]);

    if (!advisor || !advisor.isActiveAdvisor())
      return res.status(404).json({ success: false, message: 'Advisor not found or inactive' });
    if (!advisor.canTakeMoreLeads())
      return res.status(400).json({ success: false, message: `Advisor at max capacity (${advisor.workload.currentLeads}/${advisor.workload.maxLeadsCapacity})` });
    if (!lead)
      return res.status(404).json({ success: false, message: 'Lead not found' });

    const prevAdvisor = lead.assignedTo?.advisorName || null;

    lead.assignedTo = {
      advisorId:   advisor._id,
      advisorName: advisor.fullName,
      assignedAt:  new Date(),
      assignedBy:  req.user._id,
    };
    lead.sla = {
      deadline: new Date(Date.now() + 4 * 60 * 60 * 1000),
      breached:  false,
    };
    lead.currentStatus = 'Assigned';
    await lead.save();

    advisor.workload.currentLeads                 = (advisor.workload.currentLeads || 0) + 1;
    advisor.performanceMetrics.totalLeadsAssigned = (advisor.performanceMetrics.totalLeadsAssigned || 0) + 1;
    await advisor.save();

    await HistoryService.logLeadActivity(lead, 'LEAD_ASSIGNED_TO_ADVISOR', await getUserInfo(req), {
      description: `Lead assigned to ${advisor.fullName}${prevAdvisor ? ` (was: ${prevAdvisor})` : ''}`,
    });

    return res.status(200).json({
      success: true,
      message: `Lead assigned to ${advisor.fullName}`,
      data: { leadId: lead._id, advisorName: advisor.fullName, slaDeadline: lead.sla.deadline, currentStatus: lead.currentStatus },
    });
  } catch (err) {
    console.error('assignLeadToXotoAdvisor:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 10. ADVISOR — GET ASSIGNED LEADS
//     GET /leads/advisor/my-leads
// ══════════════════════════════════════════════════════════════════
export const getAdvisorAssignedLeads = async (req, res) => {
  try {
    const { status, search, eligibilityStatus, documentProgress, page = 1, limit = 20 } = req.query;
    const query = { isDeleted: false, 'assignedTo.advisorId': req.user._id };

    if (status) query.currentStatus = status;
    if (search) {
      query.$or = [
        { 'customerInfo.fullName':     { $regex: search, $options: 'i' } },
        { 'customerInfo.email':        { $regex: search, $options: 'i' } },
        { 'customerInfo.mobileNumber': { $regex: search, $options: 'i' } },
      ];
    }
    if (eligibilityStatus === 'eligible')     { query['eligibility.isEligible'] = true;  query['eligibility.checked'] = true; }
    if (eligibilityStatus === 'not_eligible') { query['eligibility.isEligible'] = false; query['eligibility.checked'] = true; }
    if (eligibilityStatus === 'not_checked')   query['eligibility.checked'] = { $ne: true };
    if (documentProgress  === 'complete')      query['documentCollection.collectionPercentage'] = 100;
    if (documentProgress  === 'incomplete')    query['documentCollection.collectionPercentage'] = { $lt: 100 };

    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ createdAt: -1 }).skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);

    const base = { isDeleted: false, 'assignedTo.advisorId': req.user._id };
    const summary = {
      total:             await Lead.countDocuments(base),
      new:               await Lead.countDocuments({ ...base, currentStatus: 'New' }),
      assigned:          await Lead.countDocuments({ ...base, currentStatus: 'Assigned' }),
      contacted:         await Lead.countDocuments({ ...base, currentStatus: 'Contacted' }),
      qualified:         await Lead.countDocuments({ ...base, currentStatus: 'Qualified' }),
      collectingDocs:    await Lead.countDocuments({ ...base, currentStatus: 'Collecting Documents' }),
      documentsComplete: await Lead.countDocuments({ ...base, currentStatus: 'Documents Complete' }),
      applicationOpened: await Lead.countDocuments({ ...base, currentStatus: 'Application Opened' }),
      notProceeding:     await Lead.countDocuments({ ...base, currentStatus: 'Not Proceeding' }),
    };

    return res.status(200).json({
      success: true, data: leads, total, summary,
      pagination: { totalPages: Math.ceil(total / parseInt(limit)), currentPage: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 11. ADVISOR — UPDATE LEAD STATUS
//     PUT /leads/advisor/lead/:leadId/status
//     PRD 6.1 correct order:
//     Assigned → Contacted → Qualified → Collecting Documents
//     → Documents Complete → Application Opened → Not Proceeding
// ══════════════════════════════════════════════════════════════════
export const advisorUpdateLeadStatus = async (req, res) => {
  try {
    const { leadId }        = req.params;
    const { status, notes } = req.body;

    const advisor = await VaultAdvisor.findById(req.user._id);
    if (!advisor) return res.status(404).json({ success: false, message: 'Advisor not found' });

    const lead = await Lead.findOne({ _id: leadId, 'assignedTo.advisorId': req.user._id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found or not assigned to you' });

    const allowed = ['Contacted', 'Qualified', 'Collecting Documents', 'Documents Complete', 'Application Opened', 'Not Proceeding'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });

    const order = {
      'New': 0, 'Assigned': 1, 'Contacted': 2, 'Qualified': 3,
      'Collecting Documents': 4, 'Documents Complete': 5,
      'Application Opened': 6, 'Not Proceeding': 99,
    };

    // Documents Complete requires 100% docs uploaded
    if (status === 'Documents Complete') {
      const pct = lead.documentCollection?.collectionPercentage || 0;
      if (pct < 100)
        return res.status(400).json({ success: false, message: `Cannot mark Documents Complete — only ${pct}% uploaded` });
    }

    // Application Opened only after Documents Complete
    if (status === 'Application Opened' && lead.currentStatus !== 'Documents Complete')
      return res.status(400).json({ success: false, message: `Must be Documents Complete first. Current: ${lead.currentStatus}` });

    // No downgrade (except Not Proceeding)
    if (status !== 'Not Proceeding' && order[status] < order[lead.currentStatus])
      return res.status(400).json({ success: false, message: `Cannot move from ${lead.currentStatus} back to ${status}` });

    const prevStatus   = lead.currentStatus;
    lead.currentStatus = status;
    if (notes) lead.notesToXoto = notes;

    let advisorMessage  = '';
    let requiredDocuments = [];
    let customerCreated = null;

    if (status === 'Contacted') {
      lead.sla.firstContactAt = new Date();
      const hrs = (lead.sla.firstContactAt - new Date(lead.assignedTo.assignedAt || lead.createdAt)) / 3600000;
      lead.sla.responseTimeHours = Math.round(hrs * 10) / 10;
      if (lead.sla.deadline && new Date() > lead.sla.deadline) {
        lead.sla.breached = true; lead.sla.breachedAt = new Date();
        advisorMessage = `SLA BREACHED — contacted ${lead.sla.responseTimeHours}h after assignment`;
      } else {
        advisorMessage = `Contacted within SLA (${lead.sla.responseTimeHours}h)`;
      }
    }

    if (status === 'Qualified') {
      lead.sla.qualificationAt = new Date();
      customerCreated = await createOrGetCustomer(lead);
      if (customerCreated) lead.customerId = customerCreated._id;
      advisorMessage = 'Lead qualified. Start collecting documents.';
    }

if (status === 'Collecting Documents') {

  const employmentType  = lead.customerInfo.employmentStatus || 'Salaried';
  const residencyStatus = lead.customerInfo.residencyStatus  || 'UAE Resident';

  // ✅ Simpler query — just isGlobal and isMandatory
  const globalDocs = await BankDocumentRequirement.find({
    status:    'Active',
    isDeleted: false,
    isGlobal:  true,
    isMandatory: true,
  }).sort({ displayOrder: 1 });

  console.log('Global docs found:', globalDocs.length); // ← debug log

  // Only reset if first time
  if (!lead.documentCollection.collectionStartedAt) {
    lead.documentCollection.collectionStartedAt    = new Date();
  lead.documentCollection.totalDocumentsRequired = globalDocs.length;
lead.documentCollection.documentsPending       = globalDocs.length;
    lead.documentCollection.documentsUploaded      = 0;
    lead.documentCollection.documentsVerified      = 0;
    lead.documentCollection.collectionPercentage   = 0;
    lead.documentCollection.readyForSubmission     = false;
  }

  advisorMessage = `Document collection started. ${globalDocs.length} documents required.`;

  requiredDocuments = globalDocs.map(doc => ({
    documentKey:       doc.documentKey,
    documentName:      doc.documentName,
    documentType:      doc.documentType,
    category:          doc.category,
    isMandatory:       doc.isMandatory,
    requiresFrontBack: doc.requiresFrontBack,
    allowedFileTypes:  doc.allowedFileTypes,
    maxFileSizeMB:     doc.maxFileSizeMB,
    helperText:        doc.helperText,
    instructions:      doc.instructions,
    isUploaded:        false,
    isVerified:        false,
  }));
}

    if (status === 'Documents Complete') {
      lead.documentCollection.collectionCompletedAt = new Date();
      advisorMessage = 'All documents received. Open Application now.';
    }

    if (status === 'Application Opened') {
      lead.conversionInfo.convertedToApplication = true;
      lead.conversionInfo.convertedAt            = new Date();
      lead.conversionInfo.convertedByName        = advisor.fullName;
      advisorMessage = 'Application opened. Track in Applications section.';
    }

    if (status === 'Not Proceeding')
      advisorMessage = `Lead closed. Reason: ${notes || 'Not provided'}`;

    await lead.save();

    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `Status: ${prevStatus} → ${status}`,
      notes:       notes || null,
    });

    return res.status(200).json({
      success: true,
      message: 'Lead status updated',
      data: {
        lead: {
          _id:            lead._id,
          customerName:   lead.customerInfo.fullName,
          previousStatus: prevStatus,
          currentStatus:  status,
          sla: { deadline: lead.sla.deadline, breached: lead.sla.breached, responseTimeHours: lead.sla.responseTimeHours },
          documentStatus: { uploaded: lead.documentCollection.documentsUploaded, total: lead.documentCollection.totalDocumentsRequired, percentage: lead.documentCollection.collectionPercentage },
        },
        advisorMessage,
        customerCreated,
        nextActions: getNextActions(status, lead.documentCollection),
        requiredDocuments
      },
    });
  } catch (err) {
    console.error('advisorUpdateLeadStatus:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 12. ADVISOR — UPDATE LEAD INFO (enrichment after contact)
//     PUT /leads/advisor/lead/:leadId/info
// ══════════════════════════════════════════════════════════════════
export const advisorUpdateLeadInfo = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;

    const lead = await Lead.findOne({ _id: leadId, 'assignedTo.advisorId': req.user._id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found or not assigned to you' });

    const allowedCustomer = [
      'fullName', 'email', 'mobileNumber', 'preferredName', 'alternativePhone',
      'whatsappNumber', 'dateOfBirth', 'nationality', 'residencyStatus', 'maritalStatus',
      'numberOfDependents', 'occupation', 'employer', 'monthlySalary', 'gender', 'employmentStatus',
    ];
    if (customerInfo) allowedCustomer.forEach(f => { if (customerInfo[f] !== undefined) lead.customerInfo[f] = customerInfo[f]; });

    const allowedProperty = ['propertyType', 'propertySubtype', 'propertyValue', 'downPaymentAmount', 'loanAmountRequired', 'isOffPlan', 'completionDate'];
    if (propertyDetails) {
      allowedProperty.forEach(f => { if (propertyDetails[f] !== undefined) lead.propertyDetails[f] = propertyDetails[f]; });
      if (propertyDetails.propertyAddress) {
        lead.propertyDetails.propertyAddress = { ...lead.propertyDetails.propertyAddress, ...propertyDetails.propertyAddress };
      }
    }

    const allowedLoan = ['preferredTenureYears', 'preferredInterestRateType', 'preferredBanks', 'feeFinancingPreference', 'specialRequirements'];
    if (loanRequirements) allowedLoan.forEach(f => { if (loanRequirements[f] !== undefined) lead.loanRequirements[f] = loanRequirements[f]; });

    if (notesToXoto !== undefined) lead.notesToXoto = notesToXoto;
    await lead.save();

    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: 'Lead info enriched by advisor',
      metadata:    { updatedFields: Object.keys(req.body) },
    });

    return res.status(200).json({ success: true, message: 'Lead info updated', data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 13. ADMIN — UPDATE LEAD STATUS
//     PUT /leads/admin/:id/status
// ══════════════════════════════════════════════════════════════════
export const updateLeadStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const lead = await Lead.findOne({ _id: req.params.id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    const valid = ['New', 'Assigned', 'Contacted', 'Qualified', 'Collecting Documents', 'Documents Complete', 'Application Opened', 'Not Proceeding'];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const prevStatus   = lead.currentStatus;
    lead.currentStatus = status;
    if (notes) lead.notesToXoto = notes;

    if (status === 'Contacted' && !lead.sla.firstContactAt) {
      lead.sla.firstContactAt = new Date();
      if (lead.sla.deadline && new Date() > lead.sla.deadline) { lead.sla.breached = true; lead.sla.breachedAt = new Date(); }
    }
    if (status === 'Qualified') lead.sla.qualificationAt = new Date();
    await lead.save();

    if (status === 'Qualified') {
      const customer = await createOrGetCustomer(lead);
      if (customer) { lead.customerId = customer._id; await lead.save(); }
    }

    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `Admin: ${prevStatus} → ${status}`,
    });

    return res.status(200).json({ success: true, message: 'Status updated', data: lead });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 14. ADVISOR — CALCULATE ELIGIBILITY
//     POST /leads/:leadId/calculate-eligibility
// ══════════════════════════════════════════════════════════════════
export const calculateLeadEligibility = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { monthlySalary, otherIncome, existingLoanEMIs, creditCardPayments, propertyValue, requestedLoanAmount, tenureYears } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (lead.assignedTo?.advisorId?.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Lead not assigned to you' });

    if (monthlySalary       !== undefined) lead.customerInfo.monthlySalary              = monthlySalary;
    if (propertyValue       !== undefined) lead.propertyDetails.propertyValue            = propertyValue;
    if (requestedLoanAmount !== undefined) lead.propertyDetails.loanAmountRequired       = requestedLoanAmount;
    if (tenureYears         !== undefined) lead.loanRequirements.preferredTenureYears    = tenureYears;

    const inputs = {
      monthlySalary:       monthlySalary       || lead.customerInfo.monthlySalary                  || 0,
      otherIncome:         otherIncome          || 0,
      existingLoanEMIs:    existingLoanEMIs     || 0,
      creditCardPayments:  creditCardPayments   || 0,
      propertyValue:       propertyValue        || lead.propertyDetails.propertyValue               || 0,
      requestedLoanAmount: requestedLoanAmount  || lead.propertyDetails.loanAmountRequired          || 0,
      tenureYears:         tenureYears          || lead.loanRequirements.preferredTenureYears        || 25,
      nationality:         lead.customerInfo.nationality,
      dateOfBirth:         lead.customerInfo.dateOfBirth,
    };

    const result = calculateEligibility(lead, inputs);

    const check = await LeadEligibilityCheck.create({
      leadId:              lead._id,
      checkedBy:           req.user._id,
      monthlySalary:       inputs.monthlySalary,
      otherIncome:         inputs.otherIncome,
      existingLoanEMIs:    inputs.existingLoanEMIs,
      creditCardPayments:  inputs.creditCardPayments,
      propertyValue:       inputs.propertyValue,
      requestedLoanAmount: inputs.requestedLoanAmount,
      tenureYears:         inputs.tenureYears,
      nationality:         inputs.nationality,
      customerAge:         result.customerAge,
      totalMonthlyIncome:  result.totalMonthlyIncome,
      totalLiabilities:    result.totalLiabilities,
      proposedEMI:         result.proposedEMI,
      dbrPercentage:       result.dbrPercentage,
      maxAllowedDBR:       result.maxAllowedDBR,
      dbrStatus:           result.dbrStatus,
      estimatedLTV:        result.estimatedLTV,
      maxLTV:              result.maxLTV,
      maxLoanAmountBasedOnDBR: result.maxLoanAmountBasedOnDBR,
      recommendedLoanAmount:   result.recommendedLoanAmount,
      isEligible:          result.isEligible,
      eligibilityNotes:    result.eligibilityNotes,
      eligibilityScore:    result.eligibilityScore,
      riskGrade:           result.riskGrade,
      stressInterestRate:  7.0,
      calculationVersion:  'v2',
    });

    lead.eligibility = {
      checked:                  true,
      latestEligibilityCheckId: check._id,
      isEligible:               result.isEligible,
      checkedAt:                new Date(),
      checkedBy:                req.user._id,
      eligibilityScore:         result.eligibilityScore,
      riskGrade:                result.riskGrade,
      dbrPercentage:            result.dbrPercentage,
      dbrStatus:                result.dbrStatus,
      estimatedLTV:             result.estimatedLTV,
      recommendedLoanAmount:    result.recommendedLoanAmount,
      eligibilityNotes:         result.eligibilityNotes,
    };
    await lead.save();

    return res.status(200).json({
      success: true,
      message: result.isEligible
        ? 'Customer is ELIGIBLE. Mark lead as Qualified.'
        : 'Customer is NOT ELIGIBLE.',
      data: {
        isEligible:              result.isEligible,
        eligibilityScore:        result.eligibilityScore,
        riskGrade:               result.riskGrade,
        eligibilityNotes:        result.eligibilityNotes,
        dbrPercentage:           result.dbrPercentage,
        maxAllowedDBR:           result.maxAllowedDBR,
        dbrStatus:               result.dbrStatus,
        ltvPercentage:           result.estimatedLTV,
        maxLTV:                  result.maxLTV,
        recommendedLoanAmount:   result.recommendedLoanAmount,
        maxLoanAmountBasedOnDBR: result.maxLoanAmountBasedOnDBR,
        proposedEMI:             result.proposedEMI,
        customerAge:             result.customerAge,
        ageAtMaturity:           result.ageAtMaturity,
        eligibilityCheckId:      check._id,
        leadCurrentStatus:       lead.currentStatus,
        nextActions: result.isEligible
          ? ['Mark lead as Qualified', 'Start collecting documents']
          : ['Review eligibility notes', 'Reduce loan amount or increase down payment'],
      },
    });
  } catch (err) {
    console.error('calculateLeadEligibility:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 15. ADVISOR — GET LATEST ELIGIBILITY
//     GET /leads/:leadId/eligibility
// ══════════════════════════════════════════════════════════════════
export const getLeadEligibility = async (req, res) => {
  try {
    const check = await LeadEligibilityCheck.findOne({ leadId: req.params.leadId }).sort({ createdAt: -1 });
    if (!check) return res.status(404).json({ success: false, message: 'No eligibility check found' });
    return res.status(200).json({ success: true, data: check });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 16. ADVISOR — GET ELIGIBILITY HISTORY
//     GET /leads/:leadId/eligibility/history
// ══════════════════════════════════════════════════════════════════
export const getLeadEligibilityHistory = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const history = await LeadEligibilityCheck.find({ leadId: req.params.leadId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('checkedBy', 'name email');
    return res.status(200).json({ success: true, data: history, count: history.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};



// // ══════════════════════════════════════════════════════════════════
// // BULK UPLOAD — Admin only
// // POST /leads/admin/bulk-upload
// // PRD Section 8.3 — .csv or .xlsx only
// // ══════════════════════════════════════════════════════════════════
// export const bulkUploadLeads = async (req, res) => {
//   try {
//     const roleDoc = await Role.findById(req.user.role);
//     if (roleDoc?.code !== '18')
//       return res.status(403).json({ success: false, message: 'Admin only' });

//     // No file uploaded
//     if (!req.file)
//       return res.status(400).json({ success: false, message: 'No file uploaded' });

//     // Unsupported file type
//     const ext = path.extname(req.file.originalname).toLowerCase();
//     if (!['.csv', '.xlsx'].includes(ext))
//       return res.status(400).json({ success: false, message: 'Unsupported file type. Please upload a .csv or .xlsx file.' });

//     // Parse file
//     const workbook  = xlsx.read(req.file.buffer, { type: 'buffer' });
//     const sheetName = workbook.SheetNames[0];
//     const rows      = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     // Empty file
//     if (!rows || rows.length === 0)
//       return res.status(400).json({ success: false, message: 'The uploaded file contains no lead records. Please add data and re-upload.' });

//     const validRows      = [];
//     const rejectedRows   = [];
//     const seenPhones     = new Set(); // intra-file duplicate tracker

//     for (let i = 0; i < rows.length; i++) {
//       const row    = rows[i];
//       const rowNum = i + 2; // row 1 = header
//       const errors = [];

//       // Required field check
//       if (!row.fullName && !row.full_name && !row['Full Name'])
//         errors.push('fullName is required');
//       if (!row.mobileNumber && !row.mobile_number && !row['Mobile Number'])
//         errors.push('mobileNumber is required');

//       const fullName     = row.fullName || row.full_name     || row['Full Name']     || '';
//       const mobileNumber = row.mobileNumber || row.mobile_number || row['Mobile Number'] || '';
//       const email        = row.email        || row['Email']        || null;
//       const nationality  = row.nationality  || row['Nationality']  || null;
//       const residency    = row.residencyStatus || row['Residency Status'] || null;
//       const employment   = row.employmentStatus || row['Employment Status'] || null;
//       const salary       = row.monthlySalary || row['Monthly Salary'] || null;
//       const notes        = row.notesToXoto  || row['Notes']        || null;

//       // Phone format check
//       const cleanPhone = String(mobileNumber).replace(/\s/g, '');
//       if (mobileNumber && !/^[0-9]{9,15}$/.test(cleanPhone))
//         errors.push('Invalid phone number format');

//       if (errors.length > 0) {
//         rejectedRows.push({ rowNumber: rowNum, fullName, mobileNumber, reason: errors.join(', ') });
//         continue;
//       }

//       // Intra-file duplicate check
//       if (seenPhones.has(cleanPhone)) {
//         rejectedRows.push({ rowNumber: rowNum, fullName, mobileNumber, reason: 'Duplicate within upload file' });
//         continue;
//       }
//       seenPhones.add(cleanPhone);

//       validRows.push({ fullName, mobileNumber: cleanPhone, email, nationality, residencyStatus: residency, employmentStatus: employment, monthlySalary: salary ? Number(salary) : null, notes });
//     }

//     // All rows invalid
//     if (validRows.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'One or more fields in the uploaded file is incorrect/corrupted. Please upload a new file.',
//         rejectedRows,
//       });
//     }

//     // Check each valid row against DB
//     const activeLeads   = []; // phone matches active lead
//     const closedLeads   = []; // phone matches closed/lost lead — create fresh
//     const freshLeads    = []; // brand new

//     for (const row of validRows) {
//       const existing = await Lead.findOne({
//         'customerInfo.mobileNumber': row.mobileNumber,
//         isDeleted: false,
//       }).sort({ createdAt: -1 });

//       if (!existing) {
//         freshLeads.push(row);
//       } else if (['Not Proceeding'].includes(existing.currentStatus)) {
//         // Closed/Lost — create fresh lead per PRD
//         closedLeads.push({ ...row, note: 'Previously closed lead — new lead created' });
//       } else {
//         // Active lead — route to same advisor, flag for admin
//         activeLeads.push({
//           ...row,
//           existingLeadId:    existing._id,
//           existingAdvisorId: existing.assignedTo?.advisorId   || null,
//           existingAdvisorName: existing.assignedTo?.advisorName || 'Unassigned',
//           note: 'Active lead exists — will be routed to existing advisor',
//         });
//       }
//     }

//     // Return preview to admin before creating
//     // Admin confirms with advisorIds in next step
//     return res.status(200).json({
//       success: true,
//       message: `File parsed. ${validRows.length} valid rows found.`,
//       data: {
//         summary: {
//           totalRows:      rows.length,
//           validRows:      validRows.length,
//           rejectedRows:   rejectedRows.length,
//           freshLeads:     freshLeads.length,
//           closedLeads:    closedLeads.length,
//           activeLeads:    activeLeads.length,
//         },
//         freshLeads,
//         closedLeads,
//         activeLeads,   // admin sees these with existing advisor name
//         rejectedRows,  // admin can download this
//         requiresConfirmation: true,
//         nextStep: 'POST /leads/admin/bulk-confirm with advisorIds to create leads',
//       },
//     });

//   } catch (err) {
//     console.error('bulkUploadLeads:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ══════════════════════════════════════════════════════════════════
// // BULK CONFIRM — Admin confirms and assigns
// // POST /leads/admin/bulk-confirm
// // PRD: Even distribution if multiple advisors selected
// // ══════════════════════════════════════════════════════════════════
// export const bulkConfirmLeads = async (req, res) => {
//   try {
//     const roleDoc = await Role.findById(req.user.role);
//     if (roleDoc?.code !== '18')
//       return res.status(403).json({ success: false, message: 'Admin only' });

//     const { freshLeads = [], closedLeads = [], advisorIds = [] } = req.body;
//     // advisorIds = array of advisor IDs to assign to (evenly distributed)

//     const toCreate = [...freshLeads, ...closedLeads];
//     if (!toCreate.length)
//       return res.status(400).json({ success: false, message: 'No leads to create' });

//     // Get advisors with workload for even distribution
//     let advisors = [];
//     if (advisorIds.length > 0) {
//       advisors = await VaultAdvisor.find({ _id: { $in: advisorIds }, isDeleted: false })
//         .sort({ 'workload.currentLeads': 1 }); // lowest workload first
//     }

//     const created  = [];
//     const failed   = [];

//     for (let i = 0; i < toCreate.length; i++) {
//       const row = toCreate[i];
//       try {
//         const lead = await Lead.create({
//           sourceInfo: {
//             source:           'admin',
//             createdByRole:    'admin',
//             createdByName:    req.user?.fullName || req.user?.email || 'Admin',
//             submissionMethod: 'bulk_upload',
//             sourceIp:         req.ip,
//             userAgent:        req.headers['user-agent'],
//           },
//           customerInfo: {
//             fullName:         row.fullName,
//             mobileNumber:     row.mobileNumber,
//             email:            row.email            || null,
//             nationality:      row.nationality      || null,
//             residencyStatus:  row.residencyStatus  || null,
//             employmentStatus: row.employmentStatus || null,
//             monthlySalary:    row.monthlySalary    || null,
//           },
//           notesToXoto:    row.notes || null,
//           currentStatus:  'New',
//           duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
//         });

//         // Assign to advisor if provided — even distribution
//         if (advisors.length > 0) {
//           // Pick advisor with lowest current leads (round-robin by index for remainder)
//           const advisor = advisors[i % advisors.length];
//           lead.assignedTo = {
//             advisorId:   advisor._id,
//             advisorName: advisor.fullName,
//             assignedAt:  new Date(),
//             assignedBy:  req.user._id,
//           };
//           lead.sla = {
//             deadline: new Date(Date.now() + 4 * 60 * 60 * 1000),
//             breached:  false,
//           };
//           lead.currentStatus = 'Assigned';
//           await lead.save();

//           // Update advisor workload
//           await advisor.updateOne({ $inc: { 'workload.currentLeads': 1, 'performanceMetrics.totalLeadsAssigned': 1 } });
//         }

//         created.push({ fullName: row.fullName, mobileNumber: row.mobileNumber, leadId: lead._id });
//       } catch (e) {
//         failed.push({ fullName: row.fullName, mobileNumber: row.mobileNumber, reason: e.message });
//       }
//     }

//     return res.status(201).json({
//       success: true,
//       message: `${created.length} leads created successfully.`,
//       data: {
//         created:   created.length,
//         failed:    failed.length,
//         createdLeads: created,
//         failedLeads:  failed,
//       },
//     });

//   } catch (err) {
//     console.error('bulkConfirmLeads:', err);
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ══════════════════════════════════════════════════════════════════
// // DOWNLOAD TEMPLATE — Admin
// // GET /leads/admin/bulk-template
// // PRD: Template columns = lead creation fields
// // ══════════════════════════════════════════════════════════════════
// export const downloadLeadTemplate = async (req, res) => {
//   try {
//     const roleDoc = await Role.findById(req.user.role);
//     if (roleDoc?.code !== '18')
//       return res.status(403).json({ success: false, message: 'Admin only' });

//     const templateData = [
//       {
//         fullName:         'Mohammed Al Rashidi',
//         mobileNumber:     '0501234567',
//         email:            'example@email.com',
//         nationality:      'UAE National',
//         residencyStatus:  'UAE National',
//         employmentStatus: 'Salaried',
//         monthlySalary:    35000,
//         notesToXoto:      'Optional notes here',
//       },
//     ];

//     const workbook  = xlsx.utils.book_new();
//     const worksheet = xlsx.utils.json_to_sheet(templateData);
//     xlsx.utils.book_append_sheet(workbook, worksheet, 'Leads');

//     const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

//     res.setHeader('Content-Disposition', 'attachment; filename=lead_upload_template.xlsx');
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     return res.send(buffer);

//   } catch (err) {
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };