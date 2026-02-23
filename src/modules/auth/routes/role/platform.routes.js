// modules/auth/routes/platform.routes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const platformController = require('../../controllers/role/platform.controller');
const {
  validateCreatePlatform,
  validateUpdatePlatform,
  validateDeletePlatform,
  validatePermanentDeletePlatform,
  validateRestorePlatform,
  validateGetPlatform,
  validateGetAllPlatforms,
} = require('../../validations/authvalidation/platform.validation');

// Create platform
router.post(
  '/',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Platforms', 'create'),
  validateCreatePlatform,
  platformController.createPlatform
);

// Update platform
router.put(
  '/:platformId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Platforms', 'update'),
  validateUpdatePlatform,
  platformController.updatePlatform
);

// Soft delete platform
router.delete(
  '/:platformId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Platforms', 'delete'),
  validateDeletePlatform,
  platformController.deletePlatform
);

// Permanent delete platform
router.delete(
  '/:platformId/permanent',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Platforms', 'delete'),
  validatePermanentDeletePlatform,
  platformController.permanentDeletePlatform
);

// Restore platform
router.put(
  '/:platformId/restore',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Platforms', 'update'),
  validateRestorePlatform,
  platformController.restorePlatform
);

// Get single platform
router.get(
  '/:platformId',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Platforms', 'read'),
  validateGetPlatform,
  platformController.getPlatform
);

// Get all platforms
router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Platforms', 'read'),
  validateGetAllPlatforms,
  platformController.getAllPlatforms
);

// Seed initial platforms (one-time operation)
router.post(
  '/seed',
  // protect,
  // authorize({ minLevel: 10 }),
  // checkPermission('Platforms', 'create'),
  platformController.seedPlatforms
);

module.exports = router;