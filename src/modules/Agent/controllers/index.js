import Agent from "../models/agent.js"; 
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


// ==============================
// 1. AGENT SIGNUP (With Duplicate Check)
// ==============================
const agentSignup = async (req, res) => {
    try {
        let { 
            first_name, last_name, email, password, 
            phone_number, country_code, 
            operating_city, specialization, country 
        } = req.body;

        // 1. Basic Empty Validation
        if (!email || !password || !phone_number || !first_name) {
            return res.status(400).json({ 
                success: false, 
                message: "Please fill all required fields" 
            });
        }

        // 👇 VALIDATION 1: EMAIL CHECK
        const existingEmail = await Agent.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ 
                success: false, 
                message: "Email already registered. Please login." 
            });
        }

        // 👇 VALIDATION 2: PHONE CHECK
        const existingPhone = await Agent.findOne({ phone_number });
        if (existingPhone) {
            return res.status(400).json({ 
                success: false, 
                message: "Phone number already exists. Use a different number." 
            });
        }

        // File Handling
        const files = req.files || {};
        const profile_photo_url =
            files['profile_photo']?.[0]?.location ||
            req.body.profile_photo ||
            "";

        const id_proof_url =
            files['id_proof']?.[0]?.location ||
            req.body.id_proof ||
            "";

        const rera_certificate_url =
            files['rera_certificate']?.[0]?.location ||
            req.body.rera_certificate ||
            "";

        const fullName = `${first_name} ${last_name}`;
        const new_password = await bcrypt.hash(password, 10);

        const newAgent = await Agent.create({
            first_name,
            last_name,
            name: fullName,
            email,
            password: new_password,
            phone_number,
            country_code,
            operating_city,
            city: operating_city,
            country: country || "India",
            specialization,
            status: "pending",
            isVerified: false,
            profile_photo: profile_photo_url,
            id_proof: id_proof_url,
            rera_certificate: rera_certificate_url
        });

        return res.status(201).json({
            success: true,
            message: "Agent account created successfully",
            data: newAgent
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ 
                success: false, 
                message: "Duplicate Key Error: Email or Phone already exists in database." 
            });
        }
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};


// ==============================
// 2. AGENT LOGIN
// ==============================
const agentLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: "Email and Password are required" 
            });
        }

        const agent = await Agent.findOne({ email });
        if (!agent) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }

        const password_match = await bcrypt.compare(password, agent.password);
        if (!password_match) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }

        const token = jwt.sign(
            { agentId: agent._id, role: "AGENT" },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        const agentData = agent.toObject();
        delete agentData.password;

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: { user: agentData, token }
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};


// ==============================
// 3. UPDATE AGENT
// ==============================
const updateAgent = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agent ID is required"
      });
    }

    const currentAgent = await Agent.findById(id);
    if (!currentAgent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    const allowedFields = [
      "first_name",
      "last_name",
      "email",
      "phone_number",
      "operating_city",
      "specialization",
      "country"
    ];

    let updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field]) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.password) {
      updateData.password = await bcrypt.hash(req.body.password, 10);
    }

    if (updateData.first_name || updateData.last_name) {
      const f = updateData.first_name || currentAgent.first_name;
      const l = updateData.last_name || currentAgent.last_name;
      updateData.name = `${f} ${l}`;
    }

    if (updateData.operating_city) {
      updateData.city = updateData.operating_city;
    }

    const files = req.files || {};
    const getFile = (key) =>
      files[key]?.[0]?.location ||
      files[key]?.[0]?.path ||
      "";

    if (files.profile_photo) {
      updateData.profile_photo = getFile("profile_photo");
    }
    if (files.id_proof) {
      updateData.id_proof = getFile("id_proof");
    }
    if (files.rera_certificate) {
      updateData.rera_certificate = getFile("rera_certificate");
    }

    const updatedAgent = await Agent.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Agent updated successfully",
      data: updatedAgent
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// ==============================
// 4. GET ALL AGENTS
// ==============================
const getAllAgents = async (req, res) => {
    try {
        const agents = await Agent.find({})
            .sort({ createdAt: -1 })
            .select("-password");

        return res.status(200).json({
            success: true,
            message: "Agents fetched successfully",
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

// ==============================
// GET AGENT BY ID
// ==============================
const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agent ID is required"
      });
    }

    const agent = await Agent.findById(id).select("-password");

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    res.status(200).json({
      success: true,
      data: agent
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// ==============================
// DELETE AGENT
// ==============================
const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agent ID is required"
      });
    }

    const deletedAgent = await Agent.findByIdAndDelete(id);

    if (!deletedAgent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Agent deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export { 
    agentSignup, 
    agentLogin, 
    updateAgent, 
    getAllAgents,
    getAgentById,
    deleteAgent
};
