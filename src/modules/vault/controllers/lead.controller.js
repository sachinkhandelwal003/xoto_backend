import Lead from '../models/VaultLead.js';
import Client from '../models/Client.js';
import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import HistoryService from '../services/history.service.js';

/* =====================================
   HELPER FUNCTION
===================================== */
const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'Agent';
  if (roleId) {
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(roleId);
    const roleCode = roleDoc?.code;
    if (roleCode === '18') userRole = 'Admin';
    else if (roleCode === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent') userRole = 'FreelanceAgent';
    else if (req.user?.agentType === 'PartnerAffiliatedAgent') userRole = 'PartnerAffiliatedAgent';
  }
  return {
    userId: req.user?._id,
    userRole: userRole,
    userName: req.user?.fullName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

/* =====================================
   CREATE LEAD (Agent only)
===================================== */
export const createLead = async (req, res) => {
  try {

    console.log("Create Lead Request Body:", req.body);
    const agentId = req.user._id;
    const agent = await VaultAgent.findById(agentId);
    console.log("Create Lead Request User:", req.user);
    if (!agent || !agent.isActiveAgent()) {
      return res.status(403).json({ success: false, message: "Agent account not active" });
    }
    
    if (agent.agentType === 'FreelanceAgent' && !agent.isVerified) {
      return res.status(403).json({ success: false, message: "Agent not verified" });
    }
    
    const { customerInfo, propertyDetails, referralType, notesToXoto } = req.body;
    
    // Duplicate check (180 days)
    const existingLead = await Lead.findOne({
      'customerInfo.mobileNumber': customerInfo.mobileNumber,
      createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      isDeleted: false
    });
    
    if (existingLead) {
      return res.status(400).json({ success: false, message: "Duplicate lead within 180 days" });
    }
    
    const leadId = `L-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const loanAmount = propertyDetails.propertyValue - (propertyDetails.downPaymentAmount || 0);
    const loanAmountRange = loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
    let commissionTier = null;
    
    if (agent.agentType === 'FreelanceAgent') {
      commissionTier = agent.getCommissionPercentage(loanAmount, referralType);
    }
    
    const lead = await Lead.create({
      leadId,
      sourceInfo: {
        createdByRole: agent.agentType === 'FreelanceAgent' ? 'freelance_agent' : 'partner_affiliated_agent',
        createdById: agentId,
        createdByName: agent.fullName,
        createdAt: new Date(),
        submissionMethod: 'manual_entry',
      },
      customerInfo,
      propertyDetails,
      loanRequirements: { preferredTenureYears: 25, preferredInterestRateType: 'Fixed' },
      referralType,
      commissionTier,
      loanAmountRange,
      expectedCommission: loanAmount * (commissionTier / 100) * 0.01,
      notesToXoto: notesToXoto || null,
      currentStatus: 'New',
      duplicateCheck: { isDuplicate: false, checkPerformedAt: new Date() },
    });
    
    await agent.updateOne({ $inc: { 'earnings.totalLeadsSubmitted': 1 } });
    
    await HistoryService.logLeadActivity(lead, 'LEAD_CREATED', await getUserInfo(req), {
      description: `Lead created for ${customerInfo.fullName}`,
    });
    
    return res.status(201).json({ success: true, message: "Lead created", data: lead });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET MY LEADS (Agent)
===================================== */
export const getMyLeads = async (req, res) => {
  try {
    const agentId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;
    
    let query = { 'sourceInfo.createdById': agentId, isDeleted: false };
    if (status) query.currentStatus = status;
    
    const leads = await Lead.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Lead.countDocuments(query);
    
    return res.status(200).json({ success: true, data: leads, total, pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET LEAD BY ID
===================================== */
export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findOne({ leadId: id, isDeleted: false }).populate('sourceInfo.createdById', 'name email');
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    return res.status(200).json({ success: true, data: lead });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   UPDATE LEAD STATUS (Xoto Admin)
===================================== */
export const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const lead = await Lead.findOne({ leadId: id, isDeleted: false });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    
    lead.currentStatus = status;
    await lead.save();
    
    if (status === 'Qualified') {
      const existingClient = await Client.findOne({ email: lead.customerInfo.email });
      if (!existingClient) {
        await Client.create({
          name: { first_name: lead.customerInfo.fullName.split(' ')[0], last_name: lead.customerInfo.fullName.split(' ').slice(1).join(' ') },
          email: lead.customerInfo.email,
          phone: { number: lead.customerInfo.mobileNumber },
          dateOfBirth: lead.customerInfo.dateOfBirth,
          nationality: lead.customerInfo.nationality,
          residencyStatus: 'UAE Resident',
          employmentStatus: lead.customerInfo.occupation ? 'Salaried' : null,
          monthlySalary: lead.customerInfo.monthlySalary,
          createdByType: 'Agent',
          createdBy: lead.sourceInfo.createdById,
          partnerId: null,
          role: (await import('../../../modules/auth/models/role/role.model.js')).Role.findOne({ code: '23' })._id,
        });
      }
    }
    
    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `Lead status changed to ${status}`,
      notes,
      previousStatus: lead.currentStatus,
      newStatus: status,
    });
    
    return res.status(200).json({ success: true, message: "Lead status updated", data: lead });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET ALL LEADS (Admin)
===================================== */
export const adminGetAllLeads = async (req, res) => {
  try {
    const { status, agentType, page = 1, limit = 20 } = req.query;
    let query = { isDeleted: false };
    if (status) query.currentStatus = status;
    if (agentType) query['sourceInfo.createdByRole'] = agentType;
    
    const leads = await Lead.find(query).populate('sourceInfo.createdById', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Lead.countDocuments(query);
    
    return res.status(200).json({ success: true, data: leads, total, pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER LEADS (Partner only)
===================================== */
export const getPartnerLeads = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const affiliatedAgents = await VaultAgent.find({ partnerId, agentType: 'PartnerAffiliatedAgent', isDeleted: false });
    const agentIds = affiliatedAgents.map(a => a._id);
    
    const leads = await Lead.find({ 'sourceInfo.createdById': { $in: agentIds }, isDeleted: false }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: leads });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

