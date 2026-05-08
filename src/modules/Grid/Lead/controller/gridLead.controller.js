const GridLead = require('../model/gridLead.model');
const Customer = require('../../../../modules/auth/models/user/customer.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const asyncHandler = require('../../../../utils/asyncHandler');
const Agent = require('../../Agent/models/agent.js');
const GridAdvisor  = require('../../Advisor/model/index.js');       // adjust path if needed
const { suggestAdvisor } = require('../../Advisor/controller/advisorAssignment.service.js');    


exports.createWebsiteLead = asyncHandler(async (req, res) => {
  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    enquiry_type, property_id,
    preferred_contact = 'whatsapp',
    message, requirements
  } = req.body;

  if (!first_name || !last_name || !phone_number) {
    return res.status(400).json({
      success: false,
      message: 'First name, last name and phone number are required'
    });
  }

  const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
  const cleanEmail = email ? email.toLowerCase().trim() : null;

  // ✅ FIX 1: Phone ya email dono se customer dhundho (PRD match logic)
  const matchQuery = { $or: [{ 'mobile.number': cleanPhone }] };
  if (cleanEmail) matchQuery.$or.push({ email: cleanEmail });

  let customer = await Customer.findOne(matchQuery);

  if (!customer) {
    customer = await Customer.create({
      name: { first_name: first_name.trim(), last_name: last_name.trim() },
      mobile: { country_code: country_code, number: cleanPhone, verified: false },
      ...(cleanEmail && { email: cleanEmail }),
      statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 }
    });
    console.log('Customer created:', customer._id);
  } else {
    console.log('Customer found:', customer._id);
  }

  const existingLeads = await GridLead.checkDuplicate(customer._id, 30);

  if (existingLeads.length > 0) {
    const existingLead = existingLeads[0];
    const existingListingId = existingLead.source?.listing_id
      ? existingLead.source.listing_id.toString()
      : null;

    if (property_id && existingListingId && existingListingId !== property_id.toString()) {
      // Case 1: Alag property → fall through → naya lead
    } else if (property_id && !existingListingId) {
      // Case 2: Pehle property nahi thi → update
      existingLead.source.listing_id = property_id;
      await existingLead.save();
      return res.json({
        success: true,
        message: 'Lead updated with property',
        data: { lead_id: existingLead._id }
      });
    } else {
      // Case 3: Same property ya koi property nahi → duplicate
      return res.json({
        success: true,
        message: 'Lead already exists',
        data: { lead_id: existingLead._id }
      });
    }
  }

  // ✅ FIX 2: Sell enquiry bhi Hot hoti hai
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
    enquiry_type: enquiry_type,
    customerId: customer._id,
    classification,
    classification_reason,
    source: {
      channel: 'website_form',
      listing_id: property_id || null
    },
    contact_info: {
      name: { first_name: first_name.trim(), last_name: last_name.trim(), is_masked: false },
      mobile: { country_code: country_code, number: cleanPhone, is_masked: false, verified: false },
      ...(cleanEmail && { email: { address: cleanEmail, is_masked: false, verified: false } }),
      preferred_contact: preferred_contact
    },
    ...(requirements && { requirements }),
    ...(message && {
      notes: [{
        text: message,
        author: `${first_name} ${last_name}`,
        author_type: 'system',
        created_at: new Date()
      }]
    }),
    created_by: customer._id
  });

  console.log('Lead created:', lead._id, '| type:', enquiry_type, '| classification:', classification);

  // ✅ FIX 3: Statistics safely update karo
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
      classification: lead.classification
    }
  });
});


exports.createSimpleWebsiteLead = asyncHandler(async (req, res) => {
  const {
    first_name,
    last_name,
    phone_number,
    country_code = '+971',
    email,
    enquiry_type = 'general_enquiry',
    property_id,
  } = req.body;

  if (!first_name || !last_name || !phone_number) {
    return res.status(400).json({
      success: false,
      message: 'Name and phone number are required'
    });
  }

  const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);

  let customer = await Customer.findOne({
    'mobile.number': cleanPhone,
    'mobile.country_code': country_code
  });

  if (!customer) {
    customer = await Customer.create({
      name: { first_name: first_name.trim(), last_name: last_name.trim() },
      mobile: { country_code: country_code, number: cleanPhone, verified: false },
      ...(email && { email: email.toLowerCase().trim() }),
      statistics: { first_enquiry_at: new Date() }
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
    enquiry_type: enquiry_type,
    customerId: customer._id,
    classification: 'warm',
    classification_reason: 'Simple web form submission',
      source: {
      channel: 'website_form',
      listing_id: property_id || null,
    },
    contact_info: {
      name: { first_name: first_name.trim(), last_name: last_name.trim(), is_masked: false },
      mobile: { country_code: country_code, number: cleanPhone, is_masked: false, verified: false },
      ...(email && {
        email: {
          address: email.toLowerCase().trim(),
          is_masked: false,
          verified: false
        }
      }),
      preferred_contact: 'whatsapp'
    },
    created_by: customer._id
  });

  customer.statistics.total_leads += 1;
  await customer.save();

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Thank you! We will contact you shortly.',
    data: { lead_id: lead._id }
  });
});


