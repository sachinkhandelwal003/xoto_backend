import GridNotification from './GridNotificationmodal';

// ── Role code → audit/notification role slug ───────────────────────
const ROLE_CODE_MAP = {
  '1':'admin',
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

const getRoleCode = (user) => {
  if (!user?.role) return null;
  if (typeof user.role === 'object') return String(user.role.code ?? '');
  return String(user.role);
};

export const getGridNotifications = async (req, res) => {
  try {
    const { limit = 50, page = 1, isRead, eventType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const roleCode = getRoleCode(req.user);
    const roleSlug = resolveRoleSlug(roleCode, req.user);

    if (!roleSlug) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Filter scoped to recipient user or role (when recipientId is null)
    const filter = {
      $or: [
        { recipientId: req.user._id },
        { recipientId: null, recipientRole: roleSlug },
      ],
    };

    // Frontend sends isRead=true/false as string
    if (isRead === 'true')  filter.isRead = true;
    if (isRead === 'false') filter.isRead = false;

    if (eventType) filter.eventType = eventType;

    const [notifications, total] = await Promise.all([
      GridNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      GridNotification.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      total,                // root-level for frontend compatibility
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const roleCode = getRoleCode(req.user);
    const roleSlug = resolveRoleSlug(roleCode, req.user);

    // Can only mark read if it belongs to this user or their role slug
    const filter = {
      _id: req.params.id,
      $or: [
        { recipientId: req.user._id },
        { recipientId: null, recipientRole: roleSlug },
      ],
    };

    const updated = await GridNotification.findOneAndUpdate(filter, { isRead: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found or unauthorized' });
    }

    return res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const markAllRead = async (req, res) => {
  try {
    const roleCode = getRoleCode(req.user);
    const roleSlug = resolveRoleSlug(roleCode, req.user);

    const filter = {
      isRead: false,
      $or: [
        { recipientId: req.user._id },
        { recipientId: null, recipientRole: roleSlug },
      ],
    };

    await GridNotification.updateMany(filter, { isRead: true });
    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};