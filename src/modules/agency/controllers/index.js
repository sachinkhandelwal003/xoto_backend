import Agency from "../models/index.js";
import Agent from "../../Agent/models/agent.js";
import bcrypt from "bcryptjs";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';



/* =====================================
   :one: AGENCY SIGNUP
===================================== */
export const agencySignup = async (req, res) => {
  try {
    const {
      agency_name,
      email,
      password,
      country_code,
      mobile_number,
      profile_photo,
      logo,
      trade_license,
      letter_of_authority,
      address,
      city
    } = req.body;

    if (!agency_name || !email || !password || !mobile_number) {
      return res.status(400).json({
        success: false,
        message: "Agency name, email, password and mobile number are required"
      });
    }

    const existing = await Agency.findOne({ $or: [{ email }, { mobile_number }] });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email or mobile number already registered"
      });
    }

    const roleDoc = await Role.findOne({ code: 15 });
    if (!roleDoc) {
      return res.status(404).json({
        success: false,
        message: "Role with code 15 not found"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const agency = await Agency.create({
      agency_name,
      email,
      password: hashedPassword,
      role: roleDoc._id,
      country_code: country_code || "+971",
      mobile_number,
      profile_photo: profile_photo || "",
      logo: logo || "",
      trade_license: trade_license || "",
      letter_of_authority: letter_of_authority || "",
      address: address || "",
      city: city || "",
      onboarding_status: "pending",
      agents: [],
      totalAgents: 0,
      is_active: true,
      is_email_verified: false,
      is_mobile_verified: false
    });

    const data = agency.toObject();
    delete data.password;

    return res.status(201).json({
      success: true,
      message: "Agency registered successfully. Waiting for admin approval.",
      data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :two: AGENCY LOGIN
===================================== */
export const agencyLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required"
      });
    }

    const agency = await Agency.findOne({ email })
      .select('+password')
      .populate('role');

    if (!agency) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const match = await bcrypt.compare(password, agency.password);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (!agency.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account disabled"
      });
    }

    if (agency.onboarding_status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Waiting for admin approval"
      });
    }

    const token = createToken(agency, "agency");
    const data = agency.toObject();
    delete data.password;

    return res.status(200).json({
      success: true,
      token,
      message: "Login successful",
      user: data,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :three: GET AGENCY BY ID
===================================== */
export const getAgencyById = async (req, res) => {
  try {
    const { id } = req.params;

    const agency = await Agency.findById(id)
      .select("-password")
      .populate('agents', 'first_name last_name email phone_number profile_photo isVerified onboarding_status');

    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: agency
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :four: GET ALL AGENCIES
===================================== */
export const getAllAgencies = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const onboarding_status = req.query.onboarding_status;

    let query = {};
    if (onboarding_status) query.onboarding_status = onboarding_status;

    const total = await Agency.countDocuments(query);
    const agencies = await Agency.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-password");

    return res.status(200).json({
      success: true,
      count: agencies.length,
      total: total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      },
      data: agencies
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :five: UPDATE AGENCY
===================================== */
export const updateAgency = async (req, res) => {
  try {
    const { id } = req.params;

    const allowedFields = [
      "agency_name",
      "profile_photo",
      "logo",
      "country_code",
      "mobile_number",
      "address",
      "city",
      "trade_license",
      "letter_of_authority",
      "onboarding_status",
      "is_active"
    ];

    let updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.password) {
      updateData.password = await bcrypt.hash(req.body.password, 10);
    }

    const updated = await Agency.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Agency updated successfully",
      data: updated
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :six: DELETE AGENCY
===================================== */
export const deleteAgency = async (req, res) => {
  try {
    const { id } = req.params;

    // Remove agency reference from all agents
    await Agent.updateMany({ agency: id }, { $set: { agency: null, agentType: "independent", onboarding_status: "pending", isVerified: false } });

    const deleted = await Agency.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Agency deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :seven: APPROVE AGENCY
===================================== */
export const approveAgency = async (req, res) => {
  try {
    const { id } = req.params;

    const agency = await Agency.findById(id);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    agency.onboarding_status = "approved";
    await agency.save();

    // Auto-approve all agents under this agency
    await Agent.updateMany(
      { agency: id },
      { $set: { onboarding_status: "approved", isVerified: true } }
    );

    return res.status(200).json({
      success: true,
      message: "Agency approved successfully. All agents under this agency are now active.",
      data: agency
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :eight: REJECT AGENCY
===================================== */
export const rejectAgency = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const agency = await Agency.findById(id);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    agency.onboarding_status = "rejected";
    agency.rejection_reason = rejection_reason || "Not specified";
    await agency.save();

    return res.status(200).json({
      success: true,
      message: "Agency rejected",
      data: agency
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :nine: GET AGENCY PROFILE (Authenticated)
===================================== */
export const getAgencyProfile = async (req, res) => {
  try {
    const agency = await Agency.findById(req.user._id)
      .select('-password')
      .populate('agents', 'first_name last_name email phone_number profile_photo isVerified onboarding_status');

    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: agency
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :ten: UPDATE AGENCY PROFILE (Authenticated)
===================================== */
export const updateAgencyProfile = async (req, res) => {
  try {
    const allowedUpdates = [
      "agency_name",
      "address",
      "city",
      "profile_photo",
      "logo",
      "trade_license",
      "letter_of_authority"
    ];

    let updateData = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    const agency = await Agency.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: agency
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :eleven: GET AGENTS UNDER AGENCY
===================================== */
export const getAgencyAgents = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    let query = { agency: agencyId };

    if (status) {
      query.onboarding_status = status;
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

    const stats = {
      total: await Agent.countDocuments({ agency: agencyId }),
      approved: await Agent.countDocuments({ agency: agencyId, onboarding_status: 'approved' }),
      pending: await Agent.countDocuments({ agency: agencyId, onboarding_status: 'pending' }),
      rejected: await Agent.countDocuments({ agency: agencyId, onboarding_status: 'rejected' })
    };

    return res.status(200).json({
      success: true,
      data: agents,
      count: agents.length,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      },
      stats
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :twelve: ADD AGENT TO AGENCY
===================================== */
export const addAgentToAgency = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const { agentId } = req.body;

    const agency = await Agency.findById(agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (agent.agency) {
      return res.status(400).json({
        success: false,
        message: "Agent already belongs to an agency"
      });
    }

    agent.agency = agencyId;
    agent.agentType = "agency_agent";
    if (agency.onboarding_status === "approved") {
      agent.onboarding_status = "approved";
      agent.isVerified = true;
    }
    await agent.save();

    if (!agency.agents.includes(agentId)) {
      agency.agents.push(agentId);
      agency.totalAgents = agency.agents.length;
      await agency.save();
    }

    return res.status(200).json({
      success: true,
      message: "Agent added to agency successfully",
      data: { agent, agency }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :thirteen: REMOVE AGENT FROM AGENCY
===================================== */
export const removeAgentFromAgency = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const { agentId } = req.body;

    const agency = await Agency.findById(agencyId);
    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agency not found"
      });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (agent.agency?.toString() !== agencyId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Agent does not belong to this agency"
      });
    }

    agent.agency = null;
    agent.agentType = "independent";
    agent.onboarding_status = "pending";
    agent.isVerified = false;
    await agent.save();

    agency.agents = agency.agents.filter(id => id.toString() !== agentId);
    agency.totalAgents = agency.agents.length;
    await agency.save();

    return res.status(200).json({
      success: true,
      message: "Agent removed from agency successfully",
      data: { agent, agency }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};