const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  /* ===== ENTITY ===== */
  entity_type: {
    type: String,
    enum: ['Estimate', 'Type', 'Category', 'Project', 'User', 'Other'],
    required: true
  },

  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  /* ===== MODULE CONTEXT ===== */
  module_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true,
    index: true
  },

  /* ===== ACTOR (FROM TOKEN) ===== */
  performed_by: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  performed_by_type: {
    type: String,
    enum: ['user', 'vendor', 'freelancer', 'system'],
    required: true
  },

  /* ===== ROLE SNAPSHOT ===== */
  role_snapshot: {
    id: mongoose.Schema.Types.ObjectId,
    code: String,
    name: String,
    isSuperAdmin: Boolean
  },

  /* ===== ACTION ===== */
  action_type: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'status_changed', 'custom'],
    required: true
  },

  description: {
    type: String,
    trim: true
  },

  field_changed: String,
  old_value: mongoose.Schema.Types.Mixed,
  new_value: mongoose.Schema.Types.Mixed,

  metadata: mongoose.Schema.Types.Mixed,

  platform: {
    type: String,
    enum: ['admin_dashboard', 'vendor_portal', 'customer_app'],
    default: 'admin_dashboard'
  },

  ip_address: String,
  user_agent: String
}, {
  timestamps: true
});

/* ===== INDEXES ===== */
activityLogSchema.index({ module_id: 1, createdAt: -1 });
activityLogSchema.index({ entity_id: 1, createdAt: -1 });
activityLogSchema.index({ performed_by: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
