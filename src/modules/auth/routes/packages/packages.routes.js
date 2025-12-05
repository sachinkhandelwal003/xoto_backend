// modules/package/routes/package.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/packages/packages.controller');
const { validateCreatePackage, validateUpdatePackage } = require('../../validations/packages/packages.validation');
const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
router.get('/', controller.getAllPackages);

router.use(protectMulti, authorize({ roles: ['SuperAdmin', 'Admin'] }));

router.post('/', validateCreatePackage, controller.createPackage);
router.get('/:id', controller.getPackageById);
router.put('/:id', validateUpdatePackage, controller.updatePackage);

// Soft delete
router.delete('/:id', controller.deletePackage);

// Restore
router.put('/:id/restore', controller.restorePackage);

// Permanent delete (only for cleanup)
router.delete('/:id/permanent', controller.permanentDeletePackage);

module.exports = router;