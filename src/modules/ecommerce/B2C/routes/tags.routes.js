const express = require('express');
const router = express.Router();
const tagController = require('../controllers/products/tags.controller');
const { protect, authorize, protectVendorb2c } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateTag,
  validateUpdateTag,
  validateGetAllTags,
  validateTagId
} = require('../validations/tags.validation');

router.post(
  '/',
  validateCreateTag,
  tagController.createTag
);

router.get(
  '/',
  validateGetAllTags,
  tagController.getAllTags
);

router.get(
  '/:id',
  validateTagId,
  tagController.getTagById
);

router.put(
  '/:id',
  validateUpdateTag,
  tagController.updateTag
);

router.delete(
  '/:id',
  validateTagId,
  tagController.deleteTag
);

module.exports = router;