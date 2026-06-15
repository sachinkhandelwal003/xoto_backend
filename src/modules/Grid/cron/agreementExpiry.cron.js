const cron = require('node-cron');
const PartnerAgreement = require('../../Grid/dealrecord/models/Partneragreement.model.js');
const GridNotification = require('../../Grid/Notification/gridnotificationmodal.js').default;

const checkAgreementExpiry = async () => {
  try {
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    // 30 din ke andar expire hone wale active agreements
    const expiringAgreements = await PartnerAgreement.find({
      status:     'active',
      expiryDate: { $gte: today, $lte: thirtyDaysLater },
    }).populate('agentId',          'first_name last_name email')
      .populate('agencyId',         'companyName primaryContactEmail')
      .populate('referralPartnerId', 'firstName lastName phone');

    console.log(`[AgreementExpiryCron] Found ${expiringAgreements.length} expiring agreements`);

    for (const agreement of expiringAgreements) {
      const daysLeft = Math.ceil((new Date(agreement.expiryDate) - today) / (1000 * 60 * 60 * 24));

      // Partner name resolve karo
      let partnerName = 'Unknown';
      let partnerType = agreement.partyType || 'partner';

      if (agreement.agentId) {
        partnerName = `${agreement.agentId.first_name || ''} ${agreement.agentId.last_name || ''}`.trim();
        partnerType = 'Agent';
      } else if (agreement.agencyId) {
        partnerName = agreement.agencyId.companyName || 'Agency';
        partnerType = 'Agency';
      } else if (agreement.referralPartnerId) {
        partnerName = `${agreement.referralPartnerId.firstName || ''} ${agreement.referralPartnerId.lastName || ''}`.trim();
        partnerType = 'Referral Partner';
      }

      // Duplicate check — same agreement ke liye aaj already notification gayi?
      const alreadyNotified = await GridNotification.findOne({
        entityId:  agreement._id,
        eventType: 'AGREEMENT_EXPIRY_WARNING',
        createdAt: { $gte: new Date(today.setHours(0, 0, 0, 0)) },
      });

      if (alreadyNotified) continue;

      await GridNotification.create({
        eventType:     'AGREEMENT_EXPIRY_WARNING',
        title:         `Partner Agreement Expiring in ${daysLeft} Days ⚠️`,
        message:       `${partnerType} agreement for ${partnerName} expires on ${new Date(agreement.expiryDate).toLocaleDateString('en-GB')} (${daysLeft} days left). Action required: Initiate new agreement version and facilitate re-signing.`,
        entityId:      agreement._id,
        entityModel:   'PartnerAgreement',
        recipientId:   null,
        recipientRole: 'admin',
        createdByName: 'System',
        createdByRole: 'System',
      });

      console.log(`[AgreementExpiryCron] Notification sent for ${partnerName} — ${daysLeft} days left`);
    }
  } catch (err) {
    console.error('[AgreementExpiryCron] Error:', err.message);
  }
};

// Har roz subah 9 baje run karega
cron.schedule('0 9 * * *', () => {
  console.log('[AgreementExpiryCron] Running daily agreement expiry check...');
  checkAgreementExpiry();
}, {
  timezone: 'Asia/Dubai'
});

console.log('[AgreementExpiryCron] Scheduled — runs daily at 9:00 AM Dubai time');

module.exports = { checkAgreementExpiry };