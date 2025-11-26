// modules/auth/routes/role.routes.js
const express = require('express');
const router = express.Router();
const { protectMulti,authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const controller = require('../../controllers/role/role.controller');
const {
  validateCreateRole,
  validateUpdateRole,
  validateDeleteRole,
  validateGetRole,
  validateGetAllRoles,
  validatePermanentDeleteRole,
  validateRestoreRole
} = require('../../validations/authvalidation/role.validation');


router.get(
  '/',
  // checkPermission('Role', 'view'),
  validateGetAllRoles,
  controller.getAllRoles
);

// ===================================================================
// ALL ROUTES UNDER "Role" MODULE
// ===================================================================
router.use(
  protectMulti,
  authorize({
    roles: ['SuperAdmin', 'Admin'], // Only these can manage permissions
  }),
  checkPermission('Permission', 'view') // Base permission check for access
);

// CREATE ROLE
router.post(
  '/',
  checkPermission('Role', 'create'),
  validateCreateRole,
  controller.createRole
);

// UPDATE ROLE
router.put(
  '/:roleId',
  checkPermission('Role', 'update'),
  validateUpdateRole,
  controller.updateRole
);

// SOFT DELETE ROLE
router.delete(
  '/:roleId',
  checkPermission('Role', 'delete'),
  validateDeleteRole,
  controller.deleteRole
);

// PERMANENT DELETE ROLE
router.delete(
  '/:roleId/permanent',
  checkPermission('Role', 'delete'),
  validatePermanentDeleteRole,
  controller.permanentDeleteRole
);

// RESTORE ROLE
router.patch(
  '/:roleId/restore',
  checkPermission('Role', 'update'),
  validateRestoreRole,
  controller.restoreRole
);

// GET SINGLE ROLE
router.get(
  '/:roleId',
  checkPermission('Role', 'view'),
  validateGetRole,
  controller.getRole
);

// GET ALL ROLES
router.get(
  '/',
  checkPermission('Role', 'view'),
  validateGetAllRoles,
  controller.getAllRoles
);

module.exports = router;
