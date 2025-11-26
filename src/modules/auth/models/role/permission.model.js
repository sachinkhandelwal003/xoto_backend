// models/role/permission.model.js
const mongoose = require('mongoose');

const PermissionSchema = new mongoose.Schema({
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role",
    required: true
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true
  },
  subModuleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module.subModules',
    default: null
  },
  canAdd: { type: Number, enum: [0, 1], default: 0 },
  canEdit: { type: Number, enum: [0, 1], default: 0 },
  canView: { type: Number, enum: [0, 1], default: 0 },
  canDelete: { type: Number, enum: [0, 1], default: 0 },
  canViewAll: { type: Number, enum: [0, 1], default: 0 },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },  // Soft delete
  deletedAt: { type: Date }
}, { timestamps: true });

// Unique combination: (role + module + subModule)
PermissionSchema.index(
  { roleId: 1, moduleId: 1, subModuleId: 1 },
  { unique: true, sparse: true }
);

const Permission = mongoose.model("Permission", PermissionSchema);
module.exports = { Permission };
