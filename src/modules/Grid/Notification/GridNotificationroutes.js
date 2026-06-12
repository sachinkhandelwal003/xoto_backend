import express from 'express';
import {
  getGridNotifications,
  markNotificationRead,
  markAllRead,
} from './gridnotificationcontroller';
import { emitGridNotification } from './gridnotificationservice.js'; // ✅ ADD — apna actual filename daalo
const { protectMulti } = require('../../../middleware/auth');

const router = express.Router();

// All grid roles (18/21/22/23/26) can access notifications
router.get('/',             protectMulti, getGridNotifications);
router.put('/read-all',  protectMulti, markAllRead);
router.put('/:id/read',  protectMulti, markNotificationRead);

// 🧪 TEMP TEST ROUTE — baad mein hata dena
router.post('/test-emit', protectMulti, async (req, res) => {
  try {
    const notif = await emitGridNotification({
      eventType: req.body.eventType || 'TEST_EVENT',
      title: req.body.title || 'Test Notification',
      message: req.body.message || 'This is a test',
      recipientId: req.user._id,
      recipientModel: 'Admin',
      recipientRole: req.body.recipientRole || null,
      createdByName: 'Postman Test',
      createdByRole: 'system',
    });
    return res.status(200).json({ success: true, notif });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;