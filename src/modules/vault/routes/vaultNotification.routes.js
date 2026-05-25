import express from 'express';
import {
  getVaultNotifications,
  markNotificationRead,
  markAllRead,
} from '../controllers/vaultNotification.controller.js';
import { protect } from '../../../middleware/auth.js';

const router = express.Router();

// GET  /vault/notifications          - list all vault notifications (admin)
router.get('/', protect, getVaultNotifications);

// PATCH /vault/notifications/read-all - mark all as read (must be before /:id)
router.patch('/read-all', protect, markAllRead);

// PATCH /vault/notifications/:id/read - mark single notification as read
router.patch('/:id/read', protect, markNotificationRead);

module.exports = router;
