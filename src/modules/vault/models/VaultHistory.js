const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    // Unique identifier
    historyId: { type: String, unique: true, required: true },
    
    // ==================== ENTITY INFORMATION ====================
    entityType: {
      type: String,
      enum: [
        'Lead', 'Case', 'Proposal', 'Client', 'Agent', 'Partner', 
        'Commission', 'Document', 'User', 'Admin', 'Payment', 'BankForm',
        'XotoAdvisor', 'MortgageOps'  // ✅ ADDED
      ],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    entityName: { type: String, default: null },
    
    // ==================== ACTION INFORMATION ====================
    action: {
      type: String,
      enum: [
        // Lead actions
        'LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_STATUS_CHANGED', 'LEAD_CONVERTED', 'LEAD_DELETED',
        'LEAD_CREATED_BY_PARTNER', 'LEAD_CREATED_FROM_WEBSITE', 'LEAD_ASSIGNED_TO_ADVISOR',  // ✅ ADDED
        // Case actions
        'CASE_CREATED', 'CASE_UPDATED', 'CASE_STATUS_CHANGED', 'CASE_SUBMITTED', 'CASE_DELETED',
        // Proposal actions
        'PROPOSAL_CREATED', 'PROPOSAL_SENT', 'PROPOSAL_VIEWED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'PROPOSAL_EXPIRED',
        // Agent actions
        'AGENT_REGISTERED', 'AGENT_VERIFIED', 'AGENT_REJECTED', 'AGENT_SUSPENDED', 'AGENT_ACTIVATED', 'AGENT_DELETED',
        // Partner actions
        'PARTNER_ONBOARDED', 'PARTNER_UPDATED', 'PARTNER_SUSPENDED', 'PARTNER_ACTIVATED',
        // Document actions
        'DOCUMENT_UPLOADED', 'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED', 'DOCUMENT_DELETED', 'DOCUMENT_REUPLOADED',  // ✅ ADDED
        // Commission actions
        'COMMISSION_CREATED', 'COMMISSION_CONFIRMED', 'COMMISSION_PAID', 'COMMISSION_FAILED',
        // Bank actions
        'BANK_SUBMITTED', 'BANK_APPROVED', 'BANK_REJECTED',
        // Client actions
        'CLIENT_PORTAL_ACCESS_GRANTED', 'CLIENT_LOGGED_IN', 'CLIENT_PASSWORD_CHANGED',
        // Auth actions
        'LOGIN', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED',
        // Employee actions
        'ADVISOR_CREATED', 'ADVISOR_SUSPENDED', 'ADVISOR_ACTIVATED', 'ADVISOR_DELETED',  // ✅ ADDED
        'OPS_CREATED', 'OPS_SUSPENDED', 'OPS_ACTIVATED', 'OPS_DELETED',  // ✅ ADDED
        'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED',  // ✅ ADDED
      ],
      required: true,
      index: true,
    },
    
    // ==================== STATUS CHANGES ====================
    previousStatus: { type: String, default: null },
    newStatus: { type: String, default: null },
    
    // ==================== WHO PERFORMED THE ACTION ====================
    performedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
      userRole: { 
        type: String, 
        enum: [
          'Admin', 'Partner', 'FreelanceAgent', 'PartnerAffiliatedAgent', 
          'IndividualPartner',  // ✅ ADDED
          'XotoAdvisor',        // ✅ ADDED
          'MortgageOps',        // ✅ ADDED
          'Client', 'Agent', 'System', 'XotoAdmin', 'Website'  // ✅ ADDED 'Website'
        ], 
        required: true 
      },
      userName: { type: String, required: true },
      userEmail: { type: String, default: null },
      userType: { type: String, default: null },
    },
    
    // ==================== WHAT CHANGED ====================
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    
    // ==================== DESCRIPTION & NOTES ====================
    description: { type: String, required: true },
    notes: { type: String, default: null },
    
    // ==================== TECHNICAL DETAILS ====================
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    requestId: { type: String, default: null },
    
    // ==================== METADATA ====================
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    
    // ==================== IMPORTANCE LEVEL ====================
    importance: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    
    // ==================== CATEGORY ====================
    category: {
      type: String,
      enum: [
        'BUSINESS_TRANSACTION', 'USER_ACTION', 'SYSTEM_EVENT', 'SECURITY_EVENT', 
        'DOCUMENT_EVENT', 'COMMUNICATION_EVENT', 'PAYMENT_EVENT'
      ],
      default: 'USER_ACTION',
    },
    
    // ==================== SOFT DELETE ====================
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { 
    timestamps: true,
    expireAfterSeconds: 63072000,
  }
);

