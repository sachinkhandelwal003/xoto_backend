// controllers/propertyLead/propertyLead.controller.js
const LandingPageLead = require('../../models/consultant/LandingPageLead.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

// Create
exports.createLandingPageLead = asyncHandler(async (req, res) => {
  let data = req.body;

  const lead = await LandingPageLead.create(data);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Lead submitted successfully',
    data: lead
  });
});


// // Get All
exports.getAllLandingPageLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit, search, status, type } = req.query;
  const query = {};

  if (status) query.status = status;
  if (type) query.type = type;
  if (search) {
    query.$or = [
      { 'name': new RegExp(search, 'i') },
      { 'phone_number': new RegExp(search, 'i') },
      { 'email': new RegExp(search, 'i') }
    ];
  }

  const total = await LandingPageLead.countDocuments(query);
  const leads = await LandingPageLead.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  // const data = leads.map(l => ({ ...l, full_name: l.full_name }));


  const data = leads.map(lead => {
    const [first_name = '', ...lastParts] = (lead.name || '').split(' ');
    const last_name = lastParts.join(' ');

    return {
      _id: lead._id,
      type: lead.type,

      name: {
        first_name,
        last_name
      },

      mobile: {
        country_code: '+91', // or detect dynamically
        number: lead.phone_number
      },

      email: lead.email,
      preferred_contact: 'call',

      property_type: lead.property_type,
      area: lead.area,
      message: lead.description,

      status: lead.status,
      is_active: lead.is_active,
      is_deleted: lead.is_deleted,
      notes: lead.notes || [],

      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      occupation:"",
      location:""
    };
  });

  res.json({
    success: true,
    // data,
    data: data,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
  });
});

// // Get Single
// exports.getPropertyLead = asyncHandler(async (req, res) => {
//   const lead = await PropertyLead.findById(req.params.id);
//   if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
//   res.json({ success: true, data: { ...lead.toObject(), full_name: lead.full_name } });
// });

// // Update
// exports.updatePropertyLead = asyncHandler(async (req, res) => {
//   const lead = await PropertyLead.findByIdAndUpdate(req.params.id, req.body, { new: true });
//   if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
//   res.json({ success: true, message: 'Updated', data: lead });
// });

// // Mark Contacted
// exports.markAsContacted = asyncHandler(async (req, res) => {
//   const lead = await PropertyLead.findById(req.params.id);
//   if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
//   lead.status = 'contacted';
//   await lead.save();
//   res.json({ success: true, message: 'Marked as contacted', data: lead });
// });

// // Delete
// exports.deletePropertyLead = asyncHandler(async (req, res) => {
//   const lead = await PropertyLead.findById(req.params.id);
//   if (!lead) throw new APIError('Not found', StatusCodes.NOT_FOUND);
//   lead.is_deleted = true;
//   lead.deleted_at = new Date();
//   await lead.save();
//   res.json({ success: true, message: 'Deleted' });
// });