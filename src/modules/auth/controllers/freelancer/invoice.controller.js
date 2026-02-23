// controllers/freelancer/invoice.controller.js
const winston = require('winston');
const Invoice = require('../../models/Freelancer/invoice.model');
const Project = require('../../models/Freelancer/projectfreelancer.model');
// const generateInvoiceNumber = require('../../../utils/invoiceNumber');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/invoice.log' }),
    new winston.transports.Console()
  ]
});
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
  return `INV-${year}-${randomPart}`;
}

exports.getProjects = asyncHandler(async (req, res) => {
  const { id, page = 1, limit = 10, status, search, freelancer } = req.query;

  // === 1. GET SINGLE PROJECT BY ID ===
  if (id) {
    const project = await Project.findOne({ _id: id, is_deleted: false })
      .populate('customer', 'name email')
      .populate('freelancer', 'name email mobile')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('-__v');

    if (!project) {
      throw new APIError('Project not found', StatusCodes.NOT_FOUND);
    }

    return res.json({ success: true, project });
  }

  // === 2. GET ALL PROJECTS (PUBLIC) ===
  const query = { is_deleted: false };

  if (status) query.status = status;
  if (search) query.title = { $regex: search.trim(), $options: 'i' };
  if (freelancer) query.freelancer = freelancer;

  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('customer', 'name email')
      .populate('freelancer', 'name email mobile')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean(),

    Project.countDocuments(query),
  ]);

  res.json({
    success: true,
    pagination: {
      page: +page,
      limit: +limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    projects,
  });
});

exports.createInvoiceForMilestone = async (projectId, milestoneId) => {
  const project = await Project.findOne({ _id: projectId, is_deleted: false });
  if (!project) throw new APIError('Project not found', StatusCodes.NOT_FOUND);

  const milestone = project.milestones.id(milestoneId);
  if (!milestone || milestone.is_deleted) throw new APIError('Milestone not found', StatusCodes.NOT_FOUND);
  if (milestone.invoice) return;

  const invoice_number = generateInvoiceNumber();
  const tax = milestone.amount * 0.1;
  const total = milestone.amount + tax;

  const invoice = await Invoice.create({
    project: project._id,
    milestone: milestone._id,
    invoice_number,
    amount: milestone.amount,
    tax,
    total,
    due_date: milestone.due_date,
    status: 'sent'
  });

  milestone.invoice = invoice._id;
  await project.save();

  logger.info(`Invoice ${invoice_number} created for milestone ${milestoneId}`);
  return invoice;
};

exports.getInvoices = asyncHandler(async (req, res) => {
  const { projectId, page = 1, limit = 10 } = req.query;
  const query = { is_deleted: false };
  if (projectId) query.project = projectId;

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('project', 'title')
      .populate('milestone', 'title status')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit)
      .lean(),
    Invoice.countDocuments(query)
  ]);

  res.json({ success: true, pagination: { page: +page, limit: +limit, total }, invoices });
});

exports.payInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const invoice = await Invoice.findOne({ _id: id, is_deleted: false });
  if (!invoice) throw new APIError('Invoice not found', StatusCodes.NOT_FOUND);
  if (invoice.status === 'paid') throw new APIError('Already paid', StatusCodes.CONFLICT);

  invoice.status = 'paid';
  invoice.paid_at = new Date();
  await invoice.save();

  logger.info(`Invoice ${invoice.invoice_number} paid`);
  res.json({ success: true, message: 'Invoice paid', invoice });
});