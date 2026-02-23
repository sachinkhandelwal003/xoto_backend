
const express = require('express');
const router = express.Router();
const materialController = require('../controllers/products/material.controller');
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const {
  validateCreateMaterial,
  validateUpdateMaterial,
  validateGetAllMaterials,
  validateMaterialId
} = require('../validations/material.validation');

router.post(
  '/',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Materials', 'create'),
  validateCreateMaterial,
  materialController.createMaterial
);

router.get(
  '/',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Materials', 'read'),
  validateGetAllMaterials,
  materialController.getAllMaterials
);

router.get(
  '/:id',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Materials', 'read'),
  validateMaterialId,
  materialController.getMaterialById
);

router.put(
  '/:id',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Materials', 'update'),
  validateUpdateMaterial,
  materialController.updateMaterial
);

router.delete(
  '/:id',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Materials', 'delete'),
  validateMaterialId,
  materialController.softDeleteMaterial
);

router.post(
  '/:id/restore',
  // protect,
  // authorize({ minLevel: 5 }),
  // checkPermission('Materials', 'update'),
  validateMaterialId,
  materialController.restoreMaterial
);

module.exports = router;
