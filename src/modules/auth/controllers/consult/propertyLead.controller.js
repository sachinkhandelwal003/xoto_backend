// controllers/propertyLead/propertyLead.controller.js
const PropertyLead = require('../../models/consultant/propertyLead.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const MortgageApplication = require("../../../mortgages/models/index.js");
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
  const lead = await PropertyLead.create({ ...req.body });

  let mortgageApplication = {};

  if (lead.type === "mortgage") {

    // map lead_sub_type → loan_type
    let loanType = "purchase";
    if (lead.lead_sub_type === "refinance") loanType = "refinance";
    if (lead.lead_sub_type === "buy_out") loanType = "buy_out";

    mortgageApplication = await MortgageApplication.create({
      application_id: `XOTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      lead_id: lead._id,

      loan_type: loanType,
      mortgage_type: "-",       // user hasn’t selected yet
      loan_preference: "-",     // user hasn’t selected yet

      income_type: lead.occupation || null,
      property_value: lead.price || null,
      loan_amount: null,

      status: "in_progress"
    });
  }


  res.json({ success: true, message: 'Created', data: {lead,mortgageApplication} });
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