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
const { protect, authorize } = require('../../../../middleware/auth');

const {
  uploadPreviewImage,
  addMoodboardImages,
  updateImageTitle,
  addMoodboardQuestions,
  deleteMoodboardImage,deletePreviewImage,getGalleryByTypeId,generateMoodboard,getQuestionByTypeId,
  deleteMoodboardQuestions,
  getMoodboardQuestions,
  getSingleMoodboardQuestionById,
  editMoodboardQuestionById
} = require('../../controllers/estimateCategory/type.controller');
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

// to create master type
router.post('/:categoryId/subcategories/:subcategoryId/types',protect, createType);

router.put('/:categoryId/subcategories/:subcategoryId/types/:id', updateType);
router.delete('/:categoryId/subcategories/:subcategoryId/types/:id', deleteType);



router.post(
  '/types/:typeId/gallery/preview',
  upload.fields([{ name: 'previewImage', maxCount: 1 }]),
  uploadPreviewImage
);

router.post(
  '/types/:typeId/gallery/moodboard',
  upload.fields([{ name: 'moodboardImages', maxCount: 20 }]),
  addMoodboardImages
);

router.post(
  '/types/:typeId/question/moodboard',
  addMoodboardQuestions
);

//get questions by master category id 
router.get(
  '/types/:typeId/get-questions',
  getMoodboardQuestions
);

router.get(
  '/types/:typeId/get-questions/:questionId',
  getSingleMoodboardQuestionById
);

router.post(
  '/types/:typeId/question/moodboard/delete',
  deleteMoodboardQuestions
);

router.post(
  '/types/:typeId/question/moodboard/edit/:questionId',
  editMoodboardQuestionById
);


router.put(
  '/types/:typeId/gallery/image-title',
  updateImageTitle
);

router.delete(
  '/types/:typeId/gallery/moodboard/:imageId',
  deleteMoodboardImage
);

router.delete(
  '/types/:typeId/gallery/preview',
  deletePreviewImage
);
router.get('/types/:typeId/gallery', getGalleryByTypeId);
router.get('/types/:typeId/questions', getQuestionByTypeId);

router.get(
  '/types/:typeId/gallery/moodboard/generate',
  generateMoodboard
);


module.exports = router;