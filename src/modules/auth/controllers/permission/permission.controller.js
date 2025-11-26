// controllers/permission/permission.controller.js
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { APIError } = require('../../../../utils/errorHandler');
const { Permission } = require('../../models/role/permission.model');
const { Role } = require('../../models/role/role.model');
const { Module } = require('../../models/role/module.model');
const asyncHandler = require('../../../../utils/asyncHandler');

// Helper: Normalize subModuleId (null if undefined)
const normalizeSubModuleId = (id) => (id === undefined || id === 'null' ? null : id);

// CREATE (Bulk – **no transaction**)
exports.createPermission = asyncHandler(async (req, res) => {
  const permissionsData = Array.isArray(req.body) ? req.body : [req.body];
  const created = [];

  for (const data of permissionsData) {
    const {
      roleId,
      moduleId,
      subModuleId: rawSubModuleId,
      canAdd = 0,
      canEdit = 0,
      canView = 0,
      canDelete = 0,
      canViewAll = 0,
    } = data;

    const subModuleId = normalizeSubModuleId(rawSubModuleId);

    // Validate Role & Module
    const [role, module] = await Promise.all([
      Role.findById(roleId),
      Module.findById(moduleId),
    ]);

    if (!role || !module) {
      throw new APIError('Invalid role or module', StatusCodes.NOT_FOUND);
    }

    // Validate subModuleId if provided
    if (subModuleId) {
      const sub = module.subModules.id(subModuleId);
      if (!sub || sub.isDeleted) {
        throw new APIError('Submodule not found or deleted', StatusCodes.NOT_FOUND);
      }
    }

    // Check duplicate (exact match)
    const exists = await Permission.findOne({
      roleId,
      moduleId,
      subModuleId,
      isDeleted: false,
    });

    if (exists) {
      throw new APIError(
        `Permission already exists for role '${role.name}', module '${module.name}'${
          subModuleId ? ' (submodule)' : ''
        }`,
        StatusCodes.CONFLICT
      );
    }

    const permission = await Permission.create({
      roleId,
      moduleId,
      subModuleId,
      canAdd: canAdd ? 1 : 0,
      canEdit: canEdit ? 1 : 0,
      canView: canView ? 1 : 0,
      canDelete: canDelete ? 1 : 0,
      canViewAll: canViewAll ? 1 : 0,
      grantedBy: req.user._id,
    });

    created.push(permission);
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: `${created.length} permission(s) created successfully`,
    permissions: created,
  });
});

// UPDATE (Safe & Partial)
exports.updatePermission = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;
  const updates = req.body;

  const permission = await Permission.findById(permissionId);
  if (!permission || permission.isDeleted) {
    throw new APIError('Permission not found', StatusCodes.NOT_FOUND);
  }

  const allowed = ['canAdd', 'canEdit', 'canView', 'canDelete', 'canViewAll', 'isActive'];
  allowed.forEach((field) => {
    if (updates[field] !== undefined) {
      permission[field] = updates[field];
    }
  });

  await permission.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Permission updated successfully',
    permission,
  });
});

// DELETE
exports.deletePermission = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  const permission = await Permission.findById(permissionId);
  if (!permission || permission.isDeleted) {
    throw new APIError('Permission not found', StatusCodes.NOT_FOUND);
  }

  await permission.deleteOne();
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Permission deleted permanently',
  });
});

exports.getPermission = asyncHandler(async (req, res) => {
  const { permissionId } = req.params;

  const permission = await Permission.findById(permissionId)
    .populate('roleId', 'name code')
    .populate('moduleId');
  if (!permission) {
    throw new APIError('Permission not found', StatusCodes.NOT_FOUND);
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Permission retrieved successfully',
    permission
  });
});

