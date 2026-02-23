// modules/auth/controllers/role/role.controller.js
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const { Role, Platform } = require('../../models/role/role.model');
const asyncHandler = require('../../../../utils/asyncHandler');

// Create a new role
exports.createRole = asyncHandler(async (req, res) => {
  const { code, name, category, description, parentRole, isSuperAdmin } = req.body;

  // Check if category exists
  const categoryExists = await Platform.findById(category);
  if (!categoryExists) {
    throw new APIError('Category not found', StatusCodes.NOT_FOUND);
  }

  // Check if parentRole exists (if provided)
  if (parentRole) {
    const parentRoleExists = await Role.findById(parentRole);
    if (!parentRoleExists) {
      throw new APIError('Parent role not found', StatusCodes.NOT_FOUND);
    }
  }

  // Check for duplicate code or name
  const existingRole = await Role.findOne({ $or: [{ code }, { name }] });
  if (existingRole) {
    throw new APIError('Role with this code or name already exists', StatusCodes.CONFLICT);
  }

  // Create new role
  const role = await Role.create({
    code,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    category,
    description,
    parentRole: parentRole || null,
    isSuperAdmin: isSuperAdmin || false
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Role created successfully',
    role,
  });
});

// Update an existing role
exports.updateRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  const { code, name, category, description, parentRole, isActive, isSuperAdmin } = req.body;

  // Check if role exists
  const role = await Role.findById(roleId);
  if (!role) {
    throw new APIError('Role not found', StatusCodes.NOT_FOUND);
  }

  // Check if category exists
  if (category) {
    const categoryExists = await Platform.findById(category);
    if (!categoryExists) {
      throw new APIError('Category not found', StatusCodes.NOT_FOUND);
    }
  }

  // Check if parentRole exists (if provided)
  if (parentRole) {
    const parentRoleExists = await Role.findById(parentRole);
    if (!parentRoleExists) {
      throw new APIError('Parent role not found', StatusCodes.NOT_FOUND);
    }
  }

  // Check for duplicate code or name (excluding current role)
  if (code || name) {
    const existingRole = await Role.findOne({
      $or: [{ code: code || role.code }, { name: name || role.name }],
      _id: { $ne: roleId },
    });
    if (existingRole) {
      throw new APIError('Role with this code or name already exists', StatusCodes.CONFLICT);
    }
  }

  // Update role
  role.code = code || role.code;
  role.name = name || role.name;
  role.slug = name ? name.toLowerCase().replace(/\s+/g, '-') : role.slug;
  role.category = category || role.category;
  role.description = description || role.description;
  role.parentRole = parentRole !== undefined ? parentRole : role.parentRole;
  role.isActive = isActive !== undefined ? isActive : role.isActive;
  role.isSuperAdmin = isSuperAdmin !== undefined ? isSuperAdmin : role.isSuperAdmin;

  await role.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Role updated successfully',
    role,
  });
});

// Soft delete a role (set isActive to false)
exports.deleteRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  // Check if role exists
  const role = await Role.findById(roleId);
  if (!role) {
    throw new APIError('Role not found', StatusCodes.NOT_FOUND);
  }

  // Check if role is already inactive
  if (!role.isActive) {
    throw new APIError('Role is already deleted', StatusCodes.BAD_REQUEST);
  }

  // Check if role is referenced by other active roles (parentRole)
  const dependentRoles = await Role.find({ parentRole: roleId, isActive: true });
  if (dependentRoles.length > 0) {
    throw new APIError('Cannot delete role with dependent active child roles', StatusCodes.BAD_REQUEST);
  }

  // Soft delete
  role.isActive = false;
  await role.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Role soft deleted successfully',
  });
});

// Permanent delete a role (only if already soft deleted)
exports.permanentDeleteRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  // Check if role exists
  const role = await Role.findById(roleId);
  if (!role) {
    throw new APIError('Role not found', StatusCodes.NOT_FOUND);
  }

  // Check if role is already soft deleted
  if (role.isActive) {
    throw new APIError('Role must be soft deleted before permanent deletion', StatusCodes.BAD_REQUEST);
  }

  // Check if role is referenced by other roles (parentRole), even inactive ones
  const dependentRoles = await Role.find({ parentRole: roleId });
  if (dependentRoles.length > 0) {
    throw new APIError('Cannot permanently delete role with dependent child roles', StatusCodes.BAD_REQUEST);
  }

  // Permanent delete
  await role.deleteOne();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Role permanently deleted successfully',
  });
});

// Restore a soft deleted role (set isActive to true)
exports.restoreRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  // Check if role exists
  const role = await Role.findById(roleId);
  if (!role) {
    throw new APIError('Role not found', StatusCodes.NOT_FOUND);
  }

  // Check if role is already active
  if (role.isActive) {
    throw new APIError('Role is already active', StatusCodes.BAD_REQUEST);
  }

  // Optional: Check if parentRole is active if needed
  if (role.parentRole) {
    const parentRoleExists = await Role.findById(role.parentRole);
    if (!parentRoleExists || !parentRoleExists.isActive) {
      throw new APIError('Parent role must be active to restore this role', StatusCodes.BAD_REQUEST);
    }
  }

  // Restore
  role.isActive = true;
  await role.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Role restored successfully',
    role,
  });
});

// Get a single role by ID
exports.getRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;

  const role = await Role.findById(roleId)
    .populate('category', 'name slug')
    .populate('parentRole', 'name code');
  if (!role) {
    throw new APIError('Role not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Role retrieved successfully',
    role,
  });
});

// Get all roles with pagination and filtering (default to active roles)
exports.getAllRoles = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { category, isActive } = req.query;

  // Build filter (default to isActive: true if not specified)
  const filter = {};
  if (category) {
    filter.category = category;
  }
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  } else {
    filter.isActive = true;
  }

  // Query roles
  const roles = await Role.find(filter)
    .populate('category', 'name slug')
    .populate('parentRole', 'name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Role.countDocuments(filter);

  res.status(StatusCodes.OK).json({
    success: true,
    count: roles.length,
    message: `${roles.length} roles found`,
    pagination: {
      totalRecords: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      perPage: limit,
    },
    roles,
  });
});