const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/products/warehouse.controller');
const { protectVendorb2c } = require('../../../../middleware/auth');
const {
  validateGetWarehouses,
  validateCreateWarehouse,
  validateUpdateWarehouse,
  validateDeleteWarehouse
} = require('../validations/warehouse.validation');

// Apply validation middleware
router.get(
  '/',
  protectVendorb2c,
  validateGetWarehouses,
  warehouseController.getWarehouses
);

router.post(
  '/',
  protectVendorb2c,
  validateCreateWarehouse,
  warehouseController.createWarehouse
);

router.put(
  '/:id',
  protectVendorb2c,
  validateUpdateWarehouse,
  warehouseController.updateWarehouse
);

router.delete(
  '/:id',
  protectVendorb2c,
  validateDeleteWarehouse,
  warehouseController.deleteWarehouse
);

module.exports = router;