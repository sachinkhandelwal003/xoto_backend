import GridNotification from './gridnotificationmodal.js';
import MortgageOps from '../../vault/models/MortgageOps.js';
import Admin from '../../vault/models/Admin.js';
import { getIO } from '../../../utils/socketInstance.js';
import GridLead from '../Lead/model/gridLead.model.js';
import Dealrecord from '../dealrecord/models/Dealrecord.model.js';
import GridAgent from '../Agent/models/agent.js';
import PlatformNotificationConfig from '../../vault/models/PlatformNotificationConfig.js';

export const emitGridNotification = async ({
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
      if (rec.role) {
        const config = await PlatformNotificationConfig.findOne({ persona: rec.role });
        if (config && config.preferences && config.preferences.get(eventType) === false) {
          console.log(`[GridNotification] Skipped eventType ${eventType} for ${rec.role} as it is disabled in settings`);
          continue;
        }
      }

      const notification = await GridNotification.create({
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
          io.to(`grid:user:${rec.id}`).emit('grid:notification', payload);
          console.log(`[GridNotification] ${eventType} → grid:user:${rec.id}`);
        } else if (rec.role) {
          // Emit to role-specific room
          io.to(`grid:role:${rec.role}`).emit('grid:notification', payload);
          console.log(`[GridNotification] ${eventType} → grid:role:${rec.role}`);
        } else {
          // Fallback to global room
          io.to('grid:notifications').emit('grid:notification', payload);
          console.log(`[GridNotification] ${eventType} → grid:notifications`);
        }
      }
    }

    return createdNotifications.length === 1 ? createdNotifications[0] : createdNotifications;
  } catch (err) {
    console.error('[GridNotification] Failed to emit:', err.message);
  }
};

export const dispatchGridNotification = async (req, {
  eventType,
  title,
  message,
  entityId = null,
  entityModel = null,
  leadId = null,
  dealRecordId = null
}) => {
  try {
    const roleId = req.user?.role;
    let actorRole = 'system';
    let actorId = req.user?._id;
    let actorName = req.user?.fullName || req.user?.companyName || req.user?.email || 'System';

    if (roleId) {
      const Role = (await import('../../auth/models/role/role.model.js')).Role;
      const roleDoc = await Role.findById(roleId);
      const code = roleDoc?.code;
      if (code === '1' || code === '18') actorRole = 'admin';
      else if (code === '21') actorRole = 'partner';
      else if (code === '23') actorRole = 'ops';
      else if (code === '26') actorRole = 'advisor';
      else if (code === '22') {
        actorRole = req.user?.agentType === 'PartnerAffiliatedAgent' ? 'partner_affiliated_agent' : 'referral_partner';
      }
    }

    let lead = null;
    if (leadId) {
      lead = await GridLead.findById(leadId);
    } else if (dealRecordId) {
      const dealDoc = await Dealrecord.findById(dealRecordId);
      if (dealDoc) {
        lead = await GridLead.findById(dealDoc.sourceLeadId);
      }
    }

    const recipientRoles = new Set();
    const recipientIds = new Set();

    const addRecipient = (id, model, role) => {
      if (id) {
        recipientIds.add(JSON.stringify({ id: id.toString(), model, role }));
      } else if (role) {
        recipientRoles.add(role);
      }
    };

    // Rule A: Grid Advisor Actions
    if (actorRole === 'advisor') {
      addRecipient(null, null, 'admin');
      if (lead && lead.sourceInfo?.createdByRole === 'referral_partner') {
        addRecipient(lead.sourceInfo.createdById, 'GridAgent', 'referral_partner');
      }
    }
    // Rule B: Partner-Affiliated Agent Actions
    else if (actorRole === 'partner_affiliated_agent') {
      addRecipient(null, null, 'admin');
      const agent = await GridAgent.findById(actorId);
      if (agent && agent.partnerId) {
        addRecipient(agent.partnerId, 'Partner', 'partner');
      }
    }
    // Rule C: Partner Actions
    else if (actorRole === 'partner') {
      if (eventType === 'DEAL_SUBMITTED_TO_XOTO' || eventType === 'NEW_APPLICATION_SUBMITTED') {
        addRecipient(null, null, 'admin');
      }
    }
    // Rule D: Ops Actions
    else if (actorRole === 'ops') {
      let submitterId = null;
      let submitterModel = null;
      let submitterRole = null;

      if (dealRecordId) {
        const dealDoc = await Dealrecord.findById(dealRecordId);
        if (dealDoc && dealDoc.createdBy) {
          submitterId = dealDoc.createdBy.userId;
          const createdRole = dealDoc.createdBy.role;
          submitterRole = createdRole === 'affiliated_agent' ? 'partner_affiliated_agent' : createdRole;
          submitterModel = ['partner_affiliated_agent', 'referral_partner'].includes(submitterRole) ? 'GridAgent' : 
                           submitterRole === 'partner' ? 'Partner' : 'XotoAdvisor';
        }
      }

      if (submitterId) {
        addRecipient(submitterId, submitterModel, submitterRole);
        if (submitterRole === 'partner_affiliated_agent') {
          const agent = await GridAgent.findById(submitterId);
          if (agent && agent.partnerId) {
            addRecipient(agent.partnerId, 'Partner', 'partner');
          }
        }
      }

      if (lead && lead.sourceInfo?.createdByRole === 'referral_partner') {
        addRecipient(lead.sourceInfo.createdById, 'GridAgent', 'referral_partner');
      }

      if (eventType === 'DEAL_DISBURSED' || eventType === 'DEAL_DECLINED') {
        addRecipient(null, null, 'admin');
      }
    }

    const notifications = [];

    for (const idStr of recipientIds) {
      const rec = JSON.parse(idStr);
      const notif = await emitGridNotification({
        eventType,
        title,
        message,
        entityId,
        entityModel,
        recipientId: rec.id,
        recipientModel: rec.model,
        recipientRole: rec.role,
        createdByName: actorName,
        createdByRole: actorRole,
      });
      notifications.push(notif);
    }

    for (const role of recipientRoles) {
      const notif = await emitGridNotification({
        eventType,
        title,
        message,
        entityId,
        entityModel,
        recipientRole: role,
        sendToAllOfRole: true,
        createdByName: actorName,
        createdByRole: actorRole,
      });
      if (Array.isArray(notif)) notifications.push(...notif);
      else if (notif) notifications.push(notif);
    }

    return notifications;
  } catch (error) {
    console.error('[dispatchGridNotification] Error:', error.message);
  }
};
