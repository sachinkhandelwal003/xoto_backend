const VaultAgent = require('../models/Agent');
const Partner = require('../models/Partner');
const Lead = require('../models/Lead');
const Commission = require('../models/Commission');
const bcrypt = require('bcryptjs');
const { Role } = require('../../../modules/auth/models/role/role.model');
const { createToken } = require('../../../middleware/auth');

/* =====================================
   AGENT SIGNUP (REGISTRATION)
===================================== */
const agentSignup = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      phone_number,
      country_code,
      password,
      agentType,
      partnerId,
      maritalStatus,
      numberOfDependents,
      dependents,
      nationality,
      dateOfBirth,
      gender
    } = req.body;

    // Validation
    if (!first_name || !last_name || !password || !phone_number) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, password and phone number are required"
      });
    }

    // Check role based on agent type
    let roleCode = 16; // Default for Freelance Agent
    if (agentType === 'PartnerAffiliatedAgent') {
      roleCode = 17; // Partner Affiliated Agent role code
    }

    const roleDoc = await Role.findOne({ code: roleCode });
    if (!roleDoc) {
      return res.status(404).json({
        success: false,
        message: `Role with code ${roleCode} not found`
      });
    }

    // Check if phone already exists
    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered"
      });
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "Email already registered"
        });
      }
    }

    // Check partner if agent is PartnerAffiliated
    let partner = null;
    let affiliationStatus = 'none';
    let isActive = true;

    if (agentType === 'PartnerAffiliatedAgent') {
      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: "Partner ID is required for Partner Affiliated Agent"
        });
      }

      partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: "Partner not found"
        });
      }

      affiliationStatus = 'pending';
      isActive = false; // Will be activated after admin verification
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create agent
    const newAgent = await VaultAgent.create({
      name: {
        first_name,
        last_name
      },
      phone: {
        country_code: country_code || '+971',
        number: phone_number
      },
      email: email || null,
      password: hashedPassword,
      role: roleDoc._id,
      agentType: agentType || 'FreelanceAgent',
      partnerId: partnerId || null,
      affiliationStatus: affiliationStatus,
      maritalStatus: maritalStatus || null,
      numberOfDependents: numberOfDependents || 0,
      dependents: dependents || [],
      nationality: nationality || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      isActive: isActive,
      isPhoneVerified: false,
      isEmailVerified: false
    });

    // Update partner's agent count
    if (partner && agentType === 'PartnerAffiliatedAgent') {
      partner.numberOfAgents += 1;
      await partner.save();
    }

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: agentType === 'PartnerAffiliatedAgent' 
        ? "Agent registered successfully. Waiting for admin verification."
        : "Freelance agent registered successfully",
      data: agentResponse
    });

  } catch (error) {
    console.error("Agent signup error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   AGENT LOGIN
===================================== */
const agentLogin = async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    if (!phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password required"
      });
    }

    const agent = await VaultAgent.findOne({ 'phone.number': phone_number })
      .select('+password')
      .populate('role')
      .populate('partnerId', 'companyName status');

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (!agent.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact admin."
      });
    }

    if (agent.suspendedAt) {
      return res.status(403).json({
        success: false,
        message: `Account suspended. Reason: ${agent.suspensionReason || 'Contact admin'}`
      });
    }

    if (agent.agentType === 'PartnerAffiliatedAgent' && agent.affiliationStatus !== 'verified') {
      return res.status(403).json({
        success: false,
        message: `Affiliation status: ${agent.affiliationStatus}. Please wait for admin verification.`
      });
    }

    // Update last login
    agent.lastLoginAt = new Date();
    await agent.save();

    const token = createToken(agent);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: agentResponse
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET ALL AGENTS (Admin only)
===================================== */
const getAllAgents = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { agentType, affiliationStatus, isActive } = req.query;

    let query = { isDeleted: false };
    if (agentType) query.agentType = agentType;
    if (affiliationStatus) query.affiliationStatus = affiliationStatus;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const agents = await VaultAgent.find(query)
      .select('-password')
      .populate('role', 'name code')
      .populate('partnerId', 'companyName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: agents,
      total: total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit: limit
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET AGENT BY ID
===================================== */
const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findOne({ _id: id, isDeleted: false })
      .select('-password')
      .populate('role', 'name code')
      .populate('partnerId', 'companyName status');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: agent
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   UPDATE AGENT
===================================== */
const updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    // Don't allow updating sensitive fields directly
    delete updateData.password;
    delete updateData.role;
    delete updateData._id;

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: "Agent updated successfully",
      data: updatedAgent
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   DELETE AGENT (Soft Delete)
===================================== */
const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.isDeleted = true;
    agent.deletedAt = new Date();
    agent.isActive = false;
    await agent.save();

    // If agent was affiliated with partner, update partner's agent count
    if (agent.partnerId && agent.agentType === 'PartnerAffiliatedAgent') {
      await Partner.findByIdAndUpdate(agent.partnerId, {
        $inc: { numberOfAgents: -1 }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Agent deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   VERIFY PARTNER AFFILIATED AGENT (Admin)
===================================== */
const verifyAffiliatedAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.user._id;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (agent.agentType !== 'PartnerAffiliatedAgent') {
      return res.status(400).json({
        success: false,
        message: "This agent is not a Partner Affiliated Agent"
      });
    }

    if (status === 'verified') {
      agent.affiliationStatus = 'verified';
      agent.isActive = true;
      agent.affiliationVerifiedBy = adminId;
      agent.affiliationVerifiedAt = new Date();
    } else if (status === 'rejected') {
      agent.affiliationStatus = 'rejected';
      agent.isActive = false;
      agent.affiliationRejectionReason = rejectionReason || 'Affiliation rejected by admin';
    }

    await agent.save();

    return res.status(200).json({
      success: true,
      message: `Agent affiliation ${status} successfully`,
      data: agent
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   SUSPEND AGENT (Admin)
===================================== */
const suspendAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspensionReason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.suspendedAt = new Date();
    agent.suspensionReason = suspensionReason;
    agent.isActive = false;
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Agent suspended successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   ACTIVATE AGENT (Admin)
===================================== */
const activateAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.suspendedAt = null;
    agent.suspensionReason = null;
    agent.isActive = true;
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Agent activated successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET AGENT DASHBOARD
===================================== */
const getAgentDashboard = async (req, res) => {
  try {
    const agentId = req.user._id;

    // Get leads submitted by this agent
    const leads = await Lead.find({ 'sourceInfo.createdById': agentId, isDeleted: false });
    
    // Get commissions
    const commissions = await Commission.find({ 
      recipientId: agentId, 
      recipientRole: 'freelance_agent',
      isDeleted: false 
    });

    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => l.currentStatus === 'Qualified').length;
    const disbursedLeads = leads.filter(l => l.currentStatus === 'Disbursed').length;
    
    const totalCommissionEarned = commissions
      .filter(c => c.status === 'Paid')
      .reduce((sum, c) => sum + c.commissionAmount, 0);
    
    const pendingCommission = commissions
      .filter(c => ['Confirmed', 'Pending'].includes(c.status))
      .reduce((sum, c) => sum + c.commissionAmount, 0);

    return res.status(200).json({
      success: true,
      data: {
        leads: {
          total: totalLeads,
          qualified: qualifiedLeads,
          disbursed: disbursedLeads,
          conversionRate: totalLeads > 0 ? (disbursedLeads / totalLeads) * 100 : 0
        },
        commissions: {
          totalEarned: totalCommissionEarned,
          pending: pendingCommission
        },
        recentLeads: leads.slice(0, 5)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   UPDATE AGENT PROFILE (Self)
===================================== */
const updateAgentProfile = async (req, res) => {
  try {
    const agentId = req.user._id;
    const updateData = req.body;

    // Allowed fields for self-update
    const allowedFields = [
      'email', 'profilePic', 'address', 'emergencyContact',
      'languagePreference', 'communicationPreference'
    ];

    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      agentId,
      { ...filteredData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedAgent
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   CHANGE PASSWORD
===================================== */
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const agentId = req.user._id;

    const agent = await VaultAgent.findById(agentId).select('+password');
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, agent.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password is incorrect"
      });
    }

    agent.password = await bcrypt.hash(newPassword, 10);
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



/* =====================================
   GET AGENTS BY PARTNER (Partner only)
===================================== */
const getAgentsByPartner = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { 
      partnerId: partnerId, 
      agentType: 'PartnerAffiliatedAgent',
      isDeleted: false 
    };

    const agents = await VaultAgent.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: agents,
      total: total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit: limit
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  agentSignup,
  agentLogin,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  verifyAffiliatedAgent,
  suspendAgent,
  activateAgent,
  getAgentDashboard,
  updateAgentProfile,
  changePassword,
  getAgentsByPartner
};