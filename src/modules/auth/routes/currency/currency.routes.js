// modules/currency/routes/currency.routes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const currencyController = require('../../controllers/currency/currency.controller');
const {
  validateCreateCurrency,
  validateUpdateCurrency,
  validateSoftDeleteCurrency,
  validatePermanentDeleteCurrency,
  validateRestoreCurrency,
  validateGetCurrency,
  validateGetAllCurrencies,
} = require('../../validations/currency/currency.validation');

// Create currency
router.post(
  '/',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Currencies', 'create'),
  validateCreateCurrency,
  currencyController.createCurrency
);

// Update currency
router.put(
  '/:currencyId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Currencies', 'update'),
  validateUpdateCurrency,
  currencyController.updateCurrency
);

// Soft delete currency
router.delete(
  '/:currencyId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Currencies', 'delete'),
  validateSoftDeleteCurrency,
  currencyController.softDeleteCurrency
);

// Permanent delete currency
router.delete(
  '/:currencyId/permanent',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Currencies', 'delete'),
  validatePermanentDeleteCurrency,
  currencyController.permanentDeleteCurrency
);

// Restore currency
router.put(
  '/:currencyId/restore',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Currencies', 'update'),
  validateRestoreCurrency,
  currencyController.restoreCurrency
);

// Get single currency
router.get(
  '/:currencyId',
 
  checkPermission('Currencies', 'read'),
  validateGetCurrency,
  currencyController.getCurrency
);

// Get all currencies
router.get(
  '/',

  validateGetAllCurrencies,
  currencyController.getAllCurrencies
);

module.exports = router;