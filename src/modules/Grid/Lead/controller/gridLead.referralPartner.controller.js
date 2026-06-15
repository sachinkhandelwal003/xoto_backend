// ════════════════════════════════════════════════════════════════════════════
// gridLead.referralPartner.controller.js
//
// Referral Partner ka complete flow — Agent ke jaisa hi hai lekin:
//   • lead_type = 'referral'
//   • source.channel = 'referral_partner'
//   • referral_info block automatically populate hota hai
//   • Partner sirf apne leads dekh sakta hai
//   • Submission ke baad commission_status track hota hai
// ════════════════════════════════════════════════════════════════════════════

const GridLead     = require('../model/gridLead.model');
const Customer     = require('../../../../modules/auth/models/user/customer.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const asyncHandler = require('../../../../utils/asyncHandler');
const Property     = require('../../../properties/models/property.model.js');
const { matchPropertiesForLead } = require('./gridLead.matchHelper');   // ← extracted helper (see below)


// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Referral partner request se referral_info build karo
// ─────────────────────────────────────────────────────────────────────────────
const buildReferralInfo = (user, bodyOverride = {}) => ({
  referral_partner_id: user._id,
  referral_code:       bodyOverride.referral_code || user.referral_code || null,
  commission_rate:     bodyOverride.commission_rate ?? user.default_commission_rate ?? null,
  commission_status:   'pending',
  notes:               bodyOverride.referral_notes || '',
});


// ════════════════════════════════════════════════════════════════════════════
// 1. CREATE LEAD  —  POST /referral-leads/create-lead
//    Same as agent createLead, but:
//      lead_type = 'referral'
//      source.channel = 'referral_partner'
//      referral_info populated automatically
// ════════════════════════════════════════════════════════════════════════════
exports.createReferralLead = asyncHandler(async (req, res) => {
  const partnerId = req.user?._id;
  if (!partnerId) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  }

  const {
    // Client info (PRD required fields)
    first_name,
    last_name,
    phone_number,
    country_code = '+971',
    email,

    // PRD optional fields
    interest_area,          // single area string (PRD: "Interest area")
    budget,                 // single budget number in AED (PRD: "Budget (AED)")
    property_type,          // PRD: "Property type interest"

    // Extended fields (kept for API flexibility)
    transaction_type = 'buy',
    location_preferences,
    budget_min,
    budget_max,
    listing_id,
    referral_code,
    referral_notes,
    commission_rate,
  } = req.body;

  // ── Validation ───────────────────────────────────────────────────────────
  if (!first_name && !last_name) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Customer name is required',
    });
  }
  if (!phone_number) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Customer phone is required',
    });
  }

  // ── Listing verify (optional) ─────────────────────────────────────────────
  if (listing_id) {
    const property = await Property.findOne({ _id: listing_id, approvalStatus: 'approved', listingStatus: 'active' });
    if (!property) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Selected property not found or not available',
      });
    }
  }

  // ── Resolve location preferences ─────────────────────────────────────────
  // Support both PRD simple field (interest_area) and extended array
  const resolvedLocations = [];
  if (interest_area) resolvedLocations.push({ area: interest_area });
  if (Array.isArray(location_preferences)) {
    location_preferences.forEach(loc =>
      resolvedLocations.push(typeof loc === 'string' ? { area: loc } : loc)
    );
  }

  // ── Resolve budget ────────────────────────────────────────────────────────
  // Support both PRD single budget and extended min/max
  const resolvedBudgetMax = budget ? Number(budget) : (budget_max ? Number(budget_max) : undefined);
  const resolvedBudgetMin = budget_min ? Number(budget_min) : undefined;

  // ── Customer resolve / create ─────────────────────────────────────────────
  const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
  const cleanEmail = email ? email.toLowerCase().trim() : null;

  let customer = null;
  const q = { $or: [{ 'mobile.number': cleanPhone }] };
  if (cleanEmail) q.$or.push({ email: cleanEmail });
  customer = await Customer.findOne(q);

  if (!customer) {
    customer = await Customer.create({
      name: {
        first_name: (first_name || 'Unknown').trim(),
        last_name:  (last_name  || '').trim(),
      },
      mobile: { country_code, number: cleanPhone, verified: false },
      ...(cleanEmail && { email: cleanEmail }),
      statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 },
    });
  }

  // ── Create + auto-submit lead (PRD: confirmation shown immediately) ───────
  const lead = await GridLead.create({
    lead_type:             'referral_partner',
    enquiry_type:          transaction_type === 'rent' ? 'rent' : transaction_type === 'sell' ? 'sell' : 'buy',
    customerId:            customer._id,
    classification:        'warm',
    classification_reason: 'Referral partner lead — submitted via referral portal',

    source: {
      channel:           'referral_partner',
      listing_id:        listing_id || null,
      referralPartnerId: partnerId,
    },

    referral_info: buildReferralInfo(req.user, { referral_code, referral_notes, commission_rate }),

    requirements: {
      property_type:        property_type || undefined,
      transaction_type,
      location_preferences: resolvedLocations,
      budget_max:           resolvedBudgetMax,
      budget_min:           resolvedBudgetMin,
    },

    contact_info: {
      name: {
        first_name: (first_name || '').trim(),
        last_name:  (last_name  || '').trim(),
        is_masked:  false,
      },
      mobile: {
        country_code,
        number:    cleanPhone,
        is_masked: false,
        verified:  false,
      },
      ...(cleanEmail && {
        email: { address: cleanEmail, is_masked: false, verified: false },
      }),
      preferred_contact: 'whatsapp',
    },

    ...(listing_id ? {
      matched_listings: [{
        listing_id,
        match_score:         100,
        presented_to_client: false,
        client_interested:   true,
      }],
    } : {}),

    // Auto-submit to Xoto on creation (PRD: confirmation shown immediately)
    submitted_to_xoto:    true,
    submitted_to_xoto_at: new Date(),
    submitted_by_agent:   partnerId,

    notes: [{
      text:        `Lead submitted by referral partner. Client: ${first_name || ''} ${last_name || ''}, Phone: ${country_code} ${cleanPhone}`,
      author:      `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim() || 'Referral Partner',
      author_type: 'agent',
      is_private:  false,
      created_at:  new Date(),
    }],

    created_by_agent: partnerId,
    created_by:       partnerId,
  });

  // ── Customer stats update ─────────────────────────────────────────────────
  await Customer.findByIdAndUpdate(customer._id, {
    $inc: { 'statistics.total_leads': 1, 'statistics.total_enquiries': 1 },
  });

  // ── Generate referral reference number ────────────────────────────────────
  const reference = `REF-${lead._id.toString().slice(-8).toUpperCase()}`;

  const clientName = `${(first_name || '').trim()} ${(last_name || '').trim()}`.trim();

  return res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Referral lead submitted successfully',
    data: {
      lead_id:       lead._id,
      reference,
      status:        lead.status,
      client_name:   clientName,
      phone:         `${country_code} ${cleanPhone}`,
      interest_area: resolvedLocations[0]?.area || null,
      budget:        resolvedBudgetMax || null,
      property_type: property_type || null,
      submitted_at:  lead.submitted_to_xoto_at,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// 2. GET MY REFERRAL LEADS  —  GET /referral-leads/my-leads
//    Sirf apne leads, assignment info hidden
// ════════════════════════════════════════════════════════════════════════════
exports.getReferralPartnerLeads = asyncHandler(async (req, res) => {
  const partnerId = req.user._id;
  const page      = parseInt(req.query.page,  10) || 1;
  const limit     = parseInt(req.query.limit, 10) || 10;
  const skip      = (page - 1) * limit;

  const { status, classification, type, search } = req.query;

  const filter = {
    lead_type:         { $in: ['referral_partner', 'referral'] },
    'source.channel':  { $in: ['referral_partner', 'agent_added'] },
    created_by_agent:  partnerId,    // sirf apne leads
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

  const [leads, total] = await Promise.all([
    GridLead.find(filter)
      .populate('source.listing_id', 'propertyName area price mainLogo')
      .populate('matched_listings.listing_id', 'propertyName area price bedrooms bathrooms builtUpArea mainLogo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GridLead.countDocuments(filter),
  ]);

  // Referral partner ko assignment info nahi dikhani
  const sanitized = leads.map(lead => {
    const { assigned_to, assigned_at, assigned_by, assignment_notes, ...safe } = lead;
    const isAssignment = (t = '') => /assigned|assign advisor|advisor/i.test(t);
    return {
      ...safe,
      notes: Array.isArray(safe.notes)
        ? safe.notes.filter(n => !isAssignment(n?.text || ''))
        : safe.notes,
      status_history: Array.isArray(safe.status_history)
        ? safe.status_history.filter(h => !isAssignment(h?.notes || ''))
        : safe.status_history,
    };
  });

  res.json({
    success: true,
    data: sanitized,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// 3. SAVE MATCHED LISTINGS  —  POST /referral-leads/:id/save-matches
//    Agent ke saveMatchedListings ka exact copy — sirf ownership check alag
// ════════════════════════════════════════════════════════════════════════════
exports.saveReferralMatchedListings = asyncHandler(async (req, res) => {
  const { id }       = req.params;
  const { listings } = req.body;
  const partnerId    = req.user._id;

  if (!Array.isArray(listings) || listings.length === 0) {
    return res.status(400).json({ success: false, message: 'listings array is required' });
  }

  const lead = await GridLead.findOne({ _id: id, created_by_agent: partnerId, lead_type: 'referral_partner' });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  listings.forEach(item => {
    const existing = lead.matched_listings.find(
      m => m.listing_id?.toString() === item.listing_id?.toString()
    );
    if (existing) {
      existing.client_interested   = item.client_interested ?? existing.client_interested;
      existing.presented_to_client = item.presented_to_client ?? true;
    } else {
      lead.matched_listings.push({
        listing_id:          item.listing_id,
        match_score:         item.match_score || 50,
        presented_to_client: item.presented_to_client ?? true,
        client_interested:   item.client_interested ?? null,
        suggested_by_advisor: false,
      });
    }
  });

  const interestedCount    = listings.filter(l => l.client_interested === true).length;
  const notInterestedCount = listings.filter(l => l.client_interested === false).length;

  if (interestedCount > 0 || notInterestedCount > 0) {
    lead.notes.push({
      text: `Referral partner updated client reactions: ${interestedCount} interested, ${notInterestedCount} not interested out of ${listings.length} properties shown.`,
      author:      req.user?.first_name || 'Referral Partner',
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
// 4. SUBMIT TO XOTO  —  POST /referral-leads/:id/submit-to-xoto
//    Same as agent submitLeadToXoto
//    Commission status 'pending' mein set rehta hai — admin approve karega
// ════════════════════════════════════════════════════════════════════════════
exports.submitReferralLeadToXoto = asyncHandler(async (req, res) => {
  const { id }    = req.params;
  const partnerId = req.user._id;
  const {
    first_name, last_name, phone_number,
    country_code = '+971', email,
    submission_note,
  } = req.body;

  const lead = await GridLead.findOne({ _id: id, created_by_agent: partnerId, lead_type: 'referral_partner' });
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

  // ≥1 interested property check
  const interestedProps        = lead.matched_listings.filter(m => m.client_interested === true);
  const advisorSuggestedInterested = (lead.advisor_suggestions || []).filter(s => s.client_reaction === 'interested');
  const totalInterested        = interestedProps.length + advisorSuggestedInterested.length;

  if (totalInterested === 0) {
    return res.status(400).json({
      success: false,
      message: 'Client must show interest in at least 1 property before submitting to Xoto. Use save-matches to record client reactions first.',
    });
  }

  // Contact info update
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
  lead.submitted_by_agent   = partnerId;

  lead.notes.push({
    text: submission_note
      ? `Referral partner submitted lead to Xoto. ${totalInterested} interested properties. Note: ${submission_note}`
      : `Referral partner submitted lead to Xoto. ${totalInterested} interested properties.`,
    author:      req.user?.first_name || 'Referral Partner',
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
      commission_status: lead.referral_info?.commission_status,
      client_added:     !!(first_name || phone_number),
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// 5. ADD NOTE  —  POST /referral-leads/:id/note
// ════════════════════════════════════════════════════════════════════════════
exports.addReferralNote = asyncHandler(async (req, res) => {
  const { id }   = req.params;
  const { text } = req.body;
  const partnerId = req.user._id;

  if (!text?.trim()) {
    return res.status(400).json({ success: false, message: 'Note text is required' });
  }

  const lead = await GridLead.findOne({ _id: id, created_by_agent: partnerId, lead_type: 'referral_partner' });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  lead.notes.push({
    text:        text.trim(),
    author:      `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim() || 'Referral Partner',
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
// 6. UPDATE REQUIREMENTS  —  PUT /referral-leads/:id/update-requirements
//    Submission ke baad update nahi kar sakte
// ════════════════════════════════════════════════════════════════════════════
exports.updateReferralRequirements = asyncHandler(async (req, res) => {
  const { id }                   = req.params;
  const { requirements, reason } = req.body;
  const partnerId                = req.user._id;

  const lead = await GridLead.findOne({ _id: id, created_by_agent: partnerId, lead_type: 'referral_partner' });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found or access denied' });
  }

  const {
    first_name,
    last_name,
    phone_number,
    country_code,
    email,
    interest_area,         // PRD simple field → converts to location_preferences
    property_type,
    transaction_type,
    location_preferences,
    budget_min,
    budget_max,
    bedrooms,
    bathrooms,
    area_sqft_min,
    area_sqft_max,
    furnished,
    ready_by_date,
    additional_notes,
  } = requirements || {};

  // Convert PRD simple interest_area to location_preferences array
  if (interest_area !== undefined) {
    requirements.location_preferences = interest_area ? [{ area: interest_area }] : [];
    delete requirements.interest_area;
  }

  // Update contact_info on the lead
  if (first_name !== undefined || last_name !== undefined || phone_number !== undefined || email !== undefined) {
    lead.contact_info = lead.contact_info || {};
    
    if (first_name !== undefined || last_name !== undefined) {
      lead.contact_info.name = lead.contact_info.name || {};
      if (first_name !== undefined) lead.contact_info.name.first_name = first_name;
      if (last_name !== undefined) lead.contact_info.name.last_name = last_name;
      lead.contact_info.name.is_masked = false;
    }

    if (phone_number !== undefined) {
      const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
      lead.contact_info.mobile = {
        country_code: country_code || lead.contact_info.mobile?.country_code || '+971',
        number:       cleanPhone,
        is_masked:    false,
        verified:     false,
      };
    }

    if (email !== undefined) {
      lead.contact_info.email = {
        address:   email.toLowerCase().trim(),
        is_masked: false,
        verified:  false,
      };
    }
  }

  // Update associated Customer if any
  if (lead.customerId) {
    const Customer = require('../../../../modules/auth/models/user/customer.model');
    const updateData = {};
    if (first_name !== undefined || last_name !== undefined) {
      if (first_name !== undefined) updateData['name.first_name'] = first_name.trim();
      if (last_name !== undefined) updateData['name.last_name'] = last_name.trim();
    }
    if (phone_number !== undefined) {
      const cleanPhone = phone_number.toString().replace(/\D/g, '').slice(-15);
      updateData.mobile = {
        country_code: country_code || '+971',
        number: cleanPhone,
        verified: false
      };
    }
    if (email !== undefined) {
      updateData.email = email.toLowerCase().trim();
    }
    if (Object.keys(updateData).length > 0) {
      await Customer.findByIdAndUpdate(lead.customerId, { $set: updateData });
    }
  }

  const oldReq = lead.requirements || {};
  lead.notes.push({
    text: `Requirements updated. Reason: ${reason || 'Client changed preferences'}. Previous: Budget AED ${oldReq.budget_max || 'N/A'}, Area: ${(oldReq.location_preferences || []).map(l => l.area || l).join(', ') || 'N/A'}, Type: ${oldReq.property_type || 'N/A'}`,
    author:      req.user?.first_name || 'Referral Partner',
    author_type: 'agent',
    is_private:  true,
    created_at:  new Date(),
  });

  lead.requirements     = { ...lead.requirements, ...requirements };
  lead.matched_listings = [];
  lead.nurturing = { is_nurturing: false, nurturing_reason: '', notify_when_available: true };

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
// 7. REFERRAL PARTNER STATS  —  GET /referral-leads/my-stats
// ════════════════════════════════════════════════════════════════════════════
exports.getReferralPartnerStats = asyncHandler(async (req, res) => {
  const partnerId = req.user._id;

  const baseFilter = {
    lead_type:         { $in: ['referral_partner', 'referral'] },
    'source.channel':  { $in: ['referral_partner', 'agent_added'] },
    created_by_agent:  partnerId,
  };

  const [
    total, newLeads, inProgress, completed, submitted, notProceeding,
    pendingCommission, paidCommission,
  ] = await Promise.all([
    GridLead.countDocuments(baseFilter),
    GridLead.countDocuments({ ...baseFilter, status: 'new' }),
    GridLead.countDocuments({ ...baseFilter, status: { $in: ['contacted', 'in_discussion', 'site_visit_scheduled', 'offer_made', 'qualified'] } }),
    GridLead.countDocuments({ ...baseFilter, status: 'completed' }),
    GridLead.countDocuments({ ...baseFilter, submitted_to_xoto: true }),
    GridLead.countDocuments({ ...baseFilter, status: 'not_proceeding' }),
    GridLead.countDocuments({ ...baseFilter, 'referral_info.commission_status': 'pending' }),
    GridLead.countDocuments({ ...baseFilter, 'referral_info.commission_status': 'paid' }),
  ]);

  const recentLeads = await GridLead.find(baseFilter)
    .select('contact_info status classification enquiry_type createdAt submitted_to_xoto referral_info')
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
        commission: {
          pending: pendingCommission,
          paid:    paidCommission,
        },
      },
      recent_leads: recentLeads,
    },
  });
});


// ════════════════════════════════════════════════════════════════════════════
// 8. ADMIN: UPDATE COMMISSION STATUS  —  PUT /referral-leads/:id/commission
//    Admin commission approve/pay karta hai
// ════════════════════════════════════════════════════════════════════════════
exports.updateCommissionStatus = asyncHandler(async (req, res) => {
  const { id }     = req.params;
  const { status, notes } = req.body;

  const VALID = ['pending', 'approved', 'paid', 'cancelled'];
  if (!VALID.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be: ${VALID.join(', ')}` });
  }

  const lead = await GridLead.findOne({ _id: id, lead_type: 'referral_partner' });
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  if (!lead.referral_info) {
    return res.status(400).json({ success: false, message: 'This lead has no referral info' });
  }

  lead.referral_info.commission_status = status;
  if (status === 'paid') {
    lead.referral_info.commission_paid_at = new Date();
  }

  lead.notes.push({
    text: `Commission status updated to "${status}"${notes ? '. Note: ' + notes : ''}`,
    author:      req.user?.firstName || 'Admin',
    author_type: 'admin',
    is_private:  false,
    created_at:  new Date(),
  });

  await lead.save();

  return res.json({
    success: true,
    message: `Commission status updated to ${status}`,
    data: {
      lead_id:           lead._id,
      commission_status: lead.referral_info.commission_status,
      commission_paid_at: lead.referral_info.commission_paid_at,
    },
  });
});

exports.getReferralLeaderboard = asyncHandler(async (req, res) => {
  const partnerId = req.user?._id;
  
  const period = req.query.period || 'all';
  const today = new Date();
  let startDate;
  
  if (period === 'week') {
    startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    startDate = new Date(0);
  }

  const GridReferralPartner = require('../../ReferralPartner/Model/ReferralPartner.model.js');
  const partners = await GridReferralPartner.find().select("firstName lastName phone email createdAt");
  
  const leadStats = await GridLead.aggregate([
    {
      $match: {
        lead_type: { $in: ['referral_partner', 'referral'] },
        'source.channel': { $in: ['referral_partner', 'agent_added'] },
        createdAt: { $gte: startDate },
      }
    },
    {
      $group: {
        _id: '$source.referralPartnerId',
        totalLeads: { $sum: 1 },
        convertedLeads: { 
          $sum: { 
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] 
          } 
        },
      }
    }
  ]);

  const statsMap = new Map(leadStats.map(stat => [String(stat._id), stat]));
  
  const leaderboardData = partners.map((partner) => {
    const id = String(partner._id);
    const stats = statsMap.get(id) || { totalLeads: 0, convertedLeads: 0 };
    const conversionRate = stats.totalLeads ? Math.round((stats.convertedLeads / stats.totalLeads) * 100) : 0;
    const commissionEarned = stats.convertedLeads * 500;
    
    return {
      id: partner._id,
      name: `${partner.firstName} ${partner.lastName}`,
      rank: 1,
      totalLeads: stats.totalLeads,
      convertedLeads: stats.convertedLeads,
      conversionRate: conversionRate,
      commissionEarned: commissionEarned,
      change: 'up',
      changeValue: 0
    };
  }).sort((a, b) => b.commissionEarned - a.commissionEarned).map((partner, index) => ({
    ...partner,
    rank: index + 1
  }));

  const myRank = leaderboardData.find(item => String(item.id) === String(partnerId));

  return res.json({
    success: true,
    status: "success",
    data: {
      leaderboard: leaderboardData,
      myRank
    }
  });
});

