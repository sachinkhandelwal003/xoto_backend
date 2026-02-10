import Agent from "../models/agent.js"; 

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ==============================
// 1. SEND OTP (Optional)
// ==============================
const sendSignupOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required" });

        const existingAgent = await Agent.findOne({ email });
        if (existingAgent) {
            return res.status(400).json({ success: false, message: "Agent already registered with this email" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        await Otp.create({
            email,
            otp,
            purpose: "agent_signup",
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        await sendOtpEmail(email, otp);

        return res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};


// ==============================
// AGENT SIGNUP (Fixing City)
// ==============================
const agentSignup = async (req, res) => {
    try {
        let { 
            first_name, last_name, email, password, 
            phone_number, country_code, 
            operating_city, // <--- Ye request se aa raha hai (e.g., "Jaipur")
            specialization,
            country 
        } = req.body;

        // ... Validations & Duplicate Checks ...

        const fullName = `${first_name} ${last_name}`;
        
        // ... File Handling ...
        const files = req.files || {};
        const profile_photo_url = files['profile_photo'] ? files['profile_photo'][0].location : (req.body.profile_photo || "");
        const id_proof_url = files['id_proof'] ? files['id_proof'][0].location : (req.body.id_proof || "");
        const rera_certificate_url = files['rera_certificate'] ? files['rera_certificate'][0].location : (req.body.rera_certificate || "");

        let new_password = await bcrypt.hash(password, 10);

        // --- CREATE AGENT ---
        const newAgent = await Agent.create({
            first_name,
            last_name,
            name: fullName,
            email,
            password: new_password,
            phone_number,
            country_code,
            
            operating_city: operating_city, // Ye Schema field hai
            
            // 👇 YEH LINE ADD KAREIN (City fix karne ke liye)
            city: operating_city, // operating_city ki value ko 'city' me copy kiya
            
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
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==============================
// 3. AGENT LOGIN
// ==============================
const agentLogin = async (req, res) => {
    try {
        let { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and Password are required" });
        }

        let agent = await Agent.findOne({ email: email });
        if (!agent) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        let password_match = await bcrypt.compare(password, agent.password);
        if (!password_match) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { agentId: agent._id, role: "AGENT" },
            process.env.JWT_SECRET || "your_jwt_secret",
            { expiresIn: "30d" }
        );

        let agentData = agent.toObject();
        delete agentData.password;

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: { user: agentData, token }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==============================
// 4. UPDATE AGENT
// ==============================
const updateAgent = async (req, res) => {
    try {
        let { id } = req.query; 
        if (!id) return res.status(400).json({ success: false, message: "Agent ID is required" });

        let updateData = { ...req.body };

        // Password hash if updating
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        // Name update logic
        if (updateData.first_name || updateData.last_name) {
             const currentAgent = await Agent.findById(id);
             if(currentAgent) {
                 const fName = updateData.first_name || currentAgent.first_name;
                 const lName = updateData.last_name || currentAgent.last_name;
                 updateData.name = `${fName} ${lName}`;
             }
        }

        let agent = await Agent.findOneAndUpdate(
            { _id: id }, 
            updateData, 
            { new: true }
        ).select("-password");

        if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

        return res.status(200).json({
            success: true,
            message: "Agent updated successfully",
            data: agent
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==============================
// 5. GET ALL AGENTS
// ==============================
const getAllAgents = async (req, res) => {
    try {
        let agents = await Agent.find({}).sort({ createdAt: -1 }).select("-password");
        return res.status(200).json({
            success: true,
            message: "Agents fetched successfully",
            count: agents.length,
            data: agents
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export { 
    sendSignupOtp, 
    agentSignup, 
    agentLogin, 
    updateAgent, 
    getAllAgents 
};