const cron = require('node-cron');
const GridLead = require('../Lead/model/gridLead.model');
const DealRecord = require('../dealrecord/models/Dealrecord.model');
const Property = require('../../properties/models/property.model');
const GridNotification = require('../Notification/GridNotificationmodal').default;

const generateWeeklyReport = async () => {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      newLeads,
      completedDeals,
      totalProperties,
      pendingProperties,
      commissionData,
    ] = await Promise.all([
      GridLead.countDocuments(),
      GridLead.countDocuments({ createdAt: { $gte: weekAgo } }),
      DealRecord.countDocuments({ commissionStatus: 'confirmed', createdAt: { $gte: weekAgo } }),
      Property.countDocuments({ approvalStatus: 'approved' }),
      Property.countDocuments({ approvalStatus: 'pending' }),
      DealRecord.aggregate([
        { $match: { createdAt: { $gte: weekAgo }, isVoided: false } },
        { $group: { _id: null, total: { $sum: '$commission.grossAmount' } } }
      ]),
    ]);

    const weeklyCommission = commissionData[0]?.total || 0;
    const reportDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    await GridNotification.create({
      eventType:     'WEEKLY_REPORT_READY',
      title:         `Weekly Performance Report Ready 📊 — ${reportDate}`,
      message:       `Weekly Summary: New Leads: ${newLeads} | Deals Confirmed: ${completedDeals} | Commission This Week: AED ${weeklyCommission.toLocaleString()} | Active Listings: ${totalProperties} | Pending Approval: ${pendingProperties}. Download full CSV from the admin panel.`,
      entityId:      null,
      entityModel:   null,
      recipientId:   null,
      recipientRole: 'admin',
      createdByName: 'System',
      createdByRole: 'System',
    });

    console.log(`[WeeklyReportCron] Report notification sent — ${reportDate}`);
  } catch (err) {
    console.error('[WeeklyReportCron] Error:', err.message);
  }
};

// Har Somwar subah 8 baje
cron.schedule('0 8 * * 1', () => {
  console.log('[WeeklyReportCron] Generating weekly report...');
  generateWeeklyReport();
}, {
  timezone: 'Asia/Dubai'
});

console.log('[WeeklyReportCron] Scheduled — runs every Monday at 8:00 AM Dubai time');

module.exports = { generateWeeklyReport };