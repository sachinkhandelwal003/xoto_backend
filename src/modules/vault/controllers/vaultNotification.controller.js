import VaultNotification from '../models/VaultNotification.js';

export const getVaultNotifications = async (req, res) => {
  try {
    const { limit = 50, page = 1, unread } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (unread === 'true') filter.isRead = false;

    const [notifications, total] = await Promise.all([
      VaultNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      VaultNotification.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    await VaultNotification.findByIdAndUpdate(req.params.id, { isRead: true });
    return res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await VaultNotification.updateMany({ isRead: false }, { isRead: true });
    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
