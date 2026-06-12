const Agent  = require("../models/agent.js");

const Agency = require("../../agency/models/index.js");
const GridLead = require('../../Lead/model/gridLead.model');
const Property = require('../../../properties/models/property.model');
const Presentation = require('../../presentation/model/presentation.model');
const PartnerAgreement = require('../../dealrecord/models/Partneragreement.model');
const bcrypt = require("bcryptjs");
const { Role } = require('../../../../modules/auth/models/role/role.model.js');
const { createToken } = require('../../../../middleware/auth.js');

const canManageAgentAgreement = (agreement, agentId) =>
  agreement &&
  agreement.partyType === 'agent' &&
  String(agreement.agentId) === String(agentId);

const appendAgreementDocument = (agreement, agentId, documentData = {}) => {
  const { name, remarks, url, mimeType, size } = documentData;

  agreement.agreementDocuments.push({
    name: name || 'Agreement document',
    remarks: remarks || '',
    url,
    mimeType: mimeType || '',
    size: Number(size) || 0,
    uploadedBy: agentId,
    uploadedAt: new Date(),
  });

  if (!agreement.signedDocumentUrl) {
    agreement.signedDocumentUrl = url;
  }

  return agreement.agreementDocuments[agreement.agreementDocuments.length - 1];
};

/* =====================================
   :one: AGENT SIGNUP
===================================== */
exports.agentSignup = async (req, res) => {
  try {
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
      country,
      agency,
    } = req.body;

    const resolvedPhone = phone_number || phone;
    const nameParts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    const resolvedFirstName = first_name || nameParts[0];
    const resolvedLastName = last_name || nameParts.slice(1).join(' ') || '-';

    if (!resolvedFirstName || !resolvedPhone || !password || !agency || !email) {
      return res.status(400).json({ success: false, message: 'Name, email, phone, password, and agency are required' });
    }

    // Check for duplicate phone
    const existing = await Agent.findOne({
      $or: [
        { phone_number: resolvedPhone },
        { email: email.toLowerCase() },
      ],
    });

    if (existing) return res.status(400).json({ success: false, message: 'Phone number or email already registered' });

    // Verify agency exists and is active
    const agencyDoc = await Agency.findOne({ _id: agency, isActive: true, isSuspended: false });
    if (!agencyDoc) return res.status(400).json({ success: false, message: 'Selected agency not found or inactive' });
const agentRole = await Role.findOne({ code: 16 });
    const newAgent = await Agent.create({
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      fullName: fullName || `${resolvedFirstName} ${resolvedLastName}`.trim(),
      email,
      phone_number: resolvedPhone,
      country_code: country_code || '+971',
      password,   // hashed by pre-save hook
      operating_city: operating_city || agencyDoc.operatingLocation?.city || 'Dubai',
      specialization: specialization || 'general',
      country: country || agencyDoc.operatingLocation?.country || 'UAE',
      agency,
        role: agentRole ? agentRole._id : null,
      agencyApprovalStatus: 'pending',
      adminApprovalStatus: 'pending',
      isActive: false,
    });

    // Optionally push agent to agency's agents array
    await Agency.findByIdAndUpdate(agency, { $addToSet: { agents: newAgent._id } });

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Awaiting agency and admin approval.',
      data: { _id: newAgent._id, phone: newAgent.phone_number, agency: newAgent.agency },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================
   :two: AGENT LOGIN
===================================== */
exports.agentLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ success: false, message: 'Phone and password required' });

    let agent = null;

    // Try 1: search by stored local phone number directly
    agent = await Agent.findOne({ phone_number: phone });

    // Try 2: split country_code + phone_number
    if (!agent && phone.startsWith('+')) {
      const numberWithoutPlus = phone.slice(1);
      const splits = [
        { country_code: '+' + numberWithoutPlus.slice(0, 1), phone_number: numberWithoutPlus.slice(1) },
        { country_code: '+' + numberWithoutPlus.slice(0, 2), phone_number: numberWithoutPlus.slice(2) },
        { country_code: '+' + numberWithoutPlus.slice(0, 3), phone_number: numberWithoutPlus.slice(3) },
        { country_code: '+' + numberWithoutPlus.slice(0, 4), phone_number: numberWithoutPlus.slice(4) },
      ];

      for (const split of splits) {
        agent = await Agent.findOne({
          country_code: split.country_code,
          phone_number: split.phone_number,
        });
        if (agent) break;
      }
    }

    if (!agent)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (!agent.password)
      return res.status(401).json({ success: false, message: 'Password not set.' });

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (agent.agencyApprovalStatus !== 'approved')
      return res.status(403).json({ success: false, message: 'Account not approved by agency yet.' });

    // ✅ Populate role before token creation
    const agentWithRole = await Agent.findById(agent._id).populate({
      path: 'role',
      strictPopulate: false,
    });

    const token = createToken(agentWithRole || agent, 'agent');
    const agentData = (agentWithRole || agent).toObject();
    delete agentData.password;

    res.status(200).json({ success: true, token, data: agentData });
  } catch (err) {
    console.error('[Agent Login]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
/* =====================================
   :three: UPDATE AGENT
===================================== */
exports.updateAgent    = async (req, res) =>{
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Agent ID required"
      });
    }

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update"
      });
    }

    let updateData = { ...req.body };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updated = await Agent.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Agent updated successfully",
      data: updated
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// controllers/agent.controller.js

