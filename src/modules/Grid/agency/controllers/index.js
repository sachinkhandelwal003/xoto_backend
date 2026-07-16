const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const mongoose = require('mongoose');
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
const GridNotification = require('../../Notification/GridNotificationmodal').default;
const { logAudit } = require('../../../vault/services/auditLog.service.js');
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

const agentApprovalEmail = ({ agentName, agentEmail, agencyName }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Welcome to Xoto, ${agentName}!</h2>
    <p>Your agent account has been approved by ${agencyName}. You can now log in to Xoto!</p>
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Email:</strong> ${agentEmail}</p>
    </div>
    <p>— Xoto Team</p>
  </div>
`;

const agentDeclineEmail = ({ agentName, agencyName, reason }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Your Xoto Agent Application Update</h2>
    <p>Hi ${agentName}, your agent application with ${agencyName} has been declined.</p>
    ${reason ? `<div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;"><p><strong>Reason:</strong> ${reason}</p></div>` : ''}
    <p>— Xoto Team</p>
  </div>
`;

const agentSuspendEmail = ({ agentName, agencyName }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Your Xoto Agent Account Suspended</h2>
    <p>Hi ${agentName}, your agent account with ${agencyName} has been suspended.</p>
    <p>— Xoto Team</p>
  </div>
`;

const agentUnsuspendEmail = ({ agentName, agencyName }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Your Xoto Agent Account Reactivated</h2>
    <p>Hi ${agentName}, your agent account with ${agencyName} has been reactivated! You can now log in to Xoto again.</p>
    <p>— Xoto Team</p>
  </div>
`;

// ── AUTH ────────────────────────────────────────────────────────────────────

const getPagination = (query, defaults = {}) => {
  const page = Math.max(Number(query.page) || defaults.page || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || defaults.limit || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const parseDateRange = ({ from, to, dateFrom, dateTo, startDate, endDate }) => {
  const start = from || dateFrom || startDate;
  const end = to || dateTo || endDate;
  const range = {};
  if (start) range.$gte = new Date(start);
  if (end) {
    const endDateValue = new Date(end);
    endDateValue.setHours(23, 59, 59, 999);
    range.$lte = endDateValue;
  }
  return Object.keys(range).length ? range : null;
};

const getMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const normalizeObjectId = (value, fieldName) => {
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new APIError(`Invalid ${fieldName}`, StatusCodes.BAD_REQUEST);
  }
  return new mongoose.Types.ObjectId(value);
};

const getAgencyAgentIds = async (agencyId, includePending = true) => {
  const filter = { agency: agencyId };
  if (!includePending) {
    filter.agencyApprovalStatus = 'approved';
    filter.adminApprovalStatus = 'approved';
    filter.isActive = true;
  }
  return Agent.find(filter).distinct('_id');
};

const assertAgencyAgent = async (agencyId, agentId) => {
  const objectId = normalizeObjectId(agentId, 'agent ID');
  const agent = await Agent.findOne({ _id: objectId, agency: agencyId }).select('-password -bankDetails');
  if (!agent) throw new APIError('Agent not found under this agency', StatusCodes.NOT_FOUND);
  return agent;
};

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

  if (!agency) {
    logAudit({
      entityType: 'AUTH', action: 'AUTH_LOGIN_FAILED',
      visibleToRoles: ['grid_admin', 'superadmin'],
      performedByName: email || 'Unknown',
      performedByRole: 'partner',
      ipAddress: req.ip ?? null, userAgent: req.headers?.['user-agent'] ?? null,
      metadata: { email, reason: 'Agency/Partner not found' },
    });
    throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  if (agency.isSuspended) {
    throw new APIError('Account suspended. Contact Xoto Admin.', StatusCodes.FORBIDDEN);
  }

  const isMatch = await agency.comparePassword(password);
  if (!isMatch) {
    logAudit({
      entityType: 'AUTH', action: 'AUTH_LOGIN_FAILED',
      visibleToRoles: ['grid_admin', 'superadmin'],
      performedBy: agency._id, performedByModel: 'Agency',
      performedByName: agency.agencyName || agency.primaryContactEmail || email,
      performedByRole: 'partner',
      ipAddress: req.ip ?? null, userAgent: req.headers?.['user-agent'] ?? null,
      metadata: { email, reason: 'Wrong password' },
    });
    throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  logAudit({
    entityType: 'AUTH', action: 'AUTH_LOGIN_SUCCESS',
    entityId: agency._id,
    visibleToRoles: ['grid_admin', 'superadmin'],
    performedBy: agency._id, performedByModel: 'Agency',
    performedByName: agency.agencyName || agency.primaryContactEmail || email,
    performedByRole: 'partner',
    ipAddress: req.ip ?? null, userAgent: req.headers?.['user-agent'] ?? null,
    metadata: { email, agencyId: agency._id.toString() },
  });

  // ✅ FIX: tempPassword case — resetToken bhi bhejo
  // if (agency.tempPassword) {
  //   await generateAndSendOTP(agency, 'password_reset', 'email');

  //   // Short-lived token — sirf OTP verify karne ke liye (15 min)
  //   const resetToken = jwt.sign(
  //     { id: agency._id, purpose: 'password_reset', type: 'agency' },
  //     process.env.JWT_SECRET,
  //     { expiresIn: '15m' }
  //   );

    //   return res.status(200).json({
    //     status:               'success',
    //     requirePasswordReset: true,
    //     resetToken,                      // ← yeh add kiya
    //     email:                agency.primaryContactEmail,
    //     message:              'Temporary password detected. A reset OTP has been sent to your registered email.',
    //   });
    // }

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

  const GridLead = require('../../Lead/model/gridLead.model');
  const Property = require('../../../properties/models/property.model');
  const Presentation = require('../../presentation/model/presentation.model');

  const agentIds = await getAgencyAgentIds(agencyId);
  const { start: monthStart, end: monthEnd } = getMonthRange();
  const activeAgentsCount = agentIds.length;

  const [
    totalLeads,
    activeLeads,
    totalListings,
    presentationGeneratedCount,
    presentationGeneratedThisMonth,
    commissionRows,
    monthlyCommissionRows,
    topAgentRows,
  ] = await Promise.all([
    GridLead.countDocuments({ created_by_agent: { $in: agentIds } }),
    GridLead.countDocuments({ created_by_agent: { $in: agentIds }, status: { $nin: ['completed', 'not_proceeding'] } }),
    Property.countDocuments({ created_by_agent: { $in: agentIds } }),
    Presentation.countDocuments({ agentId: { $in: agentIds } }),
    Presentation.countDocuments({ agentId: { $in: agentIds }, createdAt: { $gte: monthStart, $lte: monthEnd } }),
    GridLead.aggregate([
      { $match: { created_by_agent: { $in: agentIds } } },
      {
        $group: {
          _id: '$deal_record.commission_status',
          amount: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    GridLead.aggregate([
      {
        $match: {
          created_by_agent: { $in: agentIds },
          createdAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $group: {
          _id: '$deal_record.commission_status',
          amount: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    GridLead.aggregate([
      {
        $match: {
          created_by_agent: { $in: agentIds },
          createdAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      {
        $group: {
          _id: '$created_by_agent',
          totalLeads: { $sum: 1 },
          convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          commissionEarned: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } },
        },
      },
      { $sort: { convertedLeads: -1, commissionEarned: -1, totalLeads: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const topAgentIds = topAgentRows.map(row => row._id).filter(Boolean);
  const topAgentDocs = topAgentIds.length
    ? await Agent.find({ _id: { $in: topAgentIds } })
      .select('first_name last_name fullName email phone_number createdAt')
      .lean()
    : [];
  const topAgentDocMap = new Map(topAgentDocs.map(agent => [agent._id.toString(), agent]));
  const topAgents = topAgentRows
    .map(row => {
      const agent = topAgentDocMap.get(row._id?.toString());
      if (!agent) return null;
      return {
        ...agent,
        totalLeads: row.totalLeads,
        convertedLeads: row.convertedLeads,
        commissionEarned: row.commissionEarned,
      };
    })
    .filter(Boolean);
  const topAgent = topAgents[0] || null;

  const recentLeads = await GridLead.find({
    created_by_agent: { $in: agentIds }
  })
    .populate('created_by_agent', 'first_name last_name fullName email phone_number')
    .sort({ createdAt: -1 })
    .limit(5)
    .select('contact_info status created_by_agent deal_record createdAt updatedAt')
    .lean();

  const recentListings = await Property.find({ created_by_agent: { $in: agentIds } })
    .populate('created_by_agent', 'first_name last_name fullName email phone_number')
    .sort({ createdAt: -1 })
    .limit(5)
    .select('propertyName projectName propertySubType approvalStatus listingStatus status created_by_agent createdAt updatedAt')
    .lean();

  const commissionByStatus = {
    pending: 0,
    confirmed: 0,
    paid: 0,
  };
  commissionRows.forEach(row => {
    commissionByStatus[row._id || 'pending'] = row.amount || 0;
  });

  const monthlyCommissionByStatus = {
    pending: 0,
    confirmed: 0,
    paid: 0,
  };
  monthlyCommissionRows.forEach(row => {
    monthlyCommissionByStatus[row._id || 'pending'] = row.amount || 0;
  });

  const presentationQuota = agency.presentationQuota || 0;
  const presentationsUsed = Math.max(agency.presentationsUsed || 0, presentationGeneratedCount);
  const presentationBalance = Math.max(0, presentationQuota - presentationsUsed);

  res.status(200).json({
    status: 'success',
    data: {
      agency: {
        companyName: agency.companyName,
        subscriptionTier: agency.subscriptionTier,
        presentationQuota,
        presentationsUsed,
        presentationBalance,
      },
      stats: {
        active_agents: activeAgentsCount,
        total_leads: totalLeads,
        active_leads: activeLeads,
        total_listings: totalListings,
        total_deals: commissionRows.filter(row => row._id === 'confirmed' || row._id === 'paid').reduce((sum, row) => sum + row.count, 0),
        ai_presentations_generated: presentationGeneratedCount,
        ai_presentations_generated_this_month: presentationGeneratedThisMonth,
        total_commission: commissionByStatus.pending + commissionByStatus.confirmed + commissionByStatus.paid,
        commission_pending: commissionByStatus.pending,
        commission_confirmed: commissionByStatus.confirmed + commissionByStatus.paid,
      },
      commission_pipeline: {
        all_time: {
          in_progress: commissionByStatus.pending,
          confirmed: commissionByStatus.confirmed + commissionByStatus.paid,
        },
        this_month: {
          in_progress: monthlyCommissionByStatus.pending,
          confirmed: monthlyCommissionByStatus.confirmed + monthlyCommissionByStatus.paid,
        },
      },
      top_agent: topAgent,
      top_agents: topAgents,
      top_agent_of_month: topAgent,
      recent_activity: [
        ...recentLeads.map(item => ({ type: 'lead', ...item })),
        ...recentListings.map(item => ({ type: 'listing', ...item })),
      ]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        .slice(0, 10),
    }
  });
});

// ── AGENT TEAM ───────────────────────────────────────────────────────────────
/**
 * GET /agency/performance
 * Ranked agency agent performance for dashboard and internal leaderboard.
 */
exports.getPerformance = asyncHandler(async (req, res) => {
  const agencyId = req.agency._id;
  const { limit = 50 } = req.query;
  const dateRange = parseDateRange(req.query);

  const GridLead = require('../../Lead/model/gridLead.model');
  const Property = require('../../../properties/models/property.model');
  const Presentation = require('../../presentation/model/presentation.model');

  const agentIds = await getAgencyAgentIds(agencyId);
  const leadMatch = { created_by_agent: { $in: agentIds } };
  if (dateRange) leadMatch.createdAt = dateRange;

  const [agents, leadRows, listingRows, presentationRows] = await Promise.all([
    Agent.find({ _id: { $in: agentIds } })
      .select('first_name last_name fullName email phone_number profile_photo agencyApprovalStatus adminApprovalStatus isActive createdAt')
      .lean(),
    GridLead.aggregate([
      { $match: leadMatch },
      {
        $group: {
          _id: '$created_by_agent',
          totalLeads: { $sum: 1 },
          activeLeads: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'not_proceeding']] }, 0, 1],
            },
          },
          convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          closedLeads: { $sum: { $cond: [{ $in: ['$status', ['completed', 'not_proceeding']] }, 1, 0] } },
          commissionEarned: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } },
          paidCommission: {
            $sum: {
              $cond: [
                { $eq: ['$deal_record.commission_status', 'paid'] },
                { $ifNull: ['$deal_record.commission_amount', 0] },
                0,
              ],
            },
          },
          lastLeadAt: { $max: '$createdAt' },
        },
      },
    ]),
    Property.aggregate([
      { $match: { created_by_agent: { $in: agentIds } } },
      { $group: { _id: '$created_by_agent', listingsCreated: { $sum: 1 } } },
    ]),
    Presentation.aggregate([
      { $match: { agentId: { $in: agentIds } } },
      { $group: { _id: '$agentId', presentationsCreated: { $sum: 1 } } },
    ]),
  ]);

  const leadStats = new Map(leadRows.map(row => [String(row._id), row]));
  const listingStats = new Map(listingRows.map(row => [String(row._id), row]));
  const presentationStats = new Map(presentationRows.map(row => [String(row._id), row]));

  const rows = agents
    .map(agent => {
      const id = String(agent._id);
      const leads = leadStats.get(id) || {};
      const listings = listingStats.get(id) || {};
      const presentations = presentationStats.get(id) || {};
      const totalLeads = leads.totalLeads || 0;
      const convertedLeads = leads.convertedLeads || 0;

      return {
        _id: agent._id,
        name: agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || 'Agent',
        first_name: agent.first_name,
        last_name: agent.last_name,
        email: agent.email,
        phone_number: agent.phone_number,
        profile_photo: agent.profile_photo,
        agencyApprovalStatus: agent.agencyApprovalStatus || 'pending',
        adminApprovalStatus: agent.adminApprovalStatus || 'pending',
        isActive: agent.isActive !== false,
        totalLeads,
        activeLeads: leads.activeLeads || 0,
        convertedLeads,
        closedLeads: leads.closedLeads || 0,
        listingsCreated: listings.listingsCreated || 0,
        presentationsCreated: presentations.presentationsCreated || 0,
        commissionEarned: leads.commissionEarned || 0,
        paidCommission: leads.paidCommission || 0,
        conversionRate: totalLeads ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0,
        lastLeadAt: leads.lastLeadAt || null,
      };
    })
    .sort((a, b) => (
      b.totalLeads - a.totalLeads ||
      b.convertedLeads - a.convertedLeads ||
      b.commissionEarned - a.commissionEarned ||
      a.name.localeCompare(b.name)
    ))
    .map((agent, index) => ({ ...agent, rank: index + 1 }));

  const max = Math.min(Math.max(Number(limit) || 50, 1), 100);

  res.status(200).json({
    status: 'success',
    data: {
      summary: {
        totalAgents: rows.length,
        activeAgents: rows.filter(row => row.isActive).length,
        totalLeads: rows.reduce((sum, row) => sum + row.totalLeads, 0),
        activeLeads: rows.reduce((sum, row) => sum + row.activeLeads, 0),
        convertedLeads: rows.reduce((sum, row) => sum + row.convertedLeads, 0),
        presentationsCreated: rows.reduce((sum, row) => sum + row.presentationsCreated, 0),
        totalCommission: rows.reduce((sum, row) => sum + row.commissionEarned, 0),
        totalPaidToAgency: rows.reduce((sum, row) => sum + row.paidCommission, 0),
      },
      leaderboard: rows.slice(0, max),
    },
  });
});

exports.createAgent = asyncHandler(async (req, res) => {
  const {
    first_name,
    last_name,
    fullName,
    email,
    phone,
    phone_number,
    country_code,
    password,
    operating_city,
    specialization,
    experience_years,
    country,
    emiratesIdUrl,
    reraCardUrl,
    profilePhotoUrl,
  } = req.body;

  const resolvedPhone = phone_number || phone;
  const nameParts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  const resolvedFirstName = first_name || nameParts[0];
  const resolvedLastName = last_name || nameParts.slice(1).join(' ') || '-';

  // ── Validation ──────────────────────────────────────────────────────────
  if (!resolvedFirstName || !resolvedPhone || !password || !email) {
    throw new APIError(
      'first_name or fullName, email, phone, and password are required',
      StatusCodes.BAD_REQUEST
    );
  }

  // ── Duplicate check (phone must be unique across the whole system) ─────
  const existing = await Agent.findOne({
    $or: [
      { phone_number: resolvedPhone },
      { email: email.toLowerCase() },
    ],
  });
  if (existing) {
    throw new APIError(
      'An agent with this phone number or email already exists',
      StatusCodes.CONFLICT
    );
  }

  const agentRole = await Role.findOne({ code: 16 });

  // ── Create agent ────────────────────────────────────────────────────────
  const agent = await Agent.create({
    first_name: resolvedFirstName,
    last_name: resolvedLastName,
    fullName: fullName || `${resolvedFirstName} ${resolvedLastName}`.trim(),
    email,
    phone_number: resolvedPhone,
    country_code: country_code || '+971',
    password,                           // will be hashed by the pre‑save hook
    operating_city: operating_city || req.agency?.operatingLocation?.city || 'Dubai',
    specialization: specialization || 'general',
    experience_years: Number(experience_years) || 0,
    country: country || req.agency?.operatingLocation?.country || 'UAE',
    role: agentRole?._id || null,
    emiratesIdUrl: emiratesIdUrl || '',
    reraCardUrl: reraCardUrl || '',
    profile_photo: profilePhotoUrl || '',
    agency: req.agency._id,             // linked to the agency that creates it
    agencyApprovalStatus: 'approved',   // auto‑approved by the creating agency
    adminApprovalStatus: 'pending',     // still needs admin final approval
    onboarding_status: 'pending',
    isActive: true,
  });

  await Agency.findByIdAndUpdate(req.agency._id, {
    $addToSet: { agents: agent._id },
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
    experience_years,
    country,
    agency,
    emiratesIdUrl,
    reraCardUrl,
    reraCardNumber,
    profile_photo,
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
    experience_years: Number(experience_years) || 0,
    country: country || "UAE",
    agency,

    role: agentRole._id, // ✅ THIS FIXES NULL ROLE

    emiratesIdUrl: emiratesIdUrl || "",
    reraCardUrl: reraCardUrl || "",
    reraCardNumber: reraCardNumber || "",
    profile_photo: profile_photo || profilePhotoUrl || "",

    agencyApprovalStatus: "pending",
    adminApprovalStatus: "approved",
    onboarding_status: "pending",
  });

  await Agency.findByIdAndUpdate(agency, {
    $addToSet: { agents: agent._id },
  });

  agent.password = undefined;
await GridNotification.create({
  eventType:     'AGENT_REGISTERED',
  title:         'New Agent Registration (Pending Agency Approval)',
  message:       `Agent registered: ${first_name} ${last_name} (${email}) under agency — Pending agency approval`,
  entityId:      agent._id,
  entityModel:   'Agent',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: `${first_name} ${last_name}`,
  createdByRole: 'agent',
});
  res.status(201).json({
    status: "success",
    message:
      "Registration submitted. Awaiting agency approval.",
    data: agent,
  });
});
/**
 * GET /agency/agents
 */
exports.getAgents = asyncHandler(async (req, res) => {
  const agencyId = req.agency._id;
  const { status, adminStatus, search } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const filter = { agency: agencyId };
  if (status) filter.agencyApprovalStatus = status;
  if (adminStatus) filter.adminApprovalStatus = adminStatus;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { first_name: { $regex: search, $options: 'i' } },
      { last_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone_number: { $regex: search, $options: 'i' } },
    ];
  }

  const GridLead = require('../../Lead/model/gridLead.model');
  const Property = require('../../../properties/models/property.model');

  const [total, agents] = await Promise.all([
    Agent.countDocuments(filter),
    Agent.find(filter)
    .select('-password -bankDetails')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
      .lean(),
  ]);

  const agentIds = agents.map(agent => agent._id);
  const Presentation = mongoose.model('Presentation');

  const [leadStats, listingStats, presentationStats] = await Promise.all([
    GridLead.aggregate([
      { $match: { created_by_agent: { $in: agentIds } } },
      {
        $group: {
          _id: '$created_by_agent',
          totalLeads: { $sum: 1 },
          activeLeads: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'not_proceeding']] }, 0, 1],
            },
          },
          convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          commissionEarned: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } },
        },
      },
    ]),
    Property.aggregate([
      { $match: { created_by_agent: { $in: agentIds } } },
      { 
        $group: { 
          _id: '$created_by_agent', 
          listingsCreated: { $sum: 1 } 
        } 
      },
    ]),
    Presentation.aggregate([
      { $match: { agentId: { $in: agentIds } } },
      {
        $group: {
          _id: '$agentId',
          presentationsGenerated: { $sum: 1 }
        }
      }
    ]),
  ]);

  const leadStatsMap = new Map(leadStats.map(item => [String(item._id), item]));
  const listingStatsMap = new Map(listingStats.map(item => [String(item._id), item]));
  const presentationStatsMap = new Map(presentationStats.map(item => [String(item._id), item]));

  const data = agents.map(agent => {
    const leadStat = leadStatsMap.get(String(agent._id)) || {};
    const listingStat = listingStatsMap.get(String(agent._id)) || {};
    const presentationStat = presentationStatsMap.get(String(agent._id)) || {};

    return {
      _id: agent._id,
      name: agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim(),
      first_name: agent.first_name,
      last_name: agent.last_name,
      email: agent.email,
      phone_number: agent.phone_number,
      country_code: agent.country_code,
      registrationDate: agent.createdAt,
      reraCardStatus: agent.reraCardUrl || agent.reraCardNumber ? 'submitted' : 'missing',
      reraCardNumber: agent.reraCardNumber,
      reraCardUrl: agent.reraCardUrl,
      rera_number: agent.reraCardNumber,
      rera_certificate: agent.reraCardUrl,
      id_proof: agent.emiratesIdUrl,
      agencyApprovalStatus: agent.agencyApprovalStatus,
      adminApprovalStatus: agent.adminApprovalStatus,
      onboarding_status: agent.onboarding_status,
      isActive: agent.isActive,
      is_active: agent.isActive,
      status: agent.isActive,
      isFlagged: agent.isFlagged,
      flagNote: agent.flagNote,
      flaggedAt: agent.flaggedAt,
      profile_photo: agent.profile_photo,
      operating_city: agent.operating_city,
      country: agent.country,
      specialization: agent.specialization,
      experience_years: agent.experience_years || 0,
      experience: agent.experience_years || 0,
      presentationsGenerated: presentationStat.presentationsGenerated || 0,
      totalLeads: leadStat.totalLeads || 0,
      activeLeads: leadStat.activeLeads || 0,
      convertedLeads: leadStat.convertedLeads || 0,
      listingsCreated: listingStat.listingsCreated || 0,
      commissionEarned: leadStat.commissionEarned || agent.commissionEarned || 0,
    };
  });

  res.status(200).json({
    status: 'success',
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    data,
  });
});

/**
 * GET /agency/agents/:agentId
 */
exports.getAgentDetail = asyncHandler(async (req, res) => {
  const agent = await assertAgencyAgent(req.agency._id, req.params.agentId);
  const GridLead = require('../../Lead/model/gridLead.model');
  const Property = require('../../../properties/models/property.model');

  const [leadStats, listingsCreated, recentLeads, recentListings] = await Promise.all([
    GridLead.aggregate([
      { $match: { created_by_agent: agent._id } },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
          activeLeads: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'not_proceeding']] }, 0, 1],
            },
          },
          convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          commissionEarned: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } },
        },
      },
    ]),
    Property.countDocuments({ created_by_agent: agent._id }),
    GridLead.find({ created_by_agent: agent._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('contact_info requirements status classification deal_record createdAt updatedAt')
      .lean(),
    Property.find({ created_by_agent: agent._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('propertyName projectName propertySubType propertyType unitType approvalStatus listingStatus status projectStatus createdAt updatedAt')
      .lean(),
  ]);

  const stats = leadStats[0] || {};

  res.status(200).json({
    status: 'success',
    data: {
      agent,
      stats: {
        totalLeads: stats.totalLeads || 0,
        activeLeads: stats.activeLeads || 0,
        convertedLeads: stats.convertedLeads || 0,
        listingsCreated,
        commissionEarned: stats.commissionEarned || 0,
      },
      recentLeads,
      recentListings,
    },
  });
});

exports.getAgentActivity = asyncHandler(async (req, res) => {
  const agent = await assertAgencyAgent(req.agency._id, req.params.agentId);
  const { type = 'all', status, listingStatus, page, limit, skip } = {
    type: req.query.type || 'all',
    status: req.query.status,
    listingStatus: req.query.listingStatus || req.query.listing_status,
    ...getPagination(req.query),
  };
  const dateRange = parseDateRange(req.query);

  const GridLead = require('../../Lead/model/gridLead.model');
  const Property = require('../../../properties/models/property.model');

  const response = { agent };

  if (type === 'all' || type === 'leads') {
    const leadFilter = { created_by_agent: agent._id };
    if (status) leadFilter.status = status;
    if (dateRange) leadFilter.createdAt = dateRange;
    const [total, data] = await Promise.all([
      GridLead.countDocuments(leadFilter),
      GridLead.find(leadFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('contact_info requirements status classification deal_record source createdAt updatedAt')
        .lean(),
    ]);
    response.leads = { pagination: { total, page, limit, pages: Math.ceil(total / limit) }, data };
  }

  if (type === 'all' || type === 'listings') {
    const listingFilter = { created_by_agent: agent._id };
    if (listingStatus) {
      listingFilter.$and = [
        listingFilter.$and || [],
        {
          $or: [
            { listingStatus },
            { approvalStatus: listingStatus },
            { status: listingStatus },
          ]
        }
      ];
    }
    if (dateRange) {
      listingFilter.$and = [
        listingFilter.$and || [],
        { createdAt: dateRange }
      ];
    }
    const [total, data] = await Promise.all([
      Property.countDocuments(listingFilter),
      Property.find(listingFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('propertyName projectName propertySubType propertyType unitType approvalStatus listingStatus status projectStatus price city area createdAt updatedAt')
        .lean(),
    ]);
    response.listings = { pagination: { total, page, limit, pages: Math.ceil(total / limit) }, data };
  }

  res.status(200).json({ status: 'success', data: response });
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
  agent.adminApprovalStatus = 'approved';
  agent.adminApprovedAt = new Date();
  agent.onboarding_status = 'approved';
  agent.isActive = true;
  await agent.save();

  try {
    const agentName = agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
    await sendEmail({
      to: agent.email,
      subject: 'Your Xoto Agent Account Approved!',
      html: agentApprovalEmail({
        agentName,
        agentEmail: agent.email,
        agencyName: req.agency.companyName
      })
    });
  } catch (emailErr) {
    console.error('[Agent Approval Email Error]', emailErr.message);
  }
await GridNotification.create({
  eventType:     'AGENT_AGENCY_APPROVED',
  title:         'Agent Approved by Agency — Admin Verification Required',
  message:       `Agency approved agent: ${agent.fullName || agent.first_name} — Now pending Xoto admin final verification (RERA card, ID, bank details)`,
  entityId:      agent._id,
  entityModel:   'Agent',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.agency?.companyName || 'Agency',
  createdByRole: 'agency',
});
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

  try {
    const agentName = agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
    await sendEmail({
      to: agent.email,
      subject: 'Your Xoto Agent Application Update',
      html: agentDeclineEmail({
        agentName,
        agencyName: req.agency.companyName,
        reason: agent.agencyDeclineNote
      })
    });
  } catch (emailErr) {
    console.error('[Agent Decline Email Error]', emailErr.message);
  }

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
  agent.flaggedByAgency = req.agency._id;
  await agent.save();

  res.status(200).json({
    status: 'success',
    message: 'Agent flagged for Xoto admin review',
    data: agent,
  });
});

/**
 * PATCH /agency/agents/:agentId/suspend
 */
exports.suspendAgent = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const agent = await Agent.findOne({
    _id: req.params.agentId,
    agency: req.agency._id,
  });

  if (!agent) {
    throw new APIError('Agent not found', StatusCodes.NOT_FOUND);
  }

  if (!agent.isActive) {
    throw new APIError('Agent is already suspended', StatusCodes.BAD_REQUEST);
  }

  agent.isActive = false;
  agent.suspendedAt = new Date();
  agent.suspendedByAgency = req.agency._id;
  agent.suspendReason = reason || 'No reason provided';
  await agent.save();

  try {
    const agentName = agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
    await sendEmail({
      to: agent.email,
      subject: 'Your Xoto Agent Account Suspended',
      html: agentSuspendEmail({
        agentName,
        agencyName: req.agency.companyName
      })
    });
  } catch (emailErr) {
    console.error('[Agent Suspend Email Error]', emailErr.message);
  }
await GridNotification.create({
  eventType:     'AGENT_SUSPENDED',
  title:         'Agent Suspended ⚠️',
  message:       `Agent suspended: ${agent.fullName || agent.first_name} by agency. Reason: ${reason || 'Not provided'}`,
  entityId:      agent._id,
  entityModel:   'Agent',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.agency?.companyName || 'Agency',
  createdByRole: 'agency',
});
  res.status(200).json({
    status: 'success',
    message: 'Agent suspended successfully',
    data: agent,
  });
});

/**
 * PATCH /agency/agents/:agentId/unsuspend
 */
exports.unsuspendAgent = asyncHandler(async (req, res) => {
  const agent = await Agent.findOne({
    _id: req.params.agentId,
    agency: req.agency._id,
  });

  if (!agent) {
    throw new APIError('Agent not found', StatusCodes.NOT_FOUND);
  }

  if (agent.isActive) {
    throw new APIError('Agent is not suspended', StatusCodes.BAD_REQUEST);
  }

  agent.isActive = true;
  agent.unsuspendedAt = new Date();
  agent.unsuspendedByAgency = req.agency._id;
  await agent.save();

  try {
    const agentName = agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
    await sendEmail({
      to: agent.email,
      subject: 'Your Xoto Agent Account Reactivated',
      html: agentUnsuspendEmail({
        agentName,
        agencyName: req.agency.companyName
      })
    });
  } catch (emailErr) {
    console.error('[Agent Unsuspend Email Error]', emailErr.message);
  }

  res.status(200).json({
    status: 'success',
    message: 'Agent unsuspended successfully',
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
  const allowed = ['primaryContactName', 'primaryContactEmail', 'primaryContactPhone', 'address'];
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
 * POST /agency/profile/logo
 */
exports.updateLogo = asyncHandler(async (req, res) => {
  const { logo } = req.body;
  if (!logo) throw new APIError('Logo is required', StatusCodes.BAD_REQUEST);

  const agency = await Agency.findByIdAndUpdate(
    req.agency._id,
    { logo },
    { new: true, runValidators: true }
  ).select('-password');

  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);

  res.status(200).json({ status: 'success', data: agency });
});

/**
 * GET /agency/agreement
 */
exports.getAgreement = asyncHandler(async (req, res) => {
  const agency = await Agency.findById(req.agency._id).select('agreementDocuments agreementStatus agreementSigned agreementVerified agreementUnderReview agreementFeedback');
  if (!agency) throw new APIError('Agency not found', StatusCodes.NOT_FOUND);

  res.status(200).json({
    status: 'success',
    data: {
      agreementDocuments: agency.agreementDocuments,
      agreementStatus: agency.agreementStatus,
      agreementSigned: agency.agreementSigned,
      agreementVerified: agency.agreementVerified,
      agreementUnderReview: agency.agreementUnderReview,
      agreementFeedback: agency.agreementFeedback
    }
  });
});

/**
 * POST /agency/agreement/upload
 */
exports.uploadAgreement = asyncHandler(async (req, res) => {
  const { agreementDocuments, agreementStatus } = req.body;

  const agency = await Agency.findByIdAndUpdate(
    req.agency._id,
    {
      agreementDocuments,
      agreementStatus: agreementStatus || 'pending',
      agreementUnderReview: true
    },
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

const generatedPassword =
'Xoto@' + Math.floor(1000 + Math.random() * 9000);

const finalPassword =
req.body.password?.trim() || generatedPassword;

const agency = await Agency.create({
    companyName,
    reraRegistrationNumber,
    tradeLicenceUrl,
    reraLicenceUrl: reraLicenceUrl || '',
    letterOfAuthorityUrl: letterOfAuthorityUrl || '',
    logo: logo || '',
    profilePhoto: profilePhoto || '',
    primaryContactName,
    primaryContactEmail,
    primaryContactPhone,
    address: address || {},
    operatingLocation: operatingLocation || {},
    role: agencyRole?._id || null,

    password: finalPassword, // FIXED

    tempPassword: !req.body.password,

    subscriptionTier: subscriptionTier || 'basic',
    presentationQuota: presentationQuota || 100,
    onboardingStatus: 'completed',
    isActive: true,
    isSuspended: false,
    createdBy: req.user?._id || null,
});
  try {
    await sendEmail({
      to: primaryContactEmail,
      subject: 'Your Xoto Agency Account Created',
      html: agencyWelcomeEmail({
        companyName,
        primaryContactEmail,
        tempPassword: finalPassword,
      }),
    });
  } catch (emailErr) {
    console.error('[Agency Welcome Email Error]', emailErr.message);
  }

  const agencyResponse = agency.toObject();
  delete agencyResponse.password;
await GridNotification.create({
  eventType:     'AGENCY_CREATED',
  title:         'New Agency Account Created',
  message:       `Agency account created: ${companyName} (${primaryContactEmail}) — Credentials sent via email`,
  entityId:      agency._id,
  entityModel:   'Agency',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: 'Admin',
  createdByRole: 'admin',
});
  res.status(201).json({
    status: 'success',
    message: 'Agency created and credentials sent to email',
    data: agencyResponse,
  });
});
/**
 * GET /agency/leads — PRD 11.3
 * Read-only view of all leads across affiliated agents
 */
exports.getAgencyLeads = asyncHandler(async (req, res) => {
  console.log('=== getAgencyLeads called ===');
  const {
    agent,
    agentId,
    property,
    propertyId,
    status,
    property_type,
    search,
  } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const dateRange = parseDateRange(req.query);

  const agentIds = await getAgencyAgentIds(req.agency._id);
  console.log('Agency ID:', req.agency._id);
  console.log('Agent IDs:', agentIds);

  const filter = { created_by_agent: { $in: agentIds } };
  const selectedAgent = agentId || agent;
  if (selectedAgent) {
    const selectedAgentId = normalizeObjectId(selectedAgent, 'agent ID');
    if (!agentIds.some(id => String(id) === String(selectedAgentId))) {
      throw new APIError('Agent not found under this agency', StatusCodes.NOT_FOUND);
    }
    filter.created_by_agent = selectedAgentId;
  }
  if (status) filter.status = status;
  if (property_type) filter['requirements.property_type'] = property_type;
  const selectedProperty = propertyId || property;
  if (selectedProperty) {
    const selectedPropertyId = normalizeObjectId(selectedProperty, 'property ID');
    filter.$or = [
      { 'source.listing_id': selectedPropertyId },
      { 'matched_listings.listing_id': selectedPropertyId },
      { 'intent_signals.properties_viewed.property_id': selectedPropertyId },
    ];
  }
  if (dateRange) filter.createdAt = dateRange;
  if (search) {
    const searchFilter = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name': { $regex: search, $options: 'i' } },
      { 'contact_info.email.address': { $regex: search, $options: 'i' } }
    ];
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: searchFilter });
  }
  console.log('Final filter:', filter);

  const GridLead = require('../../Lead/model/gridLead.model');
  const total = await GridLead.countDocuments(filter);
  console.log('Total leads:', total);
  const leads = await GridLead.find(filter)
    .populate('created_by_agent', 'first_name last_name fullName email phone_number')
    .populate('source.listing_id', 'propertyName projectName propertySubType city area')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-presentations')
    .lean();
  console.log('Leads found:', leads.length);
  console.log('Leads:', leads);

  res.status(200).json({
    status: 'success',
    mode: 'read_only',
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
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
  const { agentId, agent, listingType, listing_type, status } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const dateRange = parseDateRange(req.query);

  const agentIds = await getAgencyAgentIds(req.agency._id);

  const Property = require('../../../properties/models/property.model');
  
  let filter = { created_by_agent: { $in: agentIds } };
  const selectedAgent = agentId || agent;
  if (selectedAgent) {
    const selectedAgentId = normalizeObjectId(selectedAgent, 'agent ID');
    if (!agentIds.some(id => String(id) === String(selectedAgentId))) {
      throw new APIError('Agent not found under this agency', StatusCodes.NOT_FOUND);
    }
    filter = { created_by_agent: selectedAgentId };
  }
  if (listingType || listing_type) {
    filter.$and = [
      filter.$and || [],
      { propertySubType: listingType || listing_type }
    ];
  }
  if (status) {
    const statusMap = {
      live: ['active', 'approved'],
      draft: ['draft'],
      pending: ['pending'],
      pending_approval: ['pending'],
      rejected: ['rejected'],
    };
    const statuses = statusMap[status] || [status];
    filter.$and = [
      filter.$and || [],
      {
        $or: [
          { listingStatus: { $in: statuses } },
          { approvalStatus: { $in: statuses } },
          { status: { $in: statuses } },
          { projectStatus: { $in: statuses } },
        ]
      }
    ];
  }
  if (dateRange) {
    filter.$and = [
      filter.$and || [],
      { createdAt: dateRange }
    ];
  }

  const total = await Property.countDocuments(filter);
  const listings = await Property.find(filter)
    .populate('created_by_agent', 'first_name last_name fullName email phone_number')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('propertyName projectName propertySubType propertyType unitType approvalStatus listingStatus status projectStatus price city area created_by_agent createdAt updatedAt')
    .lean();

  res.status(200).json({
    status: 'success',
    mode: 'read_only',
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
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

  const filter = { agencyApprovalStatus: 'approved' };
  if (status === 'approved') filter.adminApprovalStatus = 'approved';
  if (status === 'declined') filter.adminApprovalStatus = 'declined';
  if (status === 'pending') filter.adminApprovalStatus = 'pending';
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { first_name: { $regex: search, $options: 'i' } },
      { last_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone_number: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Agent.countDocuments(filter);
  const agents = await Agent.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const agentIds = agents.map(agent => agent._id);
  const Presentation = mongoose.model('Presentation');

  const presentationStats = await Presentation.aggregate([
    { $match: { agentId: { $in: agentIds } } },
    {
      $group: {
        _id: '$agentId',
        presentationsGenerated: { $sum: 1 }
      }
    }
  ]);

  const presentationStatsMap = new Map(presentationStats.map(item => [String(item._id), item]));

  const agentsWithStats = agents.map(agent => {
    const presentationStat = presentationStatsMap.get(String(agent._id)) || {};
    return {
      ...agent,
      presentationsGenerated: presentationStat.presentationsGenerated || 0
    };
  });

  res.status(200).json({
    status: 'success',
    pagination: {
      totalItems: total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      limit: Number(limit),
    },
    data: agentsWithStats,
  });
});

exports.getVerificationQueue = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;

  const filter = {
    agencyApprovalStatus: 'approved',
    adminApprovalStatus: 'pending'
  };
  
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { first_name: { $regex: search, $options: 'i' } },
      { last_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone_number: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Agent.countDocuments(filter);
  const agents = await Agent.find(filter)
    .select('-password')
    .populate('agency', 'companyName')
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

  if (agent.agencyApprovalStatus !== 'approved') {
    throw new APIError(
      'Agency approval is required before admin can approve this agent',
      StatusCodes.BAD_REQUEST
    );
  }

  agent.adminApprovalStatus = 'approved';
  agent.adminApprovedAt = new Date();
  await agent.save();
await GridNotification.create({
  eventType:     'AGENT_ADMIN_APPROVED',
  title:         'Agent Final Verification Complete ✅',
  message:       `Admin granted final platform access to agent: ${agent.first_name} ${agent.last_name}`,
  entityId:      agent._id,
  entityModel:   'Agent',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: 'Admin',
  createdByRole: 'admin',
});
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

  if (agent.agencyApprovalStatus !== 'approved') {
    throw new APIError(
      'Agency approval is required before admin can decline this agent',
      StatusCodes.BAD_REQUEST
    );
  }

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
  const agent = await Agent.findOne({
    _id: req.params.agentId,
    agencyApprovalStatus: 'approved',
  })
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
