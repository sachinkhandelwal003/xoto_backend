// models/ActivityLog.model.js (Unified History for All Platforms/Dashboards)

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  // Entity Info (Polymorphic - works for Vendor, Order, Product, User, etc.)
  entity_type: {
    type: String,
    required: true,
    enum: [
      'VendorB2C',      // E-commerce Vendor
      'Order',          // E-commerce Order
      'Product',        // E-commerce Product
      'User',           // General User
      'Admin',          // Admin Actions
      'Dashboard',      // Dashboard Views/Access
      'Payment',        // Payments
      'Inventory',      // Stock Updates
      'Category',       // Categories
      'Review',         // Reviews/Ratings
      'Other'           // Custom/Platform-specific
    ]
  },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // Actor Info
  performed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // or 'Vendor'/'Admin' based on role
    required: true
  },
  performed_by_role: {
    type: String,
    enum: ['vendor', 'admin', 'customer', 'system', 'guest'],
    default: 'vendor'
  },

  // Action Details
  action_type: {
    type: String,
    required: true,
    enum: [
      'created',          // New entity created
      'updated',          // Field updated
      'deleted',          // Entity deleted
      'status_changed',   // e.g., approved/rejected
      'document_uploaded',// File/doc added
      'login',            // User logged in
      'logout',           // User logged out
      'view',             // Dashboard/page viewed
      'payment_processed',// Payment success/fail
      'order_placed',     // Order created
      'inventory_updated',// Stock change
      'review_added',     // Review posted
      'error',            // System error/log
      'custom'            // Platform-specific
    ]
  },
  field_changed: { type: String },  // e.g., 'store_details.store_name'
  old_value: { type: mongoose.Schema.Types.Mixed },
  new_value: { type: mongoose.Schema.Types.Mixed },
  description: { type: String, trim: true },  // Human-readable summary

  // Platform/Dashboard Context
  platform: {
    type: String,
    enum: ['ecommerce', 'admin_dashboard', 'vendor_portal', 'customer_app', 'mobile', 'web', 'other'],
    default: 'ecommerce'
  },
  module: { type: String },  // e.g., 'vendor_onboarding', 'order_management'

  // Additional Metadata
  reason: { type: String, trim: true },  // e.g., rejection reason
  ip_address: { type: String },
  user_agent: { type: String },
  session_id: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }  // Extra data (JSON)
}, {
  timestamps: true  // createdAt, updatedAt
});

// Indexes for Fast Queries (Admin Dashboard, Vendor History, etc.)
activityLogSchema.index({ entity_id: 1, entity_type: 1, createdAt: -1 });
activityLogSchema.index({ performed_by: 1, createdAt: -1 });
activityLogSchema.index({ action_type: 1, platform: 1 });
activityLogSchema.index({ platform: 1, module: 1 });
activityLogSchema.index({ createdAt: -1 });  // Recent activity

module.exports = mongoose.model('ActivityLog', activityLogSchema);