/* =====================================
   GET ALL AGENTS - ADMIN ONLY (Independent Agents)
===================================== */
exports.getAllAgents    = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const onboarding_status = req.query.onboarding_status;
    const search = req.query.search;

    // ✅ Admin sees ONLY independent agents
    let query = { agentType: "independent" };

    if (onboarding_status) {
      query.onboarding_status = onboarding_status;
    }

    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Agent.countDocuments(query);
    const agents = await Agent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-password')
      .populate('agency', 'agency_name');

    // Stats for independent agents only
    const stats = {
      total: await Agent.countDocuments({ agentType: "independent" }),
      pending: await Agent.countDocuments({ agentType: "independent", onboarding_status: 'pending' }),
      approved: await Agent.countDocuments({ agentType: "independent", onboarding_status: 'approved' }),
      rejected: await Agent.countDocuments({ agentType: "independent", onboarding_status: 'rejected' }),
      active: await Agent.countDocuments({ agentType: "independent", is_active: true }),
      inactive: await Agent.countDocuments({ agentType: "independent", is_active: false })
    };

    return res.status(200).json({
      success: true,
      message: "Independent agents fetched successfully",
      count: agents.length,
      total: total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      },
      stats: stats,
      data: agents
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET AGENT BY ID - ADMIN
===================================== */
exports.getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Admin can see independent agents only
    const agent = await Agent.findOne({ _id: id})
      .select("-password")
      .populate('agency', 'agency_name');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Independent agent not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: agent
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};







// controllers/agency.controller.js

