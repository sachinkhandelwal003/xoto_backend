const cron = require('node-cron');
const GridReferralPartner = require('../ReferralPartner/Model/ReferralPartner.model');
const PartnerAgreement    = require('../dealrecord/models/Partneragreement.model');
const GridNotification    = require('../Notification/gridnotificationmodal').default;

const runReferralPartnerAlerts = async () => {
  try {
    const now = new Date();

    // ── 1. Profile Incomplete Weekly Reminder ─────────────────────────────
    const incompletePartners = await GridReferralPartner.find({
      status: 'active',
      $or: [
        { idDocumentUrl:  { $in: [null, ''] } },
        { 'bankDetails.iban': { $in: [null, ''] } },
        { isProfileComplete: false },
      ],
    }).select('_id firstName lastName');

    for (const partner of incompletePartners) {
      // Last 7 din mein already reminder gayi?
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const alreadyNotified = await GridNotification.findOne({
        eventType:   'PROFILE_INCOMPLETE_REMINDER',
        recipientId: partner._id,
        createdAt:   { $gte: sevenDaysAgo },
      });
      if (alreadyNotified) continue;

      await GridNotification.create({
        eventType:     'PROFILE_INCOMPLETE_REMINDER',
        title:         'Complete Your Profile to Unlock Payouts 📋',
        message:       `Hi ${partner.firstName}, your profile is incomplete. Please upload your ID document and bank details to become eligible for commission payouts. Incomplete profiles cannot receive payments.`,
        entityId:      partner._id,
        entityModel:   'GridReferralPartner',
        recipientId:   partner._id,
        recipientModel:'GridReferralPartner',
        recipientRole: 'gridreferralpartner',
        createdByName: 'System',
        createdByRole: 'system',
      }).catch(err => console.error('Profile reminder failed:', err.message));
    }

    // ── 2. Agreement Expiry Reminder (30 days) ────────────────────────────
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringAgreements = await PartnerAgreement.find({
      status:            'active',
      referralPartnerId: { $ne: null },
      expiryDate:        { $gte: now, $lte: thirtyDaysLater },
    }).select('_id referralPartnerId expiryDate');

    for (const agreement of expiringAgreements) {
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const alreadyNotified = await GridNotification.findOne({
        eventType:   'REFERRAL_AGREEMENT_EXPIRY',
        entityId:    agreement._id,
        createdAt:   { $gte: sevenDaysAgo },
      });
      if (alreadyNotified) continue;

      const daysLeft = Math.ceil((new Date(agreement.expiryDate) - now) / (1000 * 60 * 60 * 24));

      await GridNotification.create({
        eventType:     'REFERRAL_AGREEMENT_EXPIRY',
        title:         `Your Partner Agreement Expires in ${daysLeft} Days ⚠️`,
        message:       `Your referral partner agreement with Xoto expires on ${new Date(agreement.expiryDate).toLocaleDateString('en-GB')}. Please contact Xoto admin to renew or renegotiate before the expiry date to avoid service disruption.`,
        entityId:      agreement._id,
        entityModel:   'PartnerAgreement',
        recipientId:   agreement.referralPartnerId,
        recipientModel:'GridReferralPartner',
        recipientRole: 'gridreferralpartner',
        createdByName: 'System',
        createdByRole: 'system',
      }).catch(err => console.error('Agreement expiry notification failed:', err.message));
    }

    console.log('[ReferralPartnerAlertsCron] All alerts processed ✅');
  } catch (err) {
    console.error('[ReferralPartnerAlertsCron] Error:', err.message);
  }
};

// Har Sunday 9 AM Dubai time
cron.schedule('0 9 * * 0', () => {
  console.log('[ReferralPartnerAlertsCron] Running weekly alerts...');
  runReferralPartnerAlerts();
}, { timezone: 'Asia/Dubai' });

console.log('[ReferralPartnerAlertsCron] Scheduled — runs every Sunday at 9:00 AM Dubai time');
module.exports = { runReferralPartnerAlerts };