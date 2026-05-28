import PlatformNotificationConfig from '../models/PlatformNotificationConfig.js';
import SystemAnnouncement from '../models/SystemAnnouncement.js';
import { emitVaultNotification } from '../services/vaultNotification.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';

// Pre-defined event types for notifications
const EVENT_TYPES = [
  'LEAD_ASSIGNED',
  'LEAD_STATUS_CHANGED',
  'CASE_CREATED',
  'CASE_SUBMITTED_TO_XOTO',
  'CASE_STATUS_CHANGED',
  'CASE_DISBURSED',
  'CASE_DECLINED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_VERIFIED',
  'COMMISSION_GENERATED',
  'COMMISSION_CONFIRMED',
  'AUDIT_LOG_ALERT',
  'SYSTEM_ANNOUNCEMENT'
];

const PERSONAS = ['admin', 'partner', 'referral_partner', 'partner_affiliated_agent', 'ops', 'advisor'];

// ── GET /vault/platform-config/notifications ──────────────────────
export const getNotificationConfigs = async (req, res) => {
  try {
    let configs = await PlatformNotificationConfig.find({}).lean();

    // Seed defaults if empty or missing personas
    if (configs.length < PERSONAS.length) {
      const existingPersonas = configs.map(c => c.persona);
      const toSeed = PERSONAS.filter(p => !existingPersonas.includes(p));

      for (const persona of toSeed) {
        const defaultPrefs = {};
        EVENT_TYPES.forEach(evt => {
          defaultPrefs[evt] = true; // Enabled by default
        });

        await PlatformNotificationConfig.create({
          persona,
          preferences: defaultPrefs
        });
      }

      configs = await PlatformNotificationConfig.find({}).lean();
    }

    // Convert map to regular object for frontend
    const formatted = configs.map(c => ({
      _id: c._id,
      persona: c.persona,
      preferences: c.preferences instanceof Map ? Object.fromEntries(c.preferences) : c.preferences
    }));

    return res.status(200).json({ success: true, data: formatted, eventTypes: EVENT_TYPES });
  } catch (error) {
    console.error('getNotificationConfigs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PUT /vault/platform-config/notifications ──────────────────────
export const updateNotificationConfig = async (req, res) => {
  try {
    const { persona, preferences } = req.body;

    if (!persona || !preferences) {
      return res.status(400).json({ success: false, message: 'Persona and preferences are required' });
    }

    const updated = await PlatformNotificationConfig.findOneAndUpdate(
      { persona },
      { preferences },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Notification preferences updated for ${persona}`,
      data: updated
    });
  } catch (error) {
    console.error('updateNotificationConfig error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /vault/platform-config/announcements ──────────────────────
export const getAnnouncements = async (req, res) => {
  try {
    const { all = 'false' } = req.query;
    const filter = all === 'true' ? {} : { active: true };

    const announcements = await SystemAnnouncement.find(filter).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: announcements });
  } catch (error) {
    console.error('getAnnouncements error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /vault/platform-config/announcements ─────────────────────
export const createAnnouncement = async (req, res) => {
  try {
    const { title, message, type = 'info', expiresAt } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const name = req.user?.fullName || req.user?.email || 'Admin';

    const announcement = await SystemAnnouncement.create({
      title,
      message,
      type,
      active: true,
      createdBy: req.user?._id,
      createdByName: name,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    // Also push a real-time notification to all personas
    for (const persona of PERSONAS) {
      await emitVaultNotification({
        eventType: 'SYSTEM_ANNOUNCEMENT',
        title: `📢 Announcement: ${title}`,
        message: message,
        recipientRole: persona,
        sendToAllOfRole: true,
        createdByName: name,
        createdByRole: 'admin'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'System announcement created and broadcasted successfully',
      data: announcement
    });
  } catch (error) {
    console.error('createAnnouncement error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PUT /vault/platform-config/announcements/:id/status ───────────
export const toggleAnnouncementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    const announcement = await SystemAnnouncement.findByIdAndUpdate(
      id,
      { active: active === true },
      { new: true }
    );

    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Announcement ${announcement.active ? 'activated' : 'deactivated'}`,
      data: announcement
    });
  } catch (error) {
    console.error('toggleAnnouncementStatus error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
