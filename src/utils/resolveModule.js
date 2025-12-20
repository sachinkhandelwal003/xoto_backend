const { Module } = require('../modules/auth/models/role/module.model');

const resolveModule = async (slug) => {
  const module = await Module.findOne({
    slug,
    isActive: true,
    isDeleted: false
  }).select('_id');

  return module ? module._id : null;
};

module.exports = { resolveModule };
