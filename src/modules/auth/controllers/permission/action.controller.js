// modules/auth/controllers/action/action.controller.js
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const { Action } = require('../../models/role/actionmodule.model');
const { Module } = require('../../models/role/module.model');
const asyncHandler = require('../../../../utils/asyncHandler');

// Create actions (supports bulk creation)
exports.createAction = asyncHandler(async (req, res) => {
  const actionsData = Array.isArray(req.body) ? req.body : [req.body];

  const createdActions = [];

  for (const actionData of actionsData) {
    const { name, description, moduleId } = actionData;

    // Check if module exists
    const moduleExists = await Module.findById(moduleId);
    if (!moduleExists) {
      throw new APIError(`Module not found for moduleId ${moduleId}`, StatusCodes.NOT_FOUND);
    }

    // Check for duplicate name in the module
    const existingAction = await Action.findOne({ name, moduleId });
    if (existingAction) {
      throw new APIError(`Action with name "${name}" already exists in module ${moduleId}`, StatusCodes.CONFLICT);
    }

    // Create new action
    const action = await Action.create({
      name,
      description,
      moduleId
    });

    createdActions.push(action);
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: `${createdActions.length} action(s) created successfully`,
    actions: createdActions
  });
});

// Update an existing action
exports.updateAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;
  const { name, description } = req.body;

  // Check if action exists
  const action = await Action.findById(actionId);
  if (!action) {
    throw new APIError('Action not found', StatusCodes.NOT_FOUND);
  }

  // Check for duplicate name (excluding current)
  if (name) {
    const existing = await Action.findOne({ name, moduleId: action.moduleId, _id: { $ne: actionId } });
    if (existing) {
      throw new APIError('Action with this name already exists in the module', StatusCodes.CONFLICT);
    }
  }

  // Update action
  action.name = name || action.name;
  action.description = description || action.description;

  await action.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Action updated successfully',
    action
  });
});

// Delete an action
exports.deleteAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;

  // Check if action exists
  const action = await Action.findById(actionId);
  if (!action) {
    throw new APIError('Action not found', StatusCodes.NOT_FOUND);
  }

  // Check if action is used in permissions
  const { Permission } = require('../../models/role/permission.model');
  const permissions = await Permission.find({ actions: actionId });
  if (permissions.length > 0) {
    throw new APIError('Cannot delete action used in permissions', StatusCodes.BAD_REQUEST);
  }

  await action.deleteOne();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Action deleted successfully'
  });
});

// Get a single action by ID
exports.getAction = asyncHandler(async (req, res) => {
  const { actionId } = req.params;

  const action = await Action.findById(actionId)
    .populate('moduleId', 'name slug');
  if (!action) {
    throw new APIError('Action not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Action retrieved successfully',
    action
  });
});

// Get all actions with pagination and filtering
exports.getAllActions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { moduleId } = req.query;

  // Build filter
  const filter = {};
  if (moduleId) filter.moduleId = moduleId;

  // Query actions
  const actions = await Action.find(filter)
    .populate('moduleId', 'name slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Action.countDocuments(filter);

  res.status(StatusCodes.OK).json({
    success: true,
    count: actions.length,
    message: `${actions.length} actions found`,
    pagination: {
      totalRecords: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      perPage: limit
    },
    actions
  });
});