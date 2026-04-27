// controllers/propertyLead/propertyLead.controller.js
const PropertyLead = require('../../models/consultant/propertyLead.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const MortgageApplication = require("../../../mortgages/models/index.js");
const mortgageApplicationDocument = require("../../../mortgages/models/CustomerDocument.js");
const MortgageApplicationCustomerDetails = require("../../../mortgages/models/CustomerBasicDetails.js");
const MortgageApplicationProductRequirements = require("../../../mortgages/models/ProductRequirements.js")
const Customer = require('../../models/user/customer.model.js')
const { suggestAdvisor } = require('../../../Grid/Advisor/controller/advisorAssignment.service.js');
const GridAdvisor = require('../../../Grid/Advisor/model/index.js');
const jwt = require("jsonwebtoken");
// Create
exports.createPropertyLead = asyncHandler(async (req, res) => {
  let data = req.body;

  /* -------------------------
     Normalize mobile
  -------------------------- */
  data.mobile = {
    country_code:
      data.mobile?.country_code ||
      data.mobile?.countryCode ||
      '+91',
    number: (data.mobile?.number || data.mobile?.phone || '')
      .toString()
      .replace(/\D/g, '')
      .slice(-15)
  };

  /* -------------------------
     Preferred contact logic
  -------------------------- */
  if (!data.preferred_contact) {
    if (['buy', 'rent', 'schedule_visit', 'partner'].includes(data.type)) {
      data.preferred_contact = 'whatsapp';
    } else {
      data.preferred_contact = 'call';
    }
  } // message,stakeholder_type,name, email

  /* -------------------------
     Auto-map consultation
  -------------------------- */
  if (data.type === 'consultation') {
    data.consultant_type = data.consultant_type || 'other';
  }

  if (data.type === "rent" && !data.property) {
  return res.status(400).json({
    success: false,
    message: "Property is required for rent leads"
  });
}

  const lead = await PropertyLead.create(data);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Lead submitted successfully',
    data: lead
  });
});


