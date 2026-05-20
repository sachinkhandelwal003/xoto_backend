const GridAdvisor = require("../model/index.js");
const GridLead = require("../../Lead/model/gridLead.model.js");
const sendEmail = require("../../../../utils/sendEmail");
const { createToken } = require("../../../../middleware/auth");
const { APIError } = require("../../../../utils/errorHandler");
const asyncHandler = require("../../../../utils/asyncHandler");
const { StatusCodes } = require("../../../../utils/constants/statusCodes");

// ── Send Token Response ───────────────────────────────────────────────────────
const sendTokenResponse = (advisor, statusCode, res) => {
  const token = createToken(advisor);

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
    const {
      firstName, lastName, email,
      countryCode, phone,
      department, location, nationality, specialisation
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !countryCode) {
      return res.status(400).json({
        status: "fail",
        message: "firstName, lastName, email, countryCode and phone are required",
      });
    }

    if (!/^\+\d{1,4}$/.test(countryCode)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid countryCode format. Example: +971, +91, +1",
      });
    }

    const fullPhone = `${countryCode}${phone}`;

    const existing = await GridAdvisor.findOne({ $or: [{ email }, { phone: fullPhone }] });
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
      firstName, lastName, email,
      countryCode,
      phone: fullPhone,
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
          firstName:  advisor.firstName,
          email:      advisor.email,
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
        _id:         advisor._id,
        firstName:   advisor.firstName,
        lastName:    advisor.lastName,
        email:       advisor.email,
        countryCode: advisor.countryCode,
        phone:       advisor.phone,
        employeeId:  advisor.employeeId,
        department:  advisor.department,
        role:        advisor.role,
        status:      advisor.status,
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
      page      = 1,
      limit     = 20,
      sortBy    = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    if (status) {
      const allowed = ["active", "inactive", "deactivated", "suspended"];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          status:  "fail",
          message: `status must be one of: ${allowed.join(", ")}`,
        });
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

    const sortAllowed = [
      "createdAt", "firstName", "lastName", "status", "department",
      "leaderboard.compositeScore", "workload.activeLeadsCount",
    ];
    const sortField = sortAllowed.includes(sortBy) ? sortBy : "createdAt";
    const sortDir   = sortOrder === "asc" ? 1 : -1;

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
        status:  "fail",
        message: 'action must be "suspend" or "unsuspend"',
      });
    }

    const advisor = await GridAdvisor.findById(req.params.id);

    if (!advisor) {
      return res.status(404).json({ status: "fail", message: "GridAdvisor not found" });
    }

    if (advisor.status === "deactivated") {
      return res.status(400).json({
        status:  "fail",
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
      status:  "success",
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
// LOGIN GRID ADVISOR — Email + Password based
// POST /gridadvisor/login
// ════════════════════════════════════════════════════════════════════════════
exports.loginGridAdvisor = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new APIError("Email and password are required", StatusCodes.BAD_REQUEST);
  }

  const advisor = await GridAdvisor.findOne({ email })
    .select("+password")
    .populate("role", "name code");

  if (!advisor) {
    throw new APIError("Invalid email or password", StatusCodes.UNAUTHORIZED);
  }

  const isCorrect = await advisor.correctPassword(password);
  if (!isCorrect) {
    throw new APIError("Invalid email or password", StatusCodes.UNAUTHORIZED);
  }

  if (advisor.status === "deactivated") {
    throw new APIError("Account deactivated. Contact admin.", StatusCodes.FORBIDDEN);
  }
  if (advisor.status === "inactive") {
    throw new APIError("Account inactive. Contact admin.", StatusCodes.FORBIDDEN);
  }
  if (advisor.status === "suspended") {
    throw new APIError(
      `Account suspended. Contact admin.${advisor.deactivationReason ? ` Reason: ${advisor.deactivationReason}` : ""}`,
      StatusCodes.FORBIDDEN
    );
  }

  advisor.lastLoginAt = new Date();
  await advisor.save({ validateBeforeSave: false });

  if (!advisor.role || !advisor.role.code) {
    const { Role } = require("../../../../modules/auth/models/role/role.model");
    const defaultRole = await Role.findOne({ code: "gridadvisor" })
                                  .select("name code isSuperAdmin");
    if (defaultRole) advisor.role = defaultRole;
  }

  console.log("role after populate:", advisor.role);

  await advisor.populate("role", "name code");

  const token = createToken(advisor);

  res.status(200).json({
    success: true,
    message: "GridAdvisor login successful",
    token,
    advisor,
  });
});


