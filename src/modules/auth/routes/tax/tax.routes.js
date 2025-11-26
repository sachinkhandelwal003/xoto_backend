// modules/tax/routes/tax.routes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const taxController = require('../../controllers/tax/tax.controller');
const {
  validateCreateTax,
  validateUpdateTax,
  validateSoftDeleteTax,
  validatePermanentDeleteTax,
  validateRestoreTax,
  validateGetTax,
  validateGetAllTaxes,
} = require('../../validations/tax/tax.validation');

// Create tax
router.post(
  '/',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Taxes', 'create'),
  validateCreateTax,
  taxController.createTax
);

// Update tax
router.put(
  '/:taxId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Taxes', 'update'),
  validateUpdateTax,
  taxController.updateTax
);

// Soft delete tax
router.delete(
  '/:taxId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Taxes', 'delete'),
  validateSoftDeleteTax,
  taxController.softDeleteTax
);

// Permanent delete tax
router.delete(
  '/:taxId/permanent',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Taxes', 'delete'),
  validatePermanentDeleteTax,
  taxController.permanentDeleteTax
);

// Restore tax
router.put(
  '/:taxId/restore',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Taxes', 'update'),
  validateRestoreTax,
  taxController.restoreTax
);

// Get single tax
router.get(
  '/:taxId',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Taxes', 'read'),
  validateGetTax,
  taxController.getTax
);

// Get all taxes
router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Taxes', 'read'),
  validateGetAllTaxes,
  taxController.getAllTaxes
);

module.exports = router;