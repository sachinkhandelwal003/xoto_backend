import Agent from "../models/agent.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/* =====================================
   1️⃣ AGENT SIGNUP
===================================== */
export const agentSignup = async (req, res) => {
  try {

    const allowedFields = [
      "name",
      "email",
      "phone_number",
      "country_code",
      "operating_city",
      "specialization",
      "country",
      "profile_photo",
      "id_proof",
      "rera_certificate",
      
    ];

    let safeData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        safeData[field] = req.body[field];
      }
    });

    const { name, email, password, phone_number } = req.body;

    if (!name || !email || !password || !phone_number) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing"
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

    const hashedPassword = await bcrypt.hash(password, 10);

    const fullName = `${first_name} ${last_name || ""}`.trim();

    const newAgent = await Agent.create({
      ...safeData,
      name: fullName,
      password: hashedPassword,

      // Verification & Approval flags
      is_email_verified: true,      // frontend handled
      is_mobile_verified: true,
      status: true,                 // approved (dev mode)
      onboarding_status: "registered"
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful. Awaiting admin approval.",
      agent: {
        _id: newAgent._id,
        email: newAgent.email,
        full_name: newAgent.name,
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
   2️⃣ AGENT LOGIN
===================================== */
export const agentLogin = async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required"
      });
    }

    const agent = await Agent.findOne({ email });

    if (!agent) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const match = await bcrypt.compare(password, agent.password);

    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // 🔒 Email Verification Check
    if (!agent.is_email_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first"
      });
    }

    // 🔒 Mobile Verification Check
    if (!agent.is_mobile_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your mobile number first"
      });
    }

    // 🔒 Approval Check
    if (!agent.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not approved"
      });
    }

    const token = jwt.sign(
      {
        agentId: agent._id,
        role: "AGENT"
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    const data = agent.toObject();
    delete data.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: data,
        token
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
   3️⃣ UPDATE AGENT
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

    // 🔒 Block update if not verified
    if (!agent.is_email_verified || !agent.is_mobile_verified) {
      return res.status(403).json({
        success: false,
        message: "Verify email and mobile before updating profile"
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

    if (updateData.first_name || updateData.last_name) {
      const f = updateData.first_name || agent.first_name;
      const l = updateData.last_name || agent.last_name;
      updateData.name = `${f} ${l}`;
    }

    const updated = await Agent.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    return res.json({
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


/* =====================================
   4️⃣ GET ALL AGENTS
===================================== */
export const getAllAgents = async (req, res) => {
  try {

    const agents = await Agent.find()
      .sort({ createdAt: -1 })
      .select("-password");

    return res.json({
      success: true,
      count: agents.length,
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
   5️⃣ GET AGENT BY ID
===================================== */
export const getAgentById = async (req, res) => {
  try {

    const { id } = req.params;

    const agent = await Agent.findById(id).select("-password");

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    return res.json({
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
   6️⃣ DELETE AGENT
===================================== */
export const deleteAgent = async (req, res) => {
  try {

    const { id } = req.params;

    const deleted = await Agent.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    return res.json({
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