// Get All
exports.getAllPropertyLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, type } = req.query;

  const query = {};

  if (status) query.status = status;
  if (type) query.type = type;

  if (search) {
    query.$and = [
      {
        $or: [
          { 'name.first_name': new RegExp(search, 'i') },
          { 'name.last_name': new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { 'mobile.number': new RegExp(search, 'i') }
        ]
      }
    ];
  }

  const total = await PropertyLead.countDocuments(query);

let leads = await PropertyLead.find(query)
  .populate("property")
  .populate("assignedAdvisor", "firstName lastName email phone employeeId") // ✅ add karo
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(Number(limit))
  .lean();

  leads = await Promise.all(
    leads.map(async (lead) => {
      const mortgage_application = await MortgageApplication.findOne({ lead_id: lead._id });
      const mortgage_applicationdocument = await mortgageApplicationDocument.findOne({ lead_id: lead._id });
      const personal_details = await MortgageApplicationCustomerDetails.findOne({ lead_id: lead._id });
      const product_details = await MortgageApplicationProductRequirements.findOne({ lead_id: lead._id });

      return {
        ...lead,
        mortgage_application: mortgage_application || {},
        mortgage_applicationdocument: mortgage_applicationdocument || {},
        personal_details: personal_details || {},
        product_details: product_details || {}
      };
    })
  );

  const data = leads.map(l => ({
    ...l,
    full_name: `${l.name?.first_name || ""} ${l.name?.last_name || ""}`.trim()
  }));

  res.json({
    success: true,
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// Get Single
exports.getPropertyLead = asyncHandler(async (req, res) => {
  const lead = await PropertyLead.findById(req.params.id);
  if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
  res.json({ success: true, data: { ...lead.toObject(), full_name: lead.full_name } });
});

// Update
exports.updatePropertyLead = asyncHandler(async (req, res) => {
  const lead = await PropertyLead.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
  res.json({ success: true, message: 'Updated', data: lead });
});

// Update
exports.createMortgagePropertyLead = asyncHandler(async (req, res) => {
  let { name, email, mobile } = req.body;

  let customerAlreadyExists = await Customer.findOne({
    $or: [
      { email: email },
      { mobile: mobile }
    ]
  })

  let customer = {}

  // if it exist then we'll make the lead for it only if there is no lead in last 30 days
  if (customerAlreadyExists) {
    customer = customerAlreadyExists
    console.log("customerAlreadyExistscustomerAlreadyExists", customerAlreadyExists)
    const DAYS = 30;
    const fromDate = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

    const leads = await PropertyLead.find({
      customerId: customerAlreadyExists._id,
      createdAt: { $gte: fromDate }
    });
    console.log("leadsleadsleadsleads", leads)
    if (leads.length > 0) {
      return res.json({ success: false, message: 'You already have created a lead within last 30 days . So please try after some days', data: null });
    }

  } else { // if it doesnt exist then we have to do both signup and create lead
    customer = await Customer.create({
      email,
      name,
      mobile
    })
    console.log("custoemrrrrrrrrrrrrrrrr", customer)
  }




  const lead = await PropertyLead.create({ customerId: customer._id, ...req.body });


  let mortgageApplication = {};
  let mortgageDocument = {};
  let mortgageCustomerDetails = {};
  let mortgageProductRequirements = {};
  const applicationId = `XOTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  if (lead.type === "mortgage") {

    // map lead_sub_type → loan_type
    let loanType = "purchase";
    if (lead.lead_sub_type === "refinance") loanType = "refinance";
    if (lead.lead_sub_type === "buy_out") loanType = "buy_out";

    mortgageApplication = await MortgageApplication.create({
      customerId: customer._id,
      application_id: applicationId,
      lead_id: lead._id,

      loan_type: loanType,
      mortgage_type: "-",       // user hasn’t selected yet
      loan_preference: "-",     // user hasn’t selected yet

      income_type: lead.occupation || null,
      property_value: lead.price || null,
      loan_amount: null,

      status: "in_progress"
    });



    // we'll create a document entry here for user and after this he/she can edit those document 
    mortgageDocument = await mortgageApplicationDocument.create({
      customerId: customer._id,
      application_id: applicationId,
      lead_id: lead._id
    })


    mortgageCustomerDetails = await MortgageApplicationCustomerDetails.create({
      customerId: customer._id,
      application_id: applicationId,
      lead_id: lead._id,

      full_name: `${lead?.name?.first_name || ""} ${lead?.name?.last_name || ""}`.trim(),
      nationality: "UAE"
    });


    mortgageProductRequirements = await MortgageApplicationProductRequirements.create({
      customerId: customer._id,
      application_id: applicationId,
      lead_id: lead._id,

      // sensible initial defaults (editable later by user)
      purchase_type: lead.lead_sub_type || "",
      existing_mortgage: lead.lead_sub_type === "refinance" ? "yes" : "no",

      found_property: "yes",
      applicant: "single",

      mortgage_type: "fixed",
      fixed_term: "",

      loan_type: loanType,
      loan_period: 0,
      loan_to_value: 0,

      primary_application_income_type: lead.occupation || "",
      primary_application_income: 0,
      primary_application_age: 0,
      primary_applicant_finance_audit: "yes",

      property_value: lead.price || 0,
      property_emirate: lead.emirate || "",
      property_area: lead.area || ""
    });
  }


  const payload = {
    id: customer._id,
    email: customer.email,
    type: "user",

    role: {
      id: customer.role?._id || null,
      code: customer.role?.code || null,
      name: customer.role?.name || null,
      isSuperAdmin: customer.role?.isSuperAdmin || false,
    }
  };

  let token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });


  res.json({ success: true, message: 'Created', data: { lead, mortgageApplication, mortgageDocument, mortgageCustomerDetails, mortgageProductRequirements }, token });
});

// Mark Contacted
exports.markAsContacted = asyncHandler(async (req, res) => {
  const lead = await PropertyLead.findById(req.params.id);
  if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
  lead.status = 'contacted';
  await lead.save();
  res.json({ success: true, message: 'Marked as contacted', data: lead });
});

// Delete
exports.deletePropertyLead = asyncHandler(async (req, res) => {
  const lead = await PropertyLead.findById(req.params.id);
  if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
  lead.is_deleted = true;
  lead.deleted_at = new Date();
  await lead.save();
  res.json({ success: true, message: 'Deleted' });
});




exports.suggestAdvisors = asyncHandler(async (req, res) => {
  const lead = await PropertyLead.findById(req.params.id);
  if (!lead) throw new APIError('Lead not found', StatusCodes.NOT_FOUND);

  const best = await suggestAdvisor({
    area:           lead.area,
    preferred_city: lead.preferred_city,
    type:           lead.type,
  });

  // Also return top 5 for admin to manually pick
  const all = await GridAdvisor.find({ status: 'active' })
    .select('firstName lastName email specialisation leaderboard workload')
    .sort({ 'leaderboard.compositeScore': -1 })
    .limit(5)
    .lean();

  res.json({
    success: true,
    data: {
      recommended: best || null,    // Top 1 auto-suggested
      options: all,                  // Top 5 for manual pick
    }
  });
});

// ════════════════════════════════════════════════════
// ASSIGN ADVISOR — Admin manually assigns
// PATCH /property-leads/:id/assign
// Body: { advisorId, notes }
// PRD 4.5 — only admin can assign/reassign
// ════════════════════════════════════════════════════
exports.assignAdvisor = asyncHandler(async (req, res) => {
  const { advisorId, notes } = req.body;

  if (!advisorId) {
    return res.status(400).json({ success: false, message: 'advisorId is required' });
  }

  const [lead, advisor] = await Promise.all([
    PropertyLead.findById(req.params.id),
    GridAdvisor.findById(advisorId),
  ]);

  if (!lead)    throw new APIError('Lead not found',    StatusCodes.NOT_FOUND);
  if (!advisor) throw new APIError('Advisor not found', StatusCodes.NOT_FOUND);

  if (advisor.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: `Advisor is ${advisor.status} — cannot assign`,
    });
  }

  // Already assigned to same advisor
  if (lead.assignedAdvisor?.toString() === advisorId) {
    return res.status(400).json({
      success: false,
      message: 'Lead is already assigned to this advisor',
    });
  }

  // Assign
  lead.assignedAdvisor  = advisorId;
  lead.assignedAt       = new Date();
  lead.assignedBy       = req.user._id;   // Admin who assigned
  lead.assignmentNotes  = notes || null;

  // PRD 4.6 — status: New when just assigned
  if (lead.status === 'submit') {
    lead.status = 'submit'; // keep existing, advisor will move it to 'contacted'
  }

  await lead.save();

  // Update advisor workload count (for future sorting)
  await GridAdvisor.findByIdAndUpdate(advisorId, {
    $inc: { 'workload.activeLeadsCount': 1 }
  });

  res.json({
    success: true,
    message: `Lead assigned to ${advisor.firstName} ${advisor.lastName}`,
    data: {
      leadId:    lead._id,
      advisor: {
        _id:       advisor._id,
        name:      `${advisor.firstName} ${advisor.lastName}`,
        email:     advisor.email,
      },
      assignedAt: lead.assignedAt,
    }
  });
});


exports.getMyAssignedLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, type, search } = req.query;

  // ✅ req.user se GridAdvisor dhundo
  const advisor = await GridAdvisor.findOne({ 
    email: req.user.email  // ya phone, jo bhi match kare
  });

  if (!advisor) {
    return res.status(404).json({ 
      success: false, 
      message: 'Advisor profile not found' 
    });
  }

  const query = {
    assignedAdvisor: advisor._id,  // ✅ GridAdvisor ka actual _id
    type: { $ne: 'mortgage' }
  };

  if (status) query.status = status;
  if (type)   query.type   = type;

  if (search) {
    query.$or = [
      { 'name.first_name': new RegExp(search, 'i') },
      { 'name.last_name':  new RegExp(search, 'i') },
      { email:             new RegExp(search, 'i') },
      { 'mobile.number':   new RegExp(search, 'i') },
    ];
  }

  const total = await PropertyLead.countDocuments(query);
  const leads = await PropertyLead.find(query)
    .populate("property")
    .sort({ assignedAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const data = leads.map(l => ({
    ...l,
    full_name: `${l.name?.first_name || ''} ${l.name?.last_name || ''}`.trim()
  }));

  res.json({
    success: true,
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// PATCH /property/lead/:id/status — Advisor status update karega
exports.updateLeadStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const allowed = ['submit','contacted','converted','dead'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status` });
  }

  // ✅ GridAdvisor dhundo pehle
  const advisor = await GridAdvisor.findOne({ email: req.user.email });
  if (!advisor) return res.status(404).json({ success: false, message: 'Advisor not found' });

  const lead = await PropertyLead.findOne({
    _id:             req.params.id,
    assignedAdvisor: advisor._id,  // ✅ GridAdvisor _id
  });

  if (!lead) throw new APIError('Lead not found or not assigned to you', 404);

  lead.status = status;
  if (notes) {
    lead.notes.push({
      text:      notes,
      author:    `${advisor.firstName} ${advisor.lastName}`,
      createdAt: new Date()
    });
  }

  await lead.save();
  res.json({ success: true, message: 'Status updated', data: lead });
});