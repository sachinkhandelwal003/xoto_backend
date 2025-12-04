const express = require('express');
const router = express.Router();
const controller = require('../../controllers/estimateCategory/category.controller');
const {
  validateCreateCategory,
  validateCreateSubcategory,
  validateCreateType,
  validateBulkCreate
} = require('../../validations/estimateCategory/category.validation');
const { protectMulti, authorize } = require('../../../../middleware/auth');

// Public Routes
router.get('/', controller.getCategories);
router.get('/:id', controller.getCategoryById);

// Admin Protected Routes
router.use(protectMulti, authorize({ roles: ['SuperAdmin', 'Admin'] }));
router.post(
  '/bulk',
  validateBulkCreate,
  controller.bulkCreateCategories
);
router.post('/', validateCreateCategory, controller.createCategory);
router.post('/:categoryId/subcategories', validateCreateSubcategory, controller.createSubcategory);
router.post('/:categoryId/subcategories/:subcategoryId/types', validateCreateType, controller.createType);

module.exports = router;