const jwt = require("jsonwebtoken");
const GridAdvisor = require("../model/index.js");
const sendEmail = require("../../../../utils/sendEmail");

// ── JWT generate ──────────────────────────────────────────────────────────────
const signToken = (advisor) => {
  return jwt.sign(
    {
      id:    advisor._id,
      email: advisor.email,
      type:  "user",
      role: {
        id:           advisor._id,
        code:         24,             // ✅ fixed
        name:         "GridAdvisor",
        isSuperAdmin: false,
      },
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

const sendTokenResponse = (advisor, statusCode, res) => {
  const token = signToken(advisor);

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
    <p>Your Xoto GRID Advisor account has been created. You can log in using the credentials below.</p>
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Employee ID:</strong> ${employeeId}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> <span style="color: #e63946;">${tempPassword}</span></p>
    </div>
    <p style="color: #e63946;">
      <strong>Reminder:</strong> Please go to your <strong>Profile → Change Password</strong> 
      after logging in to set a new password.
    </p>
    <p>— Xoto GRID Team</p>
  </div>
`;

// ════════════════════════════════════════════════════════════════════════════
// CREATE GRID ADVISOR — Admin only
// POST /gridadvisor
// ════════════════════════════════════════════════════════════════════════════
exports.createGridAdvisor = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, department, location, nationality, specialisation } = req.body;

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({
        status: "fail",
        message: "firstName, lastName, email and phone are required",
      });
    }

    const existing = await GridAdvisor.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(409).json({
        status: "fail",
        message: existing.email === email
          ? "A GridAdvisor with this email already exists"
          : "A GridAdvisor with this phone already exists",
      });
    }

    const tempPassword = `Xoto@${Math.floor(1000 + Math.random() * 9000)}`;

    const advisor = await GridAdvisor.create({
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
      message: "GridAdvisor created. Login credentials sent to GridAdvisor's email.",
      data: {
        _id:        advisor._id,
        firstName:  advisor.firstName,
        lastName:   advisor.lastName,
        email:      advisor.email,
        phone:      advisor.phone,
        employeeId: advisor.employeeId,
        department: advisor.department,
        role:       advisor.role,
        status:     advisor.status,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET ALL GRID ADVISORS — Admin only
// GET /gridadvisor?status=active&department=Rentals&search=ahmed&page=1&limit=20
// ════════════════════════════════════════════════════════════════════════════
exports.getAllGridAdvisors = async (req, res) => {
  try {
    const {
      status,
      department,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (status) {
      const allowed = ["active", "inactive", "deactivated", "suspended"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ status: "fail", message: `status must be one of: ${allowed.join(", ")}` });
      }
      filter.status = status;
    }

    if (department) filter.department = department;

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { firstName:  regex },
        { lastName:   regex },
        { email:      regex },
        { employeeId: regex },
        { phone:      regex },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const sortAllowed = ["createdAt", "firstName", "lastName", "status", "department",
                         "leaderboard.compositeScore", "workload.activeLeadsCount"];
    const sortField   = sortAllowed.includes(sortBy) ? sortBy : "createdAt";
    const sortDir     = sortOrder === "asc" ? 1 : -1;

    const [advisors, total] = await Promise.all([
      GridAdvisor.find(filter)
        .select("-password -loginLink -loginLinkExpiresAt")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      GridAdvisor.countDocuments(filter),
    ]);

    res.status(200).json({
      status: "success",
      results: advisors.length,
      pagination: {
        total,
        page:       pageNum,
        limit:      limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext:    pageNum < Math.ceil(total / limitNum),
        hasPrev:    pageNum > 1,
      },
      data: { advisors },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET GRID ADVISOR BY ID — Admin only
// GET /gridadvisor/:id
// ════════════════════════════════════════════════════════════════════════════
exports.getGridAdvisorById = async (req, res) => {
  try {
    const advisor = await GridAdvisor.findById(req.params.id)
      .select("-password -loginLink -loginLinkExpiresAt")
      .populate("createdBy",     "firstName lastName email")
      .populate("deactivatedBy", "firstName lastName email");

    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "GridAdvisor not found" });
    }

    res.status(200).json({ status: "success", data: { advisor } });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ status: "fail", message: "Invalid advisor ID format" });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// SUSPEND / UNSUSPEND GRID ADVISOR — Admin only
// PATCH /gridadvisor/:id/suspend
// ════════════════════════════════════════════════════════════════════════════
exports.suspendGridAdvisor = async (req, res) => {
  try {
    const { action, reason } = req.body;

    if (!action || !["suspend", "unsuspend"].includes(action)) {
      return res.status(400).json({
        status: "fail",
        message: 'action must be "suspend" or "unsuspend"',
      });
    }

    const advisor = await GridAdvisor.findById(req.params.id);

    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "GridAdvisor not found" });
    }

    if (advisor.status === "deactivated") {
      return res.status(400).json({
        status: "fail",
        message: "Cannot suspend a deactivated GridAdvisor. Reactivate first.",
      });
    }

    if (action === "suspend") {
      if (advisor.status === "suspended") {
        return res.status(400).json({ status: "fail", message: "GridAdvisor is already suspended" });
      }
      advisor.status             = "suspended";
      advisor.deactivatedAt      = new Date();
      advisor.deactivatedBy      = req.user._id;
      advisor.deactivationReason = reason?.trim() || "Suspended by admin";
    } else {
      if (advisor.status !== "suspended") {
        return res.status(400).json({ status: "fail", message: "GridAdvisor is not currently suspended" });
      }
      advisor.status             = "active";
      advisor.deactivatedAt      = null;
      advisor.deactivatedBy      = null;
      advisor.deactivationReason = null;
    }

    await advisor.save({ validateBeforeSave: false });

    try {
      const subject = action === "suspend"
        ? "Xoto GRID — Your account has been suspended"
        : "Xoto GRID — Your account has been reinstated";

      const html = action === "suspend"
        ? `<div style="font-family:Arial,sans-serif;">
            <h2>Account Suspended</h2>
            <p>Hi ${advisor.firstName},</p>
            <p>Your Xoto GRID advisor account has been <strong>suspended</strong>.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
            <p>Please contact your admin for more information.</p>
            <p>— Xoto GRID Team</p>
           </div>`
        : `<div style="font-family:Arial,sans-serif;">
            <h2>Account Reinstated</h2>
            <p>Hi ${advisor.firstName},</p>
            <p>Your Xoto GRID advisor account has been <strong>reinstated</strong>. You can now log in again.</p>
            <p>— Xoto GRID Team</p>
           </div>`;

      await sendEmail({ to: advisor.email, subject, html });
    } catch (emailErr) {
      console.error("Suspension email failed:", emailErr.message);
    }

    res.status(200).json({
      status: "success",
      message: action === "suspend" ? "GridAdvisor suspended successfully" : "GridAdvisor reinstated successfully",
      data: {
        _id:                advisor._id,
        employeeId:         advisor.employeeId,
        status:             advisor.status,
        deactivatedAt:      advisor.deactivatedAt,
        deactivationReason: advisor.deactivationReason,
      },
    });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ status: "fail", message: "Invalid advisor ID format" });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// LOGIN GRID ADVISOR
// POST /gridadvisor/login
// ════════════════════════════════════════════════════════════════════════════
exports.loginGridAdvisor = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: "fail", message: "Please provide email and password" });
    }

    const advisor = await GridAdvisor.findOne({ email }).select("+password");
    if (!advisor) {
      return res.status(401).json({ status: "fail", message: "Invalid email or password" });
    }

    if (advisor.status === "deactivated") {
      return res.status(403).json({ status: "fail", message: "Account deactivated. Contact admin." });
    }
    if (advisor.status === "inactive") {
      return res.status(403).json({ status: "fail", message: "Account inactive. Contact admin." });
    }
    if (advisor.status === "suspended") {
      return res.status(403).json({
        status: "fail",
        message: "Account suspended. Contact admin.",
        reason: advisor.deactivationReason || null,
      });
    }

    const isCorrect = await advisor.correctPassword(password);
    if (!isCorrect) {
      return res.status(401).json({ status: "fail", message: "Invalid email or password" });
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
// PATCH /gridadvisor/reset-password
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

    const advisor = await GridAdvisor.findOne({ email }).select("+password");
    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "GridAdvisor not found" });
    }

    const isCorrect = await advisor.correctPassword(oldPassword);
    if (!isCorrect) {
      return res.status(401).json({ status: "fail", message: "Old password is incorrect" });
    }

    advisor.password          = newPassword;
    advisor.mustResetPassword = false;
    advisor.lastLoginAt       = new Date();
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

// ════════════════════════════════════════════════════════════════════════════
// UPDATE OWN PROFILE — GridAdvisor
// PATCH /gridadvisor/me
// ════════════════════════════════════════════════════════════════════════════
exports.updateMyProfile = async (req, res) => {
  try {
    const blocked = ["password", "role", "status", "employeeId",
                     "mustResetPassword", "createdBy", "email"];
    blocked.forEach(field => delete req.body[field]);

    const allowedFields = [
      "firstName", "lastName", "phone", "nationality",
      "location", "bio", "languages", "profilePhotoUrl",
    ];

    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    });

    if (req.body.specialisation) {
      const { propertyTypes, locations, listingTypes } = req.body.specialisation;
      if (propertyTypes !== undefined) updateData["specialisation.propertyTypes"] = propertyTypes;
      if (locations     !== undefined) updateData["specialisation.locations"]      = locations;
      if (listingTypes  !== undefined) updateData["specialisation.listingTypes"]   = listingTypes;
    }

    if (req.body.identity) {
      const { type, idNumber, frontUrl, backUrl, passportUrl, expiryDate } = req.body.identity;
      if (type        !== undefined) updateData["identity.type"]        = type;
      if (idNumber    !== undefined) updateData["identity.idNumber"]    = idNumber;
      if (frontUrl    !== undefined) updateData["identity.frontUrl"]    = frontUrl;
      if (backUrl     !== undefined) updateData["identity.backUrl"]     = backUrl;
      if (passportUrl !== undefined) updateData["identity.passportUrl"] = passportUrl;
      if (expiryDate  !== undefined) updateData["identity.expiryDate"]  = expiryDate;
    }

    if (req.body.bankDetails) {
      const { bankName, accountNumber, iban, accountHolderName } = req.body.bankDetails;
      if (bankName          !== undefined) updateData["bankDetails.bankName"]          = bankName;
      if (accountNumber     !== undefined) updateData["bankDetails.accountNumber"]      = accountNumber;
      if (iban              !== undefined) updateData["bankDetails.iban"]              = iban;
      if (accountHolderName !== undefined) updateData["bankDetails.accountHolderName"] = accountHolderName;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: "fail",
        message: "No valid fields provided to update",
      });
    }

    const advisor = await GridAdvisor.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -loginLink -loginLinkExpiresAt");

    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "GridAdvisor not found" });
    }

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: { advisor },
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ status: "fail", message: err.message });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};
