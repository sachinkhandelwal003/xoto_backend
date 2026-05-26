import express from 'express';
import {
  getVaultNotifications,
  markNotificationRead,
  markAllRead,
} from '../controllers/vaultNotification.controller.js';
const { protectMulti } = require('../../../middleware/auth');

const router = express.Router();

// All vault roles (18/21/22/23/26) can access notifications
router.get('/',              protectMulti, getVaultNotifications);
router.patch('/read-all',   protectMulti, markAllRead);
router.patch('/:id/read',   protectMulti, markNotificationRead);

module.exports = router;
