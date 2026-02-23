const Agency = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/* ===========================
   SIGNUP
=========================== */
const agencySignup = async (req, res) => {
  try {

    const {
      agency_name,
      email,
      password,
      country_code,
      mobile_number,
      profile_photo,
      letter_of_authority
    } = req.body;

    if (
      !agency_name ||
      !email ||
      !password ||
      !country_code ||
      !mobile_number
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided"
      });
    }

    const existing = await Agency.findOne({ email });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const agency = await Agency.create({
      agency_name,
      email,
      password: hashedPassword,
      country_code,
      mobile_number,
      profile_photo: profile_photo || "",
      letter_of_authority: letter_of_authority || "",
      onboarding_status: "registered",
      subscription_status: "free",
      is_active: true,
      is_email_verified: false,
      is_mobile_verified: false
    });

    const data = agency.toObject();
    delete data.password;

    return res.status(201).json({
      success: true,
      message: "Signup successful. Awaiting admin approval.",
      data
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


/* ===========================
   LOGIN
=========================== */
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

    const token = jwt.sign(
      {
        agencyId: agency._id,
        role: "AGENCY"
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    const data = agency.toObject();
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


/* ===========================
   GET BY ID
=========================== */
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

    return res.json({
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


/* ===========================
   GET ALL
=========================== */
const getAllAgencies = async (req, res) => {
  try {

    const agencies = await Agency.find()
      .sort({ createdAt: -1 })
      .select("-password");

    return res.json({
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


/* ===========================
   UPDATE
=========================== */
const updateAgency = async (req, res) => {
  try {

    const { id } = req.params;

    const allowedFields = [
      "profile_photo",
      "country_code",
      "mobile_number",
      "letter_of_authority",
      "onboarding_status"

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

    return res.json({
      success: true,
      message: "Updated successfully",
      data: updated
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ===========================
   DELETE
=========================== */
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

    return res.json({
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


/* ===========================
   EXPORT
=========================== */
module.exports = {
  agencySignup,
  agencyLogin,
  getAgencyById,
  getAllAgencies,
  updateAgency,
  deleteAgency
};
