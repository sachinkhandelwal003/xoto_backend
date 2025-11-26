// modules/auth/routes/action.routes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../../middleware/auth');
const { checkPermission } = require('../../../../middleware/permission');
const actionController = require('../../controllers/permission/action.controller');
const {
  validateCreateAction,
  validateUpdateAction,
  validateDeleteAction,
  validateGetAction,
  validateGetAllActions
} = require('../../validations/authvalidation/action.validation');

// Create action
router.post(
  '/',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Actions', 'create'),
  validateCreateAction,
  actionController.createAction
);

// Update action
router.put(
  '/:actionId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Actions', 'update'),
  validateUpdateAction,
  actionController.updateAction
);

// Delete action
router.delete(
  '/:actionId',
  protect,
  authorize({ minLevel: 10 }),
  checkPermission('Actions', 'delete'),
  validateDeleteAction,
  actionController.deleteAction
);

// Get single action
router.get(
  '/:actionId',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Actions', 'read'),
  validateGetAction,
  actionController.getAction
);

// Get all actions
router.get(
  '/',
  protect,
  authorize({ minLevel: 5 }),
  checkPermission('Actions', 'read'),
  validateGetAllActions,
  actionController.getAllActions
);

module.exports = router;