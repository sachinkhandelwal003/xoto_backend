const jwt = require("jsonwebtoken");
const User = require("../Model/ReferralPartner.model.js"); 
const { Role } = require("../../../../modules/auth/models/role/role.model.js"); // Apna exact common Role model path verify kar lena

// ── JWT Token Generate (Dynamic Role & User Name) ──────────────────────────────
const signToken = (user, roleData) => {
  return jwt.sign(
    {
      id: user._id,
      firstName: user.firstName, // 🌟 User ka first name
      lastName: user.lastName,   // 🌟 User ka last name
      phone: user.phone,
      email: user.email,
      type: "user",
      role: {
        id: roleData._id || user._id,
        code: roleData.code || 25, // DB se code aayega, nahi mila toh 25 default
        name: roleData.name || "gridReferralPartner", 
        isSuperAdmin: roleData.isSuperAdmin || false,
      },
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || "7d",
    }
  );
};

// ── Send Response Handler ──────────────────────────────────────────────────
const sendTokenResponse = async (user, statusCode, message, res) => {
  try {
    // 🌟 DATABASE SE ROLE NIKAL RAHE HAIN 🌟
    let userRole = await Role.findOne({ name: "gridReferralPartner" });
    
    // Agar DB mein by chance role na mile, toh API crash na ho isliye fallback
    if (!userRole) {
       userRole = { _id: user._id, code: 25, name: "gridReferralPartner", isSuperAdmin: false };
    }

    // Token banate waqt User aur Role dono bhej rahe hain
    const token = signToken(user, userRole);
    
    res.status(statusCode).json({
      status: "success",
      message: message,
      token,
      data: {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          email: user.email,
          role: userRole, // DB wala role object jayega
          status: user.status,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Token generation failed" });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// REGISTER REFERRAL PARTNER
// ════════════════════════════════════════════════════════════════════════════
exports.registerReferralPartner = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, dateOfBirth, password } = req.body;

    // 1. Basic validation
    if (!firstName || !lastName || !phone || !password) {
      return res.status(400).json({
        status: "fail",
        message: "First name, last name, phone, and password are required",
      });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({ status: "fail", message: "Phone number already registered" });
    }

    // 3. Create the user
    const partner = await User.create({
      firstName, 
      lastName, 
      phone, 
      email, 
      dateOfBirth, 
      password,
      role: "gridReferralPartner", // Model me direct string save hoga
      status: "active", 
    });

    // 4. Send token and success response
    await sendTokenResponse(partner, 201, "Registration successful! Welcome to Xoto GRID.", res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// LOGIN REFERRAL PARTNER
// ════════════════════════════════════════════════════════════════════════════
exports.loginReferralPartner = async (req, res) => {
  try {
    const { phone, password } = req.body;

    // 1. Validation
    if (!phone || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide phone number and password",
      });
    }

    // 2. Find user by phone and verify role string
    const partner = await User.findOne({ 
      phone: phone, 
      role: "gridReferralPartner" 
    }).select("+password");

    // 3. Check password
    if (!partner || !(await partner.correctPassword(password))) {
      return res.status(401).json({ status: "fail", message: "Invalid phone number or password" });
    }

    // 4. Check account status
    if (partner.status !== "active") {
      return res.status(403).json({ status: "fail", message: `Account is ${partner.status}` });
    }

    // 5. Send token and success response
    await sendTokenResponse(partner, 200, "Login successful", res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};