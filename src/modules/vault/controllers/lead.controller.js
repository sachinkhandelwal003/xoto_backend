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
/* =====================================
   ADVISOR UPDATE LEAD STATUS (Xoto Advisor only)
   Role: Xoto Advisor
   With SLA Tracking & Document Collection Validation
   (Document status auto-updates from Document uploads)
===================================== */
export const advisorUpdateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status, notes } = req.body;
    const advisorId = req.user._id;

    // Get advisor info
    const advisor = await VaultAdvisor.findById(advisorId);
    if (!advisor) {
      return res.status(404).json({ success: false, message: "Advisor not found" });
    }

    // Find lead assigned to this advisor
    const lead = await Lead.findOne({
      _id: leadId,
      'assignedTo.advisorId': advisorId,
      isDeleted: false
    }).populate('assignedTo.advisorId', 'name email');

    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: "Lead not found or not assigned to you" 
      });
    }

    // Valid statuses
    const validStatuses = [
      'New', 'Assigned', 'Contacted', 'Qualified', 
      'Collecting Documents', 'Application Created', 
      'Not Proceeding'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid status. Disbursed can only be updated from Case." 
      });
    }

    // ========== DOCUMENT COLLECTION VALIDATION (AUTO-CHECK) ==========
    // Get latest document collection status (auto-updated from Document uploads)
    const docCollection = lead.documentCollection || {};
    const collectionPercentage = docCollection.collectionPercentage || 0;
    const readyForSubmission = docCollection.readyForSubmission || false;
    
    // Check if trying to mark as Qualified without documents
    if (status === 'Qualified') {
      if (!readyForSubmission && collectionPercentage < 100) {
        return res.status(400).json({
          success: false,
          message: `Cannot mark as Qualified. Document collection is only ${collectionPercentage}% complete. Required: 100%`,
          data: {
            required: true,
            currentPercentage: collectionPercentage,
            documentsUploaded: docCollection.documentsUploaded || 0,
            documentsRequired: docCollection.totalDocumentsRequired || 7,
            documentsPending: docCollection.documentsPending || 7
          }
        });
      }
    }

    // Check if trying to mark as Application Created without qualification
    if (status === 'Application Created' && lead.currentStatus !== 'Qualified') {
      return res.status(400).json({
        success: false,
        message: `Cannot create application. Lead must be Qualified first. Current status: ${lead.currentStatus}`
      });
    }

    // Prevent downgrading status
    const statusOrder = {
      'New': 0,
      'Assigned': 1,
      'Contacted': 2,
      'Qualified': 3,
      'Collecting Documents': 4,
      'Application Created': 5,
      'Not Proceeding': 99,
      'Disbursed': 100
    };

    if (statusOrder[status] < statusOrder[lead.currentStatus] && lead.currentStatus !== 'Not Proceeding') {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${lead.currentStatus} back to ${status}`
      });
    }

    const previousStatus = lead.currentStatus;
    
    // Store messages
    let advisorMessage = "";
    let alertType = null;
    let customerCreated = null;

    // ========== UPDATE LEAD STATUS ==========
    lead.currentStatus = status;

    // ========== START DOCUMENT COLLECTION TRACKING ==========
    if (status === 'Collecting Documents' && !lead.documentCollection.collectionStartedAt) {
      lead.documentCollection.collectionStartedAt = new Date();
      lead.documentCollection.collectionMethod = 'agent_collected';
      advisorMessage = "📄 Document collection started. System will auto-track uploaded documents.";
    }

    // ========== SLA TRACKING FOR CONTACTED ==========
    if (status === 'Contacted') {
      lead.sla.firstContactAt = new Date();
      
      const assignedAt = lead.assignedTo?.assignedAt || lead.createdAt;
      const responseTimeHours = (lead.sla.firstContactAt - new Date(assignedAt)) / (1000 * 60 * 60);
      lead.sla.responseTimeHours = Math.round(responseTimeHours * 10) / 10;
      
      if (lead.sla.deadline && new Date() > new Date(lead.sla.deadline)) {
        lead.sla.breached = true;
        lead.sla.breachedAt = new Date();
        
        const hoursLate = ((new Date() - new Date(lead.sla.deadline)) / (1000 * 60 * 60)).toFixed(1);
        advisorMessage = `⚠️ SLA BREACHED! Lead contacted ${hoursLate} hours late. Response time: ${lead.sla.responseTimeHours} hours.`;
        alertType = 'SLA_BREACH';
        
        await updateAdvisorSLAMetrics(advisorId, true, lead.sla.responseTimeHours);
      } else {
        const hoursEarly = ((new Date(lead.sla.deadline) - lead.sla.firstContactAt) / (1000 * 60 * 60)).toFixed(1);
        advisorMessage = `✅ Lead contacted within SLA! Response time: ${lead.sla.responseTimeHours} hours (${hoursEarly} hours before deadline).`;
        
        await updateAdvisorSLAMetrics(advisorId, false, lead.sla.responseTimeHours);
      }
    }

    // ========== TRACK QUALIFICATION ==========
    if (status === 'Qualified') {
      lead.sla.qualificationAt = new Date();
      
      if (lead.documentCollection) {
        lead.documentCollection.readyForSubmission = true;
        lead.documentCollection.collectionCompletedAt = new Date();
      }
      
      if (lead.sla.firstContactAt) {
        const timeToQualifyHours = (lead.sla.qualificationAt - new Date(lead.sla.firstContactAt)) / (1000 * 60 * 60);
        lead.sla.timeToQualifyHours = Math.round(timeToQualifyHours * 10) / 10;
        advisorMessage = `🎯 Lead qualified! Time from contact: ${lead.sla.timeToQualifyHours} hours. Documents: ${docCollection.documentsUploaded || 0}/${docCollection.totalDocumentsRequired || 7}`;
      } else {
        advisorMessage = `🎯 Lead qualified successfully! Documents: ${docCollection.documentsUploaded || 0}/${docCollection.totalDocumentsRequired || 7}`;
      }
    }

    // ========== MESSAGES ==========
    if (status === 'Collecting Documents' && lead.documentCollection.collectionStartedAt) {
      const uploaded = docCollection.documentsUploaded || 0;
      const total = docCollection.totalDocumentsRequired || 7;
      advisorMessage = `📄 Document collection: ${uploaded}/${total} uploaded (Auto-tracked). System will auto-update as you upload.`;
    }
    
    if (status === 'Application Created') {
      advisorMessage = `📝 Application created. Case will be generated automatically.`;
    }
    
    if (status === 'Not Proceeding') {
      advisorMessage = `❌ Lead marked as Not Proceeding. Reason: ${notes || 'Not provided'}`;
    }

    // Save notes
    if (notes) {
      lead.notesToXoto = notes;
    }

    await lead.save();

    // ========== AUTO-CREATE CUSTOMER ON QUALIFIED ==========
    if (status === 'Qualified') {
      customerCreated = await createOrGetCustomer(lead);
      if (customerCreated) {
        lead.customerId = customerCreated._id;
        await lead.save();
        advisorMessage += `\n\n✅ ${customerCreated.message}`;
      }
    }

    // ========== CHECK FOR EXISTING CASE ==========
    let existingCase = null;
    if (status === 'Application Created') {
      const Case = mongoose.model('Case');
      existingCase = await Case.findOne({ 
        sourceLeadId: lead._id,
        isDeleted: false 
      });
      
      if (!existingCase) {
        advisorMessage = `⚠️ No case found. Please create a case from the proposal first.`;
      } else {
        advisorMessage = `✅ Application created. Case ${existingCase.caseReference} ready.`;
      }
    }

    // ========== LOG ACTIVITY ==========
    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_UPDATED_BY_ADVISOR', await getUserInfo(req), {
      description: `Lead status changed from ${previousStatus} to ${status}`,
      slaInfo: {
        responseTime: lead.sla.responseTimeHours,
        timeToQualify: lead.sla.timeToQualifyHours,
        breached: lead.sla.breached,
        deadline: lead.sla.deadline
      },
      documentStatus: {
        uploaded: docCollection.documentsUploaded || 0,
        total: docCollection.totalDocumentsRequired || 7,
        percentage: collectionPercentage,
        readyForSubmission: readyForSubmission
      },
      notes: notes || null,
      advisorMessage
    });

    // ========== RETURN RESPONSE ==========
    return res.status(200).json({ 
      success: true, 
      message: "Lead status updated successfully",
      data: {
        lead: {
          _id: lead._id,
          customerName: lead.customerInfo.fullName,
          previousStatus: previousStatus,
          currentStatus: status,
          sla: {
            deadline: lead.sla.deadline,
            breached: lead.sla.breached,
            responseTimeHours: lead.sla.responseTimeHours,
            firstContactAt: lead.sla.firstContactAt,
            qualificationAt: lead.sla.qualificationAt,
            timeToQualifyHours: lead.sla.timeToQualifyHours
          },
          documentStatus: {
            uploaded: docCollection.documentsUploaded || 0,
            total: docCollection.totalDocumentsRequired || 7,
            percentage: collectionPercentage,
            readyForSubmission: readyForSubmission
          }
        },
        advisorMessage: advisorMessage,
        alert: alertType ? { type: alertType, message: advisorMessage } : null,
        customerCreated: customerCreated,
        existingCase: existingCase ? {
          id: existingCase._id,
          reference: existingCase.caseReference,
          status: existingCase.currentStatus
        } : null,
        nextActions: getNextAdvisorActions(status, !!existingCase, docCollection),
        canQualify: readyForSubmission && status !== 'Qualified',
        documentProgress: {
          required: true,
          current: collectionPercentage,
          canProceed: collectionPercentage === 100
        }
      }
    });

  } catch (error) {
    console.error("advisorUpdateLeadStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ========== HELPER FUNCTIONS ==========

/**
 * Update advisor SLA metrics
 */
async function updateAdvisorSLAMetrics(advisorId, isBreach, responseTimeHours) {
  try {
    const advisor = await VaultAdvisor.findById(advisorId);
    if (!advisor) return;

    if (!advisor.performanceMetrics) {
      advisor.performanceMetrics = {
        totalLeadsAssigned: 0,
        totalLeadsContacted: 0,
        totalLeadsQualified: 0,
        slaBreaches: 0,
        slaComplianceRate: 100,
        averageResponseTimeHours: 0
      };
    }

    advisor.performanceMetrics.totalLeadsContacted = (advisor.performanceMetrics.totalLeadsContacted || 0) + 1;
    
    if (isBreach) {
      advisor.performanceMetrics.slaBreaches = (advisor.performanceMetrics.slaBreaches || 0) + 1;
    }

    const currentAvg = advisor.performanceMetrics.averageResponseTimeHours || 0;
    const totalContacts = advisor.performanceMetrics.totalLeadsContacted;
    const newAvg = ((currentAvg * (totalContacts - 1)) + responseTimeHours) / totalContacts;
    advisor.performanceMetrics.averageResponseTimeHours = Math.round(newAvg * 10) / 10;

    const totalAssigned = advisor.performanceMetrics.totalLeadsAssigned || 1;
    const breaches = advisor.performanceMetrics.slaBreaches || 0;
    advisor.performanceMetrics.slaComplianceRate = Math.round(((totalAssigned - breaches) / totalAssigned) * 100);

    await advisor.save();
  } catch (error) {
    console.error("Error updating advisor SLA metrics:", error);
  }
}

/**
 * Create or get existing customer
 */
async function createOrGetCustomer(lead) {
  try {
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
      
      return {
        _id: customer._id,
        name: `${firstName} ${lastName}`,
        email: email.toLowerCase(),
        message: `New customer account created for ${fullName}`
      };
    }
    
    return {
      _id: customer._id,
      name: customer.name?.first_name + ' ' + customer.name?.last_name,
      message: `Existing customer linked to this lead`
    };
  } catch (error) {
    console.error("Error creating customer:", error);
    return null;
  }
}

/**
 * Get next actions for advisor
 */
function getNextAdvisorActions(status, hasCase = false, documentCollection = null) {
  const uploaded = documentCollection?.documentsUploaded || 0;
  const total = documentCollection?.totalDocumentsRequired || 7;
  
  const actions = {
    'Contacted': [
      "Start document collection",
      "Upload customer documents (EID, Passport, Bank Statements)",
      "System auto-tracks upload progress"
    ],
    'Collecting Documents': [
      `📄 Documents: ${uploaded}/${total} uploaded (Auto-tracked)`,
      "Upload remaining documents",
      "System will auto-update progress",
      "Once 100% complete, you can mark as Qualified"
    ],
    'Qualified': [
      "Create loan proposal for the customer",
      "Send proposal via email/WhatsApp",
      "Wait for customer approval",
      "Create case after proposal acceptance"
    ],
    'Application Created': hasCase ? [
      "Case ready for processing",
      "Ops team will review",
      "Track case status"
    ] : [
      "⚠️ Create a case from the proposal first"
    ]
  };
  
  return actions[status] || ["Update lead notes", "Monitor lead progress"];
}
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


/* =====================================
   ADVISOR UPDATE LEAD INFORMATION
   Role: Xoto Advisor (for assigned leads only)
===================================== */
export const advisorUpdateLeadInfo = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { customerInfo, propertyDetails, loanRequirements, notesToXoto } = req.body;
    const advisorId = req.user._id;

    // Check if lead exists and is assigned to this advisor
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

    // Update customer information if provided
    if (customerInfo) {
      const allowedCustomerFields = ['occupation', 'employer', 'monthlySalary', 'numberOfDependents', 'maritalStatus'];
      allowedCustomerFields.forEach(field => {
        if (customerInfo[field] !== undefined) {
          lead.customerInfo[field] = customerInfo[field];
        }
      });
    }

    // Update property details if provided
    if (propertyDetails) {
      const allowedPropertyFields = ['propertyValue', 'downPaymentAmount', 'propertyAgeYears', 'isOffPlan', 'completionDate'];
      allowedPropertyFields.forEach(field => {
        if (propertyDetails[field] !== undefined) {
          lead.propertyDetails[field] = propertyDetails[field];
        }
      });
      
      // Update property address if provided
      if (propertyDetails.propertyAddress) {
        lead.propertyDetails.propertyAddress = {
          ...lead.propertyDetails.propertyAddress,
          ...propertyDetails.propertyAddress
        };
      }
    }

    // Update loan requirements if provided
    if (loanRequirements) {
      const allowedLoanFields = ['preferredTenureYears', 'preferredInterestRateType', 'feeFinancingPreference', 
                                   'lifeInsurancePreference', 'propertyInsurancePreference', 'specialRequirements'];
      allowedLoanFields.forEach(field => {
        if (loanRequirements[field] !== undefined) {
          lead.loanRequirements[field] = loanRequirements[field];
        }
      });
    }

    // Update notes
    if (notesToXoto !== undefined) {
      lead.notesToXoto = notesToXoto;
    }

    await lead.save();

    await HistoryService.logLeadActivity(lead, 'LEAD_INFO_UPDATED_BY_ADVISOR', await getUserInfo(req), {
      description: `Lead information updated by advisor after customer contact`,
      metadata: { updatedFields: Object.keys(req.body) }
    });

    return res.status(200).json({ 
      success: true, 
      message: "Lead information updated successfully", 
      data: lead 
    });

  } catch (error) {
    console.error("advisorUpdateLeadInfo error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};



