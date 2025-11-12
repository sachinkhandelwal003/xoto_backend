// controllers/freelancer/accountant.controller.js
const winston = require('winston');
const Accountant = require('../../models/accountant/Accountant.model');
const {Role} = require('../../../auth/models/role/role.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const bcrypt = require('bcryptjs');
const { createToken } = require('../../../../middleware/auth');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.File({ filename: 'logs/accountant.log' }), new winston.transports.Console()],
});

/* === LOGIN === */
exports.accountantLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const accountant = await Accountant.findOne({ email, is_deleted: false }).select('+password').populate('role');

  if (!accountant || !(await bcrypt.compare(password, accountant.password))) {
    throw new APIError('Invalid credentials', StatusCodes.UNAUTHORIZED);
  }

  if (!accountant.isActive) {
    throw new APIError('Account is deactivated', StatusCodes.FORBIDDEN);
  }

  const token = createToken(accountant);
  const response = accountant.toObject();
  delete response.password;

  res.json({ success: true, token, accountant: response });
});

/* === CREATE (Self Register) === */
exports.createAccountant = asyncHandler(async (req, res) => {
  const data = req.body;

  const existing = await Accountant.findOne({
    $or: [{ email: data.email }, { mobile: data.mobile }],
    is_deleted: false,
  });
  if (existing) throw new APIError('Email or mobile already in use', StatusCodes.CONFLICT);

  const role = await Role.findOne({ name: 'Accountant' });
  if (!role) throw new APIError('Accountant role not found', StatusCodes.NOT_FOUND);

  data.role = role._id;
  data.password = await bcrypt.hash(data.password, 10);
  data.isActive = true; // New accounts are active by default

  const accountant = await Accountant.create(data);
  await accountant.populate('role');

  logger.info(`Accountant registered: ${accountant._id}`);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Registration successful.',
    accountant: {
      _id: accountant._id,
      email: accountant.email,
      name: accountant.name,
      isActive: accountant.isActive,
    },
  });
});

/* === GET ALL / SINGLE === */
exports.getAllAccountants = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, id, active } = req.query;
  const query = { is_deleted: false };

  if (id) {
    const acc = await Accountant.findById(id).select('-password').populate('role').lean();
    if (!acc) throw new APIError('Not found', StatusCodes.NOT_FOUND);
    return res.json({ success: true, accountant: acc });
  }

  if (active !== undefined) query.isActive = active === 'true';
  if (search) {
    query.$or = [
      { 'name.first_name': new RegExp(search, 'i') },
      { 'name.last_name': new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  }

  const [accountants, total] = await Promise.all([
    Accountant.find(query)
      .select('-password')
      .populate('role')
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean(),
    Accountant.countDocuments(query),
  ]);

  res.json({
    success: true,
    pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) },
    accountants,
  });
});

/* === TOGGLE ACTIVE STATUS (Admin) === */
exports.toggleAccountantActive = asyncHandler(async (req, res) => {
  const accountant = await Accountant.findById(req.params.id);
  if (!accountant) throw new APIError('Not found', StatusCodes.NOT_FOUND);

  accountant.isActive = !accountant.isActive;
  await accountant.save();

  res.json({
    success: true,
    message: `Accountant ${accountant.isActive ? 'activated' : 'deactivated'}`,
    isActive: accountant.isActive,
  });
});

/* === SOFT DELETE === */
exports.deleteAccountant = asyncHandler(async (req, res) => {
  const accountant = await Accountant.findById(req.params.id);
  if (!accountant) throw new APIError('Not found', StatusCodes.NOT_FOUND);

  accountant.is_deleted = true;
  accountant.deleted_at = new Date();
  await accountant.save();

  res.json({ success: true, message: 'Accountant deleted' });
});