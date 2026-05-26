import VaultNotification from '../models/VaultNotification.js';
import MortgageOps from '../models/MortgageOps.js';
import Admin from '../models/Admin.js';
import { getIO } from '../../../utils/socketInstance.js';

export const emitVaultNotification = async ({
  eventType,
  title,
  message,
  entityId = null,
  entityModel = null,
  recipientId = null,
  recipientModel = null,
  recipientRole = null,
  sendToAllOfRole = false,
  createdByName = 'System',
  createdByRole = 'System',
}) => {
  try {
    const io = getIO();
    const recipients = [];

    // 1. Resolve recipients
    if (recipientId) {
      recipients.push({ id: recipientId, model: recipientModel, role: recipientRole });
    } else if (sendToAllOfRole && recipientRole === 'ops') {
      const activeOps = await MortgageOps.find({ isActive: true, isDeleted: false });
      activeOps.forEach(op => {
        recipients.push({ id: op._id, model: 'MortgageOps', role: 'ops' });
      });
    } else if (sendToAllOfRole && recipientRole === 'admin') {
      const activeAdmins = await Admin.find({ isActive: true, is_deleted: false });
      activeAdmins.forEach(adm => {
        recipients.push({ id: adm._id, model: 'Admin', role: 'admin' });
      });
    } else {
      // Broadcast/role notification with no specific recipients (e.g. system broadcast)
      recipients.push({ id: null, model: null, role: recipientRole });
    }

    const createdNotifications = [];

    // 2. Create database documents and emit via Socket.io
    for (const rec of recipients) {
      const notification = await VaultNotification.create({
        eventType,
        title,
        message,
        entityId,
        entityModel,
        recipientId: rec.id,
        recipientModel: rec.model,
        recipientRole: rec.role,
        createdByName,
        createdByRole,
      });

      createdNotifications.push(notification);

      if (io) {
        const payload = {
          _id:           notification._id,
          eventType,
          title,
          message,
          entityId,
          entityModel,
          recipientId:   rec.id,
          recipientModel: rec.model,
          recipientRole: rec.role,
          createdByName,
          createdByRole,
          isRead:        false,
          createdAt:     notification.createdAt,
        };

        if (rec.id) {
          // Emit to user-specific room
          io.to(`vault:user:${rec.id}`).emit('vault:notification', payload);
          console.log(`[VaultNotification] ${eventType} → vault:user:${rec.id}`);
        } else if (rec.role) {
          // Emit to role-specific room
          io.to(`vault:role:${rec.role}`).emit('vault:notification', payload);
          console.log(`[VaultNotification] ${eventType} → vault:role:${rec.role}`);
        } else {
          // Fallback to global room
          io.to('vault:notifications').emit('vault:notification', payload);
          console.log(`[VaultNotification] ${eventType} → vault:notifications`);
        }
      }
    }

    return createdNotifications.length === 1 ? createdNotifications[0] : createdNotifications;
  } catch (err) {
    console.error('[VaultNotification] Failed to emit:', err.message);
  }
};
