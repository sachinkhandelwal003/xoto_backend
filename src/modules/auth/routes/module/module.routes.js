// modules/auth/routes/module.routes.js
const express = require('express');
const router = express.Router();

const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const controller = require('../../controllers/module/module.controller');

const {
  validateCreateModule,
  validateUpdateModule,
  validateReorderModules,
  validateDeleteModule,
  validateGetModule,
  validateGetAllModules,
  validateCreateSubModule,
  validateUpdateSubModule,
  validateReorderSubModules
} = require('../../validations/authvalidation/module.validation');

// ===================================================================
// ALL ROUTES UNDER "Module" MODULE → "All Modules" SUBMODULE
// ===================================================================

router.get(
  '/',
  // checkPermission('Module', 'view', 'All Modules'),
  validateGetAllModules,
  controller.getAllModules
);
// 🔹 Protect all routes, allow only authorized roles (SuperAdmin, Admin)
router.use(
  protectMulti,
  authorize({
    roles: ['SuperAdmin', 'Admin'],
  }),
  checkPermission('Module', 'view', 'All Modules') // base permission check
);

// ===================================================================
// MODULE LEVEL
// ===================================================================

// CREATE MODULE
router.post(
  '/',
  checkPermission('Module', 'create', 'All Modules'),
  validateCreateModule,
  controller.createModule
);

// UPDATE MODULE
router.put(
  '/:moduleId',
  checkPermission('Module', 'update', 'All Modules'),
  validateUpdateModule,
  controller.updateModule
);

// REORDER MODULES
router.put(
  '/reorder',
  checkPermission('Module', 'update', 'All Modules'),
  validateReorderModules,
  controller.reorderModules
);

// DELETE MODULE (soft delete)
router.delete(
  '/:moduleId',
  checkPermission('Module', 'delete', 'All Modules'),
  validateDeleteModule,
  controller.deleteModule
);

// RESTORE MODULE
router.patch(
  '/:moduleId/restore',
  checkPermission('Module', 'update', 'All Modules'),
  validateGetModule,
  controller.restoreModule
);

// GET SINGLE MODULE
router.get(
  '/:moduleId',
  checkPermission('Module', 'view', 'All Modules'),
  validateGetModule,
  controller.getModule
);

// GET ALL MODULES
router.get(
  '/',
  checkPermission('Module', 'view', 'All Modules'),
  validateGetAllModules,
  controller.getAllModules
);

// GET MENU (UI navigation)
router.get('/menu', controller.getMenu);

// ===================================================================
// SUB-MODULE LEVEL
// ===================================================================

// CREATE SUB-MODULE
router.post(
  '/:moduleId/sub-modules',
  checkPermission('Module', 'create', 'All Modules'),
  validateCreateSubModule,
  controller.createSubModule
);

// UPDATE SUB-MODULE
router.put(
  '/:moduleId/sub-modules/:subModuleId',
  checkPermission('Module', 'update', 'All Modules'),
  validateUpdateSubModule,
  controller.updateSubModule
);

// DELETE SUB-MODULE (soft delete)
router.delete(
  '/:moduleId/sub-modules/:subModuleId',
  checkPermission('Module', 'delete', 'All Modules'),
  validateUpdateSubModule,
  controller.deleteSubModule
);

// RESTORE SUB-MODULE
router.patch(
  '/:moduleId/sub-modules/:subModuleId/restore',
  checkPermission('Module', 'update', 'All Modules'),
  validateUpdateSubModule,
  controller.restoreSubModule
);

// REORDER SUB-MODULES
router.put(
  '/:moduleId/sub-modules/reorder',
  checkPermission('Module', 'update', 'All Modules'),
  validateReorderSubModules,
  controller.reorderSubModules
);

module.exports = router;
