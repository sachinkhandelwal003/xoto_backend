// controllers/module/module.controller.js
const asyncHandler = require('../../../../utils/asyncHandler');
const { Module } = require('../../models/role/module.model');
const { Permission } = require('../../models/role/permission.model');
const APIError = require('../../../../utils/errorHandler');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const { autoAssignPosition, autoSubModulePosition } = require('../../../../utils/position');

// CREATE (bulk + auto position)
exports.createModule = asyncHandler(async (req, res) => {
  const modules = Array.isArray(req.body) ? req.body : [req.body];
  const created = [];

  for (const data of modules) {
    const { name, description, icon, route, subModules = [], position } = data;

    const modulePos = await autoAssignPosition(Module, { position });

    const subs = [];
    let maxSubPos = -1;
    for (const sub of subModules) {
      const suppliedPos = typeof sub.position === 'number' ? sub.position : null;
      const nextPos = suppliedPos !== null && suppliedPos >= 0 ? suppliedPos : maxSubPos + 1;

      if (suppliedPos !== null && suppliedPos >= 0) {
        subs.forEach(s => { if (s.position >= suppliedPos) s.position += 1; });
      }
      maxSubPos = Math.max(maxSubPos, nextPos);

      subs.push({
        name: sub.name,
        route: sub.route,
        icon: sub.icon || 'fas fa-circle',
        isActive: sub.isActive ?? true,
        position: nextPos,
        dashboardView: sub.dashboardView ?? false
      });
    }

    const module = await Module.create({
      name, description, icon: icon || 'fas fa-folder', route,
      subModules: subs, position: modulePos
    });

    created.push(module);
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: `${created.length} module(s) created`,
    data: created
  });
});

// UPDATE (any field + position + subModules)
exports.updateModule = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const updates = req.body;

  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) {
    throw new APIError('Module not found', StatusCodes.NOT_FOUND);
  }

  // Uniqueness: name & route
  if (updates.name || updates.route) {
    const query = { _id: { $ne: moduleId }, isDeleted: false };
    if (updates.name) query.name = updates.name;
    if (updates.route) query.route = updates.route;
    const conflict = await Module.findOne(query);
    if (conflict) throw new APIError('Name or route already in use', StatusCodes.CONFLICT);
  }

  // POSITION: shift others if changed
  if (typeof updates.position === 'number' && updates.position !== module.position) {
    const oldPos = module.position;
    const newPos = updates.position;

    if (newPos > oldPos) {
      await Module.updateMany(
        { position: { $gt: oldPos, $lte: newPos }, isDeleted: false },
        { $inc: { position: -1 } }
      );
    } else if (newPos < oldPos) {
      await Module.updateMany(
        { position: { $gte: newPos, $lt: oldPos }, isDeleted: false },
        { $inc: { position: 1 } }
      );
    }
    module.position = newPos;
  }

  // SUB-MODULES: full replace + auto position
  if (Array.isArray(updates.subModules)) {
    const subs = [];
    let maxPos = -1;
    for (const sub of updates.subModules) {
      const pos = typeof sub.position === 'number' ? sub.position : maxPos + 1;
      if (typeof sub.position === 'number') {
        subs.forEach(s => { if (s.position >= pos) s.position += 1; });
      }
      maxPos = Math.max(maxPos, pos);
      subs.push({ ...sub, position: pos });
    }
    module.subModules = subs;
  }

  Object.assign(module, updates);
  if (updates.name) module.slug = updates.name.toLowerCase().replace(/\s+/g, '-');

  await module.save();

  res.json({ success: true, data: module });
});

// REORDER MODULES (drag & drop)
exports.reorderModules = asyncHandler(async (req, res) => {
  const { modules } = req.body;
  if (!Array.isArray(modules)) throw new APIError('Invalid input', StatusCodes.BAD_REQUEST);

  for (const { _id, position } of modules) {
    await Module.updateOne({ _id, isDeleted: false }, { position });
  }
  res.json({ success: true, message: 'Reordered' });
});

// SOFT DELETE
exports.deleteModule = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);

  const perms = await Permission.find({ moduleId, isDeleted: false });
  if (perms.length) throw new APIError('Cannot delete: has permissions', StatusCodes.BAD_REQUEST);

  module.isDeleted = true;
  module.deletedAt = new Date();
  await module.save();

  // Close position gap
  await Module.updateMany(
    { position: { $gt: module.position }, isDeleted: false },
    { $inc: { position: -1 } }
  );

  res.json({ success: true, message: 'Module soft-deleted' });
});

// CREATE SUB-MODULE(S) in existing module
exports.createSubModule = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const subModules = Array.isArray(req.body) ? req.body : [req.body];

  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);

  const created = [];

  for (const data of subModules) {
    const { name, route, icon, isActive, dashboardView, position } = data;

    // Check route uniqueness globally
    const routeExists = await Module.findOne({
      'subModules.route': route,
      _id: { $ne: moduleId },
      'subModules.isDeleted': false
    });
    if (routeExists) throw new APIError(`Sub-module route "${route}" already exists`, StatusCodes.CONFLICT);

    const pos = autoSubModulePosition(module.subModules, { position });

    const sub = {
      name,
      route,
      icon: icon || 'fas fa-circle',
      isActive: isActive ?? true,
      dashboardView: dashboardView ?? false,
      position: pos
    };

    module.subModules.push(sub);
    created.push(sub);
  }

  await module.save();
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: `${created.length} sub-module(s) created`,
    data: created
  });
});

