// ════════════════════════════════════════════════════════════════════════════
// gridLead.controller.js
// ════════════════════════════════════════════════════════════════════════════

const GridLead    = require('../model/gridLead.model');
const Customer    = require('../../../../modules/auth/models/user/customer.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const asyncHandler = require('../../../../utils/asyncHandler');
const Agent       = require('../../Agent/models/agent.js');
const GridAdvisor = require('../../Advisor/model/index.js');
const { suggestAdvisor } = require('../../Advisor/controller/advisorAssignment.service.js');
const Property = require('../../../properties/models/property.model.js');
const PropertyInventory = require('../../../properties/models/property.inventory.model.js');
const { matchPropertiesForLead } = require('./gridLead.matchHelper');

const isGridAdmin = (role) => {
  if (!role) return false;
  if (typeof role === 'object') {
    return role?.isSuperAdmin === true ||
      Number(role?.code) === 0 ||
      Number(role?.code) === 1;
  }
  return ['admin', 'super_admin', 'xoto_super_admin', 'xoto_staff_admin'].includes(role);
};


// ════════════════════════════════════════════════════════════════════════════
// WEBSITE LEADS
// ════════════════════════════════════════════════════════════════════════════

exports.createWebsiteLead = asyncHandler(async (req, res) => {
  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    enquiry_type, property_id,
    preferred_contact = 'whatsapp',
    message, requirements,
  } = req.body;

  if (!first_name || !last_name || !phone_number) {
    return res.status(400).json({
      success: false,
      message: 'First name, last name and phone number are required',
    });
  }

  const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
  const cleanEmail = email ? email.toLowerCase().trim() : null;

  const matchQuery = { $or: [{ 'mobile.number': cleanPhone }] };
  if (cleanEmail) matchQuery.$or.push({ email: cleanEmail });

  let customer = await Customer.findOne(matchQuery);

  if (!customer) {
    customer = await Customer.create({
      name: { first_name: first_name.trim(), last_name: last_name.trim() },
      mobile: { country_code, number: cleanPhone, verified: false },
      ...(cleanEmail && { email: cleanEmail }),
      statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 },
    });
  }

  const existingLeads = await GridLead.checkDuplicate(customer._id, 30);

  if (existingLeads.length > 0) {
    const existingLead = existingLeads[0];
    const existingListingId = existingLead.source?.listing_id
      ? existingLead.source.listing_id.toString()
      : null;

    if (property_id && existingListingId && existingListingId !== property_id.toString()) {
      // Alag property → fall through → naya lead
    } else if (property_id && !existingListingId) {
      existingLead.source.listing_id = property_id;
      await existingLead.save();
      return res.json({
        success: true,
        message: 'Lead updated with property',
        data: { lead_id: existingLead._id },
      });
    } else {
      return res.json({
        success: true,
        message: 'Lead already exists',
        data: { lead_id: existingLead._id },
      });
    }
  }

  let classification = 'warm';
  let classification_reason = 'Website enquiry submitted';

  if (enquiry_type === 'sell') {
    classification = 'hot';
    classification_reason = 'Seller submitted property listing intent';
  } else if (enquiry_type === 'schedule_visit') {
    classification = 'hot';
    classification_reason = 'Customer requested site visit';
  } else if (message && message.length > 20) {
    classification = 'hot';
    classification_reason = 'Detailed enquiry with specific requirements';
  } else if (enquiry_type === 'hot_property') {
    classification = 'hot';
    classification_reason = 'Hot property enquiry submitted';
  }

  const lead = await GridLead.create({
    lead_type: 'platform',
    enquiry_type,
    customerId: customer._id,
    classification,
    classification_reason,
    source: {
      channel: 'website_form',
      listing_id: property_id || null,
    },
    contact_info: {
      name: { first_name: first_name.trim(), last_name: last_name.trim(), is_masked: false },
      mobile: { country_code, number: cleanPhone, is_masked: false, verified: false },
      ...(cleanEmail && { email: { address: cleanEmail, is_masked: false, verified: false } }),
      preferred_contact,
    },
    ...(requirements && { requirements }),
    ...(message && {
      notes: [{
        text: message,
        author: `${first_name} ${last_name}`,
        author_type: 'system',
        created_at: new Date(),
      }],
    }),
    created_by: customer._id,
  });

  customer.statistics = customer.statistics || {};
  customer.statistics.total_leads = (customer.statistics.total_leads || 0) + 1;
  customer.statistics.total_enquiries = (customer.statistics.total_enquiries || 0) + 1;
  await customer.save();

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Lead submitted successfully. Our team will contact you shortly.',
    data: {
      lead_id: lead._id,
      status: lead.status,
      classification: lead.classification,
    },
  });
});


exports.createSimpleWebsiteLead = asyncHandler(async (req, res) => {
  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    enquiry_type = 'general_enquiry',
    property_id,
  } = req.body;

  if (!first_name || !last_name || !phone_number) {
    return res.status(400).json({ success: false, message: 'Name and phone number are required' });
  }

  const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);

  let customer = await Customer.findOne({
    'mobile.number': cleanPhone,
    'mobile.country_code': country_code,
  });

  if (!customer) {
    customer = await Customer.create({
      name: { first_name: first_name.trim(), last_name: last_name.trim() },
      mobile: { country_code, number: cleanPhone, verified: false },
      ...(email && { email: email.toLowerCase().trim() }),
      statistics: { first_enquiry_at: new Date() },
    });
  }

  const existingLeads = await GridLead.checkDuplicate(customer._id, 7);

  if (existingLeads.length > 0) {
    const existingLead = existingLeads[0];
    const existingListingId = existingLead.source?.listing_id
      ? existingLead.source.listing_id.toString()
      : null;

    if (property_id && existingListingId && existingListingId !== property_id.toString()) {
      // fall through
    } else if (property_id && !existingListingId) {
      existingLead.source.listing_id = property_id;
      await existingLead.save();
      return res.json({ success: true, message: 'Lead updated with property' });
    } else {
      return res.json({ success: true, message: 'Already exists' });
    }
  }

  const lead = await GridLead.create({
    lead_type: 'platform',
    enquiry_type,
    customerId: customer._id,
    classification: 'warm',
    classification_reason: 'Simple web form submission',
    source: {
      channel: 'website_form',
      listing_id: property_id || null,
    },
    contact_info: {
      name: { first_name: first_name.trim(), last_name: last_name.trim(), is_masked: false },
      mobile: { country_code, number: cleanPhone, is_masked: false, verified: false },
      ...(email && {
        email: { address: email.toLowerCase().trim(), is_masked: false, verified: false },
      }),
      preferred_contact: 'whatsapp',
    },
    created_by: customer._id,
  });

  customer.statistics.total_leads += 1;
  await customer.save();

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Thank you! We will contact you shortly.',
    data: { lead_id: lead._id },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — GET LEADS
