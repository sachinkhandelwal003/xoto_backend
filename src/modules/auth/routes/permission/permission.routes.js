// modules/auth/routes/permission.routes.js
const express = require('express');
const router = express.Router();

const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const controller = require('../../controllers/permission/permission.controller');

const {
  validateCreatePermission,
  validateUpdatePermission,
  validateDeletePermission,
  validateGetPermission,
  validateGetAllPermissions
} = require('../../validations/authvalidation/permission.validation');

// ===================================================================
// ALL ROUTES UNDER "Permission" MODULE
// ===================================================================

// GET ALL PERMISSIONS (with filters, pagination)
router.get(
  '/',
  protectMulti,
  checkPermission('Permission', 'view'),
  validateGetAllPermissions,
  controller.getAllPermissions
);

// GET MY PERMISSIONS (logged-in user)
router.get('/my/get', protectMulti, controller.getMyPermissions);

// CREATE PERMISSION (bulk supported)
router.post(
  '/',
  protectMulti,
  checkPermission('Permission', 'create'),
  validateCreatePermission,
  controller.createPermission
);

// GET ONE PERMISSION
router.get(
  '/:permissionId',
  protectMulti,
  checkPermission('Permission', 'view'),
  validateGetPermission,
  controller.getPermission
);

// UPDATE PERMISSION
router.put(
  '/:permissionId',
  protectMulti,
  checkPermission('Permission', 'update'),
  validateUpdatePermission,
  controller.updatePermission
);

// DELETE PERMISSION
router.delete(
  '/:permissionId',
  protectMulti,
  checkPermission('Permission', 'delete'),
  validateDeletePermission,
  controller.deletePermission
);

module.exports = router;