/* =====================================
   GET ALL AGENTS UNDER AGENCY (Agency Owner)
===================================== */
exports.getAgencyAgents = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search, isVerified } = req.query;

    // ✅ Agency sees ONLY agents under this agency
    let query = { agency: agencyId, agentType: "agency_agent" };

    if (status) {
      query.onboarding_status = status;
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    if (search) {
      query.$or = [
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Agent.countDocuments(query);
    const agents = await Agent.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Stats for this agency only
    const stats = {
      total: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent" }),
      approved: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", onboarding_status: 'approved' }),
      pending: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", onboarding_status: 'pending' }),
      rejected: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", onboarding_status: 'rejected' }),
      verified: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", isVerified: true }),
      notVerified: await Agent.countDocuments({ agency: agencyId, agentType: "agency_agent", isVerified: false })
    };

    return res.status(200).json({
      success: true,
      message: "Agency agents fetched successfully",
      data: agents,
      count: agents.length,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      },
      stats: stats
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET SINGLE AGENT UNDER AGENCY
===================================== */
exports.getAgencyAgentById = async (req, res) => {
  try {
    const agencyId = req.user._id;
    const { agentId } = req.params;

    // ✅ Agency sees only their own agent
    const agent = await Agent.findOne({ 
      _id: agentId, 
      agency: agencyId, 
      agentType: "agency_agent" 
    }).select('-password');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found under this agency"
      });
    }

    return res.status(200).json({
      success: true,
      data: agent
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
/* =====================================
   :six: DELETE AGENT
===================================== */
exports.deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    if (agent.agency) {
      await Agency.findByIdAndUpdate(agent.agency, {
        $pull: { agents: agent._id },
        $inc: { totalAgents: -1 }
      });
    }

    await Agent.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Agent deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :seven: APPROVE AGENT
===================================== */
exports.approveAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.isVerified = true;
    agent.onboarding_status = "approved";
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Agent approved successfully",
      data: agent
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   :eight: REJECT AGENT
===================================== */
exports.rejectAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    agent.onboarding_status = "rejected";
    agent.rejection_reason = rejection_reason || "Not specified";
    await agent.save();

    return res.status(200).json({
      success: true,
      message: "Agent rejected",
      data: agent
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   AGENT DASHBOARD — Enhanced payload for frontend
   Returns: stats, profile_completion, listings, leads_preview, activity_feed, leaderboard, my_stats
===================================== */
exports.getDashboard = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const range = req.query.range || req.query.params?.range || '7d';
    const daysWindow = range === '30d' ? 30 : range === '90d' ? 90 : 7;

    const baseFilter = {
      lead_type: 'agent',
      'source.channel': 'agent_added',
      created_by_agent: agentId,
    };

    // Get agent profile
    const agent = await Agent.findById(agentId).lean();

    // SECTION 1: Basic stats
    const [total, newLeads, inProgress, completed, submitted, notProceeding, activeListings] = await Promise.all([
      GridLead.countDocuments(baseFilter),
      GridLead.countDocuments({ ...baseFilter, status: 'new' }),
      GridLead.countDocuments({ ...baseFilter, status: { $in: ['contacted', 'in_discussion', 'site_visit_scheduled', 'offer_made', 'qualified'] } }),
      GridLead.countDocuments({ ...baseFilter, status: 'completed' }),
      GridLead.countDocuments({ ...baseFilter, submitted_to_xoto: true }),
      GridLead.countDocuments({ ...baseFilter, status: 'not_proceeding' }),
      Property.countDocuments({
        created_by_agent: agentId,
        $or: [
          { status: 'approved' },
          { listingStatus: 'active' },
          { approvalStatus: 'approved' },
        ],
      }),
    ]);

    const stats = {
      total,
      new: newLeads,
      in_progress: inProgress,
      completed,
      submitted,
      not_proceeding: notProceeding,
      pending_submission: total - submitted - completed - notProceeding,
    };

    // SECTION 2: Profile completion percentage
    const profileFields = ['first_name', 'last_name', 'email', 'phone_number', 'specialization', 'operating_city'];
    const completedFields = profileFields.filter(f => agent && agent[f]).length;
    const profile_completion = Math.round((completedFields / profileFields.length) * 100);

    // SECTION 3: Active requirement leads count (active listings)
    const active_requirement_leads = inProgress;
    const active_listings = activeListings;

    // SECTION 4: Presentations generated
    const presentations_generated = await Presentation.countDocuments({ agentId });

    // SECTION 5: Commission earned (calculated from completed deals)
    let commission_earned = 0;
    try {
      const commissionData = await GridLead.aggregate([
        { $match: { ...baseFilter, status: 'completed' } },
        { $group: { _id: null, total_commission: { $sum: { $ifNull: ['$deal_record.commission_amount', 0] } } } }
      ]);
      commission_earned = commissionData.length > 0 ? Math.round(commissionData[0].total_commission || 0) : 0;
    } catch (e) {
      commission_earned = 0;
    }

    // SECTION 6: Leads trend — based on daysWindow
    const trendStart = new Date();
    trendStart.setHours(0,0,0,0);
    trendStart.setDate(trendStart.getDate() - (daysWindow - 1));

    const leadsAgg = await GridLead.aggregate([
      { $match: { ...baseFilter, createdAt: { $gte: trendStart } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $project: { date: '$_id', count: '$count', _id: 0 } }
    ]);

    const days = [];
    const daysDates = [];
    for (let i = daysWindow - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() - i);
      const label = daysWindow <= 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dateStr = d.toISOString().slice(0,10);
      days.push(label);
      daysDates.push(dateStr);
    }

    const leads_trend = daysDates.map((dateStr, idx) => {
      const found = leadsAgg.find(x => x.date === dateStr);
      return { name: days[idx], leads: found ? found.count : 0 };
    });

    // SECTION 7: Deals closed — last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setHours(0,0,0,0);

    const dealsAgg = await GridLead.aggregate([
      { $match: { ...baseFilter, status: 'completed', createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
      { $project: { year: '$_id.year', month: '$_id.month', count: '$count', _id: 0 } }
    ]);

    const monthsData = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date();
      m.setMonth(m.getMonth() - i);
      monthsData.push({
        label: m.toLocaleString('en-US', { month: 'short' }),
        month: m.getMonth() + 1,
        year: m.getFullYear()
      });
    }
    const deals_closed = monthsData.map(md => {
      const found = dealsAgg.find(x => x.month === md.month && x.year === md.year);
      return { month: md.label, deals: found ? found.count : 0 };
    });

    // SECTION 8: My leads preview (latest 5)
    const my_leads = await GridLead.find(baseFilter)
      .select('contact_info enquiry_type classification status createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const leads_preview = my_leads.map(l => ({
      id: l._id,
      name: `${l.contact_info?.name?.first_name || ''} ${l.contact_info?.name?.last_name || ''}`.trim() || 'Unknown',
      type: l.enquiry_type || l.classification || 'Lead',
      status: l.status || 'new',
      date: l.createdAt ? new Date(l.createdAt).toLocaleDateString() : 'N/A'
    }));

    // SECTION 9: Recent activity feed
    const activity_feed = [
      { type: 'lead_assigned', message: `New lead from ${my_leads[0]?.contact_info?.name?.first_name || 'customer'}`, time: '2 hours ago', icon: 'team' },
      { type: 'lead_status', message: 'Lead moved to "In Discussion"', time: '5 hours ago', icon: 'file-text' },
      { type: 'listing_approved', message: 'Your listing was approved', time: '1 day ago', icon: 'check' },
    ];

    // SECTION 10: Conversion metrics
    const conversion_rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const lead_status_breakdown = [
      { status: 'New', value: newLeads, color: '#5C039B' },
      { status: 'In Progress', value: inProgress, color: '#3b82f6' },
      { status: 'Completed', value: completed, color: '#10b981' },
      { status: 'Not Proceeding', value: notProceeding, color: '#ef4444' },
    ];

    // SECTION 11: Month-on-month leads growth
    const monthlyLeadsAgg = await GridLead.aggregate([
      { $match: { ...baseFilter, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
      { $project: { year: '$_id.year', month: '$_id.month', count: '$count', _id: 0 } }
    ]);

    const monthlyLeadsData = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date();
      m.setMonth(m.getMonth() - i);
      const month = m.getMonth() + 1;
      const year = m.getFullYear();
      const found = monthlyLeadsAgg.find(x => x.month === month && x.year === year);
      monthlyLeadsData.push({
        month: m.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        leads: found ? found.count : 0,
      });
    }

    // SECTION 12: Recent clients
    const recent_clients = my_leads.slice(0, 6).map(r => ({
      name: `${r.contact_info?.name?.first_name || ''} ${r.contact_info?.name?.last_name || ''}`.trim() || 'Client',
      title: r.enquiry_type || r.classification || 'Lead',
      time: r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Just now'
    }));

    return res.json({
      success: true,
      data: {
        agent_name: agent ? `${agent.first_name} ${agent.last_name}` : 'Agent',
        profile_completion,
        stats,
        active_requirement_leads,
        active_listings,
        presentations_generated,
        commission_earned,
        leads_trend,
        deals_closed,
        leads_preview,
        activity_feed,
        conversion_rate,
        lead_status_breakdown,
        monthly_leads: monthlyLeadsData,
        recent_clients,
      }
    });
  } catch (err) {
    console.error('[Agent Dashboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================
   AGENT LEADERBOARD — PRD §3.3 + §8.1
   Agent's own performance stats only.
   Score composite: deals closed + conversion rate + tenure on platform
   Tabs: weekly / monthly / quarterly / annual
   My Stats: leads by month (bar), lead status breakdown (donut), conversion funnel, MoM increase
===================================== */
exports.getLeaderboard = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const range = req.query.range || 'monthly';
    const daysWindow = range === 'weekly' ? 7 : range === 'quarterly' ? 90 : range === 'annual' ? 365 : 30;

    const currentAgent = await Agent.findById(agentId)
      .select('first_name last_name fullName email phone_number operating_city specialization agency profile_photo createdAt')
      .lean();
    if (!currentAgent) return res.status(404).json({ success: false, message: 'Agent not found' });

    // Tenure in months since joining platform (PRD §8.1 score component)
    const joinedAt = currentAgent.createdAt ? new Date(currentAgent.createdAt) : new Date();
    const tenureMonths = Math.max(0, Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)));

    const baseMatch = {
      lead_type: 'agent',
      'source.channel': 'agent_added',
      created_by_agent: agentId,
    };

    const currentStart = new Date();
    currentStart.setHours(0, 0, 0, 0);
    currentStart.setDate(currentStart.getDate() - (daysWindow - 1));

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - daysWindow);
    const previousEnd = new Date(currentStart);

    // PRD §8.1: Score = deals closed (30%) + conversion rate (40%) + tenure (30%)
    const calcProgressScore = (completedDeals, conversionRate, tenure) => Math.min(100, Math.round(
      (Math.min(completedDeals, 10) / 10 * 30) +
      (conversionRate * 0.40) +
      (Math.min(tenure, 24) / 24 * 30)
    ));

    const aggregatePerformance = async (dateFilter) => {
      const rows = await GridLead.aggregate([
        { $match: { ...baseMatch, createdAt: dateFilter } },
        {
          $group: {
            _id: null,
            totalLeads: { $sum: 1 },
            completedDeals: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            inProgressLeads: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['contacted', 'in_discussion', 'site_visit_scheduled', 'offer_made', 'qualified']] },
                  1, 0,
                ],
              },
            },
            notProceeding: { $sum: { $cond: [{ $eq: ['$status', 'not_proceeding'] }, 1, 0] } },
          },
        },
      ]);

      const row = rows[0] || {};
      const totalLeads = row.totalLeads || 0;
      const completedDeals = row.completedDeals || 0;
      const conversionRate = totalLeads > 0 ? Math.round((completedDeals / totalLeads) * 100) : 0;
      return {
        total_leads: totalLeads,
        in_progress_leads: row.inProgressLeads || 0,
        completed_deals: completedDeals,
        not_proceeding: row.notProceeding || 0,
        conversion_rate: conversionRate,
        progress_score: calcProgressScore(completedDeals, conversionRate, tenureMonths),
      };
    };

    // Date helpers for monthly grouping (My Stats)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const [current, previous, dailyRows, monthlyRows, statusRows, lastMonthRows] = await Promise.all([
      aggregatePerformance({ $gte: currentStart }),
      aggregatePerformance({ $gte: previousStart, $lt: previousEnd }),
      // Daily trend within current period
      GridLead.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: currentStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            leads: { $sum: 1 },
            conversions: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
        { $project: { date: '$_id', leads: 1, conversions: 1, _id: 0 } },
        { $sort: { date: 1 } },
      ]),
      // Leads by month (last 6 months — bar chart)
      GridLead.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            leads: { $sum: 1 },
            conversions: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      // Lead status breakdown (donut chart)
      GridLead.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]),
      // Last month leads for MoM comparison
      GridLead.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),
    ]);

    const pctChange = (now, before) => {
      if (!before && !now) return 0;
      if (!before) return 100;
      return Math.round(((now - before) / before) * 100);
    };

    const trend = {
      leads_change: pctChange(current.total_leads, previous.total_leads),
      conversion_change: current.conversion_rate - previous.conversion_rate,
      deals_change: pctChange(current.completed_deals, previous.completed_deals),
      progress_change: current.progress_score - previous.progress_score,
      direction: current.progress_score >= previous.progress_score ? 'up' : 'down',
    };

    // Build daily trend
    const trendMap = new Map(dailyRows.map(row => [row.date, row]));
    const performanceTrend = [];
    for (let i = daysWindow - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const row = trendMap.get(dateKey) || {};
      performanceTrend.push({
        date: dateKey,
        label: daysWindow <= 7
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        leads: row.leads || 0,
        conversions: row.conversions || 0,
      });
    }

    // Leads by month — fill in missing months with 0
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap = new Map(monthlyRows.map(r => [`${r._id.year}-${r._id.month}`, r]));
    const leadsByMonth = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const row = monthlyMap.get(key) || {};
      leadsByMonth.push({
        month: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear(),
        leads: row.leads || 0,
        conversions: row.conversions || 0,
      });
    }

    // MoM increase
    const thisMonthLeads = leadsByMonth[leadsByMonth.length - 1]?.leads || 0;
    const lastMonthLeads = (lastMonthRows[0]?.count) || (leadsByMonth[leadsByMonth.length - 2]?.leads) || 0;
    const momIncrease = pctChange(thisMonthLeads, lastMonthLeads);

    // Lead status breakdown for donut
    const STATUS_LABELS = {
      new_lead: 'New', contacted: 'Contacted', in_discussion: 'In Discussion',
      site_visit_scheduled: 'Site Visit', offer_made: 'Offer Made', qualified: 'Qualified',
      completed: 'Completed', not_proceeding: 'Not Proceeding',
    };
    const STATUS_COLORS = {
      new_lead: '#6366f1', contacted: '#3b82f6', in_discussion: '#8b5cf6',
      site_visit_scheduled: '#f59e0b', offer_made: '#f97316', qualified: '#10b981',
      completed: '#16a34a', not_proceeding: '#ef4444',
    };
    const leadStatusBreakdown = statusRows.map(r => ({
      status: r.status,
      label: STATUS_LABELS[r.status] || r.status,
      count: r.count,
      color: STATUS_COLORS[r.status] || '#94a3b8',
    }));

    // Conversion funnel — PRD §8.1
    const FUNNEL_STAGES = ['new_lead', 'contacted', 'in_discussion', 'offer_made', 'completed'];
    const statusCountMap = new Map(statusRows.map(r => [r.status, r.count]));
    const conversionFunnel = FUNNEL_STAGES.map((stage, idx) => ({
      stage,
      label: STATUS_LABELS[stage] || stage,
      count: statusCountMap.get(stage) || 0,
      step: idx + 1,
    }));

    return res.json({
      success: true,
      data: {
        range,
        days_window: daysWindow,
        agent: {
          id: currentAgent._id,
          name: currentAgent.fullName || `${currentAgent.first_name || ''} ${currentAgent.last_name || ''}`.trim() || 'Agent',
          email: currentAgent.email,
          city: currentAgent.operating_city || 'N/A',
          specialization: currentAgent.specialization || 'General',
          avatar: currentAgent.profile_photo || null,
          tenure_months: tenureMonths,
        },
        current,
        previous,
        trend,
        performance_trend: performanceTrend,
        // My Stats (PRD §8.1)
        leads_by_month: leadsByMonth,
        lead_status_breakdown: leadStatusBreakdown,
        conversion_funnel: conversionFunnel,
        mom_increase: momIncrease,
      },
    });
  } catch (err) {
    console.error('[Agent Leaderboard]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================
   MY AGREEMENTS — Agent signed A2A agreements
===================================== */
exports.getMyAgreements = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const agent = await Agent.findById(agentId)
      .select('first_name last_name fullName email agency')
      .populate('agency', 'agency_name agencyName companyName')
      .lean();

    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    const filters = [{ agentId, partyType: 'agent' }];
    if (agent.agency?._id) {
      filters.push({ agencyId: agent.agency._id, partyType: 'agency' });
    }

    const agreements = await PartnerAgreement.find({ $or: filters })
      .sort({ effectiveDate: -1, createdAt: -1 })
      .lean();

    const now = new Date();
    const inThirtyDays = new Date();
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);

    const formattedAgreements = agreements.map((agreement) => {
      const isExpired = agreement.expiryDate && new Date(agreement.expiryDate) < now;
      const isExpiringSoon = agreement.expiryDate &&
        new Date(agreement.expiryDate) >= now &&
        new Date(agreement.expiryDate) <= inThirtyDays;

      return {
        id: agreement._id,
        agreement_type: agreement.partyType === 'agent' ? 'Agent Agreement (A2A)' : 'Agency Master Agreement',
        party_type: agreement.partyType,
        status: isExpired ? 'expired' : agreement.status,
        effective_date: agreement.effectiveDate,
        expiry_date: agreement.expiryDate,
        is_expiring_soon: Boolean(isExpiringSoon),
        commission_split_percent: agreement.commissionSplitPercent || 0,
        referral_split_percent: agreement.referralSplitPercent || 0,
        platform_access_terms: agreement.platformAccessTerms || '',
        notes: agreement.notes || '',
        signed_document_url: agreement.signedDocumentUrl || '',
        documents: [
          ...(agreement.agreementDocuments || []).map(doc => ({
            id: doc._id,
            name: doc.name || 'Agreement document',
            remarks: doc.remarks || '',
            url: doc.url,
            mime_type: doc.mimeType || '',
            size: doc.size || 0,
            uploaded_at: doc.uploadedAt,
          })),
          ...(agreement.signedDocumentUrl && !(agreement.agreementDocuments || []).some(doc => doc.url === agreement.signedDocumentUrl)
            ? [{
              id: 'signed-document',
              name: 'Signed agreement',
              url: agreement.signedDocumentUrl,
              mime_type: '',
              size: 0,
              uploaded_at: agreement.createdAt,
              locked: true,
            }]
            : []),
        ],
        can_manage_documents: canManageAgentAgreement(agreement, agentId),
        version: agreement.version || 1,
        created_at: agreement.createdAt,
      };
    });

    const summary = {
      total: formattedAgreements.length,
      active: formattedAgreements.filter(item => item.status === 'active').length,
      expiring_soon: formattedAgreements.filter(item => item.is_expiring_soon).length,
      expired: formattedAgreements.filter(item => item.status === 'expired').length,
    };

    return res.json({
      success: true,
      data: {
        agent: {
          id: agent._id,
          name: agent.fullName || `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || 'Agent',
          email: agent.email,
          agency: agent.agency ? {
            id: agent.agency._id,
            name: agent.agency.agency_name || agent.agency.agencyName || agent.agency.companyName || 'Agency',
          } : null,
        },
        summary,
        agreements: formattedAgreements,
      },
    });
  } catch (err) {
    console.error('[Agent Agreements]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.addAgreementDocument = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { id } = req.params;
    const { name, remarks, url, mimeType, size, expiryDate } = req.body || {};
    if (!url) return res.status(400).json({ success: false, message: 'Document URL is required' });

    const agreement = await PartnerAgreement.findById(id);
    if (!canManageAgentAgreement(agreement, agentId)) {
      return res.status(403).json({ success: false, message: 'You can update only your own agent agreement documents' });
    }

    const document = appendAgreementDocument(agreement, agentId, { name, remarks, url, mimeType, size });
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'expiryDate')) {
      agreement.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }
    await agreement.save();

    return res.status(201).json({
      success: true,
      message: 'Agreement document added',
      data: {
        id: document._id,
        name: document.name,
        remarks: document.remarks,
        url: document.url,
        mime_type: document.mimeType,
        size: document.size,
        uploaded_at: document.uploadedAt,
      },
    });
  } catch (err) {
    console.error('[Agent Agreement Document Add]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.addMyAgreementDocument = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { name, remarks, url, mimeType, size, expiryDate } = req.body || {};
    if (!url) return res.status(400).json({ success: false, message: 'Document URL is required' });

    const agent = await Agent.findById(agentId).select('agency');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    let agreement = await PartnerAgreement.findOne({
      agentId,
      partyType: 'agent',
      status: { $ne: 'superseded' },
    }).sort({ effectiveDate: -1, createdAt: -1 });

    if (!agreement) {
      agreement = new PartnerAgreement({
        partyType: 'agent',
        agentId,
        agencyId: agent.agency || null,
        commissionSplitPercent: 0,
        referralSplitPercent: 0,
        platformAccessTerms: 'Agent uploaded signed A2A agreement document.',
        notes: remarks || '',
        effectiveDate: new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        status: 'active',
        createdBy: agentId,
      });
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'expiryDate')) {
      agreement.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }

    const document = appendAgreementDocument(agreement, agentId, { name, remarks, url, mimeType, size });
    await agreement.save();

    return res.status(201).json({
      success: true,
      message: 'Agreement document added',
      data: {
        agreement_id: agreement._id,
        id: document._id,
        name: document.name,
        remarks: document.remarks,
        url: document.url,
        mime_type: document.mimeType,
        size: document.size,
        uploaded_at: document.uploadedAt,
      },
    });
  } catch (err) {
    console.error('[Agent Agreement Document Add/Create]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateAgreementDocument = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { id, documentId } = req.params;
    const { name, remarks, expiryDate, url, mimeType, size } = req.body || {};

    const agreement = await PartnerAgreement.findById(id);
    if (!canManageAgentAgreement(agreement, agentId)) {
      return res.status(403).json({ success: false, message: 'You can edit only your own agent agreement documents' });
    }

    const document = agreement.agreementDocuments.id(documentId);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      document.name = name || 'Agreement document';
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'remarks')) {
      document.remarks = remarks || '';
    }
    if (url) {
      const previousUrl = document.url;
      document.url = url;
      document.mimeType = mimeType || document.mimeType || '';
      document.size = Number(size) || document.size || 0;
      if (agreement.signedDocumentUrl === previousUrl) {
        agreement.signedDocumentUrl = url;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'expiryDate')) {
      agreement.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }

    await agreement.save();

    return res.json({
      success: true,
      message: 'Agreement document updated',
      data: {
        id: document._id,
        name: document.name,
        remarks: document.remarks,
        url: document.url,
        mime_type: document.mimeType,
        size: document.size,
        uploaded_at: document.uploadedAt,
        expiry_date: agreement.expiryDate,
      },
    });
  } catch (err) {
    console.error('[Agent Agreement Document Update]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAgreementDocument = async (req, res) => {
  try {
    const agentId = req.user && req.user._id;
    if (!agentId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { id, documentId } = req.params;
    const agreement = await PartnerAgreement.findById(id);
    if (!canManageAgentAgreement(agreement, agentId)) {
      return res.status(403).json({ success: false, message: 'You can delete only your own agent agreement documents' });
    }

    const document = agreement.agreementDocuments.id(documentId);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    const removedUrl = document.url;
    document.deleteOne();

    if (agreement.signedDocumentUrl === removedUrl) {
      agreement.signedDocumentUrl = agreement.agreementDocuments[0]?.url || '';
    }

    await agreement.save();
    return res.json({ success: true, message: 'Agreement document deleted' });
  } catch (err) {
    console.error('[Agent Agreement Document Delete]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
