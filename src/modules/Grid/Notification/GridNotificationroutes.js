import express from 'express';
import {
  getGridNotifications,
  markNotificationRead,
  markAllRead,
} from '../Notification/GridNotificationcontroller';
const { protectMulti } = require('../../../middleware/auth');

const router = express.Router();

// All grid roles (18/21/22/23/26) can access notifications
router.get('/',             protectMulti, getGridNotifications);
router.patch('/read-all',  protectMulti, markAllRead);
router.patch('/:id/read',  protectMulti, markNotificationRead);

module.exports = router;