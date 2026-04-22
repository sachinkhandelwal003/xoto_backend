const jwt = require("jsonwebtoken");
const Advisor = require("../model/index.js");
const sendEmail = require("../../../../utils/sendEmail");

// ── JWT generate ──────────────────────────────────────────────────────────────
const signToken = (id) => {
  return jwt.sign({ id, role: "xoto_advisor" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });
};

const sendTokenResponse = (advisor, statusCode, res) => {
  const token = signToken(advisor._id);
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      advisor: {
        _id:               advisor._id,
        firstName:         advisor.firstName,
        lastName:          advisor.lastName,
        email:             advisor.email,
        phone:             advisor.phone,
        employeeId:        advisor.employeeId,
        department:        advisor.department,
        role:              advisor.role,
        status:            advisor.status,
        mustResetPassword: advisor.mustResetPassword,
        profileCompletion: advisor.profileCompletion,
      },
    },
  });
};

// ─── Email Template ───────────────────────────────────────────────────────────
const advisorWelcomeEmail = ({ firstName, email, tempPassword, employeeId }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Welcome to Xoto GRID, ${firstName}!</h2>
    <p>Your Xoto Advisor account has been created.</p>
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Employee ID:</strong> ${employeeId}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> <span style="color: #e63946;">${tempPassword}</span></p>
    </div>
    <p style="color: #e63946;"><strong>Important:</strong> You must reset your password on first login.</p>
    <p>— Xoto GRID Team</p>
  </div>
`;

// ════════════════════════════════════════════════════════════════════════════
// CREATE ADVISOR — Admin only
// POST /advisor
// ════════════════════════════════════════════════════════════════════════════
exports.createAdvisor = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, department, location, nationality, specialisation } = req.body;

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({
        status: "fail",
        message: "firstName, lastName, email and phone are required",
      });
    }

    const existing = await Advisor.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(409).json({
        status: "fail",
        message: existing.email === email
          ? "An advisor with this email already exists"
          : "An advisor with this phone already exists",
      });
    }

    const tempPassword = `Xoto@${Math.floor(1000 + Math.random() * 9000)}`;

    const advisor = await Advisor.create({
      firstName, lastName, email, phone,
      department, location, nationality,
      specialisation: specialisation || {},
      password: tempPassword,
      mustResetPassword: true,
      createdBy: req.user._id,
    });

    try {
      await sendEmail({
        to: advisor.email,
        subject: "Your Xoto GRID Advisor Account — Login Credentials",
        html: advisorWelcomeEmail({
          firstName: advisor.firstName,
          email: advisor.email,
          tempPassword,
          employeeId: advisor.employeeId,
        }),
      });
    } catch (emailErr) {
      console.error("Email sending failed:", emailErr.message);
    }

    res.status(201).json({
      status: "success",
      message: "Advisor created. Login credentials sent to advisor's email.",
      data: {
        _id: advisor._id,
        firstName: advisor.firstName,
        lastName: advisor.lastName,
        email: advisor.email,
        phone: advisor.phone,
        employeeId: advisor.employeeId,
        department: advisor.department,
        role: advisor.role,
        status: advisor.status,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// LOGIN ADVISOR
// POST /advisor/login
// ════════════════════════════════════════════════════════════════════════════
exports.loginAdvisor = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: "fail", message: "Please provide email and password" });
    }

    const advisor = await Advisor.findOne({ email }).select("+password");
    if (!advisor) {
      return res.status(401).json({ status: "fail", message: "Invalid email or password" });
    }

    if (advisor.status === "deactivated") {
      return res.status(403).json({ status: "fail", message: "Account deactivated. Contact admin." });
    }

    if (advisor.status === "inactive") {
      return res.status(403).json({ status: "fail", message: "Account inactive. Contact admin." });
    }

    const isCorrect = await advisor.correctPassword(password);
    if (!isCorrect) {
      return res.status(401).json({ status: "fail", message: "Invalid email or password" });
    }

    // First login — force password reset
    if (advisor.mustResetPassword) {
      return res.status(200).json({
        status: "password_reset_required",
        mustResetPassword: true,
        message: "You must reset your password before continuing.",
        email: advisor.email,
      });
    }

    advisor.lastLoginAt = new Date();
    await advisor.save({ validateBeforeSave: false });

    sendTokenResponse(advisor, 200, res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// RESET PASSWORD — First login
// PATCH /advisor/reset-password
// ════════════════════════════════════════════════════════════════════════════
exports.resetPassword = async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({
        status: "fail",
        message: "email, oldPassword and newPassword are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ status: "fail", message: "New password must be at least 8 characters" });
    }

    const advisor = await Advisor.findOne({ email }).select("+password");
    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "Advisor not found" });
    }

    const isCorrect = await advisor.correctPassword(oldPassword);
    if (!isCorrect) {
      return res.status(401).json({ status: "fail", message: "Old password is incorrect" });
    }

    advisor.password = newPassword;
    advisor.mustResetPassword = false;
    advisor.lastLoginAt = new Date();
    await advisor.save();

    try {
      await sendEmail({
        to: advisor.email,
        subject: "Xoto GRID — Password Reset Successful",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Password Reset Successful</h2>
            <p>Hi ${advisor.firstName},</p>
            <p>Your password has been reset. You can now login with your new password.</p>
            <p>— Xoto GRID Team</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Confirmation email failed:", emailErr.message);
    }

    sendTokenResponse(advisor, 200, res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};