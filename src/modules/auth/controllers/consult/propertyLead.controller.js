// controllers/propertyLead/propertyLead.controller.js
const PropertyLead = require('../../models/consultant/propertyLead.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const MortgageApplication = require("../../../mortgages/models/index.js");
const mortgageApplicationDocument = require("../../../mortgages/models/CustomerDocument.js");
const MortgageApplicationCustomerDetails = require("../../../mortgages/models/CustomerBasicDetails.js");
const Customer = require('../../models/user/customer.model.js')
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
  }

  /* -------------------------
     Auto-map consultation
  -------------------------- */
  if (data.type === 'consultation') {
    data.consultant_type = data.consultant_type || 'other';
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
  const { page = 1, limit, search, status, type } = req.query;
  const query = {};

  if (status) query.status = status;
  if (type) query.type = type;
  if (search) {
    query.$or = [
      { 'name.first_name': new RegExp(search, 'i') },
      { 'name.last_name': new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { 'mobile.number': new RegExp(search, 'i') }
    ];
  }

  const total = await PropertyLead.countDocuments(query);
  const leads = await PropertyLead.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  const data = leads.map(l => ({ ...l, full_name: l.full_name }));

  res.json({
    success: true,
    data,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
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



  res.json({ success: true, message: 'Created', data: { lead, mortgageApplication, mortgageDocument ,mortgageCustomerDetails}, token });
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