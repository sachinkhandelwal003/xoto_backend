// routes/products.router.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/products/product.controller');
const { protect, authorize, protectVendorb2c } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const upload = require('../../../../middleware/multer');
const {
  validateCreateProduct,
  validateUpdateProduct,
  validateGetAllProducts,
  validateProductId,
  validateProductVerification,
  validateAssetVerification,
  validateUpdateInventory, // New validation for createInventory
  validateUpdatePricing
} = require('../validations/product.validation');

// Use upload.any() for dynamic fields (color_images_${index}, etc.)
router.post(
  '/',
  protectVendorb2c,
  upload.any(),
  validateCreateProduct,
  productController.createProduct
);

router.get(
  '/',
  validateGetAllProducts,
  productController.getAllProducts
);

router.get(
  '/:id',
  protectVendorb2c,
  validateProductId,
  productController.getProductById
);

router.put(
  '/:id',
  protectVendorb2c,
  upload.any(),
  validateProductId,
  validateUpdateProduct,
  productController.updateProduct
);

router.delete(
  '/:id',
  protectVendorb2c,
  validateProductId,
  productController.deleteProduct
);

// Inventory Management Routes (Vendor)
router.post(
  '/:productId/inventory/create',
  protectVendorb2c,
  validateProductId,
  productController.createInventory
);

router.put(
  '/:productId/inventory',
  protectVendorb2c,
  validateProductId,
  validateUpdateInventory,
  productController.updateInventory
);

router.get(
  '/:productId/inventory/history',
  protectVendorb2c,
  validateProductId,
  validateGetAllProducts, // Reuse for query validation (e.g., sku, page, limit)
  productController.getInventoryHistory
);

// Super Admin Routes (Admin can verify products and documents)
router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'read'),
  validateGetAllProducts,
  productController.getAllProducts
);

router.get(
  '/:id',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'read'),
  validateProductId,
  productController.getProductById
);

router.put(
  '/:id/verify-all',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'verify'),
  validateProductVerification,
  productController.verifyProductAndAssets
);

router.put(
  '/:productId/verify-asset/:assetId',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'verify'),
  validateAssetVerification,
  productController.updateAssetVerification
);

router.put(
  '/:productId/update-asset/:assetId',
  protectVendorb2c,
  upload.single('file'),
  validateProductId,
  productController.updateAsset
);

// Admin Inventory Management Routes
router.post(
  '/:productId/inventory',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'create'),
  validateProductId,
  productController.createInventory
);

router.put(
  '/:productId/inventory',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'update'),
  validateProductId,
  validateUpdateInventory,
  productController.updateInventory
);

router.get(
  '/:productId/inventory/history',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'read'),
  validateProductId,
  validateGetAllProducts,
  productController.getInventoryHistory
);

// New Route for Listing Product Inventory
router.get(
  '/:productId/inventory',
  protectVendorb2c,
  validateProductId,
  productController.getProductInventory
);

// New: Superadmin update discount
router.put(
  '/:id/pricing',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Products', 'update'),
  validateUpdatePricing,
  productController.updateProductPricing 
);

module.exports = router;