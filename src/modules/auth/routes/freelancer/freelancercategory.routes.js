// routes/freelancer/category.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/freelancer/freelancercategory.controller');
const { protectMulti, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateCategory,
  validateUpdateCategory,
  validateGetCategories,
  validateCategoryId,
} = require('../../validations/freelancer/freelancercategory.validation');

// ===================================================================
// CATEGORY ROUTES → UNDER "Freelancers" MODULE → "All Category" SUBMODULE
// ===================================================================

router.get('/', validateGetCategories, controller.getAllCategories);

// Protect all routes — can be user, vendor, freelancer, etc.
router.use(
  protectMulti,
  // Only specific roles should access this module
  authorize({
    roles: ['SuperAdmin', 'Admin', 'Freelancer'], // 👈 allowed role names
  }),
  checkPermission('Freelancers', 'view', 'All Category')
);

// CREATE
router.post(
  '/',
  checkPermission('Freelancers', 'create', 'All Category'),
  validateCreateCategory,
  controller.createCategory
);

// READ ALL

// READ ONE
router.get('/:id', validateCategoryId, controller.getCategory);

// UPDATE
router.put(
  '/:id',
  checkPermission('Freelancers', 'update', 'All Category'),
  validateCategoryId,
  validateUpdateCategory,
  controller.updateCategory
);

// SOFT DELETE
router.delete(
  '/:id',
  checkPermission('Freelancers', 'delete', 'All Category'),
  validateCategoryId,
  controller.deleteCategory
);

// RESTORE
router.put(
  '/:id/restore',
  checkPermission('Freelancers', 'delete', 'All Category'),
  validateCategoryId,
  controller.restoreCategory
);

module.exports = router;