// PATCH /gridadvisor/reset-password
// ════════════════════════════════════════════════════════════════════════════
exports.resetPassword = async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({
        status:  "fail",
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
        to:      advisor.email,
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
exports.updateMyProfile = asyncHandler(async (req, res) => {
  const blocked = [
    "password", "role", "status", "employeeId",
    "mustResetPassword", "createdBy", "email",
  ];
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
      status:  "fail",
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
    status:  "success",
    message: "Profile updated successfully",
    data:    { advisor },
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET GRID ADVISOR DASHBOARD
// GET /gridadvisor/me/dashboard
// ════════════════════════════════════════════════════════════════════════════
exports.getGridAdvisorDashboard = asyncHandler(async (req, res) => {
  const advisorId = req.user._id;

  const advisor = await GridAdvisor.findById(advisorId)
    .select('firstName lastName leaderboard workload')
    .lean();

  const myLeads = await GridLead.find({ assigned_to: advisorId })
    .sort({ assigned_at: -1, createdAt: -1 })
    .limit(5)
    .lean();

  const allAdvisors = await GridAdvisor.find({ status: 'active' })
    .select('firstName lastName leaderboard workload')
    .sort({ 'leaderboard.compositeScore': -1 })
    .limit(10)
    .lean();

  const activeLeads = advisor?.workload?.activeLeadsCount || 0;
  const totalDeals = advisor?.workload?.totalDealsCompleted || 0;
  const presentations = advisor?.workload?.totalPresentationsGenerated || 0;
  const conversionRate = advisor?.leaderboard?.conversionRate || 0;

  const leaderboard = allAdvisors.map((a, i) => ({
    name: `${a.firstName} ${a.lastName}`,
    deals: a.leaderboard?.dealsClosedCount || 0,
    conversion: a.leaderboard?.conversionRate || 0,
    score: a.leaderboard?.compositeScore || 0
  }));

  const recentLeads = myLeads.map(lead => ({
    initials: lead.contact_info?.name?.first_name?.[0]?.toUpperCase() || lead.contact_info?.name?.last_name?.[0]?.toUpperCase() || 'L',
    name: `${lead.contact_info?.name?.first_name || 'Unknown'} ${lead.contact_info?.name?.last_name || 'Lead'}`,
    phone: lead.contact_info?.mobile?.number || 'N/A',
    property: lead.source?.listing_id?.propertyName || 'No property selected',
    stage: lead.status || 'new',
    budget: lead.requirements?.budget_max ? `₹${lead.requirements.budget_max.toLocaleString()}` : 'N/A',
    avatarBg: '#ddd6fe',
    avatarColor: '#4c1d95'
  }));

  const recentActivity = recentLeads.slice(0, 5).map((lead, i) => ({
    iconKey: i === 0 ? 'inbox' : i === 1 ? 'home' : i === 2 ? 'check' : 'edit',
    iconBg: i === 0 ? '#f3e8ff' : i === 1 ? '#e0f2fe' : i === 2 ? '#dcfce7' : '#fef3c7',
    iconColor: i === 0 ? '#7e22ce' : i === 1 ? '#0369a1' : i === 2 ? '#16a34a' : '#b45309',
    text: i === 0 ? `New lead assigned — ${lead.name}` : i === 1 ? `Site visit scheduled — ${lead.name}` : i === 2 ? `Action required — Follow up with ${lead.name}` : `Note added — ${lead.name}`,
    time: i === 0 ? 'Today, 11:30 AM' : i === 1 ? 'Today, 10:00 AM' : i === 2 ? 'Yesterday, 4:15 PM' : 'Yesterday, 2:30 PM'
  }));

  const leadsByMonth = [
    { month: 'Jan', leads: 45, closed: 12 },
    { month: 'Feb', leads: 52, closed: 15 },
    { month: 'Mar', leads: 48, closed: 14 },
    { month: 'Apr', leads: 60, closed: 18 },
    { month: 'May', leads: 55, closed: 16 },
    { month: 'Jun', leads: 58, closed: 17 },
  ];

  const commissionOverTime = [
    { month: 'Jan', commission: 45000 },
    { month: 'Feb', commission: 52000 },
    { month: 'Mar', commission: 48000 },
    { month: 'Apr', commission: 62000 },
    { month: 'May', commission: 58000 },
  ];

  const leadStatusBreakdown = [
    { name: 'New', value: activeLeads > 0 ? Math.round(activeLeads * 0.4) : 10, color: '#0369a1' },
    { name: 'Site Visit', value: activeLeads > 0 ? Math.round(activeLeads * 0.3) : 8, color: '#b45309' },
    { name: 'Negotiation', value: activeLeads > 0 ? Math.round(activeLeads * 0.2) : 5, color: '#7e22ce' },
    { name: 'Closed', value: totalDeals || 3, color: '#16a34a' },
  ];

  const conversionFunnel = [
    { stage: 'Leads', value: activeLeads + totalDeals + 100, fill: '#0369a1' },
    { stage: 'Site Visits', value: Math.round((activeLeads + totalDeals + 100) * 0.6), fill: '#7e22ce' },
    { stage: 'Negotiations', value: Math.round((activeLeads + totalDeals + 100) * 0.35), fill: '#b45309' },
    { stage: 'Closed Deals', value: totalDeals || 15, fill: '#16a34a' },
  ];

  res.status(200).json({
    status: 'success',
    data: {
      advisor: {
        firstName: advisor?.firstName,
        lastName: advisor?.lastName
      },
      stats: {
        activeLeads,
        presentations,
        dealsClosed: totalDeals,
        conversionRate
      },
      leaderboard,
      recentLeads,
      recentActivity,
      charts: {
        leadsByMonth,
        commissionOverTime,
        leadStatusBreakdown,
        conversionFunnel
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET ADVISOR LEADERBOARD — Admin only
// ════════════════════════════════════════════════════════════════════════════
exports.getAdvisorLeaderboard = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const GridLead = require('../../Lead/model/gridLead.model');

  const [advisors, leadRows] = await Promise.all([
    GridAdvisor.find({})
      .select('firstName lastName email phone employeeId department status profilePhotoUrl leaderboard workload createdAt')
      .lean(),
    GridLead.aggregate([
      {
        $group: {
          _id: '$assigned_to',
          totalLeads: { $sum: 1 },
          activeLeads: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'not_proceeding']] }, 0, 1],
            },
          },
          convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          closedLeads: { $sum: { $cond: [{ $in: ['$status', ['completed', 'not_proceeding']] }, 1, 0] } },
          lastLeadAt: { $max: '$createdAt' },
        },
      },
    ]),
  ]);

  const leadStats = new Map(leadRows.map(row => [String(row._id), row]));

  const rows = advisors
    .map(advisor => {
      const id = String(advisor._id);
      const leads = leadStats.get(id) || {};
      const totalLeads = leads.totalLeads || 0;
      const convertedLeads = leads.convertedLeads || 0;

      return {
        _id: advisor._id,
        name: `${advisor.firstName || ''} ${advisor.lastName || ''}`.trim() || 'Advisor',
        firstName: advisor.firstName,
        lastName: advisor.lastName,
        email: advisor.email,
        phone: advisor.phone,
        employeeId: advisor.employeeId,
        department: advisor.department,
        profilePhotoUrl: advisor.profilePhotoUrl,
        status: advisor.status,
        totalLeads,
        activeLeads: leads.activeLeads || 0,
        convertedLeads,
        closedLeads: leads.closedLeads || 0,
        conversionRate: totalLeads ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0,
        dealsClosedCount: advisor.leaderboard?.dealsClosedCount || 0,
        compositeScore: advisor.leaderboard?.compositeScore || 0,
        lastLeadAt: leads.lastLeadAt || null,
      };
    })
    .sort((a, b) => (
      b.totalLeads - a.totalLeads ||
      b.convertedLeads - a.convertedLeads ||
      b.compositeScore - a.compositeScore ||
      a.name.localeCompare(b.name)
    ))
    .map((advisor, index) => ({ ...advisor, rank: index + 1 }));

  const max = Math.min(Math.max(Number(limit) || 50, 1), 100);

  res.status(200).json({
    status: 'success',
    data: {
      summary: {
        totalAdvisors: rows.length,
        activeAdvisors: rows.filter(row => row.status === 'active').length,
        totalLeads: rows.reduce((sum, row) => sum + row.totalLeads, 0),
        activeLeads: rows.reduce((sum, row) => sum + row.activeLeads, 0),
        convertedLeads: rows.reduce((sum, row) => sum + row.convertedLeads, 0),
      },
      leaderboard: rows.slice(0, max),
    },
  });
});
