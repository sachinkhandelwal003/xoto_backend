// routes/category.routes.js
const express = require('express');
const router = express.Router();
const {
  createCategory,
  bulkCreateCategories,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require('../../controllers/estimateCategory/category.controller');
const upload = require('../../../../middleware/multer');

const {
  getSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,getSubcategoriesByCategoryName
} = require('../../controllers/estimateCategory/subcategory.controller');

const {
  getTypes,
  getTypeById,
  createType,
  updateType,
  deleteType,
} = require('../../controllers/estimateCategory/type.controller');

const {
  validateCreateCategory,
  validateBulkCreate,
  validateCreateSubcategory,
  validateCreateType,
} = require('../../validations/estimateCategory/category.validation');

const uploadTypeImages = upload.fields([
  { name: 'previewImage', maxCount: 1 },
  { name: 'moodboardImages', maxCount: 20 }
]);
// Category Routes
router.post('/', validateCreateCategory, createCategory);
router.post('/bulk', validateBulkCreate, bulkCreateCategories);
router.get('/', getCategories);
router.get('/:id', getCategoryById);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

// Subcategory Routes (nested under category)
router.get("/:categoryId/subcategories", getSubcategories);
router.get('/name/:categoryName/subcategories', getSubcategoriesByCategoryName);

router.get('/:categoryId/subcategories/:id', getSubcategoryById);
router.post('/:categoryId/subcategories', validateCreateSubcategory, createSubcategory);
router.put('/:categoryId/subcategories/:id', updateSubcategory);
router.delete('/:categoryId/subcategories/:id', deleteSubcategory);

// Type Routes (nested under subcategory)
router.get('/:categoryId/subcategories/:subcategoryId/types', getTypes);
router.get('/:categoryId/subcategories/:subcategoryId/types/:id', getTypeById);
router.post('/:categoryId/subcategories/:subcategoryId/types', validateCreateType, createType);
router.put('/:categoryId/subcategories/:subcategoryId/types/:id', updateType);
router.delete('/:categoryId/subcategories/:subcategoryId/types/:id', deleteType);

module.exports = router;