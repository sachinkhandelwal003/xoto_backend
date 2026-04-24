import Lead from '../models/VaultLead.js';
import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import HistoryService from '../services/history.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import Customer from '../../../modules/auth/models/user/customer.model.js';
import VaultAdvisor from '../models/XotoAdvisor.js'; // ✅ FIX
import mongoose from 'mongoose';

/* =====================================
   HELPER FUNCTION
===================================== */
const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'System';
  if (roleId) {
    const RoleModel = await import('../../../modules/auth/models/role/role.model.js');
    const roleDoc = await RoleModel.Role.findById(roleId);
    const roleCode = roleDoc?.code;
    if (roleCode === '18') userRole = 'Admin';
    else if (roleCode === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent') userRole = 'FreelanceAgent';
    else if (req.user?.agentType === 'PartnerAffiliatedAgent') userRole = 'PartnerAffiliatedAgent';
    else if (req.user?.employeeType === 'XotoAdvisor') userRole = 'XotoAdvisor';
  }
  return {
    userId: req.user?._id,
    userRole: userRole,
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

/* =====================================
   1. CREATE LEAD - AGENT (Freelance & Partner-Affiliated)
   Role: FreelanceAgent, PartnerAffiliatedAgent
===================================== */
export const createLead = async (req, res) => {
  try {
    const agentId = req.user._id;
    const agent = await VaultAgent.findById(agentId);
    
    if (!agent || !agent.isActiveAgent()) {
      return res.status(403).json({ success: false, message: "Agent account not active" });
    }
    
    if (agent.agentType === 'FreelanceAgent' && !agent.isVerified) {
      return res.status(403).json({ success: false, message: "Agent not verified" });
    }
    
    const { customerInfo, propertyDetails, referralType, notesToXoto } = req.body;
    
    // Validation
    if (!customerInfo?.fullName || !customerInfo?.email || !customerInfo?.mobileNumber) {
      return res.status(400).json({ success: false, message: "Customer name, email and mobile number are required" });
    }
    
    if (!propertyDetails?.propertyType || !propertyDetails?.propertyValue) {
      return res.status(400).json({ success: false, message: "Property type and value are required" });
    }
    
    // Duplicate check (180 days)
    const existingLead = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      isDeleted: false
    });
    
    if (existingLead) {
      return res.status(400).json({ success: false, message: "Duplicate lead within 180 days" });
    }
    
    const loanAmount = propertyDetails.propertyValue - (propertyDetails.downPaymentAmount || 0);
    const loanAmountRange = loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
    let commissionTier = null;
    
    if (agent.agentType === 'FreelanceAgent') {
      commissionTier = agent.getCommissionPercentage(loanAmount, referralType);
    }
    
    const lead = await Lead.create({
      sourceInfo: {
        source: agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdByRole: agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdById: agentId,
        createdByModel: 'VaultAgent',
        createdByName: agent.fullName,
        createdAt: new Date(),
        submissionMethod: 'manual_entry',
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
      },
      customerInfo,
      propertyDetails,
      loanRequirements: { preferredTenureYears: 25, preferredInterestRateType: 'Fixed' },
      referralType: referralType || 'Referral Only',
      commissionTier,
      loanAmountRange,
      expectedCommission: commissionTier ? (loanAmount * (commissionTier / 100) * 0.01) : null,
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });
    
    await agent.updateOne({ $inc: { 'earnings.totalLeadsSubmitted': 1 } });
    
    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED', await getUserInfo(req), {
      description: `Lead created for ${customerInfo.fullName}`,
    });
    
    const message = agent.agentType === 'FreelanceAgent' 
      ? "Lead created successfully. Awaiting admin assignment to Xoto Advisor."
      : "Lead created successfully. Your partner can now view this lead.";
    
    return res.status(201).json({ success: true, message, data: lead });
    
  } catch (error) {
    console.error("Create lead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   2. CREATE WEBSITE LEAD (Public)
   Role: Public (No Auth)
===================================== */
export const createWebsiteLead = async (req, res) => {
  try {
    const { customerInfo, propertyDetails, notesToXoto } = req.body;
    
    // Validation
    if (!customerInfo?.fullName || !customerInfo?.email || !customerInfo?.mobileNumber) {
      return res.status(400).json({ success: false, message: "Customer name, email and mobile number are required" });
    }
    
    if (!propertyDetails?.propertyType || !propertyDetails?.propertyValue) {
      return res.status(400).json({ success: false, message: "Property type and value are required" });
    }
    
    // Duplicate check (30 days for website leads)
    const existingLead = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      isDeleted: false
    });
    
    if (existingLead) {
      return res.status(400).json({ success: false, message: "You have already submitted a request. Our team will contact you soon." });
    }
    
    const loanAmount = propertyDetails.propertyValue - (propertyDetails.downPaymentAmount || 0);
    const loanAmountRange = loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
    
    const lead = await Lead.create({
      sourceInfo: {
        source: 'website',
        createdByRole: 'website',
        createdByName: 'Website Visitor',
        createdAt: new Date(),
        submissionMethod: 'website_form',
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
      },
      customerInfo,
      propertyDetails,
      loanRequirements: { preferredTenureYears: 25, preferredInterestRateType: 'Fixed' },
      referralType: 'Referral Only',
      loanAmountRange,
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });
    
    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED_FROM_WEBSITE', await getUserInfo(req), {
      description: `Website lead created for ${customerInfo.fullName}`,
    });
    
    return res.status(201).json({ 
      success: true, 
      message: "Thank you! Our mortgage advisor will contact you within 24 hours.", 
      data: { leadId: lead._id }
    });
    
  } catch (error) {
    console.error("Create website lead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   3. CREATE PARTNER LEAD (Individual Partner only)
   Role: Partner (Individual only)
===================================== */
export const createPartnerLead = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const partner = await Partner.findById(partnerId);
    
    if (!partner || !partner.isActive()) {
      return res.status(403).json({ success: false, message: "Partner account not active" });
    }
    
    // Only Individual Partners can create leads directly
    if (partner.partnerCategory !== 'individual') {
      return res.status(403).json({ 
        success: false, 
        message: "Company partners cannot create leads directly. Please add affiliated agents to create leads on your behalf." 
      });
    }
    
    const { customerInfo, propertyDetails, referralType, notesToXoto } = req.body;
    
    // Validation
    if (!customerInfo?.fullName || !customerInfo?.email || !customerInfo?.mobileNumber) {
      return res.status(400).json({ success: false, message: "Customer name, email and mobile number are required" });
    }
    
    if (!propertyDetails?.propertyType || !propertyDetails?.propertyValue) {
      return res.status(400).json({ success: false, message: "Property type and value are required" });
    }
    
    // Duplicate check (180 days)
    const existingLead = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      isDeleted: false
    });
    
    if (existingLead) {
      return res.status(400).json({ success: false, message: "Duplicate lead within 180 days" });
    }
    
    const loanAmount = propertyDetails.propertyValue - (propertyDetails.downPaymentAmount || 0);
    const loanAmountRange = loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
    
    const lead = await Lead.create({
      sourceInfo: {
        source: 'individual_partner',
        createdByRole: 'individual_partner',
        createdById: partnerId,
        createdByModel: 'Partner',
        createdByName: partner.displayName,
        createdAt: new Date(),
        submissionMethod: 'manual_entry',
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'],
      },
      customerInfo,
      propertyDetails,
      loanRequirements: { preferredTenureYears: 25, preferredInterestRateType: 'Fixed' },
      referralType: referralType || 'Referral Only',
      loanAmountRange,
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });
    
    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED_BY_PARTNER', await getUserInfo(req), {
      description: `Lead created by partner ${partner.displayName} for ${customerInfo.fullName}`,
    });
    
    return res.status(201).json({ success: true, message: "Lead created successfully", data: lead });
    
  } catch (error) {
    console.error("Create partner lead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   4. GET MY LEADS (Agent)
   Role: FreelanceAgent, PartnerAffiliatedAgent
===================================== */
export const getMyLeads = async (req, res) => {
  try {
    const agentId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;
    
    let query = { 
      'sourceInfo.createdById': agentId, 
      isDeleted: false 
    };
    if (status) query.currentStatus = status;
    
    const leads = await Lead.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
      
    const total = await Lead.countDocuments(query);
    
    return res.status(200).json({ 
      success: true, 
      data: leads, 
      total, 
      pagination: { 
        totalPages: Math.ceil(total / limit), 
        currentPage: parseInt(page), 
        limit 
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   5. GET LEAD BY ID
   Role: All authenticated users (with permission check)
===================================== */
export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findOne({ _id: id, isDeleted: false })
      .populate('sourceInfo.createdById', 'name email');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    // ✅ No permission check — anyone authenticated can access

    return res.status(200).json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error("Get lead error:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   6. GET PARTNER LEADS (Partner only)
   Role: Partner (Both Company & Individual)
===================================== */
export const getPartnerLeads = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const partner = await Partner.findById(partnerId);
    
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }
    
    let leads = [];
    
    if (partner.partnerCategory === 'company') {
      // Company Partner: Get leads from affiliated agents
      const affiliatedAgents = await VaultAgent.find({ 
        partnerId: partnerId, 
        agentType: 'PartnerAffiliatedAgent', 
        isDeleted: false 
      });
      
      const agentIds = affiliatedAgents.map(a => a._id);
      
      if (agentIds.length > 0) {
        leads = await Lead.find({ 
          'sourceInfo.createdById': { $in: agentIds }, 
          isDeleted: false 
        }).sort({ createdAt: -1 }).populate('sourceInfo.createdById', 'name email');
      }
    } else {
      // Individual Partner: Get their own leads
      leads = await Lead.find({ 
        'sourceInfo.createdById': partnerId,
        'sourceInfo.createdByModel': 'Partner',
        isDeleted: false 
      }).sort({ createdAt: -1 });
    }
    
    return res.status(200).json({ success: true, data: leads });
    
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   7. ADMIN GET ALL LEADS
   Role: Admin only
===================================== */
/* =====================================
   7. ADMIN GET ALL LEADS (Only Website & Freelance Agent)
   Role: Admin only
===================================== */
/* =====================================
   7. ADMIN GET ALL LEADS (With Filters)
   Role: Admin only
   Filters: source, status, agentId, advisorId, search, dateRange
===================================== */
export const adminGetAllLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { 
      status, 
      source, 
      agentId,
      advisorId,
      search,
      fromDate,
      toDate,
      page = 1, 
      limit = 20 
    } = req.query;

    // ✅ Build query
    let query = { isDeleted: false };
    
    // 1. Filter by source (freelance_agent, website, etc.)
    if (source) {
      query['sourceInfo.source'] = source;
    } else {
      // Default: Only freelance_agent and website (as per your requirement)
      query['sourceInfo.source'] = { $in: ['freelance_agent', 'website'] };
    }
    
    // 2. Filter by status
    if (status) {
      query.currentStatus = status;
    }
    
    // 3. Filter by Agent ID (who created the lead)
    if (agentId) {
      query['sourceInfo.createdById'] = agentId;
    }
    
    // 4. Filter by Advisor ID (assigned to)
    if (advisorId) {
      query['assignedTo.advisorId'] = advisorId;
    }
    
    // 5. Filter by assigned/unassigned
    if (req.query.assigned === 'true') {
      query['assignedTo.advisorId'] = { $ne: null };
    }
    if (req.query.assigned === 'false') {
      query['assignedTo.advisorId'] = null;
    }
    
    // 6. Search by customer name, email, or mobile
    if (search) {
      query.$or = [
        { 'customerInfo.fullName': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { 'customerInfo.mobileNumber': { $regex: search, $options: 'i' } }
      ];
    }
    
    // 7. Filter by date range
    if (fromDate) {
      query.createdAt = { ...query.createdAt, $gte: new Date(fromDate) };
    }
    if (toDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(toDate) };
    }

    // ✅ Execute query with pagination
    const leads = await Lead.find(query)
      .populate('sourceInfo.createdById', 'name email employeeCode agentType')
      .populate('assignedTo.advisorId', 'name email employeeCode')
      .populate('assignedTo.assignedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

    // ✅ Get summary stats for filters
    const summary = {
      totalLeads: total,
      bySource: await Lead.aggregate([
        { $match: { isDeleted: false, 'sourceInfo.source': { $in: ['freelance_agent', 'website'] } } },
        { $group: { _id: '$sourceInfo.source', count: { $sum: 1 } } }
      ]),
      byStatus: await Lead.aggregate([
        { $match: { isDeleted: false, 'sourceInfo.source': { $in: ['freelance_agent', 'website'] } } },
        { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
      ]),
      unassignedCount: await Lead.countDocuments({
        isDeleted: false,
        'sourceInfo.source': { $in: ['freelance_agent', 'website'] },
        'assignedTo.advisorId': null,
        currentStatus: 'New'
      })
    };

    return res.status(200).json({
      success: true,
      data: leads,
      total,
      summary,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalItems: total
      }
    });

  } catch (error) {
    console.error("adminGetAllLeads error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   8. ADMIN GET UNASSIGNED LEADS
   Role: Admin only
===================================== */
export const getUnassignedLeads = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { page = 1, limit = 20 } = req.query;

    const query = {
      isDeleted: false,
      currentStatus: 'New',
      'assignedTo.advisorId': null,
      'sourceInfo.source': { $in: ['freelance_agent', 'website'] }
    };

    const leads = await Lead.find(query)
      .populate('sourceInfo.createdById', 'name email')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: leads,
      total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   9. ADMIN ASSIGN LEAD TO XOTO ADVISOR
   Role: Admin only
===================================== */
export const assignLeadToXotoAdvisor = async (req, res) => {
  try {
    // 🔐 Admin check
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    const { leadId, advisorId } = req.body;

    if (!leadId || !advisorId) {
      return res.status(400).json({
        success: false,
        message: "leadId and advisorId are required"
      });
    }

    // ✅ FIX: Use proper model
    const advisor = await VaultAdvisor.findById(advisorId);

    if (!advisor || !advisor.isActiveAdvisor()) {
      return res.status(404).json({
        success: false,
        message: "Advisor not found or inactive"
      });
    }

    // ✅ Capacity check
    if (!advisor.canTakeMoreLeads()) {
      return res.status(400).json({
        success: false,
        message: `Advisor ${advisor.fullName} is at max capacity (${advisor.workload.currentLeads}/${advisor.workload.maxLeadsCapacity})`
      });
    }

    // ✅ Find lead
    const lead = await Lead.findOne({ _id: leadId, isDeleted: false });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    // ✅ Prevent reassignment
    if (lead.assignedTo?.advisorId) {
      return res.status(400).json({
        success: false,
        message: "Lead already assigned to an advisor"
      });
    }

    // ✅ Assign lead
    lead.assignedTo = {
      advisorId: advisor._id,
      advisorName: advisor.fullName,
      assignedAt: new Date(),
      assignedBy: req.user._id
    };

    // ✅ SLA (4 hours)
    lead.sla = {
      deadline: new Date(Date.now() + 4 * 60 * 60 * 1000),
      breached: false
    };

    lead.currentStatus = 'Assigned';

    await lead.save();

    // ✅ Update advisor workload safely
    advisor.workload.currentLeads = (advisor.workload.currentLeads || 0) + 1;
    advisor.performanceMetrics.totalLeadsAssigned =
      (advisor.performanceMetrics.totalLeadsAssigned || 0) + 1;

    await advisor.save();

    // ✅ History log
    await HistoryService.logLeadActivity(
      lead,
      'LEAD_ASSIGNED_TO_ADVISOR',
      await getUserInfo(req),
      {
        description: `Lead assigned to advisor ${advisor.fullName}`,
        metadata: {
          advisorId: advisor._id,
          advisorName: advisor.fullName
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: `Lead assigned to ${advisor.fullName}`,
      data: {
        leadId: lead._id,
        advisorName: advisor.fullName,
        slaDeadline: lead.sla.deadline,
        currentStatus: lead.currentStatus
      }
    });

  } catch (error) {
    console.error("Assign lead error:", error); // ✅ helpful debug
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* =====================================
   GET ADVISOR ASSIGNED LEADS (Xoto Advisor only)
   Role: Xoto Advisor
===================================== */
export const getAdvisorAssignedLeads = async (req, res) => {
  try {
    const advisorId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query for leads assigned to this advisor
    let query = {
      isDeleted: false,
      'assignedTo.advisorId': advisorId
    };

    // Filter by status if provided
    if (status) {
      query.currentStatus = status;
    }

    const leads = await Lead.find(query)
      .populate('sourceInfo.createdById', 'name email')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

    // Get summary stats
    const summary = {
      total: total,
      new: await Lead.countDocuments({ ...query, currentStatus: 'New' }),
      assigned: await Lead.countDocuments({ ...query, currentStatus: 'Assigned' }),
      contacted: await Lead.countDocuments({ ...query, currentStatus: 'Contacted' }),
      qualified: await Lead.countDocuments({ ...query, currentStatus: 'Qualified' }),
      collectingDocs: await Lead.countDocuments({ ...query, currentStatus: 'Collecting Documents' }),
      applicationCreated: await Lead.countDocuments({ ...query, currentStatus: 'Application Created' }),
      notProceeding: await Lead.countDocuments({ ...query, currentStatus: 'Not Proceeding' }),
      disbursed: await Lead.countDocuments({ ...query, currentStatus: 'Disbursed' })
    };

    return res.status(200).json({
      success: true,
      data: leads,
      total,
      summary,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalItems: total
      }
    });

  } catch (error) {
    console.error("getAdvisorAssignedLeads error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   ADVISOR UPDATE LEAD STATUS (Xoto Advisor only)
   Role: Xoto Advisor
===================================== */
export const advisorUpdateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes } = req.body;
    const advisorId = req.user._id;

    const lead = await Lead.findOne({
      _id: leadId,
      'assignedTo.advisorId': advisorId,
      isDeleted: false
    });

    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: "Lead not found or not assigned to you" 
      });
    }

    const validStatuses = [
      'New', 'Assigned', 'Contacted', 'Qualified', 
      'Collecting Documents', 'Application Created', 
      'Not Proceeding', 'Disbursed'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid status" 
      });
    }

    const previousStatus = lead.currentStatus;
    lead.currentStatus = status;

    // Track SLA for Contacted status
    if (status === 'Contacted') {
      lead.sla.firstContactAt = new Date();
      if (lead.sla.deadline && new Date() > lead.sla.deadline) {
        lead.sla.breached = true;
        lead.sla.breachedAt = new Date();
      }
    }

    // Track qualification
    if (status === 'Qualified') {
      lead.sla.qualificationAt = new Date();
    }

    if (notes) {
      lead.notesToXoto = notes;
    }

    await lead.save();

    // Create Customer when Qualified
    if (status === 'Qualified') {
      const { email, mobileNumber, fullName, nationality, dateOfBirth } = lead.customerInfo;
      
      let customer = await Customer.findOne({
        $or: [
          { email: email.toLowerCase() },
          { "mobile.number": mobileNumber.replace(/^\+971/, '') }
        ],
        is_deleted: false
      });
      
      if (!customer) {
        const customerRole = await Role.findOne({ name: "Customer" });
        const firstName = fullName.split(' ')[0];
        const lastName = fullName.split(' ').slice(1).join(' ') || '';
        
        customer = await Customer.create({
          name: { first_name: firstName, last_name: lastName },
          email: email.toLowerCase(),
          mobile: { country_code: '+971', number: mobileNumber.replace(/^\+971/, '') },
          dateOfBirth: dateOfBirth || null,
          nationality: nationality || null,
          role: customerRole?._id,
          assignedTo: lead.sourceInfo.createdById,
          source: 'vault',
          isActive: true,
        });
        
        lead.customerId = customer._id;
        await lead.save();
      }
    }

    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_UPDATED_BY_ADVISOR', await getUserInfo(req), {
      description: `Lead status changed from ${previousStatus} to ${status}`,
      notes: notes || null,
    });

    return res.status(200).json({ 
      success: true, 
      message: "Lead status updated successfully", 
      data: lead 
    });

  } catch (error) {
    console.error("advisorUpdateLeadStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
/* =====================================
   10. UPDATE LEAD STATUS (Admin)
   Role: Admin, XotoAdvisor
===================================== */
export const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const lead = await Lead.findOne({ _id: id, isDeleted: false });
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    
    const validStatuses = ['New', 'Assigned', 'Contacted', 'Qualified', 'Collecting Documents', 'Application Created', 'Not Proceeding', 'Disbursed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    
    const previousStatus = lead.currentStatus;
    lead.currentStatus = status;
    
    // Track SLA for Contacted status
    if (status === 'Contacted') {
      lead.sla.firstContactAt = new Date();
      if (lead.sla.deadline && new Date() > lead.sla.deadline) {
        lead.sla.breached = true;
        lead.sla.breachedAt = new Date();
      }
    }
    
    // Track qualification
    if (status === 'Qualified') {
      lead.sla.qualificationAt = new Date();
    }
    
    await lead.save();
    
    // Create Customer when Qualified
    if (status === 'Qualified') {
      const { email, mobileNumber, fullName, nationality, dateOfBirth } = lead.customerInfo;
      
      let customer = await Customer.findOne({
        $or: [
          { email: email.toLowerCase() },
          { "mobile.number": mobileNumber.replace(/^\+971/, '') }
        ],
        is_deleted: false
      });
      
      if (!customer) {
        const customerRole = await Role.findOne({ name: "Customer" });
        const firstName = fullName.split(' ')[0];
        const lastName = fullName.split(' ').slice(1).join(' ') || '';
        
        customer = await Customer.create({
          name: { first_name: firstName, last_name: lastName },
          email: email.toLowerCase(),
          mobile: { country_code: '+971', number: mobileNumber.replace(/^\+971/, '') },
          dateOfBirth: dateOfBirth || null,
          nationality: nationality || null,
          role: customerRole?._id,
          assignedTo: lead.sourceInfo.createdById,
          source: 'vault',
          isActive: true,
        });
        
        lead.customerId = customer._id;
        await lead.save();
      }
    }
    
    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `Lead status changed from ${previousStatus} to ${status}`,
      notes: notes || null,
    });
    
    return res.status(200).json({ success: true, message: "Lead status updated", data: lead });
    
  } catch (error) {
    console.error("Update lead status error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};