import Agent from "../models/agent.js";
import Agency from "../../agency/models/index.js";
import bcrypt from "bcryptjs";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';

/* =====================================
   :one: AGENT SIGNUP
===================================== */
export const agentSignup = async (req, res) => {
  try {
    const allowedFields = [
      "first_name",
      "last_name",
      "email",
      "phone_number",
      "country_code",
      "operating_city",
      "specialization",
      "country",
      "profile_photo",
      "id_proof",
      "rera_certificate",
      "agency_id"
    ];

    let safeData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        safeData[field] = req.body[field];
      }
    });

    const { first_name, last_name, email, password, phone_number, agency_id } = req.body;

    if (!first_name || !last_name || !password || !phone_number) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, password and phone number are required"
      });
    }

    const roleDoc = await Role.findOne({ code: 16 });
    if (!roleDoc) {
      return res.status(404).json({
        success: false,
        message: "Role with code 16 not found"
      });
    }

    const existingEmail = await Agent.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    const existingPhone = await Agent.findOne({ phone_number });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists"
      });
    }

    // Check agency if provided
    let agency = null;
    let agentType = "independent";
    let onboarding_status = "pending";
    let isVerified = false;

    if (agency_id) {
      agency = await Agency.findById(agency_id);
      if (agency) {
        agentType = "agency_agent";
        if (agency.onboarding_status === "approved") {
          onboarding_status = "approved";
          isVerified = true;
        }
      } else {
        return res.status(404).json({
          success: false,
          message: "Agency not found"
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await Agent.create({
      ...safeData,
      first_name,
      last_name,
      password: hashedPassword,
      role: roleDoc._id,
      agency: agency_id || null,
      agentType: agentType,
      is_email_verified: true,
      is_mobile_verified: true,
      isVerified: isVerified,
      onboarding_status: onboarding_status,
      status: true
    });

    // If agent belongs to agency, add to agency's agents list
    if (agency_id && agency) {
      await Agency.findByIdAndUpdate(agency_id, {
        $push: { agents: newAgent._id },
        $inc: { totalAgents: 1 }
      });
    }

    return res.status(201).json({
      success: true,
      message: agency_id 
        ? "Agent registered under agency successfully" 
        : "Registration successful. Waiting for admin approval.",
      agent: {
        _id: newAgent._id,
        email: newAgent.email,
        agency: newAgent.agency,
        agentType: newAgent.agentType,
        onboarding_status: newAgent.onboarding_status
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
   :two: AGENT LOGIN
===================================== */
export const agentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required",
      });
    }

    const agent = await Agent.findOne({ email })
      .select('+password')
      .populate('role')
      .populate('agency', 'agency_name logo onboarding_status');

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!agent.is_email_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    if (!agent.is_mobile_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your mobile number first",
      });
    }

    if (agent.agentType === "independent" && !agent.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not approved by admin yet",
      });
    }

    if (agent.agentType === "agency_agent" && agent.agency) {
      if (agent.agency.onboarding_status !== "approved") {
        return res.status(403).json({
          success: false,
          message: "Your agency is not approved yet",
        });
      }
    }

    const token = createToken(agent);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      agent: agentResponse,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :three: UPDATE AGENT
===================================== */
export const updateAgent = async (req, res) => {
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
export const getAllAgents = async (req, res) => {
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
export const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Admin can see independent agents only
    const agent = await Agent.findOne({ _id: id, agentType: "independent" })
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
export const getAgencyAgents = async (req, res) => {
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
export const getAgencyAgentById = async (req, res) => {
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
export const deleteAgent = async (req, res) => {
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
export const approveAgent = async (req, res) => {
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
export const rejectAgent = async (req, res) => {
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