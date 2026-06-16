const cron        = require('node-cron');
const Property    = require('../../properties/models/property.model');
const GridLead    = require('../Lead/model/gridLead.model');
const Developer   = require('../Developer/models/developer.model');
const GridNotification = require('../Notification/gridnotificationmodal').default;

const VIEW_MILESTONE    = 1000;  // 1000 views
const FEATURED_EXPIRY_DAYS = 7;  // 7 din pehle remind karo
const AGREEMENT_EXPIRY_DAYS = 30; // 30 din pehle remind karo

const runDeveloperAlerts = async () => {
  try {
    const now = new Date();

    // ── 1. New Enquiry/Lead on Developer Listing ──────────────────────────
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const recentLeads = await GridLead.find({
      'source.listing_id': { $ne: null },
      createdAt: { $gte: oneDayAgo },
    }).populate('source.listing_id', 'developer propertyName projectName');

    for (const lead of recentLeads) {
      const property = lead.source?.listing_id;
      if (!property?.developer) continue;

      const alreadyNotified = await GridNotification.findOne({
        eventType: 'NEW_ENQUIRY_ON_LISTING',
        entityId:  lead._id,
      });
      if (alreadyNotified) continue;

      await GridNotification.create({
        eventType:     'NEW_ENQUIRY_ON_LISTING',
        title:         'New Interest on Your Listing 👀',
        message:       `A new enquiry has been received on "${property.propertyName || property.projectName}". Note: Customer contact details are private per platform policy. You can view aggregated interest counts in your dashboard.`,
        entityId:      lead._id,
        entityModel:   'GridLead',
        recipientId:   property.developer,
        recipientModel:'Developer',
        recipientRole: 'developer',
        createdByName: 'System',
        createdByRole: 'System',
      }).catch(err => console.error('Enquiry notification failed:', err.message));
    }

    // ── 2. Listing Performance Milestone (1000 views) ─────────────────────
    const hotListings = await Property.find({
      developer:      { $ne: null },
      approvalStatus: 'approved',
      viewCount:      { $gte: VIEW_MILESTONE },
    }).select('developer propertyName projectName viewCount');

    for (const property of hotListings) {
      const alreadyNotified = await GridNotification.findOne({
        eventType: 'LISTING_VIEW_MILESTONE',
        entityId:  property._id,
        message:   { $regex: `${property.viewCount}` },
      });
      if (alreadyNotified) continue;

      await GridNotification.create({
        eventType:     'LISTING_VIEW_MILESTONE',
        title:         `Your Listing Hit ${property.viewCount.toLocaleString()} Views 🎯`,
        message:       `"${property.propertyName || property.projectName}" has reached ${property.viewCount.toLocaleString()} views. Consider leveraging this interest for marketing or adjusting pricing to accelerate conversions.`,
        entityId:      property._id,
        entityModel:   'Properties',
        recipientId:   property.developer,
        recipientModel:'Developer',
        recipientRole: 'developer',
        createdByName: 'System',
        createdByRole: 'System',
      }).catch(err => console.error('View milestone notification failed:', err.message));
    }

    // ── 3. Featured Listing Expiry (7 days) ──────────────────────────────
    const sevenDaysLater = new Date(now.getTime() + FEATURED_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const expiringFeatured = await Property.find({
      developer:      { $ne: null },
      isFeatured:     true,
      featuredUntil:  { $gte: now, $lte: sevenDaysLater },
    }).select('developer propertyName projectName featuredUntil');

    for (const property of expiringFeatured) {
      const alreadyNotified = await GridNotification.findOne({
        eventType: 'FEATURED_LISTING_EXPIRY',
        entityId:  property._id,
        createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
      });
      if (alreadyNotified) continue;

      const daysLeft = Math.ceil((new Date(property.featuredUntil) - now) / (1000 * 60 * 60 * 24));

      await GridNotification.create({
        eventType:     'FEATURED_LISTING_EXPIRY',
        title:         `Featured Listing Expires in ${daysLeft} Days ⏰`,
        message:       `Your featured listing "${property.propertyName || property.projectName}" will expire on ${new Date(property.featuredUntil).toLocaleDateString('en-GB')}. Contact Xoto admin to renew or extend your featured placement.`,
        entityId:      property._id,
        entityModel:   'Properties',
        recipientId:   property.developer,
        recipientModel:'Developer',
        recipientRole: 'developer',
        createdByName: 'System',
        createdByRole: 'System',
      }).catch(err => console.error('Featured expiry notification failed:', err.message));
    }

    // ── 4. Developer Agreement Expiry (30 days) ───────────────────────────
    const thirtyDaysLater = new Date(now.getTime() + AGREEMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const expiringDevelopers = await Developer.find({
      accountStatus:     'active',
      agreementExpiryDate: { $gte: now, $lte: thirtyDaysLater },
    }).select('_id companyName name agreementExpiryDate');

    for (const developer of expiringDevelopers) {
      const alreadyNotified = await GridNotification.findOne({
        eventType:   'DEVELOPER_AGREEMENT_EXPIRY',
        recipientId: developer._id,
        createdAt:   { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
      });
      if (alreadyNotified) continue;

      const daysLeft = Math.ceil((new Date(developer.agreementExpiryDate) - now) / (1000 * 60 * 60 * 24));

      await GridNotification.create({
        eventType:     'DEVELOPER_AGREEMENT_EXPIRY',
        title:         `Commercial Agreement Expires in ${daysLeft} Days ⚠️`,
        message:       `Your commercial agreement with Xoto expires on ${new Date(developer.agreementExpiryDate).toLocaleDateString('en-GB')}. Please contact Xoto admin to renew or renegotiate before the expiry date to avoid service disruption.`,
        entityId:      developer._id,
        entityModel:   'Developer',
        recipientId:   developer._id,
        recipientModel:'Developer',
        recipientRole: 'developer',
        createdByName: 'System',
        createdByRole: 'System',
      }).catch(err => console.error('Developer agreement expiry notification failed:', err.message));
    }

    console.log('[DeveloperAlertsCron] All developer alerts processed ✅');
  } catch (err) {
    console.error('[DeveloperAlertsCron] Error:', err.message);
  }
};

// Har 6 ghante chalega
cron.schedule('0 */6 * * *', () => {
  console.log('[DeveloperAlertsCron] Running developer alerts...');
  runDeveloperAlerts();
}, { timezone: 'Asia/Dubai' });

console.log('[DeveloperAlertsCron] Scheduled — runs every 6 hours');
module.exports = { runDeveloperAlerts };