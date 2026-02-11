import Agency from "../models/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/* ===========================
   SIGNUP
=========================== */
export const agencySignup = async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Check existing
    const exist = await Agency.findOne({ email });

    if (exist) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create agency (spread operator)
    const agency = await Agency.create({
      ...req.body,

      password: hashedPassword,
      onboarding_status: "registered",
      is_active: true,
      // default system values
      status: true,               // approved (dev mode)
      subscription_status: "free"
    });

    const data = agency.toObject();
    delete data.password;

//     return res.status(201).json({
//   success: true,
//   message: "Registration successful. Awaiting admin approval.",
//   agency: {
//     _id: agency._id,
//     email: agency.email,
//     onboarding_status: agency.onboarding_status
//   }
// });
return res.status(201).json({
      success: true,
      message: "Signup successful",
      data
    }); 


  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ===========================
   LOGIN
=========================== */
export const agencyLogin = async (req, res) => {
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

    // 🔒 Status check (approval)
  // ADD HERE 👇
if (agency.onboarding_status !== "approved" && agency.onboarding_status !== "completed") {
  return res.status(403).json({
    success: false,
    message: "Registration successful. Awaiting admin approval. "
  });
}


    // Token
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
   UPDATE
=========================== */
export const updateAgency = async (req, res) => {
  try {

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agency ID required"
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update"
      });
    }

    let updateData = { ...req.body }; // ✅ spread

    // Hash password if present
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
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
   GET BY ID
=========================== */
export const getAgencyById = async (req, res) => {
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
export const getAllAgencies = async (req, res) => {
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
   DELETE
=========================== */
export const deleteAgency = async (req, res) => {
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
      message: "Deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
