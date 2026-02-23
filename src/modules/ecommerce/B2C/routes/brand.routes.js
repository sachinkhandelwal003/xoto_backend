const express = require('express');
const router = express.Router();
const brandController = require('../controllers/products/brand.controller');
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const upload = require('../../../../middleware/multer');
const {
  validateCreateBrand,
  validateUpdateBrand,
  validateGetAllBrands,
  validateBrandId
} = require('../validations/brand.validation');

router.post(
  '/',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Brands', 'create'),
  upload.single('logo'), // Handle single logo upload
  validateCreateBrand,
  brandController.createBrand
);

router.get(
  '/',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Brands', 'read'),
  validateGetAllBrands,
  brandController.getAllBrands
);

router.get(
  '/:id',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Brands', 'read'),
  validateBrandId,
  brandController.getBrandById
);

router.put(
  '/:id',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Brands', 'update'),
  upload.single('logo'), // Handle single logo upload
  validateUpdateBrand,
  brandController.updateBrand
);

router.delete(
  '/:id',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Brands', 'delete'),
  validateBrandId,
  brandController.softDeleteBrand
);

router.post(
  '/:id/restore',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Brands', 'update'),
  validateBrandId,
  brandController.restoreBrand
);

module.exports = router;