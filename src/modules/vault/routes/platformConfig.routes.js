import express from 'express';
import {
  getNotificationConfigs,
  updateNotificationConfig,
  getAnnouncements,
  createAnnouncement,
  toggleAnnouncementStatus
} from '../controllers/platformConfig.controller.js';
import { protectMulti } from '../../../middleware/auth.js';

const router = express.Router();

// Helper middleware to restrict to Admin (role code '18')
const isAdmin = async (req, res, next) => {
  try {
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    let roleCode = req.user?.role?.code;
    if (!roleCode) {
      const roleId = req.user?.role?._id || req.user?.role;
      if (roleId) {
        const roleDoc = await Role.findById(roleId);
        roleCode = roleDoc?.code;
      }
    }
    if (roleCode === '18') return next();
    return res.status(403).json({ success: false, message: 'Admin access required' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// All platform config endpoints require authentication
router.use(protectMulti);

// Active system announcements (accessible by all personas)
router.get('/announcements', getAnnouncements);

// Admin-only notification settings
router.get('/notifications', isAdmin, getNotificationConfigs);
router.put('/notifications', isAdmin, updateNotificationConfig);

// Admin-only announcement creation/management
router.post('/announcements', isAdmin, createAnnouncement);
router.put('/announcements/:id/status', isAdmin, toggleAnnouncementStatus);

module.exports = router;
