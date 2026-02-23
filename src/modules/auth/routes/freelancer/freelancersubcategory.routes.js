// routes/subcategory.route.js
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/freelancer/freelancersubcategory.controller');
const { protect } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateSubcategory,
  validateUpdateSubcategory,
  validateGetSubcategories,
  validateSubcategoryId
} = require('../../validations/freelancer/freelancersubcategory.validation');
// READ ALL
router.get(
  '/',
  validateGetSubcategories,
  controller.getAllSubcategories
);

// ALL SUBCATEGORY ROUTES → UNDER "Freelancers" MODULE → "All Subcategory" SUBMODULE
router.use(protect, checkPermission('Freelancers', 'view', 'All Subcategory'));


// CREATE
router.post(
  '/',
  checkPermission('Freelancers', 'create', 'All Subcategory'),
  validateCreateSubcategory,
  controller.createSubcategory
);



// READ ONE
router.get(
  '/:id',
  validateSubcategoryId,
  controller.getSubcategory
);

// UPDATE
router.put(
  '/:id',
  checkPermission('Freelancers', 'update', 'All Subcategory'),
  validateSubcategoryId,
  validateUpdateSubcategory,
  controller.updateSubcategory
);

// SOFT DELETE
router.delete(
  '/:id',
  checkPermission('Freelancers', 'delete', 'All Subcategory'),
  validateSubcategoryId,
  controller.deleteSubcategory
);

// RESTORE
router.patch(
  '/:id/restore',
  checkPermission('Freelancers', 'delete', 'All Subcategory'),
  validateSubcategoryId,
  controller.restoreSubcategory
);

module.exports = router;