const mongoose = require('mongoose');
const PropertyLead = require('../../models/consultant/propertyLead.model')
const Freelancer = require('../../models/Freelancer/freelancer.model');
const VendorB2C = require('../../models/Vendor/B2cvendor.model');
const Developer = require('../../../properties/models/DeveloperModel');
const Property = require('../../../properties/models/PropertyModel');
const Estimate = require('../../../auth/models/leads/estimate.model');
const Project = require('../../../auth/models/Freelancer/projectfreelancer.model');
const Product = require('../../../products/models/ProductModel')
const Purchase = require('../../../products/models/Purchase')
const MileStonebill = require("../../../auth/controllers/freelancer/models/MileStoneBill"); // adjust path if needed

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
      // PropertyLead.aggregate([
      //   { $match: { is_deleted: false } },
      //   {
      //     $group: {
      //       _id: { $ifNull: ['$type', 'unknown'] },
      //       count: { $sum: 1 }
      //     }
      //   }
      // ]),

      PropertyLead.aggregate([
        { $match: { is_deleted: false } },
        {
          $group: {
            _id: { $ifNull: ['$type', 'unknown'] },
            count: { $sum: 1 }
          }
        },
        {
          $match: { _id: { $ne: 'unknown' } }
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



// exports.supervisorDashboard = async (req, res) => {
//   try {

//     let date = 

//     const { supervisor_id } = req.query;

//     let assigned_estimates = await Estimate.countDocuments({ assigned_supervisor: supervisor_id });

//     let pending_estimates = await Estimate.countDocuments({ assigned_supervisor: supervisor_id, status: "pending" })

//     let completed_projects = await Project.countDocuments({ assigned_supervisor: supervisor_id, status: "completed" });

//     let pending_projects = await Project.countDocuments({ assigned_supervisor: supervisor_id, status: "in_progress" })
//     /* ---------------- RESPONSE ---------------- */

//     let top_five_projects = await Project.find({ assigned_supervisor: supervisor_id }).sort({ createdAt: -1 }).limit(5);

//     let estimate_graph = await Estimate

//     res.json({
//       success: true,
//       data: {
//         assigned_estimates, pending_estimates, completed_projects, pending_projects, top_five_projects
//       }
//     });

//   } catch (err) {
//     console.error('SupervispDashboard Error Dashboard Error:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Dashboard data fetch failed'
//     });
//   }
// };



exports.supervisorDashboard = async (req, res) => {
  try {
    const { supervisor_id, from, to } = req.query;

    const parseDate = (d) => {
      const [dd, mm, yyyy] = d.split("-");
      return new Date(`${yyyy}-${mm}-${dd}`);
    };

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    let assigned_estimates = await Estimate.countDocuments({
      assigned_supervisor: supervisor_id
    });

    let pending_estimates = await Estimate.countDocuments({
      assigned_supervisor: supervisor_id,
      status: "pending"
    });

    let completed_projects = await Project.countDocuments({
      assigned_supervisor: supervisor_id,
      status: "completed"
    });

    let pending_projects = await Project.countDocuments({
      assigned_supervisor: supervisor_id,
      status: "in_progress"
    });

    let top_five_projects = await Project.find({
      assigned_supervisor: supervisor_id
    })
      .sort({ createdAt: -1 })
      .limit(5);

    /* -------- GRAPH DATA (SIMPLE AF) -------- */
    console.log("fromDatefromDatefromDatefromDatefromDatefromDate", fromDate, toDate)
    const estimates = await Estimate.find({
      assigned_supervisor: supervisor_id,
      createdAt: { $gte: fromDate, $lte: toDate }
    })

    const graph = {};

    estimates.forEach(e => {
      const date = e.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
      graph[date] = (graph[date] || 0) + 1;
    });

    const estimate_graph = Object.keys(graph)
      .sort()
      .map(date => ({
        date,
        total: graph[date]
      }));

    res.json({
      success: true,
      data: {
        assigned_estimates,
        pending_estimates,
        completed_projects,
        pending_projects,
        top_five_projects,
        estimate_graph
      }
    });

  } catch (err) {
    console.error('SupervisorDashboard Error:', err);
    res.status(500).json({
      success: false,
      message: 'Dashboard data fetch failed'
    });
  }
};

exports.freelancerDashboard = async (req, res) => {
  try {
    const { freelancer_id, from, to } = req.query;

    const parseDate = (d) => {
      const [dd, mm, yyyy] = d.split("-");
      return new Date(`${yyyy}-${mm}-${dd}`);
    };

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    let assigned_estimates = await Estimate.countDocuments({
      sent_to_freelancers: { $in: [freelancer_id] }
    });

    let pending_estimates = await Estimate.countDocuments({
      sent_to_freelancers: { $in: [freelancer_id] },
      status: "pending"
    });

    let completed_projects = await Project.countDocuments({
      assigned_freelancer: freelancer_id,
      status: "completed"
    });

    let pending_projects = await Project.countDocuments({
      assigned_freelancer: freelancer_id,
      status: "in_progress"
    });

    let top_five_projects = await Project.find({
      assigned_freelancer: freelancer_id
    })
      .sort({ createdAt: -1 })
      .limit(5);

    /* -------- GRAPH DATA (SIMPLE AF) -------- */
    console.log("fromDatefromDatefromDatefromDatefromDatefromDate", fromDate, toDate)
    const estimates = await Estimate.find({
      sent_to_freelancers: { $in: [freelancer_id] },
      createdAt: { $gte: fromDate, $lte: toDate }
    })

    const graph = {};

    estimates.forEach(e => {
      const date = e.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
      graph[date] = (graph[date] || 0) + 1;
    });

    const estimate_graph = Object.keys(graph)
      .sort()
      .map(date => ({
        date,
        total: graph[date]
      }));

    res.json({
      success: true,
      data: {
        assigned_estimates,
        pending_estimates,
        completed_projects,
        pending_projects,
        top_five_projects,
        estimate_graph
      }
    });

  } catch (err) {
    console.error('SupervisorDashboard Error:', err);
    res.status(500).json({
      success: false,
      message: 'Dashboard data fetch failed'
    });
  }
};


exports.vendorDashboard = async (req, res) => {
  try {
    const { vendor_id, from, to } = req.query;

    const parseDate = (d) => {
      const [dd, mm, yyyy] = d.split("-");
      return new Date(`${yyyy}-${mm}-${dd}`);
    };

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    /* ---------------- TOTAL PRODUCTS ---------------- */
    const total_products = await Product.countDocuments({
      vendor_id
    });

    /* ---------------- TOTAL ORDERS (PAID PURCHASES) ---------------- */
    const total_orders = await Purchase.countDocuments({
      status: "paid",
      createdAt: { $gte: fromDate, $lte: toDate }
    });

    /* ---------------- TOTAL REVENUE ---------------- */
    const revenueAgg = await Purchase.aggregate([
      {
        $match: {
          status: "paid",
          createdAt: { $gte: fromDate, $lte: toDate }
        }
      },
      {
        $group: {
          _id: null,
          total_revenue: { $sum: "$total_price" }
        }
      }
    ]);

    const total_revenue = revenueAgg[0]?.total_revenue || 0;

    /* ---------------- TOP 5 PRODUCTS (FROM PURCHASE) ---------------- */
      let top_products = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5);

    /* ---------------- SALES GRAPH (DATE-WISE REVENUE) ---------------- */
    const salesGraphAgg = await Purchase.aggregate([
      {
        $match: {
          status: "paid",
          createdAt: { $gte: fromDate, $lte: toDate }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            }
          },
          total_revenue: { $sum: "$total_price" }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    const sales_graph = salesGraphAgg.map(d => ({
      date: d._id.date,
      total_revenue: d.total_revenue
    }));

    return res.status(200).json({
      success: true,
      data: {
        total_products,
        total_orders,
        total_revenue,
        top_products,
        sales_graph
      }
    });

  } catch (error) {
    console.error("Vendor Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Vendor dashboard fetch failed"
    });
  }
};

exports.customerDashboard = async (req, res) => {
  try {
    const { customer_id, from, to } = req.query;

    const parseDate = (d) => {
      const [dd, mm, yyyy] = d.split("-");
      return new Date(`${yyyy}-${mm}-${dd}`);
    };

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    /* ---------------- TOTAL ESTIMATES ---------------- */
    const total_estimates = await Estimate.countDocuments({
      customer: customer_id
    });

    /* ---------------- TOTAL PROJECTS ---------------- */
    const total_projects = await Project.countDocuments({
      customer: customer_id
    });

    /* ---------------- TOTAL ORDERS ---------------- */
    const total_orders = await Purchase.countDocuments({
      customer_id,
      status: "paid",
      createdAt: { $gte: fromDate, $lte: toDate }
    });

    /* ---------------- TOTAL PURCHASED PRODUCTS (QUANTITY) ---------------- */
    const productsAgg = await Purchase.aggregate([
      {
        $match: {
          customer_id: new mongoose.Types.ObjectId(customer_id),
          status: "paid",
          createdAt: { $gte: fromDate, $lte: toDate }
        }
      },
      { $unwind: "$EcommerceCartitems" },
      {
        $lookup: {
          from: "EcommerceCartItem",
          localField: "EcommerceCartitems",
          foreignField: "_id",
          as: "cartItem"
        }
      },
      { $unwind: "$cartItem" },
      {
        $group: {
          _id: null,
          total_products: { $sum: "$cartItem.quantity" }
        }
      }
    ]);

    const total_products = productsAgg[0]?.total_products || 0;

    /* ---------------- TOTAL SPENT (REVENUE) ---------------- */
    const revenueAgg = await Purchase.aggregate([
      {
        $match: {
          customer_id: new mongoose.Types.ObjectId(customer_id),
          status: "paid",
          createdAt: { $gte: fromDate, $lte: toDate }
        }
      },
      {
        $group: {
          _id: null,
          total_spent: { $sum: "$total_price" }
        }
      }
    ]);

    const total_spent = revenueAgg[0]?.total_spent || 0;

   

    /* ---------------- PURCHASE GRAPH (DATE-WISE SPEND) ---------------- */
    const salesGraphAgg = await Purchase.aggregate([
      {
        $match: {
          customer_id: new mongoose.Types.ObjectId(customer_id),
          status: "paid",
          createdAt: { $gte: fromDate, $lte: toDate }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            }
          },
          total_spent: { $sum: "$total_price" }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    const purchase_graph = salesGraphAgg.map(d => ({
      date: d._id.date,
      total_spent: d.total_spent
    }));

    /* ---------------- RESPONSE ---------------- */
    return res.status(200).json({
      success: true,
      data: {
        total_estimates,
        total_projects,
        total_orders,
        total_products,
        total_spent,
        purchase_graph
      }
    });

  } catch (error) {
    console.error("Customer Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Customer dashboard fetch failed"
    });
  }
};

exports.accountantDashboard = async (req, res) => {
  try {
    const { accountant_id, from, to } = req.query;

    /* ---------------- DATE FILTER ---------------- */
    let dateFilter = {};
    if (from && to) {
      const parseDate = (d) => {
        const [dd, mm, yyyy] = d.split("-");
        return new Date(`${yyyy}-${mm}-${dd}`);
      };

      dateFilter.createdAt = {
        $gte: parseDate(from),
        $lte: parseDate(to)
      };
    }

    /* ---------------- TOTAL PROJECTS ---------------- */
    const total_projects = await Project.countDocuments({
      accountant: accountant_id
    });

    /* ---------------- TOTAL BILLS ---------------- */
    const total_bills = await MileStonebill.countDocuments({
      ...dateFilter
    });

    /* ---------------- PAID / UNPAID BILLS ---------------- */
    const paid_bills = await MileStonebill.countDocuments({
      is_paid: true,
      ...dateFilter
    });

    const unpaid_bills = await MileStonebill.countDocuments({
      is_paid: false,
      ...dateFilter
    });

    /* ---------------- COLLECTED AMOUNT ---------------- */
    const collectedAgg = await MileStonebill.aggregate([
      {
        $match: {
          is_paid: true,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          collected_amount: { $sum: "$price" }
        }
      }
    ]);

    const collected_amount = collectedAgg[0]?.collected_amount || 0;

    /* ---------------- PENDING AMOUNT ---------------- */
    const pendingAgg = await MileStonebill.aggregate([
      {
        $match: {
          is_paid: false,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          pending_amount: { $sum: "$price" }
        }
      }
    ]);

    const pending_amount = pendingAgg[0]?.pending_amount || 0;

    /* ---------------- RECENT BILLS ---------------- */
    const recent_bills = await MileStonebill.find(dateFilter)
      .populate("project_id", "Code title")
      .populate("customer_id", "name email")
      .sort({ createdAt: -1 })
      .limit(10);

    /* ---------------- RESPONSE ---------------- */
    return res.status(200).json({
      success: true,
      data: {
        total_projects,
        total_bills,
        paid_bills,
        unpaid_bills,
        collected_amount,
        pending_amount,
        recent_bills
      }
    });

  } catch (error) {
    console.error("Accountant Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load accountant dashboard"
    });
  }
};





