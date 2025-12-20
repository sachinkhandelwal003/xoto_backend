const ActivityLog = require('../modules/auth/models/history/ActivityLog.model');

const logActivity = async ({
  entity_type,
  entity_id,
  module_id,
  action_type,
  description,
  field_changed,
  old_value,
  new_value,
  metadata,
  req
}) => {
  try {
    if (!req?.user) return;

    const tokenUser = req.user;

    await ActivityLog.create({
      entity_type,
      entity_id,
      module_id,

      performed_by: tokenUser.id,
      performed_by_type: tokenUser.type || 'system',

      role_snapshot: tokenUser.role
        ? {
            id: tokenUser.role.id,
            code: tokenUser.role.code,
            name: tokenUser.role.name,
            isSuperAdmin: tokenUser.role.isSuperAdmin
          }
        : null,

      action_type,
      description,
      field_changed,
      old_value,
      new_value,
      metadata,

      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });
  } catch (err) {
    console.error('❌ ActivityLog Error:', err.message);
  }
};

module.exports = logActivity;
