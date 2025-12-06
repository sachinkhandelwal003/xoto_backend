// controllers/enquiry/enquiry.controller.js
const Enquiry = require('../../models/consultant/enquiry.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

// PUBLIC: Create Enquiry
exports.createEnquiry = asyncHandler(async (req, res) => {
  const { name, mobile, email, message, preferred_contact } = req.body;

  const enquiry = await Enquiry.create({
    name: { first_name: name.first_name.trim(), last_name: name.last_name.trim() },
    mobile: { country_code: mobile.country_code || '+91', number: mobile.number.trim() },
    email: email.toLowerCase().trim(),
    message: message?.trim(),
    preferred_contact: preferred_contact || 'phone',
    status: 'submit'
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Thank you! We have received your enquiry. Our team will contact you soon.',
    data: enquiry
  });
});

// GET ALL
exports.getAllEnquiries = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const query = {};

  if (status) query.status = status;
  if (search) {
    query.$or = [
      { 'name.first_name': new RegExp(search, 'i') },
      { 'name.last_name': new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { 'mobile.number': new RegExp(search, 'i') }
    ];
  }

  const total = await Enquiry.countDocuments(query);
  const enquiries = await Enquiry.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .select('-__v')
    .lean();

  const data = enquiries.map(e => ({
    ...e,
    full_name: e.full_name
  }));

  res.json({
    success: true,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

exports.getEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) throw new APIError('Enquiry not found', StatusCodes.NOT_FOUND);

  res.json({ success: true, data: { ...enquiry.toObject(), full_name: enquiry.full_name } });
});

exports.updateEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!enquiry) throw new APIError('Enquiry not found', StatusCodes.NOT_FOUND);

  res.json({ success: true, message: 'Updated successfully', data: enquiry });
});

// Quick Action: Mark as Contacted
exports.markAsContacted = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) throw new APIError('Enquiry not found', StatusCodes.NOT_FOUND);

  enquiry.status = 'contacted';
  await enquiry.save();

  res.json({ success: true, message: 'Marked as contacted', data: enquiry });
});

exports.deleteEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) throw new APIError('Enquiry not found', StatusCodes.NOT_FOUND);

  enquiry.is_deleted = true;
  enquiry.deleted_at = new Date();
  await enquiry.save();

  res.json({ success: true, message: 'Enquiry deleted' });
});