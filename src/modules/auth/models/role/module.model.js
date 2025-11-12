// models/role/module.model.js
const mongoose = require('mongoose');
const { Permission } = require('./permission.model'); // Import Permission model

const SubModuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  route: { type: String, required: true, trim: true },
  icon: { type: String, trim: true, default: 'fas fa-circle' },
  isActive: { type: Boolean, default: true },
  position: { type: Number, default: 0 },
  dashboardView: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { _id: true });

const ModuleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 50 },
  slug: { type: String, unique: true, lowercase: true, trim: true },
  description: { type: String, trim: true, maxlength: 300 },
  icon: { type: String, trim: true, default: 'fas fa-folder' },
  route: { type: String, unique: true, trim: true, required: true },
  subModules: [SubModuleSchema],
  isActive: { type: Boolean, default: true },
  position: { type: Number, default: 0 },
  dashboardView: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

// Auto-generate slug
ModuleSchema.pre('save', function (next) {
  if (this.isModified('name') && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

/**
 * 🔁 Auto-update related permissions when module or submodules are soft deleted
 */
ModuleSchema.pre('save', async function (next) {
  try {
    // Handle full module deletion
    if (this.isModified('isDeleted') && this.isDeleted === true) {
      await Permission.updateMany(
        { moduleId: this._id, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date() } }
      );
    }

    // Handle submodule deletions
    if (this.isModified('subModules')) {
      const deletedSubs = this.subModules.filter(sm => sm.isDeleted === true);
      if (deletedSubs.length > 0) {
        const subIds = deletedSubs.map(sm => sm._id);
        await Permission.updateMany(
          { subModuleId: { $in: subIds }, isDeleted: false },
          { $set: { isDeleted: true, deletedAt: new Date() } }
        );
      }
    }

    next();
  } catch (err) {
    console.error('❌ Error auto-updating permissions on module/submodule delete:', err);
    next(err);
  }
});

const Module = mongoose.model('Module', ModuleSchema);
module.exports = { Module };
