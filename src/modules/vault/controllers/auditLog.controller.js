import AuditLog from '../models/AuditLog.js';

// ── Role code → audit role slug ───────────────────────────────────
const ROLE_CODE_MAP = {
  '18': 'admin',
  '21': 'partner',
  '22': null,     // resolved by agentType below
  '23': 'ops',
  '26': 'advisor',
};

const resolveRoleSlug = (roleCode, user) => {
  if (roleCode === '22') {
    return user?.agentType === 'PartnerAffiliatedAgent'
      ? 'partner_affiliated_agent'
      : 'referral_partner';
  }
  return ROLE_CODE_MAP[roleCode] ?? null;
};

// protectMulti populates req.user.role as a full object {_id, code, name}
// Extract role code directly without an extra DB round-trip
const getRoleCode = (user) => {
  if (!user?.role) return null;
  if (typeof user.role === 'object') return String(user.role.code ?? '');
  return String(user.role);
};

// ══════════════════════════════════════════════════════════════════
// GET /vault/audit  — paginated, filtered, role-restricted
// ══════════════════════════════════════════════════════════════════
export const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1, limit = 50,
      entityType, entityId, action,
      performedByRole, dateFrom, dateTo,
    } = req.query;

    const roleCode = getRoleCode(req.user);
    const roleSlug = resolveRoleSlug(roleCode, req.user);

    if (!roleSlug) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Base visibility filter — every query must respect this
    const query = { visibleToRoles: roleSlug };

    // Non-admin roles see only their own entries OR entries about entities they own
    if (roleSlug !== 'admin') {
      if (roleSlug === 'advisor') {
        query.$or = [
          { performedBy: req.user._id },
          { performedByRole: 'advisor', 'metadata.advisorId': req.user._id.toString() },
        ];
      } else if (roleSlug === 'partner') {
        query.$or = [
          { performedBy: req.user._id },
          { 'metadata.partnerId': req.user._id.toString() },
        ];
      } else if (roleSlug === 'ops') {
        // Ops sees application / document / ops logs
        query.entityType = { $in: ['CASE', 'APPLICATION', 'DOCUMENT', 'OPS'] };
      } else if (roleSlug === 'referral_partner' || roleSlug === 'partner_affiliated_agent') {
        // Agents see only logs they performed or about their own leads/commissions
        query.$or = [
          { performedBy: req.user._id },
          { 'metadata.agentId': req.user._id.toString() },
        ];
      }
    }

    // Optional filters
    if (entityType) query.entityType = entityType;
    if (entityId)   query.entityId   = entityId;
    if (action)     query.action     = action;
    if (performedByRole) query.performedByRole = performedByRole;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   query.createdAt.$lte = new Date(dateTo);
    }

    const skip     = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = Math.min(parseInt(limit), 200);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      total,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
      viewerRole: roleSlug,
    });

  } catch (error) {
    console.error('getAuditLogs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// GET /vault/audit/:entityType/:entityId  — timeline for one entity
// ══════════════════════════════════════════════════════════════════
export const getEntityAuditTrail = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const roleCode = getRoleCode(req.user);
    const roleSlug = resolveRoleSlug(roleCode, req.user);

    if (!roleSlug) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const query = {
      entityType: entityType.toUpperCase(),
      entityId,
      visibleToRoles: roleSlug,
    };

    // Non-admin: must be involved
    if (roleSlug !== 'admin') {
      query.$or = [
        { performedBy: req.user._id },
        { 'metadata.advisorId': req.user._id.toString() },
        { 'metadata.partnerId': req.user._id.toString() },
        { 'metadata.agentId': req.user._id.toString() },
      ];
    }

    const logs = await AuditLog.find(query).sort({ createdAt: 1 }).lean();

    return res.status(200).json({ success: true, data: logs, total: logs.length });

  } catch (error) {
    console.error('getEntityAuditTrail error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// GET /vault/audit/stats  — summary counts by action type (admin only)
// ══════════════════════════════════════════════════════════════════
export const getAuditStats = async (req, res) => {
  try {
    const roleCode = getRoleCode(req.user);
    if (roleCode !== '18') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const { dateFrom, dateTo } = req.query;
    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(dateTo);
    }

    const [byEntity, byAction, byRole] = await Promise.all([
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$entityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$performedByRole', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const totalLogs = byEntity.reduce((s, e) => s + e.count, 0);

    return res.status(200).json({
      success: true,
      data: { totalLogs, byEntity, byAction, byRole },
    });

  } catch (error) {
    console.error('getAuditStats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