// ════════════════════════════════════════════════════════════════════════════

exports.getLeads = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page,  10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip  = (page - 1) * limit;

  const { status, classification, type, search, lead_type, source_channel } = req.query;

  const filter = {};
  if (status)         filter.status         = status;
  if (classification) filter.classification = classification;
  if (type)           filter.enquiry_type   = type;
  if (lead_type)      filter.lead_type      = lead_type;
  if (source_channel) filter['source.channel'] = source_channel;

  if (search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: search, $options: 'i' } },
      { 'contact_info.email.address':   { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: search, $options: 'i' } },
      { full_name:                      { $regex: search, $options: 'i' } },
    ];
  }

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id')
      .populate('matched_listings.listing_id')
      .populate('customerId', 'name firstName lastName email mobile phone')
      .populate('assigned_to', 'firstName lastName email phone')
      .populate({
        path: 'created_by_agent',
        select: 'first_name last_name email phone_number agency',
        populate: { path: 'agency', select: 'companyName agency_name name primaryContactEmail' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GridLead.countDocuments(filter),
  ]);

  const leadsWithAdvisor = leads.map(lead => {
    const obj = lead.toObject({ virtuals: true });
    obj.assignedAdvisor = obj.assigned_to || null;
    return obj;
  });

  res.json({
    success: true,
    data: leadsWithAdvisor,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});


exports.getWebsitePlatformLeads = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page,  10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip  = (page - 1) * limit;

  const filter = { lead_type: 'platform', 'source.channel': 'website_form' };

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id')
      .populate('matched_listings.listing_id')
      .populate('assigned_to', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GridLead.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: leads.map(l => ({ ...l.toObject({ virtuals: true }), assignedAdvisor: l.assigned_to || null })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — CREATE LEAD
// ════════════════════════════════════════════════════════════════════════════

exports.createLead = asyncHandler(async (req, res) => {
  const agentId = req.user?._id;
  if (!agentId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  }

  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    property_type, transaction_type = 'buy',
    location_preferences = [],
    budget_min, budget_max,
    bedrooms, bathrooms,
    area_sqft_min, area_sqft_max,
    furnished = 'any',
    ready_by_date, additional_notes,
    listing_id, enquiry_type,
  } = req.body;

  const hasRequirements =
    property_type ||
    (Array.isArray(location_preferences) && location_preferences.length > 0) ||
    budget_min || budget_max || bedrooms || bathrooms || additional_notes;

  if (!hasRequirements) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'At least one requirement detail is required (property type, location, budget, or bedrooms)',
    });
  }

  if (listing_id) {
    const property = await Property.findOne({
      _id: listing_id,
      approvalStatus: 'approved',
      listingStatus: 'active',
    });
    if (!property) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Selected property not found or not available',
      });
    }
  }

  const cleanPhone = phone_number ? phone_number.toString().replace(/\D/g, '').slice(-15) : null;
  const cleanEmail = email ? email.toLowerCase().trim() : null;

  let customer = null;
  if (cleanPhone || cleanEmail) {
    const q = { $or: [] };
    if (cleanPhone) q.$or.push({ 'mobile.number': cleanPhone });
    if (cleanEmail) q.$or.push({ email: cleanEmail });

    customer = await Customer.findOne(q);

    if (!customer) {
      customer = await Customer.create({
        name: {
          first_name: (first_name || 'Unknown').trim(),
          last_name:  (last_name  || 'Customer').trim(),
        },
        ...(cleanPhone && { mobile: { country_code, number: cleanPhone, verified: false } }),
        ...(cleanEmail && { email: cleanEmail }),
        statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 },
      });
    }
  }

  const resolvedEnquiryType = enquiry_type ||
    (transaction_type === 'rent' ? 'rent' :
     transaction_type === 'sell' ? 'sell' : 'buy');

  const lead = await GridLead.create({
    lead_type:             'agent',
    enquiry_type:          resolvedEnquiryType,
    customerId:            customer?._id || agentId,
    classification:        'warm',
    classification_reason: 'Agent requirement lead created via CRM',
    source: {
      channel:    'agent_added',
      listing_id: listing_id || null,
    },
    requirements: {
      property_type,
      transaction_type,
      location_preferences: Array.isArray(location_preferences)
        ? location_preferences.map(loc => typeof loc === 'string' ? { area: loc } : loc)
        : [],
      budget_min:    budget_min    ? Number(budget_min)    : undefined,
      budget_max:    budget_max    ? Number(budget_max)    : undefined,
      bedrooms:      bedrooms      ? Number(bedrooms)      : undefined,
      bathrooms:     bathrooms     ? Number(bathrooms)     : undefined,
      area_sqft_min: area_sqft_min ? Number(area_sqft_min) : undefined,
      area_sqft_max: area_sqft_max ? Number(area_sqft_max) : undefined,
      furnished,
      ready_by_date: ready_by_date || undefined,
      additional_notes,
    },
    ...(cleanPhone || cleanEmail ? {
      contact_info: {
        name: { first_name: first_name || '', last_name: last_name || '', is_masked: false },
        ...(cleanPhone && { mobile: { country_code, number: cleanPhone, is_masked: false, verified: false } }),
        ...(cleanEmail && { email: { address: cleanEmail, is_masked: false, verified: false } }),
        preferred_contact: 'whatsapp',
      },
    } : {}),
    ...(listing_id ? {
      matched_listings: [{
        listing_id,
        match_score:         100,
        presented_to_client: false,
        client_interested:   true,
      }],
    } : {}),
    created_by_agent: agentId,
    created_by:       agentId,
  });

  await Agent.findByIdAndUpdate(agentId, {
    $inc: { totalLeads: 1, activeLeads: 1 },
  });

  if (customer?._id) {
    await Customer.findByIdAndUpdate(customer._id, {
      $inc: { 'statistics.total_leads': 1, 'statistics.total_enquiries': 1 },
    });
  }

  return res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Agent lead created successfully',
    data: {
      lead_id:        lead._id,
      status:         lead.status,
      classification: lead.classification,
      lead_type:      lead.lead_type,
      has_client:     !!(cleanPhone || cleanEmail),
      has_property:   !!listing_id,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — GET ALL AGENT LEADS (Admin view)
// ════════════════════════════════════════════════════════════════════════════

exports.getAgentLeads = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page,  10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip  = (page - 1) * limit;

  const { status, classification, type, search } = req.query;

  const filter = {
    lead_type:        'agent',
    'source.channel': 'agent_added',
  };

  if (status) {
  filter.status = new RegExp(`^${status}$`, 'i');
}
  if (classification) filter.classification = classification;
  if (type)           filter.enquiry_type   = type;

  if (search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: search, $options: 'i' } },
      { 'contact_info.email.address':   { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: search, $options: 'i' } },
    ];
  }

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id')
      .populate('matched_listings.listing_id')
      .populate('assigned_to', 'firstName lastName email')
      .populate({
        path:   'created_by_agent',
        model:  'GridAgent',
        select: 'first_name last_name email phone_number role',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GridLead.countDocuments(filter),
  ]);

  const leadsWithMeta = leads.map(lead => {
    const obj = lead.toObject({ virtuals: true });
    obj.assignedAdvisor = obj.assigned_to     || null;
    obj.creatingAgent   = obj.created_by_agent || null;
    return obj;
  });

  res.json({
    success: true,
    data: leadsWithMeta,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — SUGGEST ADVISORS FOR LEAD
// ════════════════════════════════════════════════════════════════════════════

exports.suggestAdvisorsForLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const lead = await GridLead.findById(id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  const req_data = lead.requirements || {};
  const locationPref = req_data.location_preferences?.[0];
  const area = typeof locationPref === 'object' ? locationPref.area : locationPref || null;
  const propertyType = req_data.property_type || null;

  const recommended = await suggestAdvisor({
    area,
    preferred_city: null,
    type: propertyType,
  });

  const allAdvisors = await GridAdvisor.find({ status: 'active' })
    .select('firstName lastName email phone specialisation leaderboard workload status')
    .lean();

  allAdvisors.sort((a, b) => {
    const scoreA = a.leaderboard?.compositeScore || 0;
    const scoreB = b.leaderboard?.compositeScore || 0;
    const loadA  = a.workload?.activeLeadsCount  || 0;
    const loadB  = b.workload?.activeLeadsCount  || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return loadA - loadB;
  });

  res.json({
    success: true,
    recommended: recommended || null,
    options: allAdvisors,
    context: { area, propertyType, currentAdvisor: lead.assigned_to || null },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — ASSIGN ADVISOR TO LEAD
// ════════════════════════════════════════════════════════════════════════════

exports.assignAdvisorToLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { advisorId, notes = '' } = req.body;

  if (!advisorId) {
    return res.status(400).json({ success: false, message: 'advisorId is required' });
  }

  const lead = await GridLead.findById(id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  const advisor = await GridAdvisor.findOne({ _id: advisorId, status: 'active' });
  if (!advisor) {
    return res.status(404).json({ success: false, message: 'Advisor not found or is not active' });
  }

  const previousAdvisorId = lead.assigned_to ? lead.assigned_to.toString() : null;
  const isReassignment    = !!previousAdvisorId;

  lead.assigned_to = advisorId;
  lead.assigned_at = new Date();

  const oldStatus = lead.status;
  if (oldStatus !== 'new') {
    lead.status = 'new';
    lead._originalStatus = 'new';
    lead.status_history = lead.status_history || [];
    lead.status_history.push({
      status:     'new',
      changed_by: req.user?._id,
      changed_at: new Date(),
      notes: isReassignment ? 'Reassigned to new advisor (reset to New)' : 'Assigned to advisor (New)',
    });
  }

  lead.notes = lead.notes || [];
  lead.notes.push({
    text: notes
      ? `${isReassignment ? 'Reassigned' : 'Assigned'} to ${advisor.firstName} ${advisor.lastName}. Note: ${notes}`
      : `${isReassignment ? 'Reassigned' : 'Assigned'} to ${advisor.firstName} ${advisor.lastName}`,
    author:      req.user?.firstName || 'Admin',
    author_type: 'admin',
    is_private:  false,
    created_at:  new Date(),
  });

  await lead.save();

  await GridAdvisor.findByIdAndUpdate(advisorId, {
    $inc: { 'workload.activeLeadsCount': 1, 'workload.totalLeadsAssigned': 1 },
  });

  if (isReassignment && previousAdvisorId !== advisorId.toString()) {
    await GridAdvisor.findByIdAndUpdate(previousAdvisorId, {
      $inc: { 'workload.activeLeadsCount': -1 },
    });
  }

  const updatedLead = await GridLead.findById(id)
    .populate('assigned_to',       'firstName lastName email phone')
    .populate('created_by_agent',  'first_name last_name email phone_number');

  return res.json({
    success: true,
    message: isReassignment
      ? `Lead reassigned to ${advisor.firstName} ${advisor.lastName}`
      : `Lead assigned to ${advisor.firstName} ${advisor.lastName}`,
    data: {
      lead_id:         updatedLead._id,
      status:          updatedLead.status,
      assigned_to:     updatedLead.assigned_to,
      assigned_at:     updatedLead.assigned_at,
      is_reassignment: isReassignment,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADVISOR — GET MY ASSIGNED LEADS
// ════════════════════════════════════════════════════════════════════════════

exports.getMyAssignedLeads = asyncHandler(async (req, res) => {
  const advisorId = req.user._id;
  const page      = parseInt(req.query.page,  10) || 1;
  const limit     = parseInt(req.query.limit, 10) || 10;
  const skip      = (page - 1) * limit;

  const filter = { assigned_to: advisorId };
  if (req.query.status) filter.status = req.query.status;

  if (req.query.search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: req.query.search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: req.query.search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: req.query.search, $options: 'i' } },
      { 'contact_info.email.address':   { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id')
      .populate('created_by_agent', 'first_name last_name email')
      .sort({ assigned_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GridLead.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: leads,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADVISOR — UPDATE LEAD STATUS
// ════════════════════════════════════════════════════════════════════════════

exports.updateMyLeadStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes = '', inventoryUnitId } = req.body;
  const actorId = req.user?._id;
  const actorIsAdmin = isGridAdmin(req.user?.role);
  const actorType = actorIsAdmin ? 'admin' : 'advisor';

  if (!actorId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  }

  const lead = await GridLead.findById(id);
  if (!lead) {
    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Lead not found' });
  }

  const isAssignedAdvisor = lead.assigned_to && lead.assigned_to.toString() === actorId.toString();
  if (!actorIsAdmin && !isAssignedAdvisor) {
    return res.status(StatusCodes.FORBIDDEN).json({
      success: false,
      message: 'Only assigned advisor or admin can update this lead status',
    });
  }

  const ALLOWED = [
    'new', 'contacted', 'qualified', 'in_discussion',
    'site_visit_scheduled', 'offer_made', 'reserved',
    'spa_signed', 'completed', 'not_proceeding',
  ];

  if (!status || !ALLOWED.includes(status)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: `Invalid status. Allowed: ${ALLOWED.join(', ')}`,
    });
  }


const FLOW = [
  'new', 'contacted', 'qualified', 'in_discussion',
  'site_visit_scheduled', 'offer_made', 'reserved',
  'spa_signed', 'completed',
];

  const current = lead.status;

  if (status !== 'not_proceeding') {
    const currIdx = FLOW.indexOf(current);
    const nextIdx = FLOW.indexOf(status);
    if (currIdx !== -1 && nextIdx !== -1 && nextIdx < currIdx) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Status can only progress forward as per workflow',
      });
    }
  }

  if (current === status) {
    return res.json({
      success: true,
      message: 'Status already same',
      data: { lead_id: lead._id, status: lead.status },
    });
  }

  // Inventory logic for status progression
  const statusesRequiringUnit = ['reserved', 'spa_signed', 'completed'];
  const requiresInventoryUpdate = statusesRequiringUnit.includes(status) || status === 'not_proceeding';

  if (statusesRequiringUnit.includes(status)) {
    const finalInventoryId = inventoryUnitId || lead.deal_record?.inventory_unit_id;
    if (!finalInventoryId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `An inventoryUnitId is required to update lead status to ${status}`,
      });
    }

    // Set the inventory unit id in the lead deal_record if not already set
    if (!lead.deal_record) lead.deal_record = {};
    if (!lead.deal_record.inventory_unit_id) {
      lead.deal_record.inventory_unit_id = finalInventoryId;
    }
  }

  if (requiresInventoryUpdate) {
    const unitId = inventoryUnitId || lead.deal_record?.inventory_unit_id;
    if (unitId) {
      const inventoryUpdate = {};
      if (status === 'reserved') {
        inventoryUpdate.status = 'reserved';
        inventoryUpdate.reservedBy = actorId;
        inventoryUpdate.reservedAt = new Date();
        inventoryUpdate.leadId = lead._id;
      } else if (status === 'spa_signed') {
        inventoryUpdate.status = 'spa_signed';
      } else if (status === 'not_proceeding') {
        // Revert inventory back to available if it was reserved/booked but deal didn't proceed
        const currentInventory = await PropertyInventory.findById(unitId);
        if (currentInventory && ['reserved', 'booked', 'spa_signed'].includes(currentInventory.status)) {
           inventoryUpdate.status = 'available';
           inventoryUpdate.reservedBy = null;
           inventoryUpdate.reservedAt = null;
           inventoryUpdate.bookedBy = null;
           inventoryUpdate.bookedAt = null;
           inventoryUpdate.leadId = null;
        }
      }
      
      if (Object.keys(inventoryUpdate).length > 0) {
        await PropertyInventory.findByIdAndUpdate(unitId, inventoryUpdate);
      }
    }
  }

  const notesTrim = typeof notes === 'string' ? notes.trim() : '';

  lead.status          = status;
  lead._originalStatus = status;

  lead.status_history = lead.status_history || [];
  lead.status_history.push({
    status,
    changed_by: actorId,
    changed_at: new Date(),
    notes:      notesTrim || undefined,
  });

  lead.notes = lead.notes || [];
  lead.notes.push({
    text:        notesTrim ? `Status updated to "${status}". Note: ${notesTrim}` : `Status updated to "${status}"`,
    author:      req.user?.firstName || req.user?.first_name || (actorIsAdmin ? 'Admin' : 'Advisor'),
    author_type: actorType,
    is_private:  false,
    created_at:  new Date(),
  });

  await lead.save();

  return res.json({
    success: true,
    message: 'Lead status updated successfully',
    data: { lead_id: lead._id, status: lead.status },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// SMART MATCHES
// ════════════════════════════════════════════════════════════════════════════

exports.getSmartMatches = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const lead = await GridLead.findById(id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  const { matches, matchType, note } = await matchPropertiesForLead(lead.requirements, 10);

  if (matches.length === 0 && !lead.nurturing?.is_nurturing) {
    lead.nurturing = {
      is_nurturing:          true,
      nurturing_reason:      'no_match',
      nurturing_started_at:  new Date(),
      notify_when_available: true,
    };
    await lead.save();
  }

  return res.json({
    success: true,
    matchType,
    note:              note || null,
    count:             matches.length,
    is_nurturing:      lead.nurturing?.is_nurturing || false,
    data:              matches,
    advisor_suggestions: lead.advisor_suggestions || [],
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADVISOR — SUGGEST PROPERTY TO CLIENT
// ════════════════════════════════════════════════════════════════════════════

exports.suggestPropertyToClient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { property_id, note } = req.body;
  const advisorId = req.user._id;

  if (!property_id) {
    return res.status(400).json({ success: false, message: 'property_id is required' });
  }

  const [lead, property] = await Promise.all([
    GridLead.findById(id),
    Property.findById(property_id),
  ]);

  if (!lead)     return res.status(404).json({ success: false, message: 'Lead not found' });
  if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

  const alreadySuggested = lead.advisor_suggestions.some(
    s => s.property_id.toString() === property_id.toString()
  );
  if (alreadySuggested) {
    return res.status(400).json({ success: false, message: 'Property already suggested for this lead' });
  }

  lead.advisor_suggestions.push({
    property_id,
    suggested_by:    advisorId,
    suggested_at:    new Date(),
    note:            note || '',
    client_reaction: 'pending',
  });

  if (lead.nurturing?.is_nurturing) {
    lead.nurturing.is_nurturing = false;
  }

  await lead.save();

  return res.json({
    success: true,
    message: 'Property suggested to client successfully',
    data: lead.advisor_suggestions,
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADVISOR — UPDATE CLIENT REACTION TO SUGGESTION
// ════════════════════════════════════════════════════════════════════════════

exports.updateSuggestionReaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { property_id, reaction } = req.body;

  const VALID = ['interested', 'not_interested', 'maybe'];
  if (!VALID.includes(reaction)) {
    return res.status(400).json({ success: false, message: `reaction must be: ${VALID.join(', ')}` });
  }

  const lead = await GridLead.findById(id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  const suggestion = lead.advisor_suggestions.find(
    s => s.property_id.toString() === property_id.toString()
  );
  if (!suggestion) {
    return res.status(404).json({ success: false, message: 'Suggestion not found' });
  }

  suggestion.client_reaction = reaction;

  if (reaction === 'interested') {
    const alreadyMatched = lead.matched_listings.some(
      m => m.listing_id.toString() === property_id.toString()
    );
    if (!alreadyMatched) {
      lead.matched_listings.push({
        listing_id:          property_id,
        match_score:         75,
        presented_to_client: true,
        client_interested:   true,
      });
    }
    if (lead.status === 'new' || lead.status === 'contacted') {
      lead.status = 'in_discussion';
    }
  }

  await lead.save();

  return res.json({
    success: true,
    message: 'Client reaction recorded',
    data: { reaction, status: lead.status },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADVISOR — UPDATE LEAD REQUIREMENTS
// ════════════════════════════════════════════════════════════════════════════

exports.updateLeadRequirements = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { requirements, reason } = req.body;

  const lead = await GridLead.findById(id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  lead.notes.push({
    text: `Requirements updated. Reason: ${reason || 'Client changed preferences'}. Previous: Budget ${lead.requirements?.budget_max || 'N/A'} AED, Area: ${lead.requirements?.location_preferences?.map(l => l.area || l).join(', ') || 'N/A'}`,
    author:      req.user?.firstName || 'Advisor',
    author_type: 'advisor',
    is_private:  true,
    created_at:  new Date(),
  });

  lead.requirements = { ...lead.requirements, ...requirements };
  lead.nurturing = {
    is_nurturing:          false,
    nurturing_reason:      '',
    notify_when_available: true,
  };

  await lead.save();

  const { matches, matchType } = await matchPropertiesForLead(lead.requirements, 10);

  return res.json({
    success: true,
    message: 'Requirements updated successfully',
    new_matches: { matchType, count: matches.length, data: matches },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// GET LEAD BY ID (role-based sanitization)
// ════════════════════════════════════════════════════════════════════════════

exports.getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const lead = await GridLead.findById(id)
    .populate('source.listing_id')
    .populate('matched_listings.listing_id')
    .populate('customerId', 'name firstName lastName email mobile phone')
    .populate('assigned_to',      'firstName lastName email phone')
    .populate({
      path: 'created_by_agent',
      select: 'first_name last_name email phone_number role agency',
      populate: { path: 'agency', select: 'companyName agency_name name primaryContactEmail' },
    })
    .populate('advisor_suggestions.property_id')
    .lean({ virtuals: true });

  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  const roleName = req.user?.role?.name?.toLowerCase();

  if (roleName === 'agent' || roleName === 'gridreferralpartner' || roleName === 'referral_partner') {
    const userId    = req.user._id?.toString();
    const createdBy = lead.created_by_agent?._id?.toString() || lead.created_by?.toString();
    if (userId !== createdBy) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    delete lead.assigned_to;
    delete lead.assigned_at;
    delete lead.assigned_by;
    delete lead.assignment_notes;

    const isAssignmentText = (t = '') => /assigned|assign advisor|advisor/i.test(t);

    if (Array.isArray(lead.notes)) {
      lead.notes = lead.notes.filter(n => !isAssignmentText(n?.text || ''));
    }
    if (Array.isArray(lead.status_history)) {
      lead.status_history = lead.status_history.filter(
        h => !isAssignmentText(h?.status || '') && !isAssignmentText(h?.notes || '')
      );
    }
  }

  if (roleName === 'gridadvisor' || roleName === 'advisor') {
    const advisorId = req.user._id?.toString();
    if (lead.assigned_to?._id?.toString() !== advisorId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
  }

  return res.json({ success: true, data: lead });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — GET OWN LEADS
// ════════════════════════════════════════════════════════════════════════════

const getAgencyAgentIds = async (agencyId, includePending = true) => {
  const Agent = require('../../Agent/models/agent');
  const filter = { agency: agencyId };
  if (!includePending) {
    filter.agencyApprovalStatus = 'approved';
    filter.adminApprovalStatus = 'approved';
    filter.isActive = true;
  }
  return Agent.find(filter).distinct('_id');
};

exports.getAgentOwnLeads = asyncHandler(async (req, res) => {
  let agentIds;
  
  if (req.user.constructor.modelName === 'Agency') {
    agentIds = await getAgencyAgentIds(req.user._id);
  } else {
    agentIds = [req.user._id];
  }
  
  const page    = parseInt(req.query.page,  10) || 1;
  const limit   = parseInt(req.query.limit, 10) || 10;
  const skip    = (page - 1) * limit;

  const { status, classification, type, search } = req.query;

  const filter = {
    created_by_agent:  { $in: agentIds },
  };
  
  if (req.user.constructor.modelName !== 'Agency') {
    filter.lead_type = 'agent';
    filter['source.channel'] = 'agent_added';
  }

  if (status)         filter.status         = status;
  if (classification) filter.classification = classification;
  if (type)           filter.enquiry_type   = type;

  if (search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: search, $options: 'i' } },
      { 'contact_info.email.address':   { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: search, $options: 'i' } },
    ];
  }

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id',           'propertyName area price mainLogo')
      .populate('matched_listings.listing_id',  'propertyName area price bedrooms bathrooms builtUpArea mainLogo')
      .populate('created_by_agent',              'first_name last_name email phone_number')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GridLead.countDocuments(filter),
  ]);

  const sanitized = leads.map(lead => {
    const { assigned_to, assigned_at, assigned_by, assignment_notes, ...safe } = lead;
    const isAssignment = (t = '') => /assigned|assign advisor|advisor/i.test(t);
    const mapped = {
      ...safe,
      notes: Array.isArray(safe.notes)
        ? safe.notes.filter(n => !isAssignment(n?.text || ''))
        : safe.notes,
      status_history: Array.isArray(safe.status_history)
        ? safe.status_history.filter(h => !isAssignment(h?.notes || ''))
        : safe.status_history,
      name: safe.contact_info?.name || { first_name: '', last_name: '' },
      email: safe.contact_info?.email?.address,
      phone_number: safe.contact_info?.mobile?.number,
      agent: safe.created_by_agent,
      property_type: safe.requirements?.property_type,
      bedrooms: safe.requirements?.bedrooms,
      budget: safe.requirements?.budget,
      preferred_location: safe.requirements?.location,
      source: safe.source?.channel || 'Direct',
    };
    return mapped;
  });

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.json({
    success: true,
    data: sanitized,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — SAVE MATCHED LISTINGS
// ════════════════════════════════════════════════════════════════════════════

exports.saveMatchedListings = asyncHandler(async (req, res) => {
  const { id }       = req.params;
  const { listings } = req.body;
  const agentId      = req.user._id;

  if (!Array.isArray(listings) || listings.length === 0) {
    return res.status(400).json({ success: false, message: 'listings array is required' });
  }

  const lead = await GridLead.findOne({ _id: id, created_by_agent: agentId });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  listings.forEach(item => {
    const existing = lead.matched_listings.find(
      m => m.listing_id?.toString() === item.listing_id?.toString()
    );
    if (existing) {
      existing.client_interested   = item.client_interested   ?? existing.client_interested;
      existing.presented_to_client = item.presented_to_client ?? true;
    } else {
      lead.matched_listings.push({
        listing_id:           item.listing_id,
        match_score:          item.match_score || 50,
        presented_to_client:  item.presented_to_client ?? true,
        client_interested:    item.client_interested    ?? null,
        suggested_by_advisor: false,
      });
    }
  });

  const interestedCount    = listings.filter(l => l.client_interested === true).length;
  const notInterestedCount = listings.filter(l => l.client_interested === false).length;

  if (interestedCount > 0 || notInterestedCount > 0) {
    lead.notes.push({
      text:        `Agent updated client reactions: ${interestedCount} interested, ${notInterestedCount} not interested out of ${listings.length} properties shown.`,
      author:      req.user?.first_name || 'Agent',
      author_type: 'agent',
      is_private:  true,
      created_at:  new Date(),
    });
  }

  await lead.save();

  return res.json({
    success: true,
    message: 'Client reactions saved',
    data: {
      lead_id:        lead._id,
      matched_count:  lead.matched_listings.length,
      interested:     lead.matched_listings.filter(m => m.client_interested === true).length,
      not_interested: lead.matched_listings.filter(m => m.client_interested === false).length,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — SUBMIT LEAD TO XOTO
// ════════════════════════════════════════════════════════════════════════════

exports.submitLeadToXoto = asyncHandler(async (req, res) => {
  const { id }  = req.params;
  const agentId = req.user._id;
  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    submission_note,
  } = req.body;

  const lead = await GridLead.findOne({ _id: id, created_by_agent: agentId });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  if (lead.submitted_to_xoto) {
    return res.status(400).json({
      success: false,
      message: 'Lead already submitted to Xoto admin',
      submitted_at: lead.submitted_to_xoto_at,
    });
  }

  const interestedProps            = lead.matched_listings.filter(m => m.client_interested === true);
  const advisorSuggestedInterested = (lead.advisor_suggestions || []).filter(s => s.client_reaction === 'interested');
  const totalInterested            = interestedProps.length + advisorSuggestedInterested.length;

  if (totalInterested === 0) {
    return res.status(400).json({
      success: false,
      message: 'Client must show interest in at least 1 property before submitting to Xoto. Use save-matches to record client reactions first.',
    });
  }

  if (first_name || last_name || phone_number) {
    const cleanPhone = phone_number
      ? phone_number.toString().replace(/\D/g, '').slice(-15)
      : lead.contact_info?.mobile?.number;

    lead.contact_info = {
      ...lead.contact_info,
      name: {
        first_name: first_name || lead.contact_info?.name?.first_name || '',
        last_name:  last_name  || lead.contact_info?.name?.last_name  || '',
        is_masked:  false,
      },
      mobile: {
        country_code: country_code || lead.contact_info?.mobile?.country_code || '+971',
        number:       cleanPhone,
        is_masked:    false,
        verified:     false,
      },
      ...(email && {
        email: { address: email.toLowerCase().trim(), is_masked: false, verified: false },
      }),
      preferred_contact: lead.contact_info?.preferred_contact || 'whatsapp',
    };

    if (cleanPhone || email) {
      const q = { $or: [] };
      if (cleanPhone) q.$or.push({ 'mobile.number': cleanPhone });
      if (email)      q.$or.push({ email: email.toLowerCase().trim() });

      let customer = await Customer.findOne(q);
      if (!customer) {
        customer = await Customer.create({
          name: {
            first_name: (first_name || 'Unknown').trim(),
            last_name:  (last_name  || 'Client').trim(),
          },
          ...(cleanPhone && { mobile: { country_code, number: cleanPhone, verified: false } }),
          ...(email && { email: email.toLowerCase().trim() }),
          statistics: { first_enquiry_at: new Date(), total_leads: 1, total_enquiries: 1 },
        });
      }
      lead.customerId = customer._id;
    }
  }

  lead.submitted_to_xoto    = true;
  lead.submitted_to_xoto_at = new Date();
  lead.submitted_by_agent   = agentId;

  lead.notes.push({
    text: submission_note
      ? `Agent submitted lead to Xoto for advisor assignment. ${totalInterested} interested properties. Note: ${submission_note}`
      : `Agent submitted lead to Xoto for advisor assignment. ${totalInterested} interested properties.`,
    author:      req.user?.first_name || 'Agent',
    author_type: 'agent',
    is_private:  false,
    created_at:  new Date(),
  });

  await lead.save();

  return res.json({
    success: true,
    message: 'Lead submitted to Xoto admin successfully. An advisor will be assigned shortly.',
    data: {
      lead_id:          lead._id,
      submitted_at:     lead.submitted_to_xoto_at,
      interested_count: totalInterested,
      client_added:     !!(first_name || phone_number),
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — ADD NOTE
// ════════════════════════════════════════════════════════════════════════════

exports.addAgentNote = asyncHandler(async (req, res) => {
  const { id }   = req.params;
  const { text } = req.body;
  const agentId  = req.user._id;

  if (!text?.trim()) {
    return res.status(400).json({ success: false, message: 'Note text is required' });
  }

  const lead = await GridLead.findOne({ _id: id, created_by_agent: agentId });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  lead.notes.push({
    text:        text.trim(),
    author:      `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim() || 'Agent',
    author_type: 'agent',
    is_private:  true,
    created_at:  new Date(),
  });

  await lead.save();

  return res.json({
    success: true,
    message: 'Note added',
    data: lead.notes[lead.notes.length - 1],
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — UPDATE REQUIREMENTS
// ════════════════════════════════════════════════════════════════════════════



exports.agentUpdateRequirements = asyncHandler(async (req, res) => {
  const { id }                   = req.params;
  const { requirements, reason } = req.body;
  const agentId                  = req.user._id;

  const lead = await GridLead.findOne({ _id: id, created_by_agent: agentId });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  if (lead.submitted_to_xoto) {
    return res.status(400).json({
      success: false,
      message: 'Requirements cannot be changed after lead is submitted to Xoto. Contact your assigned advisor.',
    });
  }

  const oldReq = lead.requirements || {};
  lead.notes.push({
    text: `Requirements updated by agent. Reason: ${reason || 'Client changed preferences'}. Previous: Budget AED ${oldReq.budget_max || 'N/A'}, Area: ${(oldReq.location_preferences || []).map(l => l.area || l).join(', ') || 'N/A'}, Type: ${oldReq.property_type || 'N/A'}`,
    author:      req.user?.first_name || 'Agent',
    author_type: 'agent',
    is_private:  true,
    created_at:  new Date(),
  });

  lead.requirements     = { ...lead.requirements, ...requirements };
  lead.matched_listings = [];
  lead.nurturing = {
    is_nurturing:          false,
    nurturing_reason:      '',
    notify_when_available: true,
  };

  await lead.save();

  const { matches, matchType, note } = await matchPropertiesForLead(lead.requirements, 10);

  return res.json({
    success: true,
    message: 'Requirements updated. Fresh property matches found.',
    data: { lead_id: lead._id, requirements: lead.requirements },
    new_matches: { matchType, note: note || null, count: matches.length, data: matches },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// AGENT — STATS
// ════════════════════════════════════════════════════════════════════════════

exports.getAgentStats = asyncHandler(async (req, res) => {
  const agentId = req.user._id;

  const baseFilter = {
    lead_type:         'agent',
    'source.channel':  'agent_added',
    created_by_agent:  agentId,
  };

  const [total, newLeads, inProgress, completed, submitted, notProceeding] = await Promise.all([
    GridLead.countDocuments(baseFilter),
    GridLead.countDocuments({ ...baseFilter, status: 'new' }),
    GridLead.countDocuments({ ...baseFilter, status: { $in: ['contacted', 'in_discussion', 'site_visit_scheduled', 'offer_made', 'qualified'] } }),
    GridLead.countDocuments({ ...baseFilter, status: 'completed' }),
    GridLead.countDocuments({ ...baseFilter, submitted_to_xoto: true }),
    GridLead.countDocuments({ ...baseFilter, status: 'not_proceeding' }),
  ]);

  const recentLeads = await GridLead.find(baseFilter)
    .select('contact_info status classification enquiry_type createdAt submitted_to_xoto')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return res.json({
    success: true,
    data: {
      stats: {
        total,
        new:                newLeads,
        in_progress:        inProgress,
        completed,
        submitted,
        not_proceeding:     notProceeding,
        pending_submission: total - submitted - completed - notProceeding,
      },
      recent_leads: recentLeads,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — SUBMITTED QUEUE (unassigned)
// ════════════════════════════════════════════════════════════════════════════

exports.getSubmittedQueue = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page,  10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip  = (page - 1) * limit;

  const filter = {
    submitted_to_xoto: true,
    assigned_to:       null,
  };

  if (req.query.classification) filter.classification = req.query.classification;

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('created_by_agent',          'first_name last_name email phone_number')
      .populate('matched_listings.listing_id', 'propertyName area price bedrooms mainLogo')
      .sort({ classification: -1, submitted_to_xoto_at: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GridLead.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data: leads,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

exports.addAdvisorNote = asyncHandler(async (req, res) => {
  const { id }   = req.params;
  const { text } = req.body;
  const userId   = req.user?._id;
 
  if (!text?.trim()) {
    return res.status(400).json({ success: false, message: 'Note text is required' });
  }
 
  const lead = await GridLead.findById(id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }
 
  // Only assigned advisor or admin can add notes
  const isAdmin   = ['admin', 'super_admin'].includes(req.user?.role);
  const isAdvisor = lead.assigned_to?.toString() === userId?.toString();
 
  if (!isAdmin && !isAdvisor) {
    return res.status(403).json({ success: false, message: 'Only the assigned advisor can add notes' });
  }
 
  const note = {
    text:        text.trim(),
    author:      `${req.user?.firstName || req.user?.first_name || ''} ${req.user?.lastName || req.user?.last_name || ''}`.trim() || 'Advisor',
    author_type: 'advisor',
    is_private:  true,
    created_at:  new Date(),
  };
 
  lead.notes.push(note);
  await lead.save();
 
  return res.json({
    success: true,
    message: 'Note added',
    data: lead.notes[lead.notes.length - 1],
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — CREATE GENERAL LEAD
// ════════════════════════════════════════════════════════════════════════════

exports.createGeneralLead = asyncHandler(async (req, res) => {
  const adminId = req.user?._id;

  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    enquiry_type = 'general_enquiry',
    property_id,
    source_channel = 'admin_manual',
    classification = 'warm',
    requirements,
    notes: noteText,
  } = req.body;

  if (!first_name || !last_name || !phone_number) {
    return res.status(400).json({
      success: false,
      message: 'First name, last name and phone number are required',
    });
  }

  const ALLOWED_CHANNELS = ['admin_manual', 'phone_call', 'whatsapp', 'email', 'bulk_upload'];
  if (!ALLOWED_CHANNELS.includes(source_channel)) {
    return res.status(400).json({
      success: false,
      message: `source_channel must be one of: ${ALLOWED_CHANNELS.join(', ')}`,
    });
  }

  const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
  const cleanEmail = email ? email.toLowerCase().trim() : null;

  // Customer match karo ya naya banao
  const matchQuery = { $or: [{ 'mobile.number': cleanPhone }] };
  if (cleanEmail) matchQuery.$or.push({ email: cleanEmail });

  let customer = await Customer.findOne(matchQuery);

  if (!customer) {
    customer = await Customer.create({
      name: { first_name: first_name.trim(), last_name: last_name.trim() },
      mobile: { country_code, number: cleanPhone, verified: false },
      ...(cleanEmail && { email: cleanEmail }),
      statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 },
    });
  }

  // Duplicate check (7 din ke andar)
  const existingLeads = await GridLead.checkDuplicate(customer._id, 7);
  if (existingLeads.length > 0) {
    const existing = existingLeads[0];
    return res.status(409).json({
      success: false,
      message: "This customer's lead already exists.",
      data: { lead_id: existing._id, status: existing.status, created_at: existing.createdAt },
    });
  }

  // Property validate karo agar di hai
  if (property_id) {
    const property = await Property.findOne({ _id: property_id, approvalStatus: 'approved' });
    if (!property) {
      return res.status(400).json({ success: false, message: 'Property are not found or not approved' });
    }
  }

  const lead = await GridLead.create({
    lead_type:             'general',
    enquiry_type,
    customerId:            customer._id,
    classification,
    classification_reason: `General lead — Created by admin via ${source_channel}`,
    source: {
      channel:    source_channel,
      listing_id: property_id || null,
    },
    contact_info: {
      name:   { first_name: first_name.trim(), last_name: last_name.trim(), is_masked: false },
      mobile: { country_code, number: cleanPhone, is_masked: false, verified: false },
      ...(cleanEmail && { email: { address: cleanEmail, is_masked: false, verified: false } }),
      preferred_contact: 'whatsapp',
    },
    ...(requirements && { requirements }),
    ...(noteText && {
      notes: [{
        text:        noteText,
        author:      `${req.user?.firstName || 'Admin'} ${req.user?.lastName || ''}`.trim(),
        author_type: 'admin',
        is_private:  false,
        created_at:  new Date(),
      }],
    }),
    created_by: adminId,
    updated_by: adminId,
  });

  await Customer.findByIdAndUpdate(customer._id, {
    $inc: { 'statistics.total_leads': 1, 'statistics.total_enquiries': 1 },
  });

  return res.status(201).json({
    success: true,
    message: 'General lead successfully created',
    data: {
      lead_id:        lead._id,
      status:         lead.status,
      classification: lead.classification,
      lead_type:      lead.lead_type,
      customer_id:    customer._id,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — BULK CREATE GENERAL LEADS
// ════════════════════════════════════════════════════════════════════════════

exports.bulkCreateGeneralLeads = asyncHandler(async (req, res) => {
  const adminId = req.user?._id;
  const { leads: leadsArray, assign_to_advisor } = req.body;

  if (!Array.isArray(leadsArray) || leadsArray.length === 0) {
    return res.status(400).json({
      success: false,
      message: "leads array is required and must not be empty.",
    });
  }

  if (leadsArray.length > 500) {
    return res.status(400).json({
      success: false,
        message: 'A maximum of 500 leads can be uploaded at a time.',
      });
  }

  const results = { created: [], duplicates: [], errors: [] };

  for (const [index, item] of leadsArray.entries()) {
    try {
      const {
        first_name, last_name, phone_number,
        country_code = '+971', email,
        enquiry_type = 'general_enquiry',
        requirements,
        classification = 'warm',
      } = item;

      if (!first_name || !phone_number) {
        results.errors.push({ index, reason: 'first_name aur phone_number required hain', item });
        continue;
      }

      const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
      const cleanEmail = email ? email.toLowerCase().trim() : null;

      const matchQuery = { $or: [{ 'mobile.number': cleanPhone }] };
      if (cleanEmail) matchQuery.$or.push({ email: cleanEmail });

      let customer = await Customer.findOne(matchQuery);
      if (!customer) {
        customer = await Customer.create({
          name:   { first_name: first_name.trim(), last_name: (last_name || '').trim() },
          mobile: { country_code, number: cleanPhone, verified: false },
          ...(cleanEmail && { email: cleanEmail }),
          statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 },
        });
      }

      const existing = await GridLead.checkDuplicate(customer._id, 7);
      if (existing.length > 0) {
        results.duplicates.push({ index, phone_number, existing_lead_id: existing[0]._id });
        continue;
      }

      const lead = await GridLead.create({
        lead_type:             'general',
        enquiry_type,
        customerId:            customer._id,
        classification,
        classification_reason: 'General lead — bulk upload by admin',
        source:                { channel: 'bulk_upload' },
        contact_info: {
          name:   { first_name: first_name.trim(), last_name: (last_name || '').trim(), is_masked: false },
          mobile: { country_code, number: cleanPhone, is_masked: false, verified: false },
          ...(cleanEmail && { email: { address: cleanEmail, is_masked: false, verified: false } }),
          preferred_contact: 'whatsapp',
        },
        ...(requirements && { requirements }),
        ...(assign_to_advisor && {
          assigned_to: assign_to_advisor,
          assigned_at: new Date(),
          assigned_by: adminId,
        }),
        created_by: adminId,
      });

      await Customer.findByIdAndUpdate(customer._id, {
        $inc: { 'statistics.total_leads': 1 },
      });

      results.created.push({ index, lead_id: lead._id, phone_number });
    } catch (err) {
      results.errors.push({ index, reason: err.message, item });
    }
  }

  return res.status(201).json({
    success: true,
    message: `Bulk upload complete: ${results.created.length} created, ${results.duplicates.length} duplicates, ${results.errors.length} errors`,
    summary: {
      total_submitted: leadsArray.length,
      created:         results.created.length,
      duplicates:      results.duplicates.length,
      errors:          results.errors.length,
    },
    data: results,
  });
});


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — GET ALL GENERAL LEADS
// ════════════════════════════════════════════════════════════════════════════

exports.getGeneralLeads = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page,  10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip  = (page - 1) * limit;

  const {
    status,
    classification,
    source_channel,
    assigned,     // 'true' | 'false'
    advisor_id,
    search,
    from_date,
    to_date,
  } = req.query;

  const filter = { lead_type: 'general' };

  if (status)         filter.status               = status;
  if (classification) filter.classification       = classification;
  if (source_channel) filter['source.channel']   = source_channel;
  if (advisor_id)     filter.assigned_to          = advisor_id;

  if (assigned === 'true')  filter.assigned_to = { $ne: null };
  if (assigned === 'false') filter.assigned_to = null;

  if (from_date || to_date) {
    filter.createdAt = {};
    if (from_date) filter.createdAt.$gte = new Date(from_date);
    if (to_date)   filter.createdAt.$lte = new Date(to_date);
  }

  if (search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: search, $options: 'i' } },
      { 'contact_info.email.address':   { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: search, $options: 'i' } },
    ];
  }

  const [leads, total, assignedCount, unassignedCount, hotCount] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id',            'propertyName area price mainLogo')
      .populate('assigned_to',                  'firstName lastName email phone')
      .populate('matched_listings.listing_id',  'propertyName area price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GridLead.countDocuments(filter),
    GridLead.countDocuments({ lead_type: 'general', assigned_to: { $ne: null } }),
    GridLead.countDocuments({ lead_type: 'general', assigned_to: null }),
    GridLead.countDocuments({ lead_type: 'general', classification: 'hot' }),
  ]);

  return res.json({
    success: true,
    stats: {
      total_general: total,
      assigned:      assignedCount,
      unassigned:    unassignedCount,
      hot:           hotCount,
    },
    data: leads.map(lead => ({
      ...lead,
      assignedAdvisor: lead.assigned_to || null,
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});
