import VaultNotification from '../models/VaultNotification.js';
import { getIO } from '../../../utils/socketInstance.js';

// Vault role codes that receive notifications: Admin(18), Partner(21), VaultAgent(22), Ops(23), Advisor(26)
const VAULT_SOCKET_ROOM = 'vault:notifications';

export const emitVaultNotification = async ({
  eventType,
  title,
  message,
  entityId = null,
  entityModel = null,
  createdByName = 'System',
  createdByRole = 'System',
}) => {
  try {
    const notification = await VaultNotification.create({
      eventType,
      title,
      message,
      entityId,
      entityModel,
      createdByName,
      createdByRole,
    });

    const io = getIO();
    if (io) {
      const payload = {
        _id:           notification._id,
        eventType,
        title,
        message,
        entityId,
        entityModel,
        createdByName,
        createdByRole,
        isRead:        false,
        createdAt:     notification.createdAt,
      };

      // Emit to all connected vault roles (18/21/22/23/26)
      io.to(VAULT_SOCKET_ROOM).emit('vault:notification', payload);
      console.log(`[VaultNotification] ${eventType} → ${VAULT_SOCKET_ROOM}`);
    }

    return notification;
  } catch (err) {
    console.error('[VaultNotification] Failed to emit:', err.message);
  }
};
