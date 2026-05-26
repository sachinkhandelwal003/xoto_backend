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

  // 1. Fetch Advisor basic info
  const advisor = await GridAdvisor.findById(advisorId)
    .select('firstName lastName leaderboard workload')
    .lean();

  // 2. Fetch all leads assigned to this advisor for calculating stats and charts
  const allLeads = await GridLead.find({ assigned_to: advisorId, is_deleted: false })
    .populate('source.listing_id')
    .lean();

  // 3. Fetch latest 5 leads for the UI list
  const myLeads = await GridLead.find({ assigned_to: advisorId, is_deleted: false })
    .populate('source.listing_id')
    .sort({ assigned_at: -1, createdAt: -1 })
    .limit(5)
    .lean();

  // 4. Calculate dynamic stats
  let activeLeads = 0;
  let dealsClosed = 0;
  let presentations = 0;

  allLeads.forEach(lead => {
    // Active Leads count (not completed and not not_proceeding)
    if (!['completed', 'not_proceeding'].includes(lead.status)) {
      activeLeads++;
    }
    // Closed Deals count
    if (lead.status === 'completed') {
      dealsClosed++;
    }
    // Presentations count
    if (lead.presentations && Array.isArray(lead.presentations)) {
      presentations += lead.presentations.length;
    }
  });

  const totalLeadsCount = allLeads.length;
  const conversionRate = totalLeadsCount > 0 
    ? Math.round((dealsClosed / totalLeadsCount) * 100) 
    : 0;

  // 5. Generate Leads by Month & Commission Over Time for the last 6 months
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    last6Months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: monthNames[d.getMonth()],
      year: d.getFullYear(),
      leads: 0,
      closed: 0,
      commission: 0
    });
  }

  allLeads.forEach(lead => {
    // Leads count per month
    if (lead.createdAt) {
      const createdDate = new Date(lead.createdAt);
      const createdKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
      const monthObj = last6Months.find(m => m.key === createdKey);
      if (monthObj) {
        monthObj.leads++;
      }
    }

    // Closed and commission per month
    if (lead.status === 'completed') {
      const closedAt = lead.deal_record?.closed_at || lead.updatedAt || lead.createdAt;
      if (closedAt) {
        const closedDate = new Date(closedAt);
        const closedKey = `${closedDate.getFullYear()}-${String(closedDate.getMonth() + 1).padStart(2, '0')}`;
        const monthObj = last6Months.find(m => m.key === closedKey);
        if (monthObj) {
          monthObj.closed++;
          monthObj.commission += lead.deal_record?.commission_amount || 0;
        }
      }
    }
  });

  const leadsByMonth = last6Months.map(m => ({
    month: m.month,
    leads: m.leads,
    closed: m.closed
  }));

  const commissionOverTime = last6Months.map(m => ({
    month: m.month,
    commission: m.commission
  }));

  // 6. Lead Status Breakdown (New, Site Visit, Negotiation, Closed)
  let newCount = 0;
  let siteVisitCount = 0;
  let negotiationCount = 0;
  let closedCount = 0;

  allLeads.forEach(lead => {
    const status = lead.status;
    if (['new', 'contacted', 'qualified'].includes(status)) {
      newCount++;
    } else if (status === 'site_visit_scheduled') {
      siteVisitCount++;
    } else if (['in_discussion', 'offer_made', 'reserved', 'spa_signed'].includes(status)) {
      negotiationCount++;
    } else if (status === 'completed') {
      closedCount++;
    }
  });

  const leadStatusBreakdown = [
    { name: 'New', value: newCount, color: '#0369a1' },
    { name: 'Site Visit', value: siteVisitCount, color: '#b45309' },
    { name: 'Negotiation', value: negotiationCount, color: '#7e22ce' },
    { name: 'Closed', value: closedCount, color: '#16a34a' },
  ];

  // 7. Conversion Funnel (Leads, Site Visits, Negotiations, Closed Deals)
  let funnelLeads = 0;
  let funnelSiteVisits = 0;
  let funnelNegotiations = 0;
  let funnelClosed = 0;

  allLeads.forEach(lead => {
    funnelLeads++;

    const hasSiteVisit = ['site_visit_scheduled', 'offer_made', 'reserved', 'spa_signed', 'completed'].includes(lead.status) || 
                         lead.status_history?.some(h => h.status === 'site_visit_scheduled');
    if (hasSiteVisit) {
      funnelSiteVisits++;
    }

    const hasNegotiation = ['in_discussion', 'offer_made', 'reserved', 'spa_signed', 'completed'].includes(lead.status) || 
                           lead.status_history?.some(h => ['in_discussion', 'offer_made', 'reserved', 'spa_signed'].includes(h.status));
    if (hasNegotiation) {
      funnelNegotiations++;
    }

    if (lead.status === 'completed') {
      funnelClosed++;
    }
  });

  // Ensure strict funnel shape for visual clarity (leads >= site visits >= negotiations >= closed)
  funnelSiteVisits = Math.max(funnelSiteVisits, funnelNegotiations, funnelClosed);
  funnelNegotiations = Math.max(funnelNegotiations, funnelClosed);

  const conversionFunnel = [
    { stage: 'Leads', value: funnelLeads, fill: '#0369a1' },
    { stage: 'Site Visits', value: funnelSiteVisits, fill: '#7e22ce' },
    { stage: 'Negotiations', value: funnelNegotiations, fill: '#b45309' },
    { stage: 'Closed Deals', value: funnelClosed, fill: '#16a34a' },
  ];

  // 8. Dynamic Leaderboard (Live rankings)
  const activeAdvisors = await GridAdvisor.find({ status: 'active' })
    .select('firstName lastName leaderboard workload')
    .lean();

  const advisorIds = activeAdvisors.map(a => a._id);

  const advisorLeadStats = await GridLead.aggregate([
    {
      $match: {
        assigned_to: { $in: advisorIds },
        is_deleted: false
      }
    },
    {
      $group: {
        _id: '$assigned_to',
        totalLeads: { $sum: 1 },
        dealsClosed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        }
      }
    }
  ]);

  const statsMap = new Map(advisorLeadStats.map(row => [String(row._id), row]));

  const leaderboard = activeAdvisors.map(a => {
    const row = statsMap.get(String(a._id)) || { totalLeads: 0, dealsClosed: 0 };
    const deals = row.dealsClosed;
    const conversion = row.totalLeads > 0 ? Math.round((row.dealsClosed / row.totalLeads) * 100) : 0;
    // Points formula: 100 points per closed deal, 10 points per assigned lead
    const score = (deals * 100) + (row.totalLeads * 10);
    return {
      name: `${a.firstName} ${a.lastName}`,
      deals,
      conversion,
      score
    };
  });

  // Sort by score descending, then deals closed
  leaderboard.sort((a, b) => b.score - a.score || b.deals - a.deals);
  const topLeaderboard = leaderboard.slice(0, 10);

  // 9. Format Recent Leads list
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

  // 10. Generate real activity stream from advisor's leads
  const activities = [];
  allLeads.forEach(lead => {
    const clientName = `${lead.contact_info?.name?.first_name || 'Unknown'} ${lead.contact_info?.name?.last_name || 'Lead'}`;

    // New Lead assignment activity
    const assignDate = lead.assigned_at || lead.createdAt;
    if (assignDate) {
      activities.push({
        date: new Date(assignDate),
        iconKey: 'inbox',
        iconBg: '#f3e8ff',
        iconColor: '#7e22ce',
        text: `New lead assigned — ${clientName}`,
      });
    }

    // Status changes activity
    if (lead.status_history && Array.isArray(lead.status_history)) {
      lead.status_history.forEach(history => {
        let text = `Status updated to ${history.status?.replace('_', ' ')} — ${clientName}`;
        let iconKey = 'edit';
        let iconBg = '#fef3c7';
        let iconColor = '#b45309';

        if (history.status === 'site_visit_scheduled') {
          iconKey = 'home';
          iconBg = '#e0f2fe';
          iconColor = '#0369a1';
        } else if (history.status === 'completed') {
          iconKey = 'check';
          iconBg = '#dcfce7';
          iconColor = '#16a34a';
        }

        activities.push({
          date: new Date(history.changed_at || lead.updatedAt),
          iconKey,
          iconBg,
          iconColor,
          text,
        });
      });
    }

    // Notes activity
    if (lead.notes && Array.isArray(lead.notes)) {
      lead.notes.forEach(note => {
        activities.push({
          date: new Date(note.created_at || lead.updatedAt),
          iconKey: 'edit',
          iconBg: '#fef3c7',
          iconColor: '#b45309',
          text: `Note added — ${clientName}: "${note.text?.substring(0, 40)}${note.text?.length > 40 ? '...' : ''}"`,
        });
      });
    }

    // Communications activity
    if (lead.communications && Array.isArray(lead.communications)) {
      lead.communications.forEach(comm => {
        activities.push({
          date: new Date(comm.conducted_at || lead.updatedAt),
          iconKey: 'check',
          iconBg: '#dcfce7',
          iconColor: '#16a34a',
          text: `${comm.comm_type?.charAt(0).toUpperCase() + comm.comm_type?.slice(1)} logged — ${clientName}`,
        });
      });
    }
  });

  activities.sort((a, b) => b.date - a.date);

  const formatActivityTime = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) {
      if (date.getDate() === now.getDate()) {
        return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
    if (diffDays === 1) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const recentActivity = activities.slice(0, 5).map(act => ({
    iconKey: act.iconKey,
    iconBg: act.iconBg,
    iconColor: act.iconColor,
    text: act.text,
    time: formatActivityTime(act.date)
  }));

  if (recentActivity.length === 0) {
    recentActivity.push({
      iconKey: 'inbox',
      iconBg: '#f3e8ff',
      iconColor: '#7e22ce',
      text: 'Welcome to your Xoto GRID Dashboard!',
      time: 'Just now'
    });
  }

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
        dealsClosed,
        conversionRate
      },
      leaderboard: topLeaderboard,
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
  const { limit = 50, period = 'weekly' } = req.query;
  const GridLead = require('../../Lead/model/gridLead.model');

  let dateFilter = {};
  if (period !== 'trust') {
    const now = new Date();
    let startDate = new Date();
    if (period === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'monthly') {
      startDate.setDate(now.getDate() - 30);
    } else if (period === 'quarterly') {
      startDate.setDate(now.getDate() - 90);
    } else if (period === 'annual') {
      startDate.setDate(now.getDate() - 365);
    }
    dateFilter = { createdAt: { $gte: startDate } };
  }

  const [advisors, leadRows] = await Promise.all([
    GridAdvisor.find({})
      .select('firstName lastName email phone employeeId department status profilePhotoUrl leaderboard workload createdAt')
      .lean(),
    GridLead.aggregate([
      {
        $match: {
          is_deleted: false,
          ...dateFilter
        }
      },
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
    });

  // Sort based on period
  if (period === 'trust') {
    // Trust Ranking: Sort by composite score
    rows.sort((a, b) => b.compositeScore - a.compositeScore || b.totalLeads - a.totalLeads);
  } else {
    // Top Converters: ranked by leads-to-completed conversion ratio (conversionRate)
    rows.sort((a, b) => b.conversionRate - a.conversionRate || b.convertedLeads - a.convertedLeads || b.totalLeads - a.totalLeads);
  }

  // Assign ranks dynamically
  const rankedRows = rows.map((advisor, index) => ({ ...advisor, rank: index + 1 }));

  const max = Math.min(Math.max(Number(limit) || 50, 1), 100);

  res.status(200).json({
    status: 'success',
    data: {
      summary: {
        totalAdvisors: rankedRows.length,
        activeAdvisors: rankedRows.filter(row => row.status === 'active').length,
        totalLeads: rankedRows.reduce((sum, row) => sum + row.totalLeads, 0),
        activeLeads: rankedRows.reduce((sum, row) => sum + row.activeLeads, 0),
        convertedLeads: rankedRows.reduce((sum, row) => sum + row.convertedLeads, 0),
      },
      leaderboard: rankedRows.slice(0, max),
    },
  });
});

