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
// exports.getAllPropertyLeads = asyncHandler(async (req, res) => {
//   const { page = 1, limit, search, status, type } = req.query;
//   const query = {};

//   if (status) query.status = status;
//   if (type) query.type = type;
//   if (search) {
//     query.$or = [
//       { 'name.first_name': new RegExp(search, 'i') },
//       { 'name.last_name': new RegExp(search, 'i') },
//       { email: new RegExp(search, 'i') },
//       { 'mobile.number': new RegExp(search, 'i') }
//     ];
//   }

//   const total = await PropertyLead.countDocuments(query);
//   const leads = await PropertyLead.find(query)
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * limit)
//     .limit(parseInt(limit))
//     .lean();

//   const data = leads.map(l => ({ ...l, full_name: l.full_name }));

//   res.json({
//     success: true,
//     data,
//     pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) }
//   });
// });

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