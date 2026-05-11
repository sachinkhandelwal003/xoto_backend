const jwt = require('jsonwebtoken');
const Agency = require('../models/index');
const Agent = require('../models/agent');
const AgencyOTP = require('../models/OTP');
const sendEmail = require('../../../../utils/sendEmail');
const { generateAndSendOTP } = require('../services/sendOTP');
const { createToken } = require('../../../../middleware/auth');
const asyncHandler = require('../../../../utils/asyncHandler');
const { APIError } = require('../../../../utils/errorHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { Role } = require('../../../auth/models/role/role.model');
// ── Helpers ─────────────────────────────────────────────────────────────────
const sendTokenResponse = (agency, statusCode, res) => {
  const token = createToken(agency);
  agency.password = undefined;
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      agency
    },
  });
};

const agencyWelcomeEmail = ({ companyName, primaryContactEmail, tempPassword }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Welcome to Xoto, ${companyName}!</h2>
    <p>Your agency account has been created by Admin. Please use the credentials below to log in.</p>
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Email:</strong> ${primaryContactEmail}</p>
      <p><strong>Temporary Password:</strong> <span style="color: #e63946;">${tempPassword}</span></p>
    </div>
    <p style="color: #e63946;">
      <strong>Reminder:</strong> After logging in, please reset your password immediately.
    </p>
    <p>— Xoto Team</p>
  </div>
`;

// ── AUTH ────────────────────────────────────────────────────────────────────

/**
 * POST /agency/auth/login
 * Agency logs in with email + password.
 * If temporary password, OTP is sent for password reset.
 */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new APIError('Email and password are required', StatusCodes.BAD_REQUEST);
  }

const agency = await Agency.findOne({ primaryContactEmail: email, isActive: true })
.select('+password')
.populate('role', 'code name');
if (!agency) throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);

if (agency.isSuspended) {
  throw new APIError('Account suspended. Contact Xoto Admin.', StatusCodes.FORBIDDEN);
}


  const isMatch = await agency.comparePassword(password);
  if (!isMatch) {
    throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  if (agency.tempPassword) {
    await generateAndSendOTP(agency, 'password_reset', 'email');
    return res.status(200).json({
      status: 'success',
      requirePasswordReset: true,
      message: 'Temporary password detected. A reset OTP has been sent to your registered email.',
    });
  }

  sendTokenResponse(agency, 200, res);
});

/**
 * POST /agency/auth/request-otp
 * Request OTP for login via phone.
 */
exports.requestOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    throw new APIError('Phone number is required', StatusCodes.BAD_REQUEST);
  }

  const agency = await Agency.findOne({ primaryContactPhone: phone, isActive: true });
  if (!agency) {
    throw new APIError('No agency found with this phone number', StatusCodes.NOT_FOUND);
  }
  if (agency.isSuspended) {
    throw new APIError('Account suspended. Contact Xoto Admin.', StatusCodes.FORBIDDEN);
  }

  await generateAndSendOTP(agency, 'login', 'phone');
  res.status(200).json({ status: 'success', message: 'OTP sent to registered phone number.' });
});

/**
 * POST /agency/auth/verify-otp
 * Verify OTP and issue JWT.
 */
exports.verifyOTP = asyncHandler(async (req, res) => {
  const { identifier, otp, purpose } = req.body;
  if (!identifier || !otp) {
    throw new APIError('Identifier and OTP are required', StatusCodes.BAD_REQUEST);
  }

  const otpRecord = await AgencyOTP.findOne({ identifier, isUsed: false, purpose: purpose || 'login' })
    .sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new APIError('No active OTP found. Please request a new one.', StatusCodes.NOT_FOUND);
  }

  otpRecord.attempts += 1;
  const { valid, reason } = otpRecord.isValid(otp);
  if (!valid) {
    await otpRecord.save();
    throw new APIError(reason, StatusCodes.BAD_REQUEST);
  }

  otpRecord.isUsed = true;
  await otpRecord.save();

  const agency = await Agency.findById(otpRecord.agencyId);
  if (!agency || !agency.isActive) {
    throw new APIError('Agency not found or inactive', StatusCodes.NOT_FOUND);
  }

  sendTokenResponse(agency, 200, res);
});

/**
 * POST /agency/auth/reset-password
 * OTP-verified password reset.
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword) {
    throw new APIError('All fields are required', StatusCodes.BAD_REQUEST);
  }
  if (newPassword.length < 8) {
    throw new APIError('Password must be at least 8 characters', StatusCodes.BAD_REQUEST);
  }

  const otpRecord = await AgencyOTP.findOne({ identifier, isUsed: false, purpose: 'password_reset' })
    .sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new APIError('No active OTP found', StatusCodes.NOT_FOUND);
  }

  otpRecord.attempts += 1;
  const { valid, reason } = otpRecord.isValid(otp);
  if (!valid) {
    await otpRecord.save();
    throw new APIError(reason, StatusCodes.BAD_REQUEST);
  }

  otpRecord.isUsed = true;
  await otpRecord.save();

  const agency = await Agency.findById(otpRecord.agencyId);
  if (!agency) {
    throw new APIError('Agency not found', StatusCodes.NOT_FOUND);
  }

  agency.password = newPassword;
  agency.tempPassword = false;
  await agency.save();

  sendTokenResponse(agency, 200, res);
});

// ── DASHBOARD ────────────────────────────────────────────────────────────────

/**
 * GET /agency/dashboard
 */
exports.getDashboard = asyncHandler(async (req, res) => {
  const agencyId = req.agency._id;

  const agency = await Agency.findById(agencyId).select('-password');
  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);

  const agentStats = await Agent.aggregate([
    { $match: { agency: agencyId, agencyApprovalStatus: 'approved', adminApprovalStatus: 'approved' } },
    {
      $group: {
        _id: null,
        totalAgents: { $sum: 1 },
        totalLeads: { $sum: '$totalLeads' },
        activeLeads: { $sum: '$activeLeads' },
        totalPresentations: { $sum: '$presentationsGenerated' },
        totalCommission: { $sum: '$commissionEarned' },
        totalDeals: { $sum: '$dealsClosedCount' },
      },
    },
  ]);

const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);

const topAgent = await Agent.findOne({
  agency: agencyId,
  agencyApprovalStatus: 'approved',
  adminApprovalStatus: 'approved',
  updatedAt: { $gte: startOfMonth },
}).sort({ dealsClosedCount: -1 })
  .select('fullName dealsClosedCount commissionEarned activeLeads');

  const pendingAgents = await Agent.countDocuments({
    agency: agencyId,
    agencyApprovalStatus: 'pending',
  });

  const stats = agentStats[0] || {
    totalAgents: 0, totalLeads: 0, activeLeads: 0,
    totalPresentations: 0, totalCommission: 0, totalDeals: 0,
  };
  const recentActivity = await Agent.find({
  agency: agencyId,
  agencyApprovalStatus: 'approved',
})
  .sort({ updatedAt: -1 })
  .limit(10)
  .select('fullName updatedAt activeLeads dealsClosedCount');

  res.status(200).json({
    status: 'success',
    data: {
      agency: {
        companyName: agency.companyName,
        subscriptionTier: agency.subscriptionTier,
        presentationBalance: agency.presentationBalance,
        presentationsUsed: agency.presentationsUsed,
        presentationQuota: agency.presentationQuota,
      },
      stats: {
        totalActiveAgents: stats.totalAgents,
        pendingApprovalAgents: pendingAgents,
        totalLeads: stats.totalLeads,
        activeLeads: stats.activeLeads,
        totalDealsClosedAllTime: stats.totalDeals,
        totalCommissionEarned: stats.totalCommission,
        presentationsGenerated: stats.totalPresentations,
        presentationBalance: agency.presentationBalance,
      },
      topAgent,
      recentActivity,
    },
  });
});

// ── AGENT TEAM ───────────────────────────────────────────────────────────────
exports.createAgent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, location } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────
  if (!fullName || !phone || !password) {
    throw new APIError(
      'fullName, phone, and password are required',
      StatusCodes.BAD_REQUEST
    );
  }

  // ── Duplicate check (phone must be unique across the whole system) ─────
  const existing = await Agent.findOne({ phone });
  if (existing) {
    throw new APIError(
      'An agent with this phone number already exists',
      StatusCodes.CONFLICT
    );
  }

  // ── Create agent ────────────────────────────────────────────────────────
  const agent = await Agent.create({
    fullName,
    email: email || undefined,          // optional in schema, omit if blank
    phone,
    password,                           // will be hashed by the pre‑save hook
    location: location || undefined,
    agency: req.agency._id,             // linked to the agency that creates it
    agencyApprovalStatus: 'approved',   // auto‑approved by the creating agency
    adminApprovalStatus: 'pending',     // still needs admin final approval
    isActive: true,
  });

  // Remove password from response
  agent.password = undefined;

  res.status(201).json({
    status: 'success',
    data: agent,
  });
}); 

exports.registerAgent = asyncHandler(async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone_number,
    country_code,
    password,
    operating_city,
    specialization,
    country,
    agency,
    emiratesIdUrl,
    reraCardUrl,
    profilePhotoUrl,
  } = req.body;

  if (
    !first_name ||
    !last_name ||
    !phone_number ||
    !country_code ||
    !password ||
    !operating_city ||
    !specialization ||
    !agency
  ) {
    throw new APIError(
      "first_name, last_name, phone_number, country_code, password, operating_city, specialization and agency are required",
      StatusCodes.BAD_REQUEST
    );
  }

  const existingPhone = await Agent.findOne({ phone_number });
  if (existingPhone) {
    throw new APIError(
      "An agent with this phone number already exists",
      StatusCodes.CONFLICT
    );
  }

  if (email) {
    const existingEmail = await Agent.findOne({ email });
    if (existingEmail) {
      throw new APIError(
        "An agent with this email already exists",
        StatusCodes.CONFLICT
      );
    }
  }

  // Verify agency exists
  const agencyExists = await Agency.findOne({
    _id: agency,
    isActive: true,
    isSuspended: false,
  });

  if (!agencyExists) {
    throw new APIError(
      "Selected agency not found or inactive",
      StatusCodes.NOT_FOUND
    );
  }

  // ✅ Fetch Agent Role
  const agentRole = await Role.findOne({ code: 16 });

  if (!agentRole) {
    throw new APIError(
      "Agent role not found",
      StatusCodes.BAD_REQUEST
    );
  }

  // ✅ Create Agent with role
  const agent = await Agent.create({
    first_name,
    last_name,
    email,
    phone_number,
    country_code,
    password, // hashed by pre-save hook
    operating_city,
    specialization,
    country: country || "UAE",
    agency,

    role: agentRole._id, // ✅ THIS FIXES NULL ROLE

    id_proof: emiratesIdUrl || "",
    rera_certificate: reraCardUrl || "",
    profile_photo: profilePhotoUrl || "",

    agencyApprovalStatus: "pending",
    adminApprovalStatus: "pending",
    onboarding_status: "pending",
  });

  agent.password = undefined;

  res.status(201).json({
    status: "success",
    message:
      "Registration submitted. Awaiting agency and admin approval.",
    data: agent,
  });
});
/**
 * GET /agency/agents
 */
exports.getAgents = asyncHandler(async (req, res) => {
  const agencyId = req.agency._id;
const { status, adminStatus, search, page = 1, limit = 20 } = req.query;

  const filter = { agency: agencyId };
if (status) filter.agencyApprovalStatus = status;
if (adminStatus) filter.adminApprovalStatus = adminStatus;  if (search) filter.$or = [
    { fullName: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
  ];

  const total = await Agent.countDocuments(filter);
  const agents = await Agent.find(filter)
    .select('-password -bankDetails')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
    data: agents,
  });
});

/**
 * GET /agency/agents/:agentId
 */
exports.getAgentDetail = asyncHandler(async (req, res) => {
const agent = await Agent.findOne({
  _id: req.params.agentId,
  agency: req.agency._id,
}).select('-password -bankDetails -presentationsGenerated -presentations');
if (!mongoose.Types.ObjectId.isValid(req.params.agentId)) {
    throw new APIError('Invalid agent ID', StatusCodes.BAD_REQUEST);
  }
  if (!agent) {
    throw new APIError('Agent not found', StatusCodes.NOT_FOUND);
  }

  res.status(200).json({ status: 'success', data: agent });
});


/**
 * PATCH /agency/agents/:agentId/approve
 */
exports.approveAgent = asyncHandler(async (req, res) => {
  const agent = await Agent.findOne({
    _id: req.params.agentId,
    agency: req.agency._id,
    agencyApprovalStatus: 'pending',
  });

  if (!agent) {
    throw new APIError('Agent not found or not in pending state', StatusCodes.NOT_FOUND);
  }

  agent.agencyApprovalStatus = 'approved';
  agent.agencyApprovedAt = new Date();
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent approved successfully',
    data: agent,
  });
});

/**
 * PATCH /agency/agents/:agentId/decline
 */
exports.declineAgent = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const agent = await Agent.findOne({
    _id: req.params.agentId,
    agency: req.agency._id,
    agencyApprovalStatus: 'pending',
  });

  if (!agent) {
    throw new APIError('Agent not found or not in pending state', StatusCodes.NOT_FOUND);
  }

  agent.agencyApprovalStatus = 'declined';
  agent.agencyDeclinedAt = new Date();
  agent.agencyDeclineNote = reason || 'No reason provided';
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent declined successfully',
    data: agent,
  });
});

/**
 * PATCH /agency/agents/:agentId/flag
 */
exports.flagAgent = asyncHandler(async (req, res) => {
  const { note } = req.body;

  const agent = await Agent.findOne({
    _id: req.params.agentId,
    agency: req.agency._id,
  });

  if (!agent) {
    throw new APIError('Agent not found', StatusCodes.NOT_FOUND);
  }
  if (agent.isFlagged) {
    throw new APIError('Agent is already flagged', StatusCodes.BAD_REQUEST);
  }

  agent.isFlagged = true;
  agent.flagNote = note || '';
  agent.flaggedAt = new Date();
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent flagged for admin review',
    data: agent,
  });
});

// ── PROFILE ─────────────────────────────────────────────────────────────────

/**
 * GET /agency/profile
 */
exports.getProfile = asyncHandler(async (req, res) => {
  const agency = await Agency.findById(req.agency._id).select('-password');
  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);
  res.status(200).json({ status: 'success', data: agency });
});

/**
 * PATCH /agency/profile
 */

exports.updateProfile = asyncHandler(async (req, res) => {
   const criticalFields = ['companyName', 'reraRegistrationNumber'];
  const attemptedCritical = criticalFields.filter(f => req.body[f] !== undefined);
  if (attemptedCritical.length > 0) {
    throw new APIError(
      `Fields ${attemptedCritical.join(', ')} can only be changed by Xoto Admin.`,
      StatusCodes.FORBIDDEN
    );
  }
  const allowed = ['primaryContactName', 'primaryContactEmail', 'primaryContactPhone'];
  const updates = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const agency = await Agency.findByIdAndUpdate(
    req.agency._id,
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password');

  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);

  res.status(200).json({ status: 'success', data: agency });
});

/**
 * POST /admin/agency/create   (Admin only – placed here for convenience)
 */
exports.createAgencyByAdmin = asyncHandler(async (req, res) => {
  const {
    companyName,
    reraRegistrationNumber,
    tradeLicenceUrl,
    reraLicenceUrl,           // ✅ new
    letterOfAuthorityUrl,     // ✅ new
    logo,                     // ✅ new
    profilePhoto,             // ✅ new
    primaryContactName,
    primaryContactEmail,
    primaryContactPhone,
    subscriptionTier,
    presentationQuota,
    address,                  // ✅ new
    operatingLocation,        // ✅ new
  } = req.body;

  const agencyRole = await Role.findOne({ slug: 'agency' });

  const existingAgency = await Agency.findOne({
    $or: [{ primaryContactEmail }, { reraRegistrationNumber }],
  });
  if (existingAgency) {
    throw new APIError('Agency already exists with this email or RERA number', StatusCodes.BAD_REQUEST);
  }

  const generatedPassword = 'Xoto@' + Math.floor(1000 + Math.random() * 9000);

  const agency = await Agency.create({
    companyName,
    reraRegistrationNumber,
    tradeLicenceUrl,
    reraLicenceUrl:       reraLicenceUrl       || '',   // ✅
    letterOfAuthorityUrl: letterOfAuthorityUrl || '',   // ✅
    logo:                 logo                 || '',   // ✅
    profilePhoto:         profilePhoto         || '',   // ✅
    primaryContactName,
    primaryContactEmail,
    primaryContactPhone,
    address:           address           || {},         // ✅
    operatingLocation: operatingLocation || {},         // ✅
    role:              agencyRole?._id   || null,
    password:          generatedPassword,
    tempPassword:      true,
    subscriptionTier:  subscriptionTier  || 'basic',
    presentationQuota: presentationQuota || 100,
    isActive:          true,
    isSuspended:       false,
    createdBy:         req.user?._id     || null,
  });

  try {
    await sendEmail({
      to: primaryContactEmail,
      subject: 'Your Xoto Agency Account Created',
      html: agencyWelcomeEmail({
        companyName,
        primaryContactEmail,
        tempPassword: generatedPassword,
      }),
    });
  } catch (emailErr) {
    console.error('[Agency Welcome Email Error]', emailErr.message);
  }

  res.status(201).json({
    status: 'success',
    message: 'Agency created and credentials sent to email',
    data: agency,
  });
});
/**
 * GET /agency/leads — PRD 11.3
 * Read-only view of all leads across affiliated agents
 */
exports.getAgencyLeads = asyncHandler(async (req, res) => {
  const { agentId, status, page = 1, limit = 20 } = req.query;

  // Get all approved agents under this agency
  const agentIds = await Agent.find({
    agency: req.agency._id,
    agencyApprovalStatus: 'approved',
  }).distinct('_id');

  const filter = { assignedAgent: { $in: agentIds } };
  if (agentId) filter.assignedAgent = agentId;
  if (status) filter.status = status;

  const Lead = require('../../../leads/models/Lead'); // adjust path
  const total = await Lead.countDocuments(filter);
  const leads = await Lead.find(filter)
    .populate('assignedAgent', 'fullName email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    data: leads,
  });
});
exports.getPublicAgencies = asyncHandler(async (req, res) => {
  const agencies = await Agency.find({ isActive: true, isSuspended: false })
    .select('companyName _id')
    .sort({ companyName: 1 })
    .lean();

  res.status(200).json({
    status: 'success',
    data: agencies,
  });
});
/**
 * GET /agency/listings — PRD 11.4
 * Read-only view of all listings by affiliated agents
 */
exports.getAgencyListings = asyncHandler(async (req, res) => {
  const { agentId, listingType, status, page = 1, limit = 20 } = req.query;

  const agentIds = await Agent.find({
    agency: req.agency._id,
    agencyApprovalStatus: 'approved',
  }).distinct('_id');

  const filter = { createdBy: { $in: agentIds } };
  if (agentId) filter.createdBy = agentId;
  if (listingType) filter.listingType = listingType;
  if (status) filter.status = status;

  const Listing = require('../../../listings/models/Listing'); // adjust path
  const total = await Listing.countDocuments(filter);
  const listings = await Listing.find(filter)
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    data: listings,
  });
});
// GET all agencies — Admin only
exports.getAllAgencies = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;

  const filter = {};
  if (status === 'active')    { filter.isActive = true;  filter.isSuspended = false; }
  if (status === 'suspended') { filter.isSuspended = true; }
  if (search) filter.$or = [
    { companyName:            { $regex: search, $options: 'i' } },
    { primaryContactEmail:    { $regex: search, $options: 'i' } },
    { primaryContactPhone:    { $regex: search, $options: 'i' } },
    { reraRegistrationNumber: { $regex: search, $options: 'i' } },
  ];

  const total    = await Agency.countDocuments(filter);
  const agencies = await Agency.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    pagination: {
      currentPage: Number(page),
      totalPages:  Math.ceil(total / limit),
      totalItems:  total,
      limit:       Number(limit),
    },
    data: agencies,
  });
});

// GET single agency — Admin only
exports.getAgencyById = asyncHandler(async (req, res) => {
  const agency = await Agency.findById(req.params.id).select('-password');
  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);
  res.status(200).json({ status: 'success', data: agency });
});

// PATCH suspend agency — Admin only
exports.suspendAgency = asyncHandler(async (req, res) => {
  const agency = await Agency.findByIdAndUpdate(
    req.params.id,
    { isSuspended: true, isActive: false },
    { new: true }
  ).select('-password');
  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);
  res.status(200).json({ status: 'success', message: 'Agency suspended successfully', data: agency });
});

// PATCH activate agency — Admin only
exports.activateAgency = asyncHandler(async (req, res) => {
  const agency = await Agency.findByIdAndUpdate(
    req.params.id,
    { isSuspended: false, isActive: true },
    { new: true }
  ).select('-password');
  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);
  res.status(200).json({ status: 'success', message: 'Agency activated successfully', data: agency });
});

// ── List all agents (Admin only) ─────────────────────────────────────
exports.getAllAgents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;

  const filter = {};
  if (status === 'approved') filter.adminApprovalStatus = 'approved';
  if (status === 'declined') filter.adminApprovalStatus = 'declined';
  if (status === 'pending') filter.adminApprovalStatus = 'pending';
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Agent.countDocuments(filter);
  const agents = await Agent.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.status(200).json({
    status: 'success',
    pagination: {
      totalItems: total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      limit: Number(limit),
    },
    data: agents,
  });
});

// ── Admin Approve Agent ──────────────────────────────────────────────
exports.adminApproveAgent = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.agentId);
  if (!agent) throw new APIError('Agent not found', StatusCodes.NOT_FOUND);

  agent.adminApprovalStatus = 'approved';
  agent.adminApprovedAt = new Date();
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent approved by admin',
    data: agent,
  });
});

// ── Admin Decline Agent ──────────────────────────────────────────────
exports.adminDeclineAgent = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const agent = await Agent.findById(req.params.agentId);
  if (!agent) throw new APIError('Agent not found', StatusCodes.NOT_FOUND);

  agent.adminApprovalStatus = 'declined';
  agent.adminDeclinedAt = new Date();
  agent.adminDeclineNote = reason || 'Declined by admin';
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent declined by admin',
    data: agent,
  });
});
// ── Get single agent by ID (Admin only) ─────────────────────────────
exports.getAgentByIdAdmin = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.agentId)
    .select('-password')
    .populate('agency', 'companyName primaryContactEmail primaryContactPhone');

  if (!agent) throw new APIError('Agent not found', StatusCodes.NOT_FOUND);

  res.status(200).json({ status: 'success', data: agent });
});
/**
 * PUT /admin/agents/:agentId/reset
 * Admin reverts a declined agent back to pending for re‑approval.
 */
exports.resetAgentDecline = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.agentId);
  if (!agent) throw new APIError('Agent not found', StatusCodes.NOT_FOUND);

  // Clear admin decline fields
  agent.adminApprovalStatus = 'pending';
  agent.adminDeclinedAt = null;
  agent.adminDeclineNote = null;
  // Ensure agent is active while pending
  agent.isActive = true;
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent has been reset to pending for admin re‑approval.',
    data: agent,
  });
});