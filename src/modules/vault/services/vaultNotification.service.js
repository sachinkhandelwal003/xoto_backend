import VaultNotification from '../models/VaultNotification.js';
import MortgageOps from '../models/MortgageOps.js';
import Admin from '../models/Admin.js';
import { getIO } from '../../../utils/socketInstance.js';
import Lead from '../models/VaultLead.js';
import Case from '../models/Case.js';
import VaultAgent from '../models/Agent.js';
import PlatformNotificationConfig from '../models/PlatformNotificationConfig.js';

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
      if (rec.role) {
        const config = await PlatformNotificationConfig.findOne({ persona: rec.role });
        if (config && config.preferences && config.preferences.get(eventType) === false) {
          console.log(`[VaultNotification] Skipped eventType ${eventType} for ${rec.role} as it is disabled in settings`);
          continue;
        }
      }

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

export const dispatchVaultNotification = async (req, {
  eventType,
  title,
  message,
  entityId = null,
  entityModel = null,
  leadId = null,
  caseId = null
}) => {
  try {
    const roleId = req.user?.role;
    let actorRole = 'system';
    let actorId = req.user?._id;
    let actorName = req.user?.fullName || req.user?.companyName || req.user?.email || 'System';

    if (roleId) {
      const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
      const roleDoc = await Role.findById(roleId);
      const code = roleDoc?.code;
      if (code === '18') actorRole = 'admin';
      else if (code === '21') actorRole = 'partner';
      else if (code === '23') actorRole = 'ops';
      else if (code === '26') actorRole = 'advisor';
      else if (code === '22') {
        actorRole = req.user?.agentType === 'PartnerAffiliatedAgent' ? 'partner_affiliated_agent' : 'referral_partner';
      }
    }

    let lead = null;
    if (leadId) {
      lead = await Lead.findById(leadId);
    } else if (caseId) {
      const caseDoc = await Case.findById(caseId);
      if (caseDoc) {
        lead = await Lead.findById(caseDoc.sourceLeadId);
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

    // Rule A: Xoto Advisor Actions
    if (actorRole === 'advisor') {
      addRecipient(null, null, 'admin');
      if (lead && lead.sourceInfo?.createdByRole === 'referral_partner') {
        addRecipient(lead.sourceInfo.createdById, 'VaultAgent', 'referral_partner');
      }
    }
    // Rule B: Partner-Affiliated Agent Actions
    else if (actorRole === 'partner_affiliated_agent') {
      addRecipient(null, null, 'admin');
      const agent = await VaultAgent.findById(actorId);
      if (agent && agent.partnerId) {
        addRecipient(agent.partnerId, 'Partner', 'partner');
      }
    }
    // Rule C: Partner Actions
    else if (actorRole === 'partner') {
      // Only notify Admin for Case submissions, others stay silent
      if (eventType === 'CASE_SUBMITTED_TO_XOTO' || eventType === 'NEW_APPLICATION_SUBMITTED') {
        addRecipient(null, null, 'admin');
      }
    }
    // Rule D: Ops Actions
    else if (actorRole === 'ops') {
      let submitterId = null;
      let submitterModel = null;
      let submitterRole = null;

      if (caseId) {
        const caseDoc = await Case.findById(caseId);
        if (caseDoc && caseDoc.createdBy) {
          submitterId = caseDoc.createdBy.userId;
          const createdRole = caseDoc.createdBy.role;
          submitterRole = createdRole === 'affiliated_agent' ? 'partner_affiliated_agent' : createdRole;
          submitterModel = ['partner_affiliated_agent', 'referral_partner'].includes(submitterRole) ? 'VaultAgent' : 
                           submitterRole === 'partner' ? 'Partner' : 'XotoAdvisor';
        }
      }

      if (submitterId) {
        addRecipient(submitterId, submitterModel, submitterRole);
        if (submitterRole === 'partner_affiliated_agent') {
          const agent = await VaultAgent.findById(submitterId);
          if (agent && agent.partnerId) {
            addRecipient(agent.partnerId, 'Partner', 'partner');
          }
        }
      }

      if (lead && lead.sourceInfo?.createdByRole === 'referral_partner') {
        addRecipient(lead.sourceInfo.createdById, 'VaultAgent', 'referral_partner');
      }

      if (eventType === 'CASE_DISBURSED' || eventType === 'CASE_DECLINED') {
        addRecipient(null, null, 'admin');
      }
    }

    const notifications = [];

    for (const idStr of recipientIds) {
      const rec = JSON.parse(idStr);
      const notif = await emitVaultNotification({
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
      const notif = await emitVaultNotification({
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
    console.error('[dispatchVaultNotification] Error:', error.message);
  }
};

