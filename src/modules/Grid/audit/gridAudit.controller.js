const AuditLog = require('../../vault/models/AuditLog.js').default;
const { logAudit } = require('../../vault/services/auditLog.service.js');

const buildAuditQuery = (q) => {
  const query = { visibleToRoles: { $in: ['grid_admin', 'superadmin'] } };
  if (q.entityType)      query.entityType      = q.entityType.toUpperCase();
  if (q.action)          query.action          = q.action;
  if (q.performedByRole) query.performedByRole  = q.performedByRole;
  if (q.search) {
    query.$or = [
      { performedByName: { $regex: q.search, $options: 'i' } },
      { entityRef:       { $regex: q.search, $options: 'i' } },
      { action:          { $regex: q.search, $options: 'i' } },
    ];
  }
  if (q.dateFrom || q.dateTo) {
    query.createdAt = {};
    if (q.dateFrom) query.createdAt.$gte = new Date(q.dateFrom);
    if (q.dateTo)   query.createdAt.$lte = new Date(q.dateTo);
  }
  return query;
};

const isGridAdmin = (user) => {
  const code = user?.role?.code !== undefined
    ? Number(user.role.code)
    : Number(user?.role);
  return code === 0 || code === 1;
};

// GET /grid/audit
exports.getGridAuditLogs = async (req, res) => {
  try {
    if (!isGridAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access only' });
    }
    const { page = 1, limit = 50 } = req.query;
    const query    = buildAuditQuery(req.query);
    const skip     = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = Math.min(parseInt(limit), 200);

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      AuditLog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      total,
      pagination: {
        currentPage: parseInt(page),
        totalPages:  Math.ceil(total / limitNum),
        limit:       limitNum,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /grid/audit/export
exports.exportAuditLogs = async (req, res) => {
  try {
    if (!isGridAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access only' });
    }

    const query = buildAuditQuery(req.query);
    const logs  = await AuditLog.find(query).sort({ createdAt: -1 }).limit(10000).lean();

    const escape = (v) => {
      const s = v == null ? '' : String(v).replace(/"/g, '""');
      return `"${s}"`;
    };

    const SKIP      = new Set(['roleCode', '__v', '_id', 'id', 'performedBy']);
    const isMongoId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
    const isIdKey   = (k) => k === '_id' || k === 'id' || k.endsWith('Id') || k.endsWith('_id');
    const cleanMeta = (meta) => {
      if (!meta || typeof meta !== 'object') return '';
      return Object.entries(meta)
        .filter(([k, v]) =>
          !SKIP.has(k) && !isIdKey(k) &&
          v != null && v !== '' &&
          typeof v !== 'object' &&
          !isMongoId(String(v))
        )
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    };

    const header = ['Date & Time', 'Action', 'Entity Type', 'Reference', 'Performed By', 'Email / Phone', 'Role', 'IP Address', 'Details'].map(escape).join(',');

    const rows = logs.map(l => {
      const m = l.metadata || {};
      const contact = m.email || m.phone || m.mobile || '';
      return [
        escape(l.createdAt ? new Date(l.createdAt).toISOString().replace('T', ' ').slice(0, 19) : ''),
        escape(l.action || ''),
        escape(l.entityType || ''),
        escape(l.entityRef || ''),
        escape(l.performedByName || 'System'),
        escape(contact),
        escape(l.performedByRole || ''),
        escape(l.ipAddress || ''),
        escape(cleanMeta(m)),
      ].join(',');
    });

    const csv      = [header, ...rows].join('\r\n');
    const filename = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.write('﻿'); // BOM for Excel
    res.end(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /grid/audit/stats
exports.getGridAuditStats = async (req, res) => {
  try {
    if (!isGridAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access only' });
    }

    const { dateFrom, dateTo } = req.query;
    const matchStage = { visibleToRoles: { $in: ['grid_admin', 'superadmin'] } };
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(dateTo);
    }

    const [byEntity, byAction, recentLogins, failedLogins, loginsByRole] = await Promise.all([
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$entityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      AuditLog.countDocuments({ ...matchStage, action: 'AUTH_LOGIN_SUCCESS' }),
      AuditLog.countDocuments({ ...matchStage, action: 'AUTH_LOGIN_FAILED' }),
      AuditLog.aggregate([
        { $match: { ...matchStage, action: 'AUTH_LOGIN_SUCCESS' } },
        { $group: { _id: '$performedByRole', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const totalLogs = byEntity.reduce((s, e) => s + e.count, 0);

    return res.status(200).json({
      success: true,
      data: { totalLogs, byEntity, byAction, recentLogins, failedLogins, loginsByRole },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /grid/audit/logout
// Called by frontend on logout — logs AUTH_LOGOUT for any Grid role
exports.gridLogout = async (req, res) => {
  try {
    const user = req.user;

    const roleMap = {
      16: 'agent', 24: 'grid_advisor', 15: 'partner',
      17: 'developer', 25: 'referral_partner', 1: 'admin', 0: 'superadmin',
    };
    const code = user?.role?.code !== undefined ? Number(user.role.code) : Number(user?.role);
    const roleName = roleMap[code] || user?.role?.name || 'unknown';

    const name = user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : user?.first_name
        ? `${user.first_name} ${user.last_name || ''}`.trim()
        : user?.name || user?.email || String(user?._id);

    logAudit({
      entityType:      'AUTH',
      action:          'AUTH_LOGOUT',
      performedBy:     user._id,
      performedByName: name,
      performedByRole: roleName,
      visibleToRoles:  ['grid_admin', 'superadmin'],
      ipAddress:       req.ip || req.headers['x-forwarded-for'] || null,
      userAgent:       req.headers['user-agent'] || null,
      metadata:        { roleCode: code, email: user?.email || null },
    });

    return res.status(200).json({ success: true, message: 'Logged out' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
