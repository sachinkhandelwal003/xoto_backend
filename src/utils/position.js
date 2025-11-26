// utils/position.js
const autoAssignPosition = async (Model, { position } = {}, field = 'position') => {
  if (typeof position === 'number' && position >= 0) {
    await Model.updateMany(
      { [field]: { $gte: position }, isDeleted: false },
      { $inc: { [field]: 1 } }
    );
    return position;
  }
  const last = await Model.findOne({ isDeleted: false })
    .sort({ [field]: -1 })
    .select(field)
    .lean();
  return last ? last[field] + 1 : 0;
};

const autoSubModulePosition = (subModules, { position } = {}) => {
  if (typeof position === 'number' && position >= 0) {
    subModules.forEach(s => {
      if (s.position >= position && !s.isDeleted) s.position += 1;
    });
    return position;
  }
  const active = subModules.filter(s => !s.isDeleted);
  const max = active.length ? Math.max(...active.map(s => s.position)) : -1;
  return max + 1;
};

module.exports = { autoAssignPosition,autoSubModulePosition };