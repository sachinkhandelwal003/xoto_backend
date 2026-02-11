import Agency from "../models/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";



const agencySignup = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const existingAgency = await Agency.findOne({ email });

    if (existingAgency) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgency = await Agency.create({
      ...req.body,
      password: hashedPassword,
      subscription_status: "free",
      is_active: true
    });

    const agencyData = newAgency.toObject();
    delete agencyData.password;

    return res.status(201).json({
      success: true,
      message: "Agency registered successfully",
      data: agencyData
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




const agencyLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required"
      });
    }

    const agency = await Agency.findOne({ email });

    if (!agency) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const match = await bcrypt.compare(password, agency.password);

    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (agency.is_active === false) {
      return res.status(403).json({
        success: false,
        message: "Agency account is deactivated"
      });
    }

    const token = jwt.sign(
      { agencyId: agency._id, role: "AGENCY" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    const agencyData = agency.toObject();
    delete agencyData.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: { user: agencyData, token }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



const updateAgency = async (req, res) => {
  try {

    // console.log("BODY:", req.body);

    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: "Body missing"
      });
    }

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agency ID required"
      });
    }

    const allowedFields = [
      "email",
      "mobile_number",
      "country_code",
      "password",
      "profile_photo",
      "letter_of_authority"
    ];

    let updateData = {};

    for (let field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update"
      });
    }

    const updated = await Agency.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    res.json({
      success: true,
      data: updated
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({
      success: false,
      message: e.message
    });
  }
};









const getAgencyById = async (req, res) => {
  try {
    const { id } = req.params;

    const agency = await Agency.findById(id).select("-password");

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




const getAllAgencies = async (req, res) => {
  try {
    const agencies = await Agency.find({})
      .sort({ createdAt: -1 })
      .select("-password");

    return res.status(200).json({
      success: true,
      count: agencies.length,
      data: agencies
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




const deleteAgency = async (req, res) => {
  try {
    const { id } = req.params;

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



export {
  agencySignup,
  agencyLogin,
  updateAgency,
  getAgencyById,
  getAllAgencies,
  deleteAgency
};
