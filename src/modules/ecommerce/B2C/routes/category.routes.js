const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/products/category.controller');
const {
  validateCreateCategory,
  validateUpdateCategory,
  validateGetAllCategories,
  validateCategoryId
} = require('../validations/category.validation');
const upload = require('../../../../middleware/multer');

router.post('/', upload.single('image'), validateCreateCategory, categoryController.createCategory);
router.get('/', validateGetAllCategories, categoryController.getAllCategories);
router.get('/:id', validateCategoryId, categoryController.getCategoryById);
router.put('/:id', upload.single('image'), validateUpdateCategory, categoryController.updateCategory);

// Soft Delete Operations
router.delete('/:id', validateCategoryId, categoryController.softDeleteCategory);
router.post('/:id/restore', validateCategoryId, categoryController.restoreCategory);

// Special Routes
router.get('/hierarchy', categoryController.getCategoryHierarchy);
router.get('/highlighted', categoryController.getHighlightedCategories);

module.exports = router;