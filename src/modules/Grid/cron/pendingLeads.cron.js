const cron = require('node-cron');
const GridLead = require('../Lead/model/gridLead.model');
const GridNotification = require('../Notification/GridNotificationmodal').default;

const checkPendingManualLeads = async () => {
  try {
    // Phone call ya WhatsApp se aaye unassigned manual leads
    const pendingLeads = await GridLead.find({
      lead_type: 'general',
      'source.channel': { $in: ['phone_call', 'whatsapp', 'admin_manual'] },
      assigned_to: null,
      status: 'new',
    });

    if (pendingLeads.length === 0) return;

    console.log(`[PendingLeadsCron] Found ${pendingLeads.length} unassigned manual leads`);

    // Duplicate check — last 1 ghante mein already notification gayi?
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const alreadyNotified = await GridNotification.findOne({
      eventType: 'PENDING_MANUAL_LEADS',
      createdAt: { $gte: oneHourAgo },
    });

    if (alreadyNotified) return;

    // Channel wise count
    const phoneCalls = pendingLeads.filter(l => l.source?.channel === 'phone_call').length;
    const whatsapp   = pendingLeads.filter(l => l.source?.channel === 'whatsapp').length;
    const manual     = pendingLeads.filter(l => l.source?.channel === 'admin_manual').length;

    await GridNotification.create({
      eventType:     'PENDING_MANUAL_LEADS',
      title:         `${pendingLeads.length} Manual Enquiries Pending Assignment 📋`,
      message:       `${pendingLeads.length} off-platform leads are unassigned: Phone calls: ${phoneCalls} | WhatsApp: ${whatsapp} | Manual: ${manual}. Log and assign these leads to prevent them falling through the cracks.`,
      entityId:      null,
      entityModel:   null,
      recipientId:   null,
      recipientRole: 'admin',
      createdByName: 'System',
      createdByRole: 'System',
    });

    console.log(`[PendingLeadsCron] Notification sent — ${pendingLeads.length} pending leads`);
  } catch (err) {
    console.error('[PendingLeadsCron] Error:', err.message);
  }
};

// Har ghante chalega
cron.schedule('0 * * * *', () => {
  console.log('[PendingLeadsCron] Running hourly pending leads check...');
  checkPendingManualLeads();
}, {
  timezone: 'Asia/Dubai'
});

console.log('[PendingLeadsCron] Scheduled — runs every hour');

module.exports = { checkPendingManualLeads };