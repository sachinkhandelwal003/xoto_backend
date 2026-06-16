

import mongoose from 'mongoose';

// ══════════════════════════════════════════════════════════════════
// ENTITY TYPES — what is being audited
// ══════════════════════════════════════════════════════════════════
export const ENTITY_TYPES = {
  LEAD:        'LEAD',
  CASE:        'CASE',
  APPLICATION: 'APPLICATION',
  DOCUMENT:    'DOCUMENT',
  COMMISSION:  'COMMISSION',
  USER:        'USER',
  OPS:         'OPS',
  PARTNER:     'PARTNER',
  AGENT:       'AGENT',
  SYSTEM:      'SYSTEM',
};

// ══════════════════════════════════════════════════════════════════
// ACTIONS — what happened
// ══════════════════════════════════════════════════════════════════
export const AUDIT_ACTIONS = {
  // Lead
  LEAD_CREATED:              'LEAD_CREATED',
  LEAD_ASSIGNED:             'LEAD_ASSIGNED',
  LEAD_REASSIGNED:           'LEAD_REASSIGNED',
  LEAD_STATUS_CHANGED:       'LEAD_STATUS_CHANGED',
  LEAD_NOTES_ADDED:          'LEAD_NOTES_ADDED',
  LEAD_QUALIFICATION_UPDATED:'LEAD_QUALIFICATION_UPDATED',

  // Case / Application
  CASE_CREATED:              'APPLICATION_CREATED',
  CASE_SUBMITTED_TO_XOTO:    'APPLICATION_SUBMITTED_TO_XOTO',
  CASE_PICKED_UP:            'APPLICATION_PICKED_UP',
  CASE_ASSIGNED_TO_OPS:      'APPLICATION_ASSIGNED_TO_OPS',
  CASE_STATUS_CHANGED:       'APPLICATION_STATUS_CHANGED',
  CASE_RETURNED:             'APPLICATION_RETURNED',
  CASE_RESUBMITTED:          'APPLICATION_RESUBMITTED',
  CASE_SUBMITTED_TO_BANK:    'APPLICATION_SUBMITTED_TO_BANK',
  CASE_DISBURSED:            'APPLICATION_DISBURSED',
  CASE_REJECTED:             'APPLICATION_REJECTED',
  CASE_LOST:                 'APPLICATION_LOST',

  APPLICATION_CREATED:              'APPLICATION_CREATED',
  APPLICATION_SUBMITTED_TO_XOTO:    'APPLICATION_SUBMITTED_TO_XOTO',
  APPLICATION_PICKED_UP:            'APPLICATION_PICKED_UP',
  APPLICATION_ASSIGNED_TO_OPS:      'APPLICATION_ASSIGNED_TO_OPS',
  APPLICATION_STATUS_CHANGED:       'APPLICATION_STATUS_CHANGED',
  APPLICATION_RETURNED:             'APPLICATION_RETURNED',
  APPLICATION_RESUBMITTED:          'APPLICATION_RESUBMITTED',
  APPLICATION_SUBMITTED_TO_BANK:    'APPLICATION_SUBMITTED_TO_BANK',
  APPLICATION_DISBURSED:            'APPLICATION_DISBURSED',
  APPLICATION_REJECTED:             'APPLICATION_REJECTED',
  APPLICATION_LOST:                 'APPLICATION_LOST',

  // Document
  DOCUMENT_UPLOADED:         'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED:          'DOCUMENT_DELETED',
  DOCUMENT_REPLACED:         'DOCUMENT_REPLACED',
  DOCUMENT_VERIFIED:         'DOCUMENT_VERIFIED',
  DOCUMENT_DOWNLOADED:       'DOCUMENT_DOWNLOADED',

  // Commission
  COMMISSION_GENERATED:      'COMMISSION_GENERATED',
  COMMISSION_CONFIRMED:      'COMMISSION_CONFIRMED',
  COMMISSION_PAID:           'COMMISSION_PAID',
  COMMISSION_REJECTED:       'COMMISSION_REJECTED',
  COMMISSION_EDITED:         'COMMISSION_EDITED',

  // User / Security
  USER_LOGIN:                'USER_LOGIN',
  USER_LOGOUT:               'USER_LOGOUT',
  USER_FAILED_LOGIN:         'USER_FAILED_LOGIN',
  USER_PASSWORD_RESET:       'USER_PASSWORD_RESET',
  USER_SUSPENDED:            'USER_SUSPENDED',
  USER_ACTIVATED:            'USER_ACTIVATED',

  // Ops
  OPS_SLA_OVERRIDE:          'OPS_SLA_OVERRIDE',
  OPS_REASSIGNMENT:          'OPS_REASSIGNMENT',
  OPS_STATUS_OVERRIDE:       'OPS_STATUS_OVERRIDE',
  OPS_ADMIN_INTERVENTION:    'OPS_ADMIN_INTERVENTION',
};

// ══════════════════════════════════════════════════════════════════
// ROLE VISIBILITY MAP — who can see what audit events
// ══════════════════════════════════════════════════════════════════
export const ROLE_VISIBILITY = {
  admin:                   'admin',
  advisor:                 'advisor',
  partner:                 'partner',
  ops:                     'ops',
  referral_partner:        'referral_partner',
  partner_affiliated_agent:'partner_affiliated_agent',
};

// Default visibility per entity type
export const DEFAULT_VISIBILITY = {
  LEAD:        ['admin', 'advisor', 'ops', 'partner', 'referral_partner', 'partner_affiliated_agent'],
  CASE:        ['admin', 'advisor', 'ops', 'partner', 'partner_affiliated_agent'],
  APPLICATION: ['admin', 'advisor', 'ops', 'partner', 'partner_affiliated_agent'],
  DOCUMENT:    ['admin', 'advisor', 'ops', 'partner', 'partner_affiliated_agent'],
  COMMISSION:  ['admin'],
  USER:        ['admin'],
  OPS:         ['admin', 'ops'],
  PARTNER:     ['admin', 'partner'],
  AGENT:       ['admin'],
  SYSTEM:      ['admin'],
};

// ══════════════════════════════════════════════════════════════════
// AUDIT LOG SCHEMA
// ══════════════════════════════════════════════════════════════════
const auditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: Object.values(ENTITY_TYPES),
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    entityRef: {
      type: String,
      default: null, // human-readable ref (caseReference, leadId string, etc.)
    },

    action: {
      type: String,
      required: true,
    },

    // Snapshot of what changed
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },

    // Who did it
    performedBy:      { type: mongoose.Schema.Types.ObjectId, default: null },
    performedByModel: { type: String, default: null }, // 'Admin' | 'Partner' | 'VaultAgent' | 'MortgageOps' | 'System'
    performedByName:  { type: String, default: 'System' },
    performedByRole:  { type: String, default: null },  // 'admin' | 'advisor' | 'partner' | 'ops' | 'referral_partner' | 'partner_affiliated_agent'

    // Role-based visibility — only these roles can query this log
    visibleToRoles: [{ type: String }],

    // Request context
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    // Extra context (flexible)
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    collection: 'xoto_auditlogs',
  }
);

// ── Indexes ───────────────────────────────────────────────────────
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ visibleToRoles: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ performedByRole: 1, performedBy: 1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
