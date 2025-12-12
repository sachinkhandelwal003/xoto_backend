// utils/logActivity.js

const ActivityLog = require('../modules/auth/models/history/ActivityLog.model');

const logActivity = async ({
  entity_type,
  entity_id,
  performed_by,
  action_type,
  field_changed = null,
  old_value = null,
  new_value = null,
  description = null,
  platform = 'ecommerce',
  module = null,
  reason = null,
  req = null  // For IP/user-agent
}) => {
  try {
    await ActivityLog.create({
      entity_type,
      entity_id,
      performed_by,
      performed_by_role: req?.user?.role || 'system',
      action_type,
      field_changed,
      old_value,
      new_value,
      description,
      platform,
      module,
      reason,
      ip_address: req?.ip || req?.connection?.remoteAddress,
      user_agent: req?.headers['user-agent']
    });
  } catch (error) {
    console.error('Activity log failed:', error);
  }
};

module.exports = logActivity;