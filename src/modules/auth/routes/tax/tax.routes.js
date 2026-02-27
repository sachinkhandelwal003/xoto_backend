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
  checkPermission('Tax', 'create'),
  validateCreateTax,
  taxController.createTax
);

// Update tax
router.put(
  '/:taxId',
  protect,
  checkPermission('Tax', 'update'),
  validateUpdateTax,
  taxController.updateTax
);

// Soft delete tax
router.delete(
  '/:taxId',
  protect,
  checkPermission('Tax', 'delete'),
  validateSoftDeleteTax,
  taxController.softDeleteTax
);

// Permanent delete tax
router.delete(
  '/:taxId/permanent',
  protect,
  checkPermission('Tax', 'delete'),
  validatePermanentDeleteTax,
  taxController.permanentDeleteTax
);

// Restore tax
router.put(
  '/:taxId/restore',
  protect,
  checkPermission('Tax', 'update'),
  validateRestoreTax,
  taxController.restoreTax
);

// Get single tax
router.get(
  '/:taxId',
  protect,
  checkPermission('Tax', 'read'),
  validateGetTax,
  taxController.getTax
);

// Get all taxes
router.get(
  '/',
  protect,
  checkPermission('Tax', 'read'),
  validateGetAllTaxes,
  taxController.getAllTaxes
);

module.exports = router;