// UPDATE SUB-MODULE
exports.updateSubModule = asyncHandler(async (req, res) => {
  const { moduleId, subModuleId } = req.params;
  const updates = req.body;

  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);

  const sub = module.subModules.id(subModuleId);
  if (!sub || sub.isDeleted) throw new APIError('Sub-module not found', StatusCodes.NOT_FOUND);

  if (updates.route && updates.route !== sub.route) {
    const exists = await Module.findOne({
      'subModules.route': updates.route,
      _id: { $ne: moduleId },
      'subModules.isDeleted': false
    });
    if (exists) throw new APIError('Route already in use', StatusCodes.CONFLICT);
  }

  if (typeof updates.position === 'number' && updates.position !== sub.position) {
    const oldPos = sub.position;
    const newPos = updates.position;

    if (newPos > oldPos) {
      module.subModules.forEach(s => {
        if (s.position > oldPos && s.position <= newPos && !s.isDeleted) s.position -= 1;
      });
    } else if (newPos < oldPos) {
      module.subModules.forEach(s => {
        if (s.position >= newPos && s.position < oldPos && !s.isDeleted) s.position += 1;
      });
    }
    sub.position = newPos;
  }

  Object.assign(sub, updates);
  await module.save();

  res.json({ success: true, data: sub });
});

// SOFT DELETE SUB-MODULE
exports.deleteSubModule = asyncHandler(async (req, res) => {
  const { moduleId, subModuleId } = req.params;

  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);

  const sub = module.subModules.id(subModuleId);
  if (!sub || sub.isDeleted) throw new APIError('Sub-module not found', StatusCodes.NOT_FOUND);

  sub.isDeleted = true;
  sub.deletedAt = new Date();

  // Close gap
  module.subModules.forEach(s => {
    if (s.position > sub.position && !s.isDeleted) s.position -= 1;
  });

  await module.save();
  res.json({ success: true, message: 'Sub-module soft-deleted' });
});

// RESTORE SUB-MODULE
exports.restoreSubModule = asyncHandler(async (req, res) => {
  const { moduleId, subModuleId } = req.params;

  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);

  const sub = module.subModules.id(subModuleId);
  if (!sub || !sub.isDeleted) throw new APIError('Sub-module not deleted', StatusCodes.BAD_REQUEST);

  sub.isDeleted = false;
  sub.deletedAt = null;

  const newPos = autoSubModulePosition(module.subModules, { position: sub.position });
  sub.position = newPos;

  await module.save();
  res.json({ success: true, data: sub });
});

// REORDER SUB-MODULES (drag & drop)
exports.reorderSubModules = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const { subModules } = req.body; // [{ _id, position }]

  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);

  const map = new Map(subModules.map(s => [s._id.toString(), s.position]));
  module.subModules.forEach(sub => {
    const pos = map.get(sub._id.toString());
    if (typeof pos === 'number') sub.position = pos;
  });

  // Normalize
  const active = module.subModules.filter(s => !s.isDeleted);
  active.sort((a, b) => a.position - b.position);
  active.forEach((s, i) => s.position = i);

  await module.save();
  res.json({ success: true, message: 'Sub-modules reordered' });
});

// RESTORE
exports.restoreModule = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId);
  if (!module || !module.isDeleted) throw new APIError('Module not deleted', StatusCodes.BAD_REQUEST);

  module.isDeleted = false;
  module.deletedAt = null;

  // Re-open position
  const newPos = await autoAssignPosition(Module, { position: module.position });
  module.position = newPos;

  await module.save();
  res.json({ success: true, data: module });
});

// GET ALL (excludes deleted)
// GET ALL (excludes deleted)
exports.getAllModules = asyncHandler(async (req, res) => {
  let { page, limit, isActive } = req.query;

  const filter = { isDeleted: false };
  if (isActive !== undefined) filter.isActive = isActive === "true";

  // If LIMIT is not provided → return ALL
  const usePagination = !!limit;

  let modules;
  let total;

  if (usePagination) {
    page = Number(page) || 1;
    limit = Number(limit);

    total = await Module.countDocuments(filter);

    modules = await Module.find(filter)
      .sort({ position: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
  } else {
    // No limit → return ALL without pagination
    modules = await Module.find(filter).sort({ position: 1 });
    total = modules.length;
  }

  res.json({
    success: true,
    data: modules,
    pagination: usePagination
      ? { page, limit, total }
      : null
  });
});

// GET MENU (active + not deleted)
exports.getMenu = asyncHandler(async (req, res) => {
  const filter = { isActive: true, isDeleted: false };
  const modules = await Module.find(filter).sort({ position: 1 });

  const menu = modules.map(m => ({
    ...m.toObject(),
    subModules: m.subModules
      .filter(s => s.isActive && !s.isDeleted)
      .sort((a, b) => a.position - b.position)
  }));

  res.json({ success: true, data: menu });
});

// GET SINGLE MODULE (added for completeness – used by validateGetModule)
exports.getModule = asyncHandler(async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId);
  if (!module || module.isDeleted) throw new APIError('Module not found', StatusCodes.NOT_FOUND);
  res.json({ success: true, data: module });
});