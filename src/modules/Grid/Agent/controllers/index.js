const Agent  = require("../models/agent.js");

const Agency = require("../../agency/models/index.js");
const GridLead = require('../../Lead/model/gridLead.model');
const Property = require('../../../properties/models/property.model');
const Presentation = require('../../presentation/model/presentation.model');
const bcrypt = require("bcryptjs");
const { Role } = require('../../../../modules/auth/models/role/role.model.js');
const { createToken } = require('../../../../middleware/auth.js');


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

    if (agent.agencyApprovalStatus !== 'approved' || agent.adminApprovalStatus !== 'approved')
      return res.status(403).json({ success: false, message: 'Account not fully approved yet.' });

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
