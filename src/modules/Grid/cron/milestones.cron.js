const cron = require('node-cron');
const Property = require('../../properties/models/property.model');
const DealRecord = require('../dealrecord/models/Dealrecord.model');
const GridNotification = require('../Notification/GridNotificationmodal').default;

const VIEW_MILESTONE = 100;

const checkMilestones = async () => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── 1. Property view milestones ──────────────────────────────
    const hotProperties = await Property.find({
      viewCount: { $gte: VIEW_MILESTONE },
      approvalStatus: 'approved',
    }).select('propertyName projectName viewCount area city');

    for (const property of hotProperties) {
      // Already notified for this milestone?
      const alreadyNotified = await GridNotification.findOne({
        eventType: 'PROPERTY_VIEW_MILESTONE',
        entityId:  property._id,
        message:   { $regex: `${property.viewCount} views` },
      });

      if (alreadyNotified) continue;

      await GridNotification.create({
        eventType:     'PROPERTY_VIEW_MILESTONE',
        title:         `Property Hit ${property.viewCount} Views 🎯`,
        message:       `"${property.propertyName || property.projectName}" in ${property.area || property.city} has reached ${property.viewCount} views. Strong market interest — consider featuring this listing or investigating lead conversion.`,
        entityId:      property._id,
        entityModel:   'Properties',
        recipientId:   null,
        recipientRole: 'admin',
        createdByName: 'System',
        createdByRole: 'System',
      });

      console.log(`[MilestonesCron] View milestone notification — ${property.propertyName} (${property.viewCount} views)`);
    }

    // ── 2. Monthly commission milestone ──────────────────────────
    const COMMISSION_TARGET = 500000; // AED 500k per month target

    const monthlyCommission = await DealRecord.aggregate([
      {
        $match: {
          createdAt: { $gte: monthStart },
          commissionStatus: { $in: ['confirmed', 'paid'] },
          isVoided: false,
        },
      },
      {
        $group: {
          _id:   null,
          total: { $sum: '$commission.grossAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const monthTotal  = monthlyCommission[0]?.total || 0;
    const dealCount   = monthlyCommission[0]?.count || 0;
    const monthName   = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    if (monthTotal >= COMMISSION_TARGET) {
      const alreadyNotified = await GridNotification.findOne({
        eventType: 'COMMISSION_MILESTONE',
        createdAt: { $gte: monthStart },
      });

      if (!alreadyNotified) {
        await GridNotification.create({
          eventType:     'COMMISSION_MILESTONE',
          title:         `Monthly Commission Target Hit! 🏆 AED ${monthTotal.toLocaleString()}`,
          message:       `Platform commission for ${monthName} has exceeded the AED ${COMMISSION_TARGET.toLocaleString()} target. Total: AED ${monthTotal.toLocaleString()} across ${dealCount} confirmed deals. Celebrate the win and review top performers.`,
          entityId:      null,
          entityModel:   null,
          recipientId:   null,
          recipientRole: 'admin',
          createdByName: 'System',
          createdByRole: 'System',
        });

        console.log(`[MilestonesCron] Commission milestone hit — AED ${monthTotal.toLocaleString()}`);
      }
    }

  } catch (err) {
    console.error('[MilestonesCron] Error:', err.message);
  }
};

// Har 6 ghante check karega
cron.schedule('0 */6 * * *', () => {
  console.log('[MilestonesCron] Checking performance milestones...');
  checkMilestones();
}, {
  timezone: 'Asia/Dubai'
});

console.log('[MilestonesCron] Scheduled — runs every 6 hours');

module.exports = { checkMilestones };