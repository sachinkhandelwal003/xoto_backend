// controllers/consultant/consultant.controller.js
const winston = require('winston');
const Consultant = require('../../models/consultant/consult.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const Notification = require('../../../Notification/Models/NotificationModel');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/consultant.log' }),
    new winston.transports.Console()
  ]
});

// getAllConsultants - updated to support filtering by type
exports.getAllConsultants = asyncHandler(async (req, res) => {
  const { page = 1, limit, search, status, type, active, is_deleted } = req.query;

  const query = {};

  if (is_deleted !== undefined) query.is_deleted = is_deleted === 'true';
  if (active !== undefined) query.is_active = active === 'true';
  if (status) query.status = status;
  if (type) query.type = type; // New filter

  if (search) {
    query.$or = [
      { 'name.first_name': new RegExp(search, 'i') },
      { 'name.last_name': new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { 'mobile.number': new RegExp(search, 'i') }
    ];
  }

  let consultantQuery = Consultant.find(query)
    .select('-__v')
    .sort({ createdAt: -1 });

  let pagination = null;
  if (limit) {
    const limitNum = parseInt(limit);
    const pageNum = parseInt(page);
    consultantQuery = consultantQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    const total = await Consultant.countDocuments(query);
    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  const consultants = await consultantQuery.lean();

  const consultantsWithFullName = consultants.map(c => ({
    ...c,
    full_name: `${c.name.first_name} ${c.name.last_name}`
  }));

  res.status(200).json({
    success: true,
    data: consultantsWithFullName,
    pagination,
  });
});

// createConsultant - now includes type
exports.createConsultant = asyncHandler(async (req, res) => {
  const {
    name,
    mobile,
    email,
    type,
    status = 'submitted',
    message,
    follow_up_date,
    notes
  } = req.body;

  const CONSULTANT_TYPE_MAP = {
    landscaping: 'landscape',
    landscape: 'landscape',
    interior: 'interior',
    interior_design: 'interior',
    architect: 'architect',
    architecture: 'architect',
    civil: 'civil_engineer',
    civil_engineer: 'civil_engineer',
    other: 'other'
  };

  const normalizedType =
    CONSULTANT_TYPE_MAP[type?.toLowerCase()] || 'other';

  const consultant = await Consultant.create({
    name: {
      first_name: name.first_name.trim(),
      last_name: name.last_name.trim()
    },
    mobile: {
      country_code: mobile.country_code || '+91',
      number: mobile.number.trim()
    },
    email: email.toLowerCase().trim(),
    type: normalizedType,
    status,
    message: message?.trim(),
    follow_up_date,
    notes: notes?.trim(),
    is_active: true
  });

  /* 🔔 SEND NOTIFICATION DIRECTLY FROM BACKEND */
  await Notification.create({
    receiverType: 'admin',
    notificationType: 'consultant_created',
    title: 'New Consultant Request',
    message: `New ${normalizedType.replace('_', ' ')} consultant request from ${consultant.full_name}`,
    senderType: 'system'
  });

  logger.info(
    `Consultant created: ${consultant._id} | ${consultant.full_name} | Type: ${normalizedType}`
  );

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Consultant created successfully',
    consultant
  });
});


// GET SINGLE CONSULTANT
exports.getConsultant = asyncHandler(async (req, res) => {
  const consultant = await Consultant.findOne({
    _id: req.params.id,
    is_deleted: false
  });

  if (!consultant) throw new APIError('Consultant not found', StatusCodes.NOT_FOUND);

  const consultantObj = consultant.toObject();
  consultantObj.full_name = consultant.full_name;

  res.status(StatusCodes.OK).json({
    success: true,
    consultant: consultantObj
  });
});

// UPDATE CONSULTANT
exports.updateConsultant = asyncHandler(async (req, res) => {
  const {
    name,
    mobile,
    email,
    status,
    message,
    follow_up_date,
    notes,
    is_active
  } = req.body;

  const consultant = await Consultant.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!consultant) throw new APIError('Consultant not found', StatusCodes.NOT_FOUND);

  // Update fields if provided
  if (name) {
    if (name.first_name) consultant.name.first_name = name.first_name.trim();
    if (name.last_name) consultant.name.last_name = name.last_name.trim();
  }

  if (mobile) {
    if (mobile.country_code) consultant.mobile.country_code = mobile.country_code.trim();
    if (mobile.number) consultant.mobile.number = mobile.number.trim();
  }

  if (email) consultant.email = email.toLowerCase().trim();
  if (status) consultant.status = status;
  if (message !== undefined) consultant.message = message?.trim();
  if (follow_up_date !== undefined) consultant.follow_up_date = follow_up_date;
  if (notes !== undefined) consultant.notes = notes?.trim();
  if (is_active !== undefined) consultant.is_active = is_active;

  await consultant.save();

  logger.info(`Consultant updated: ${consultant._id} | ${consultant.full_name}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Consultant updated successfully',
    consultant
  });
});

// SOFT DELETE CONSULTANT
exports.deleteConsultant = asyncHandler(async (req, res) => {
  const consultant = await Consultant.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!consultant) throw new APIError('Consultant not found', StatusCodes.NOT_FOUND);

  consultant.is_deleted = true;
  consultant.deleted_at = new Date();
  await consultant.save();

  logger.info(`Consultant soft-deleted: ${consultant._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Consultant deleted successfully'
  });
});

// RESTORE CONSULTANT
exports.restoreConsultant = asyncHandler(async (req, res) => {
  const consultant = await Consultant.findOne({
    _id: req.params.id,
    is_deleted: true
  });
  if (!consultant) throw new APIError('Consultant not found or already active', StatusCodes.NOT_FOUND);

  consultant.is_deleted = false;
  consultant.deleted_at = null;
  await consultant.save();

  logger.info(`Consultant restored: ${consultant._id}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Consultant restored successfully'
  });
});

// UPDATE STATUS ONLY
exports.updateConsultantStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const consultant = await Consultant.findOne({
    _id: req.params.id,
    is_deleted: false
  });
  if (!consultant) throw new APIError('Consultant not found', StatusCodes.NOT_FOUND);

  consultant.status = status;
  await consultant.save();

  logger.info(`Consultant status updated: ${consultant._id} | ${status}`);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Consultant status updated successfully',
    consultant
  });
});