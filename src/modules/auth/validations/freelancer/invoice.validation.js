// validations/freelancer/invoice.validation.js
const { query, param } = require('express-validator');
const mongoose = require('mongoose');
const { validate } = require('./projectfreelancer.validation');

const objectId = (v, f) => { if (!mongoose.Types.ObjectId.isValid(v)) throw new Error(`${f} invalid`); return true; };

exports.validateGetInvoices = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('projectId').optional().custom(v => objectId(v, 'Project ID')),
  validate
];

exports.validateInvoiceId = [param('id').custom(v => objectId(v, 'Invoice ID')), validate];