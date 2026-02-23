const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/products/category.controller');
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateCategory,
  validateCategoryId,
  validateUpdateCategory,
  validateCreateSubcategory,
  validateSubcategoryId,
  validateUpdateSubcategory
} = require('../../validations/product/category.validation');

router.get('/', categoryController.getAllCategories);
router.get('/subcategories', categoryController.getAllSubcategories);

router.post(
  '/category',
  validateCreateCategory,
  categoryController.createCategory
);

router.get(
  '/category/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Categories', 'read'),
  validateCategoryId,
  categoryController.getCategoryById
);

router.put(
  '/category/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Categories', 'update'),
  validateCategoryId,
  validateUpdateCategory,
  categoryController.updateCategory
);

router.delete(
  '/category/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Categories', 'delete'),
  validateCategoryId,
  categoryController.deleteCategory
);

router.post(
  '/subcategories',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Categories', 'create'),
  validateCreateSubcategory,
  categoryController.createSubcategory
);

router.get(
  '/subcategories/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Categories', 'read'),
  validateSubcategoryId,
  categoryController.getSubcategoryById
);

router.put(
  '/subcategories/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Categories', 'update'),
  validateSubcategoryId,
  validateUpdateSubcategory,
  categoryController.updateSubcategory
);

router.delete(
  '/subcategories/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Categories', 'delete'),
  validateSubcategoryId,
  categoryController.deleteSubcategory
);

module.exports = router;