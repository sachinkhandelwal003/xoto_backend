const Agent  = require("../models/agent.js");
const Agency = require("../../agency/models/index.js");
const bcrypt = require("bcryptjs");
const { Role } = require('../../../../modules/auth/models/role/role.model.js');
const { createToken } = require('../../../../middleware/auth.js');

/* =====================================
   :one: AGENT SIGNUP
===================================== */
exports.agentSignup = async (req, res) => {
  try {
    const { fullName, email, phone, password, location, agency } = req.body;
    if (!fullName || !phone || !password || !agency) {
      return res.status(400).json({ success: false, message: 'Full name, phone, password, and agency are required' });
    }

    // Check for duplicate phone
    const existing = await Agent.findOne({ phone_number: phone });

    if (existing) return res.status(400).json({ success: false, message: 'Phone number already registered' });

    // Verify agency exists and is active
    const agencyDoc = await Agency.findOne({ _id: agency, isActive: true, isSuspended: false });
    if (!agencyDoc) return res.status(400).json({ success: false, message: 'Selected agency not found or inactive' });
const agentRole = await Role.findOne({ code: 16 });
    const newAgent = await Agent.create({
      fullName,
      email: email || undefined,
      phone,
      password,   // hashed by pre-save hook
      location: location || undefined,
      agency,
        role: agentRole ? agentRole._id : null,
      agencyApprovalStatus: 'pending',
      adminApprovalStatus: 'pending',
      isActive: false,
    });

    // Optionally push agent to agency's agents array
    await Agency.findByIdAndUpdate(agency, { $push: { agents: newAgent._id } });

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Awaiting agency and admin approval.',
      data: { _id: newAgent._id, phone: newAgent.phone, agency: newAgent.agency },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================
   :two: AGENT LOGIN
===================================== */
exports.agentLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ success: false, message: 'Phone and password required' });

    let agent = null;

    // Try 1: search by phone field directly
    agent = await Agent.findOne({ phone });

    // Try 2: split country_code + phone_number
    if (!agent && phone.startsWith('+')) {
      const numberWithoutPlus = phone.slice(1);
      const splits = [
        { country_code: '+' + numberWithoutPlus.slice(0, 1), phone_number: numberWithoutPlus.slice(1) },
        { country_code: '+' + numberWithoutPlus.slice(0, 2), phone_number: numberWithoutPlus.slice(2) },
        { country_code: '+' + numberWithoutPlus.slice(0, 3), phone_number: numberWithoutPlus.slice(3) },
        { country_code: '+' + numberWithoutPlus.slice(0, 4), phone_number: numberWithoutPlus.slice(4) },
      ];

      for (const split of splits) {
        agent = await Agent.findOne({
          country_code: split.country_code,
          phone_number: split.phone_number,
        });
        if (agent) break;
      }
    }

    if (!agent)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (!agent.password)
      return res.status(401).json({ success: false, message: 'Password not set.' });

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (agent.agencyApprovalStatus !== 'approved' || agent.adminApprovalStatus !== 'approved')
      return res.status(403).json({ success: false, message: 'Account not fully approved yet.' });

    // ✅ Populate role before token creation
    const agentWithRole = await Agent.findById(agent._id).populate({
      path: 'role',
      strictPopulate: false,
    });

    const token = createToken(agentWithRole || agent, 'agent');
    const agentData = (agentWithRole || agent).toObject();
    delete agentData.password;

    res.status(200).json({ success: true, token, data: agentData });
  } catch (err) {
    console.error('[Agent Login]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================
   :three: UPDATE AGENT
===================================== */
exports.updateAgent    = async (req, res) =>{
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agent ID required"
      });
    }

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update"
      });
    }

    let updateData = { ...req.body };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updated = await Agent.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Agent updated successfully",
      data: updated
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// controllers/agent.controller.js

/* =====================================
   GET ALL AGENTS - ADMIN ONLY (Independent Agents)
===================================== */
exports.getAllAgents    = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const onboarding_status = req.query.onboarding_status;
    const search = req.query.search;

    // ✅ Admin sees ONLY independent agents
    let query = { agentType: "independent" };

    if (onboarding_status) {
      query.onboarding_status = onboarding_status;
    }

    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Agent.countDocuments(query);
    const agents = await Agent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-password')
      .populate('agency', 'agency_name');

    // Stats for independent agents only
    const stats = {
      total: await Agent.countDocuments({ agentType: "independent" }),
      pending: await Agent.countDocuments({ agentType: "independent", onboarding_status: 'pending' }),
      approved: await Agent.countDocuments({ agentType: "independent", onboarding_status: 'approved' }),
      rejected: await Agent.countDocuments({ agentType: "independent", onboarding_status: 'rejected' }),
      active: await Agent.countDocuments({ agentType: "independent", is_active: true }),
      inactive: await Agent.countDocuments({ agentType: "independent", is_active: false })
    };

    return res.status(200).json({
      success: true,
      message: "Independent agents fetched successfully",
      count: agents.length,
      total: total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      },
      stats: stats,
      data: agents
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET AGENT BY ID - ADMIN
===================================== */
exports.getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Admin can see independent agents only
    const agent = await Agent.findOne({ _id: id})
      .select("-password")
      .populate('agency', 'agency_name');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Independent agent not found"
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







// controllers/agency.controller.js

/* =====================================
   GET ALL AGENTS UNDER AGENCY (Agency Owner)
===================================== */
exports.getAgencyAgents = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search, isVerified } = req.query;

    // ✅ Agency sees ONLY agents under this agency
    let query = { agency: agencyId, agentType: "agency_agent" };

    if (status) {
      query.onboarding_status = status;
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Agent.countDocuments(query);
    const agents = await Agent.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Stats for this agency only
    const stats = {
      total: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent" }),
      approved: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", onboarding_status: 'approved' }),
      pending: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", onboarding_status: 'pending' }),
      rejected: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", onboarding_status: 'rejected' }),
      verified: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", isVerified: true }),
      notVerified: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", isVerified: false })
    };

    return res.status(200).json({
      success: true,
      message: "Agency agents fetched successfully",
      data: agents,
      count: agents.length,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      },
      stats: stats
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET SINGLE AGENT UNDER AGENCY
===================================== */
exports.getAgencyAgentById = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const { agentId } = req.params;

    // ✅ Agency sees only their own agent
    const agent = await Agent.findOne({ 
      _id: agentId, 
      agency: agencyId, 
      agentType: "agency_agent" 
    }).select('-password');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found under this agency"
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
   :six: DELETE AGENT
===================================== */
exports.deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (agent.agency) {
      await Agency.findByIdAndUpdate(agent.agency, {
        $pull: { agents: agent._id },
        $inc: { totalAgents: -1 }
      });
    }

    await Agent.findByIdAndDelete(id);

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
   :seven: APPROVE AGENT
===================================== */
exports.approveAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.isVerified = true;
    agent.onboarding_status = "approved";
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Agent approved successfully",
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
   :eight: REJECT AGENT
===================================== */
exports.rejectAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.onboarding_status = "rejected";
    agent.rejection_reason = rejection_reason || "Not specified";
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Agent rejected",
      data: agent
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};