exports.getAllPermissions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { roleCode, moduleId, isActive } = req.query;

  const filter = { isDeleted: false };

  // ✅ Step 1: Filter by Role Code
  if (roleCode) {
    const role = await Role.findOne({ code: roleCode.trim() });
    if (!role) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Role not found with the provided code',
      });
    }
    filter.roleId = role._id;
  }

  if (moduleId) filter.moduleId = moduleId;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  // ✅ Step 2: Fetch permissions
  const permissions = await Permission.find(filter)
    .populate('roleId', 'name code')
    .populate('moduleId', 'name route icon subModules')
    .populate('grantedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // ✅ Step 3: Extract relevant submodule (only the one matching subModuleId)
  const formattedPermissions = permissions.map((perm) => {
    const subModule =
      perm.subModuleId && perm.moduleId?.subModules?.length
        ? perm.moduleId.subModules.find(
            (s) => s._id.toString() === perm.subModuleId.toString()
          )
        : null;

    return {
      _id: perm._id,
      role: perm.roleId,
      module: {
        _id: perm.moduleId?._id,
        name: perm.moduleId?.name,
        route: perm.moduleId?.route,
        icon: perm.moduleId?.icon,
      },
      subModule: subModule
        ? {
            _id: subModule._id,
            name: subModule.name,
            route: subModule.route,
            icon: subModule.icon,
          }
        : null,
      permissions: {
        canAdd: perm.canAdd,
        canEdit: perm.canEdit,
        canView: perm.canView,
        canDelete: perm.canDelete,
        canViewAll: perm.canViewAll,
      },
      isActive: perm.isActive,
      grantedBy: perm.grantedBy,
      createdAt: perm.createdAt,
    };
  });

  // ✅ Step 4: Count and return
  const total = await Permission.countDocuments(filter);

  res.status(StatusCodes.OK).json({
    success: true,
    count: formattedPermissions.length,
    message: `${formattedPermissions.length} permissions found`,
    pagination: {
      totalRecords: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      perPage: limit,
    },
    permissions: formattedPermissions,
  });
});




// ✅ YOUR CODE IS PERFECT - Add this endpoint for frontend
exports.getMyPermissions = asyncHandler(async (req, res) => {
  try {
    // 🧩 Get roleId from authenticated user (works with both protectMulti and protectFreelancer)
    const roleId = req.user?.role?._id || req.user?.role?.id;
    
    console.log('👤 User in getMyPermissions:', {
      userId: req.user?._id,
      userType: req.user?.constructor?.modelName,
      role: req.user?.role,
      roleId: roleId
    });

    if (!roleId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'User role not found in token. Please log in again.',
      });
    }

    const permissions = await Permission.find({
      roleId,
      isActive: true,
      isDeleted: false,
    })
      .populate('roleId', 'name code')
      .populate('moduleId', 'name route icon subModules')
      .populate('grantedBy', 'name email')
      .lean();

    console.log(`📋 Found ${permissions.length} permissions for role ${roleId}`);

    const formatted = permissions.map((perm) => {
      const subModule =
        perm.subModuleId && perm.moduleId?.subModules?.length
          ? perm.moduleId.subModules.find(
              (s) => s._id.toString() === perm.subModuleId.toString()
            )
          : null;

      return {
        _id: perm._id,
        role: perm.roleId,
        module: {
          _id: perm.moduleId?._id,
          name: perm.moduleId?.name,
          route: perm.moduleId?.route,
          icon: perm.moduleId?.icon,
        },
        subModule: subModule
          ? {
              _id: subModule._id,
              name: subModule.name,
              route: subModule.route,
              icon: subModule.icon,
            }
          : null,
        permissions: {
          canAdd: perm.canAdd,
          canEdit: perm.canEdit,
          canView: perm.canView,
          canDelete: perm.canDelete,
          canViewAll: perm.canViewAll,
        },
      };
    });

    res.status(StatusCodes.OK).json({
      success: true,
      total: formatted.length,
      permissions: formatted,
    });
  } catch (error) {
    console.error('❌ Error in getMyPermissions:', error);
    throw error;
  }
});