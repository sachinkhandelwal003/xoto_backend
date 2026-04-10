import Lead from '../models/VaultLead.js';
import Client from '../models/Client.js';
import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import HistoryService from '../services/history.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import Customer from '../../../modules/auth/models/user/customer.model.js';


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
    
    // Duplicate check (180 days) - using mobileNumber
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
    
    // ✅ Create lead without custom leadId - MongoDB will generate _id
    const lead = await Lead.create({
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
    console.error("Create lead error:", error);
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
   GET LEAD BY ID (using MongoDB _id)
===================================== */
export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findOne({ _id: id, isDeleted: false })
      .populate('sourceInfo.createdById', 'name email');
      
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    return res.status(200).json({ success: true, data: lead });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   UPDATE LEAD STATUS (Xoto Admin)
===================================== */
// At the top of lead.controller.js - add this import
export const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    console.log("=== UPDATE LEAD STATUS ===");
    console.log("Lead ID:", id);
    console.log("New Status:", status);
    
    const lead = await Lead.findOne({ _id: id, isDeleted: false });
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    
    const previousStatus = lead.currentStatus;
    lead.currentStatus = status;
    await lead.save();
    console.log("Lead status updated to:", status);
    
    // ✅ If lead becomes Qualified, create Customer
    if (status === 'Qualified') {
      console.log("=== CREATING CUSTOMER ===");
      
      const { email, mobileNumber, fullName, nationality, dateOfBirth } = lead.customerInfo;
      
      // ✅ Check if customer already exists by email or mobile
      let customer = await Customer.findOne({
        $or: [
          { email: email.toLowerCase() },
          { "mobile.number": mobileNumber.replace(/^\+971/, '') }
        ],
        is_deleted: false
      });
      
      if (!customer) {
        // ✅ Get Customer role by NAME (same as customerSignup)
        const customerRole = await Role.findOne({ name: "Customer" });
        
        if (!customerRole) {
          console.error("❌ Customer role not found!");
          return res.status(400).json({ 
            success: false, 
            message: "Customer role not found. Please ensure 'Customer' role exists in database." 
          });
        }
        
        console.log("✅ Customer role found:", customerRole.name, customerRole._id);
        
        // Create new customer
        const firstName = fullName.split(' ')[0];
        const lastName = fullName.split(' ').slice(1).join(' ') || '';
        
        customer = await Customer.create({
          name: {
            first_name: firstName,
            last_name: lastName,
          },
          email: email.toLowerCase(),
          mobile: {
            country_code: '+971',
            number: mobileNumber.replace(/^\+971/, ''),
          },
          dateOfBirth: dateOfBirth || null,
          nationality: nationality || null,
          role: customerRole._id,  // ✅ Set role from database
          assignedTo: lead.sourceInfo.createdById,
          source: 'vault',
          isActive: true,
        });
        
        console.log(`✅ New customer created: ${customer._id}`);
      } else {
        console.log(`✅ Customer already exists: ${customer._id}`);
        
        // ✅ Update customer role if not set
        if (!customer.role) {
          const customerRole = await Role.findOne({ name: "Customer" });
          if (customerRole) {
            customer.role = customerRole._id;
            await customer.save();
            console.log(`✅ Customer role updated for existing customer: ${customer._id}`);
          }
        }
      }
    }
    
    // Log history
    await HistoryService.logLeadActivity(lead, 'LEAD_STATUS_CHANGED', await getUserInfo(req), {
      description: `Lead status changed from ${previousStatus} to ${status}`,
      notes,
      previousStatus,
      newStatus: status,
    });
    
    return res.status(200).json({ 
      success: true, 
      message: "Lead status updated", 
      data: lead 
    });
    
  } catch (error) {
    console.error("Update lead status error:", error);
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
    
    // Filter by status if provided
    if (status) query.currentStatus = status;
    
    // Filter by agent type if provided (freelance_agent or partner_affiliated_agent)
    if (agentType) query['sourceInfo.createdByRole'] = agentType;
    
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
   GET PARTNER LEADS (Partner only)
===================================== */
export const getPartnerLeads = async (req, res) => {
  try {
    const partnerId = req.user._id;
    
    // Find all Partner-Affiliated Agents under this partner
    const affiliatedAgents = await VaultAgent.find({ 
      partnerId: partnerId, 
      agentType: 'PartnerAffiliatedAgent', 
      isDeleted: false 
    });
    
    const agentIds = affiliatedAgents.map(a => a._id);
    
    // If no affiliated agents, return empty array
    if (agentIds.length === 0) {
      return res.status(200).json({ success: true, data: [], message: "No affiliated agents found" });
    }
    
    // Get leads ONLY from these affiliated agents
    const leads = await Lead.find({ 
      'sourceInfo.createdById': { $in: agentIds }, 
      isDeleted: false 
    }).sort({ createdAt: -1 });
    
    return res.status(200).json({ success: true, data: leads });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