exports.getLeads = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const {
    status,
    classification,
    type,
    search,
    lead_type,
    source_channel
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (classification) filter.classification = classification;
  if (type) filter.enquiry_type = type;
  if (lead_type) filter.lead_type = lead_type;
  if (source_channel) filter['source.channel'] = source_channel;

  if (search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name': { $regex: search, $options: 'i' } },
      { 'contact_info.email.address': { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number': { $regex: search, $options: 'i' } },
      { full_name: { $regex: search, $options: 'i' } },
    ];
  }

  const leads = await GridLead.find(filter)
    .populate('source.listing_id')
    .populate('matched_listings.listing_id')
    .populate('assigned_to', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const leadsWithAdvisor = leads.map((lead) => {
    const obj = lead.toObject({ virtuals: true });
    obj.assignedAdvisor = obj.assigned_to || null;
    return obj;
  });

  const total = await GridLead.countDocuments(filter);

  res.json({
    success: true,
    data: leadsWithAdvisor,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});

exports.getWebsitePlatformLeads = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;
  const filter = {
    lead_type: 'platform',
    'source.channel': 'website_form'
  };
  const leads = await GridLead.find(filter)
    .populate('source.listing_id')
    .populate('matched_listings.listing_id')
    .populate('assigned_to', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const total = await GridLead.countDocuments(filter);
  res.json({
    success: true,
    data: leads.map(l => ({ ...l.toObject({ virtuals: true }), assignedAdvisor: l.assigned_to || null })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  });
});

exports.createLead = asyncHandler(async (req, res) => {
  const agentId = req.user?._id;
  if (!agentId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  }

  const {
    // ── Client Info (optional per PRD §4.1) ──
    first_name,
    last_name,
    phone_number,
    country_code = '+971',
    email,

    // ── Requirements (at least one required) ──
    property_type,
    transaction_type = 'buy',
    location_preferences = [],   // array of strings ["Dubai Marina", "JVC"]
    budget_min,
    budget_max,
    bedrooms,
    bathrooms,
    area_sqft_min,
    area_sqft_max,
    furnished = 'any',
    ready_by_date,
    additional_notes,

    // ── Property Selection (optional) ──
    listing_id,                  // agar client kisi property mein interested hai
    enquiry_type,                // 'buy' | 'rent' | 'sell' — agent override kar sakta hai
  } = req.body;

  // ── Validation: at least one requirement ──────────────────────
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

  // ── If listing_id provided, verify it exists ──────────────────
  if (listing_id) {
    const Property = require('../../../properties/models/property.model.js');
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

  // ── Customer resolve / create (optional) ─────────────────────
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

  // ── Determine enquiry type ─────────────────────────────────────
  const resolvedEnquiryType = enquiry_type ||
    (transaction_type === 'rent' ? 'rent' :
     transaction_type === 'sell' ? 'sell' : 'buy');

  // ── Create Lead ───────────────────────────────────────────────
  const lead = await GridLead.create({
    lead_type:              'agent',
    enquiry_type:           resolvedEnquiryType,
    customerId:             customer?._id || agentId,
    classification:         'warm',
    classification_reason:  'Agent requirement lead created via CRM',
    source: {
      channel:    'agent_added',
      listing_id: listing_id || null,
    },
    requirements: {
      property_type,
      transaction_type,
      location_preferences: Array.isArray(location_preferences)
        ? location_preferences.map(loc =>
            typeof loc === 'string' ? { area: loc } : loc
          )
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
    // Contact info — masked by default per PRD §4.1
    ...(cleanPhone || cleanEmail ? {
      contact_info: {
        name: {
          first_name: first_name || '',
          last_name:  last_name  || '',
          is_masked:  false,         // PRD: masked until A2A agreement
        },
        ...(cleanPhone && {
          mobile: { country_code, number: cleanPhone, is_masked: false, verified: false },
        }),
        ...(cleanEmail && {
          email: { address: cleanEmail, is_masked: false, verified: false },
        }),
        preferred_contact: 'whatsapp',
      },
    } : {}),
    // If property selected, add to matched_listings
    ...(listing_id ? {
      matched_listings: [{
        listing_id,
        match_score:         100,   // agent ne khud select kiya
        presented_to_client: false,
        client_interested:   true,
      }],
    } : {}),
    created_by_agent: agentId,
    created_by:       agentId,
  });

  // ── Update agent stats ────────────────────────────────────────
  await Agent.findByIdAndUpdate(agentId, {
    $inc: { totalLeads: 1, activeLeads: 1 },
  });

  // ── Update customer stats ─────────────────────────────────────
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

exports.getAgentLeads = asyncHandler(async (req, res) => {
  const page  = parseInt(req.query.page,  10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip  = (page - 1) * limit;
 
  const { status, classification, type, search } = req.query;
 
  // ✅ Hard-lock to agent leads only
  const filter = {
    lead_type: 'agent',
    'source.channel': 'agent_added',
  };
 
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
 
  const leads = await GridLead.find(filter)
    .populate('source.listing_id')
    .populate('matched_listings.listing_id')
    .populate('assigned_to',       'firstName lastName email')
 .populate({
    path: 'created_by_agent',  
    model: 'GridAgent',        
    select: 'first_name last_name email phone_number role'  
  })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
 
  const total = await GridLead.countDocuments(filter);
 
  const leadsWithMeta = leads.map((lead) => {
    const obj = lead.toObject({ virtuals: true });
    obj.assignedAdvisor = obj.assigned_to    || null;
    obj.creatingAgent   = obj.created_by_agent || null;
    return obj;
  });
 
  res.json({
    success: true,
    data: leadsWithMeta,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD THESE TWO EXPORTS TO:  gridLead.controller.js
// (paste karo existing exports ke neeche)
// ─────────────────────────────────────────────────────────────────────────────
      // adjust path if needed

exports.suggestAdvisorsForLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // ── Lead fetch ────────────────────────────────────────────────────────────
  const lead = await GridLead.findById(id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  // ── Extract hints from lead requirements ──────────────────────────────────
  const req_data = lead.requirements || {};

  // Location: first preference ka area use karo
  const locationPref = req_data.location_preferences?.[0];
  const area = typeof locationPref === 'object'
    ? locationPref.area
    : locationPref || null;

  const propertyType = req_data.property_type || null;

  // ── Get recommended advisor (best match via PRD 4.5 logic) ───────────────
  const recommended = await suggestAdvisor({
    area,
    preferred_city: null,
    type: propertyType,
  });

  // ── Get ALL active advisors for the dropdown (sorted by score + workload) ─
  const allAdvisors = await GridAdvisor.find({ status: 'active' })
    .select('firstName lastName email phone specialisation leaderboard workload status')
    .lean();

  // Sort: high composite score → low active leads (same PRD 4.5 logic)
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
    recommended: recommended || null,   // best match (pre-select karo frontend mein)
    options: allAdvisors,               // full list for Radio.Group
    context: {                          // debug info
      area,
      propertyType,
      currentAdvisor: lead.assigned_to || null,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// 2. ASSIGN ADVISOR TO LEAD
//    PUT /gridlead/:id/assign
//    Called when admin clicks "Assign" or "Reassign" in AssignModal
// ════════════════════════════════════════════════════════════════════════════
exports.assignAdvisorToLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { advisorId, notes = '' } = req.body;

  if (!advisorId) {
    return res.status(400).json({ success: false, message: 'advisorId is required' });
  }

  const lead = await GridLead.findById(id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  const advisor = await GridAdvisor.findOne({ _id: advisorId, status: 'active' });
  if (!advisor) {
    return res.status(404).json({
      success: false,
      message: 'Advisor not found or is not active',
    });
  }

  const previousAdvisorId = lead.assigned_to ? lead.assigned_to.toString() : null;
  const isReassignment = !!previousAdvisorId;

  // 1) Assign target
  lead.assigned_to = advisorId;
  lead.assigned_at = new Date();

  // 2) PRD: assign ke baad lead "New" hi rahe (auto contacted nahi)
  //    (reassign bhi funnel restart)
  const oldStatus = lead.status;
  if (oldStatus !== 'new') {
    lead.status = 'new';

    // prevent pre-save duplicate status_history: align internal original status
    lead._originalStatus = 'new';

    // store status transition in status_history
    lead.status_history = lead.status_history || [];
    lead.status_history.push({
      status: 'new',
      changed_by: req.user?._id,
      changed_at: new Date(),
      notes: isReassignment ? 'Reassigned to new advisor (reset to New)' : 'Assigned to advisor (New)',
    });
  }

  // 3) assignment note in lead.notes (aapke UI me yahi show hota hai)
  if (!lead.notes) lead.notes = [];
  lead.notes.push({
    text: notes
      ? `${isReassignment ? 'Reassigned' : 'Assigned'} to ${advisor.firstName} ${advisor.lastName}. Note: ${notes}`
      : `${isReassignment ? 'Reassigned' : 'Assigned'} to ${advisor.firstName} ${advisor.lastName}`,
    author: req.user?.firstName || 'Admin',
    author_type: 'admin',
    is_private: false,
    created_at: new Date(),
  });

  await lead.save();

  // Workload update
  await GridAdvisor.findByIdAndUpdate(advisorId, {
    $inc: {
      'workload.activeLeadsCount': 1,
      'workload.totalLeadsAssigned': 1,
    },
  });

  if (isReassignment && previousAdvisorId !== advisorId.toString()) {
    await GridAdvisor.findByIdAndUpdate(previousAdvisorId, {
      $inc: { 'workload.activeLeadsCount': -1 },
    });
  }

  const updatedLead = await GridLead.findById(id)
    .populate('assigned_to', 'firstName lastName email phone')
    .populate('created_by_agent', 'first_name last_name email phone_number');

  return res.json({
    success: true,
    message: isReassignment
      ? `Lead reassigned to ${advisor.firstName} ${advisor.lastName}`
      : `Lead assigned to ${advisor.firstName} ${advisor.lastName}`,
    data: {
      lead_id: updatedLead._id,
      status: updatedLead.status,
      assigned_to: updatedLead.assigned_to,
      assigned_at: updatedLead.assigned_at,
      is_reassignment: isReassignment,
    },
  });
});

exports.getMyAssignedLeads = asyncHandler(async (req, res) => {
  const advisorId = req.user._id; // logged-in advisor id
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;
  const filter = { assigned_to: advisorId }; // core condition
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
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  });
});

exports.updateMyLeadStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes = '' } = req.body;

  const advisorId = req.user?._id;
  if (!advisorId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  }

  const lead = await GridLead.findById(id);
  if (!lead) {
    return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Lead not found' });
  }

  // Only assigned advisor can update
  if (!lead.assigned_to || lead.assigned_to.toString() !== advisorId.toString()) {
    return res.status(StatusCodes.FORBIDDEN).json({
      success: false,
      message: 'Only assigned advisor can update this lead status',
    });
  }

  // PRD enum allowed (schema safe)
  const ALLOWED = [
    'new',
    'contacted',
    'qualified', // schema me hai, PRD me nahi, but safe allow
    'in_discussion',
    'site_visit_scheduled',
    'offer_made',
    'reserved',
    'spa_signed',
    'completed',
    'not_proceeding',
  ];

  if (!status || !ALLOWED.includes(status)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: `Invalid status. Allowed: ${ALLOWED.join(', ')}`,
    });
  }

  // PRD flow enforcement (no backward)
  const FLOW = [
    'new',
    'contacted',
    'in_discussion',
    'site_visit_scheduled',
    'offer_made',
    'reserved',
    'spa_signed',
    'completed',
  ];

  const current = lead.status;
  if (status === 'not_proceeding') {
    // terminal allowed anytime except maybe completed (optional)
  } else {
    const currIdx = FLOW.indexOf(current);
    const nextIdx = FLOW.indexOf(status);

    // if current or next not in flow, allow but don't block (safe)
    if (currIdx !== -1 && nextIdx !== -1 && nextIdx < currIdx) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Status can only progress forward as per workflow',
      });
    }
  }

  const notesTrim = typeof notes === 'string' ? notes.trim() : '';

  // Set status + status_history manually; prevent duplicate by aligning _originalStatus
  const oldStatus = lead.status;
  if (oldStatus === status) {
    return res.json({
      success: true,
      message: 'Status already same',
      data: { lead_id: lead._id, status: lead.status },
    });
  }

  lead.status = status;
  lead._originalStatus = status; // prevent pre-save duplicate status_history

  // status_history update
  lead.status_history = lead.status_history || [];
  lead.status_history.push({
    status,
    changed_by: advisorId,
    changed_at: new Date(),
    notes: notesTrim || undefined,
  });

  // lead.notes update (your UI “Notes History” uses lead.notes)
  lead.notes = lead.notes || [];
  lead.notes.push({
    text: notesTrim ? `Status updated to "${status}". Note: ${notesTrim}` : `Status updated to "${status}"`,
    author: req.user?.firstName || 'Advisor',
    author_type: 'advisor',
    is_private: false,
    created_at: new Date(),
  });

  // Save
  await lead.save();

  return res.json({
    success: true,
    message: 'Lead status updated successfully',
    data: {
      lead_id: lead._id,
      status: lead.status,
    },
  });
});