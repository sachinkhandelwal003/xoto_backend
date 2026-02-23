const express = require('express');
const router = express.Router();
const attributeController = require('../controllers/products/attributes.controller');
const { protect, authorize ,protectVendorb2c} = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateAttribute,
  validateUpdateAttribute,
  validateGetAllAttributes,
  validateAttributeId
} = require('../validations/attributes.validation');

router.post(
  '/',

  validateCreateAttribute,
  attributeController.createAttribute
);

router.get(
  '/',

  validateGetAllAttributes,
  attributeController.getAllAttributes
);

router.get(
  '/:id',
  validateAttributeId,
  attributeController.getAttributeById
);

router.put(
  '/:id',

  validateUpdateAttribute,
  attributeController.updateAttribute
);

router.delete(
  '/:id',

  validateAttributeId,
  attributeController.deleteAttribute
);

module.exports = router;