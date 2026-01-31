const PropertyLead = require('../../models/consultant/propertyLead.model');
const Freelancer = require('../../models/Freelancer/freelancer.model');
const VendorB2C = require('../../models/Vendor/B2cvendor.model');
const Developer = require('../../../properties/models/DeveloperModel');
const Property = require('../../../properties/models/PropertyModel');

/* ---------------- DATE RANGE HELPER ---------------- */
const getDateRange = (range) => {
  const now = new Date();
  let from = new Date();

  switch (range) {
    case '30d':
      from.setDate(now.getDate() - 30);
      break;
    case '90d':
      from.setDate(now.getDate() - 90);
      break;
    default:
      from.setDate(now.getDate() - 7);
  }

  return { from, to: now };
};

/* ---------------- SUPERADMIN DASHBOARD ---------------- */
exports.superAdminDashboard = async (req, res) => {
  try {
    const range = req.query.range || '7d';
    const { from, to } = getDateRange(range);

    const [
      /* -------- LEADS -------- */
      totalLeads,
      leadStatus,
      leadTypes,
      leadsTimeline,

      /* -------- USERS -------- */
      activeFreelancers,
      pendingFreelancers,
      activeVendors,

      /* -------- DEVELOPERS -------- */
      totalDevelopers,
      verifiedDevelopers,

      /* -------- PROPERTIES -------- */
      propertyStats
    ] = await Promise.all([

      /* TOTAL LEADS */
      PropertyLead.countDocuments({ is_active: true }),

      /* LEADS BY STATUS */
   PropertyLead.aggregate([
  {
    $match: {
      type: {
        $in: [
          'buy',
          'sell',
          'rent',
          'schedule_visit',
          'partner',
          'investor',
          'developer',
          'enquiry',
          'ai_enquiry',
          'consultation',
          'mortgage'
        ]
      }
    }
  },
  {
    $group: {
      _id: '$type',
      count: { $sum: 1 }
    }
  }
]),


      /* LEADS BY TYPE */
      PropertyLead.aggregate([
        { $match: { is_deleted: false } },
        {
          $group: {
            _id: { $ifNull: ['$type', 'unknown'] },
            count: { $sum: 1 }
          }
        }
      ]),

      /* LEADS TIMELINE */
      PropertyLead.aggregate([
        {
          $match: {
            is_deleted: false,
            createdAt: { $gte: from, $lte: to }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            total: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      /* FREELANCERS */
      Freelancer.countDocuments({
        onboarding_status: 'approved',
        isActive: true
      }),

      Freelancer.countDocuments({
  onboarding_status: { $ne: 'approved' },
        isActive: true
      }),

      /* VENDORS */
      VendorB2C.countDocuments({
        onboarding_status: 'approved',
        isActive: true
      }),

      /* DEVELOPERS */
      Developer.countDocuments({}),
      Developer.countDocuments({ isVerifiedByAdmin: true }),

      /* PROPERTIES */
      Property.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            available: { $sum: { $cond: ['$isAvailable', 1, 0] } },
            featured: { $sum: { $cond: ['$isFeatured', 1, 0] } },
            notReady: { $sum: { $cond: ['$notReadyYet', 1, 0] } },
            // rent: {
            //   $sum: {
            //     $cond: [{ $eq: ['$transactionType', 'rent'] }, 1, 0]
            //   }
            // },
            // sell: {
            //   $sum: {
            //     $cond: [{ $eq: ['$transactionType', 'sell'] }, 1, 0]
            //   }
            // }
          }
        }
      ])
    ]);

    /* ---------------- RESPONSE ---------------- */
    res.json({
      success: true,
      data: {
        leads: {
          total: totalLeads,
          status: leadStatus,
          types: leadTypes,
          timeline: leadsTimeline
        },
        users: {
          freelancers: activeFreelancers,
          pendingFreelancers,
          vendors: activeVendors
        },
        developers: {
          total: totalDevelopers,
          verified: verifiedDevelopers
        },
        properties: propertyStats[0] || {
          total: 0,
          available: 0,
          featured: 0,
          notReady: 0,
          rent: 0,
          sell: 0
        }
      }
    });

  } catch (err) {
    console.error('SuperAdmin Dashboard Error:', err);
    res.status(500).json({
      success: false,
      message: 'Dashboard data fetch failed'
    });
  }
};

