import AuditLog, { DEFAULT_VISIBILITY } from '../models/AuditLog.js';

/**
 * Write an audit log entry.
 *
 * @param {object} opts
 * @param {string}  opts.entityType      - ENTITY_TYPES constant
 * @param {*}       opts.entityId        - MongoDB ObjectId of the entity
 * @param {string}  [opts.entityRef]     - Human-readable ref (case number, etc.)
 * @param {string}  opts.action          - AUDIT_ACTIONS constant
 * @param {*}       [opts.oldValue]      - Value before the change
 * @param {*}       [opts.newValue]      - Value after the change
 * @param {*}       [opts.performedBy]   - User ObjectId
 * @param {string}  [opts.performedByModel] - Mongoose model name of the actor
 * @param {string}  [opts.performedByName]
 * @param {string}  [opts.performedByRole]  - role slug
 * @param {string[]}[opts.visibleToRoles]   - override default visibility
 * @param {string}  [opts.ipAddress]
 * @param {string}  [opts.userAgent]
 * @param {*}       [opts.metadata]      - extra context
 */
export const logAudit = async ({
  entityType,
  entityId = null,
  entityRef = null,
  action,
  oldValue = null,
  newValue = null,
  performedBy = null,
  performedByModel = null,
  performedByName = 'System',
  performedByRole = null,
  visibleToRoles = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) => {
  try {
    const roles = visibleToRoles ?? (DEFAULT_VISIBILITY[entityType] || ['admin']);
    await AuditLog.create({
      entityType,
      entityId,
      entityRef,
      action,
      oldValue,
      newValue,
      performedBy,
      performedByModel,
      performedByName,
      performedByRole,
      visibleToRoles: roles,
      ipAddress,
      userAgent,
      metadata,
    });
  } catch (err) {
    // Never let audit failures break the main flow
    console.error('[AuditLog] write failed:', err.message);
  }
};

/**
 * Build actor info from a request object.
 * Returns { performedBy, performedByModel, performedByName, performedByRole, ipAddress, userAgent }
 */
export const actorFromReq = (req, roleSlug = null) => ({
  performedBy:       req.user?._id ?? null,
  performedByModel:  req.user?.type === 'partner' ? 'Partner'
                   : req.user?.employeeType === 'MortgageOps' ? 'MortgageOps'
                   : req.user?.agentType ? 'VaultAgent'
                   : 'Admin',
  performedByName:   req.user?.fullName
                  || req.user?.companyName
                  || req.user?.name?.first_name
                  || req.user?.email
                  || 'System',
  performedByRole:   roleSlug,
  ipAddress:         req.ip ?? null,
  userAgent:         req.headers?.['user-agent'] ?? null,
});