// ==================== INDEXES ====================
historySchema.index({ createdAt: -1 });
historySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
historySchema.index({ performedBy: 1, createdAt: -1 });
historySchema.index({ action: 1, createdAt: -1 });
historySchema.index({ importance: 1, createdAt: -1 });
historySchema.index({ category: 1, createdAt: -1 });
historySchema.index({ userRole: 1, createdAt: -1 });

// ==================== VIRTUALS ====================
historySchema.virtual('formattedDate').get(function () {
  return this.createdAt.toLocaleString('en-AE', { timeZone: 'Asia/Dubai' });
});

historySchema.virtual('formattedDateISO').get(function () {
  return this.createdAt.toISOString();
});

historySchema.virtual('timeAgo').get(function () {
  const seconds = Math.floor((new Date() - this.createdAt) / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return `${years} years ago`;
});

// ==================== STATIC METHODS ====================

historySchema.statics.log = async function (data) {
  const historyId = `HIST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return this.create({ historyId, ...data });
};

historySchema.statics.getEntityHistory = async function (entityType, entityId, options = {}) {
  const { limit = 50, skip = 0, action = null, fromDate = null, toDate = null } = options;
  let query = { entityType, entityId, isDeleted: false };
  if (action) query.action = action;
  if (fromDate) query.createdAt = { $gte: fromDate };
  if (toDate) query.createdAt = { ...query.createdAt, $lte: toDate };
  const total = await this.countDocuments(query);
  const data = await this.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
  return { data, total, skip, limit };
};

historySchema.statics.getUserTimeline = async function (userId, options = {}) {
  const { limit = 50, skip = 0, fromDate = null, toDate = null } = options;
  let query = { 'performedBy.userId': userId, isDeleted: false };
  if (fromDate) query.createdAt = { $gte: fromDate };
  if (toDate) query.createdAt = { ...query.createdAt, $lte: toDate };
  const total = await this.countDocuments(query);
  const data = await this.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
  return { data, total, skip, limit };
};

historySchema.statics.getDashboardSummary = async function (limit = 20) {
  return this.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(limit).lean();
};

historySchema.statics.getActionStats = async function (fromDate, toDate) {
  const match = { isDeleted: false };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = fromDate;
    if (toDate) match.createdAt.$lte = toDate;
  }
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$action', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

historySchema.statics.getEntityStats = async function (fromDate, toDate) {
  const match = { isDeleted: false };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = fromDate;
    if (toDate) match.createdAt.$lte = toDate;
  }
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$entityType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

historySchema.statics.getActivityByRole = async function (fromDate, toDate) {
  const match = { isDeleted: false };
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = fromDate;
    if (toDate) match.createdAt.$lte = toDate;
  }
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$performedBy.userRole', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

historySchema.statics.searchHistory = async function (searchTerm, options = {}) {
  const { limit = 50, skip = 0 } = options;
  return this.find({
    isDeleted: false,
    $or: [
      { description: { $regex: searchTerm, $options: 'i' } },
      { entityName: { $regex: searchTerm, $options: 'i' } },
      { 'performedBy.userName': { $regex: searchTerm, $options: 'i' } },
      { notes: { $regex: searchTerm, $options: 'i' } },
    ],
  }).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

// ==================== INSTANCE METHODS ====================
historySchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

const History = mongoose.models.VaultHistory || mongoose.model('VaultHistory', historySchema);
module.exports = History;