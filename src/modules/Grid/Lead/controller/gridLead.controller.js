const GridLead = require('../model/gridLead.model');
const Customer = require('../../../../modules/auth/models/user/customer.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const asyncHandler = require('../../../../utils/asyncHandler');


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
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { status, classification, type, search } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (classification) filter.classification = classification;
  if (type) filter.enquiry_type = type;

  // ✅ Search support
  if (search) {
    filter.$or = [
      { 'contact_info.name.first_name': { $regex: search, $options: 'i' } },
      { 'contact_info.name.last_name':  { $regex: search, $options: 'i' } },
      { 'contact_info.email.address':   { $regex: search, $options: 'i' } },
      { 'contact_info.mobile.number':   { $regex: search, $options: 'i' } },
      { full_name:                      { $regex: search, $options: 'i' } },
    ];
  }

const leads = await GridLead.find(filter)
  .populate('source.listing_id')
  .populate('matched_listings.listing_id')          // ← ye add karo
  .populate('assigned_to', 'firstName lastName email')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);

  // ✅ Rename assigned_to → assignedAdvisor so frontend AdvisorChip works
  const leadsWithAdvisor = leads.map(lead => {
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