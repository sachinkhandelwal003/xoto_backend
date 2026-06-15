const cron             = require('node-cron');
const Agent            = require('../Agent/models/agent');
const GridLead         = require('../Lead/model/gridLead.model');
const PartnerAgreement = require('../dealrecord/models/Partneragreement.model');
const GridNotification = require('../Notification/gridnotificationmodal').default;

// ════════════════════════════════════════════════════════════════════════════
// CRON 1 — Profile Incomplete Reminder
// Runs: Every Sunday at 9 PM
// PRD §13.2 — "Profile incomplete reminder (weekly)"
// ════════════════════════════════════════════════════════════════════════════
cron.schedule('0 21 * * 0', async () => {
  console.log('[Cron] Running profile incomplete reminder...');
  try {
    const incompleteAgents = await Agent.find({
      isActive:            true,
      adminApprovalStatus: 'approved',
      $or: [
        { profileComplete: false },
        { emiratesIdUrl:   '' },
        { reraCardNumber:  '' },
        { 'bankDetails.iban': '' },
      ],
    }).select('_id first_name');

    let sent = 0;
    for (const agent of incompleteAgents) {
      await GridNotification.create({
        eventType:      'PROFILE_INCOMPLETE',
        title:          'Profile Incomplete ⚠️',
        message:        `Hi ${agent.first_name}, your profile is missing required fields (Emirates ID, RERA card, or bank details). Complete your profile to receive commission payouts.`,
        entityId:       agent._id,
        entityModel:    'GridAgent',
        recipientId:    agent._id,
        recipientModel: 'GridAgent',
        recipientRole:  'agent',
        createdByName:  'System',
        createdByRole:  'system',
      });
      sent++;
    }

    console.log(`[Cron] Profile reminders sent to ${sent} agents`);
  } catch (err) {
    console.error('[Cron] Profile reminder failed:', err.message);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CRON 2 — Lead Inactivity Alert (24 hours)
// Runs: Every hour
// PRD §13.2 — "Lead inactivity alert: No status update on [Lead] in 24 hours"
// Logic: Lead is active (not completed/not_proceeding), has an agent,
//        and updatedAt is older than 24 hours
// ════════════════════════════════════════════════════════════════════════════
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running lead inactivity alert check...');
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find active leads that haven't been updated in 24 hours
    // and haven't already had an inactivity notification recently
    const staleLeads = await GridLead.find({
      is_deleted:        false,
      status:            { $nin: ['completed', 'not_proceeding'] },
      created_by_agent:  { $ne: null },
      updatedAt:         { $lt: twentyFourHoursAgo },
    })
      .select('_id contact_info created_by_agent updatedAt status')
      .lean();

    let sent = 0;
    for (const lead of staleLeads) {
      const clientName = lead.contact_info?.name
        ? `${lead.contact_info.name.first_name || ''} ${lead.contact_info.name.last_name || ''}`.trim()
        : 'your client';

      const hoursSince = Math.floor(
        (Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60)
      );

      // Check if we already sent an inactivity alert for this lead recently (last 24h)
      const recentAlert = await GridNotification.findOne({
        eventType:   'LEAD_INACTIVITY',
        entityId:    lead._id,
        createdAt:   { $gte: twentyFourHoursAgo },
      });

      if (recentAlert) continue; // Skip — already notified in last 24h

      await GridNotification.create({
        eventType:      'LEAD_INACTIVITY',
        title:          'Lead Inactivity Alert ⏰',
        message:        `No status update on "${clientName}" in ${hoursSince} hours — action required. Please update the lead status or add a note.`,
        entityId:       lead._id,
        entityModel:    'GridLead',
        recipientId:    lead.created_by_agent,
        recipientModel: 'GridAgent',
        recipientRole:  'agent',
        createdByName:  'System',
        createdByRole:  'system',
      });
      sent++;
    }

    console.log(`[Cron] Lead inactivity alerts sent for ${sent} leads`);
  } catch (err) {
    console.error('[Cron] Lead inactivity alert failed:', err.message);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CRON 3 — Partner Agreement Expiry Reminder (30 days)
// Runs: Every day at 8 AM
// PRD §8.5 — "Admin notified 30 days before expiry, agent should also know"
// Uses: expiryDate + expiryAlertSentAt fields from PartnerAgreement model
// ════════════════════════════════════════════════════════════════════════════
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Running partner agreement expiry check...');
  try {
    const now           = new Date();
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Find active agreements expiring within 30 days
    // where expiryAlertSentAt is null (not yet sent) or sent more than 7 days ago
    const sevenDaysAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const expiringAgreements = await PartnerAgreement.find({
      status:     'active',
      expiryDate: { $gte: now, $lte: thirtyDaysOut },
      $or: [
        { expiryAlertSentAt: null },
        { expiryAlertSentAt: { $lt: sevenDaysAgo } },
      ],
    }).lean();

    let sent = 0;
    for (const agreement of expiringAgreements) {
      const daysLeft = Math.ceil(
        (new Date(agreement.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // ── Notify Admin ──────────────────────────────────────────
      await GridNotification.create({
        eventType:      'AGREEMENT_EXPIRY_REMINDER',
        title:          `Partner Agreement Expiring in ${daysLeft} Days ⚠️`,
        message:        `A partner agreement (${agreement.partyType}) is expiring on ${new Date(agreement.expiryDate).toLocaleDateString('en-GB')}. Renew it to avoid disruption to commission payouts.`,
        entityId:       agreement._id,
        entityModel:    'PartnerAgreement',
        recipientId:    null,
        recipientRole:  'admin',
        createdByName:  'System',
        createdByRole:  'system',
      });

      // ── Notify Agent (if applicable) ─────────────────────────
      if (agreement.agentId) {
        await GridNotification.create({
          eventType:      'AGREEMENT_EXPIRY_REMINDER',
          title:          `Your Partner Agreement Expires in ${daysLeft} Days ⚠️`,
          message:        `Your partner agreement with Xoto expires on ${new Date(agreement.expiryDate).toLocaleDateString('en-GB')}. Contact your admin to renew before the expiry date.`,
          entityId:       agreement._id,
          entityModel:    'PartnerAgreement',
          recipientId:    agreement.agentId,
          recipientModel: 'GridAgent',
          recipientRole:  'agent',
          createdByName:  'System',
          createdByRole:  'system',
        });
      }

      // ── Notify Agency (if applicable) ─────────────────────────
      if (agreement.agencyId) {
        await GridNotification.create({
          eventType:      'AGREEMENT_EXPIRY_REMINDER',
          title:          `Partner Agreement Expiring in ${daysLeft} Days ⚠️`,
          message:        `Your agency's partner agreement with Xoto expires on ${new Date(agreement.expiryDate).toLocaleDateString('en-GB')}. Please contact Xoto admin to renew.`,
          entityId:       agreement._id,
          entityModel:    'PartnerAgreement',
          recipientId:    agreement.agencyId,
          recipientModel: 'Agency',
          recipientRole:  'partner',
          createdByName:  'System',
          createdByRole:  'system',
        });
      }

      // ── Mark alert as sent on the agreement ──────────────────
      await PartnerAgreement.findByIdAndUpdate(agreement._id, {
        expiryAlertSentAt: now,
      });

      sent++;
    }

    console.log(`[Cron] Agreement expiry reminders sent for ${sent} agreements`);
  } catch (err) {
    console.error('[Cron] Agreement expiry reminder failed:', err.message);
  }
});

console.log('[GridNotificationCron] All cron jobs registered ✅');