// controllers/vault.statistics.controller.js

import mongoose from 'mongoose';
import Case from '../models/Case.js';
import VaultLead from '../models/VaultLead.js';
import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import Commission from '../models/Commission.js';
import XotoAdvisor from '../models/XotoAdvisor.js';
import MortgageOps from '../models/MortgageOps.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'System';
  if (roleId) {
    const roleDoc = await Role.findById(roleId);
    if (roleDoc?.code === '18') userRole = 'Admin';
    else if (roleDoc?.code === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent') userRole = 'FreelanceAgent';
    else if (req.user?.agentType === 'PartnerAffiliatedAgent') userRole = 'PartnerAffiliatedAgent';
    else if (req.user?.employeeType === 'XotoAdvisor') userRole = 'Advisor';
    else if (req.user?.employeeType === 'MortgageOps') userRole = 'MortgageOps';
  }
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

// ==================== ADMIN DASHBOARD STATISTICS ====================

// ==================== ADMIN DASHBOARD STATISTICS ====================

export const getAdminDashboardStats = async (req, res) => {
  try {

    // ==================== ROLE CHECK ====================

    const roleDoc = await Role.findById(req.user.role);

    if (roleDoc?.code !== '18') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // ==================== DATE FILTER ====================

    const { range, fromDate, toDate } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    let dateFilter = {};

    if (range === 'today') {
      dateFilter = {
        createdAt: { $gte: today }
      };
    }

    else if (range === 'week') {
      dateFilter = {
        createdAt: { $gte: weekAgo }
      };
    }

    else if (range === 'month') {
      dateFilter = {
        createdAt: { $gte: monthAgo }
      };
    }

    else if (fromDate && toDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        }
      };
    }

    // ==================== LEAD FILTER ====================

    const leadFilter = {
      isDeleted: false,
      'sourceInfo.source': {
        $in: ['website', 'freelance_agent', 'admin']
      },
      ...dateFilter
    };

    // ==================== KPI COUNTS ====================

    const [
      totalLeads,
      activeCases,
      totalPartners,
      totalFreelanceAgents,
      totalAdvisors,
      totalOpsExecutives,
      disbursedCases,
      pendingCases,
      slaBreachedLeads
    ] = await Promise.all([

      // TOTAL LEADS
      VaultLead.countDocuments(leadFilter),

      // ACTIVE CASES
      Case.countDocuments({
        isDeleted: false,
        currentStatus: {
          $nin: ['Disbursed', 'Rejected', 'Lost']
        }
      }),

      // PARTNERS
      Partner.countDocuments({
        isDeleted: false,
        status: 'active'
      }),

      // FREELANCE AGENTS ONLY
      VaultAgent.countDocuments({
        isDeleted: false,
        isActive: true,
        agentType: 'FreelanceAgent'
      }),

      // ADVISORS
      XotoAdvisor.countDocuments({
        isDeleted: false,
        isActive: true
      }),

      // OPS
      MortgageOps.countDocuments({
        isDeleted: false,
        isActive: true
      }),

      // DISBURSED CASES
      Case.countDocuments({
        isDeleted: false,
        currentStatus: 'Disbursed'
      }),

      // PENDING CASES
      Case.countDocuments({
        isDeleted: false,
        currentStatus: {
          $in: [
            'Draft',
            'Submitted to Xoto',
            'In Ops Queue - Pending Pick-up',
            'Under Review',
            'Bank Application',
            'Pre-Approved',
            'Valuation',
            'FOL Issued',
            'FOL Signed'
          ]
        }
      }),

      // SLA BREACH
      VaultLead.countDocuments({
        isDeleted: false,
        'sla.breached': true
      })

    ]);

    // ==================== CONVERSION RATE ====================

    const leadToCaseConversionRate =
      totalLeads > 0
        ? Number(((disbursedCases / totalLeads) * 100).toFixed(2))
        : 0;

    // ==================== LEAD STATUS ====================

    const leadsByStatus = await VaultLead.aggregate([
      {
        $match: leadFilter
      },
      {
        $group: {
          _id: '$currentStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const leadStatusMap = {};

    leadsByStatus.forEach(item => {
      leadStatusMap[item._id] = item.count;
    });

    const leadStatus = {
      new: leadStatusMap['New'] || 0,
      assigned: leadStatusMap['Assigned'] || 0,
      contacted: leadStatusMap['Contacted'] || 0,
      qualified: leadStatusMap['Qualified'] || 0,
      collectingDocuments: leadStatusMap['Collecting Documents'] || 0,
      applicationCreated: leadStatusMap['Application Created'] || 0,
      notProceeding: leadStatusMap['Not Proceeding'] || 0,
      disbursed: leadStatusMap['Disbursed'] || 0
    };

    // ==================== CASE STATUS ====================

    const casesByStatus = await Case.aggregate([
      {
        $match: {
          isDeleted: false
        }
      },
      {
        $group: {
          _id: '$currentStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const caseStatusMap = {};

    casesByStatus.forEach(item => {
      caseStatusMap[item._id] = item.count;
    });

    const caseStatus = {
      draft: caseStatusMap['Draft'] || 0,
      submittedToXoto: caseStatusMap['Submitted to Xoto'] || 0,
      inOpsQueue: caseStatusMap['In Ops Queue - Pending Pick-up'] || 0,
      underReview: caseStatusMap['Under Review'] || 0,
      bankApplication: caseStatusMap['Bank Application'] || 0,
      preApproved: caseStatusMap['Pre-Approved'] || 0,
      valuation: caseStatusMap['Valuation'] || 0,
      folIssued: caseStatusMap['FOL Issued'] || 0,
      folSigned: caseStatusMap['FOL Signed'] || 0,
      disbursed: caseStatusMap['Disbursed'] || 0,
      rejected: caseStatusMap['Rejected'] || 0,
      lost: caseStatusMap['Lost'] || 0
    };

    // ==================== LEADS OVER TIME ====================

    const leadsOverTime = await VaultLead.aggregate([
      {
        $match: {
          createdAt: { $gte: monthAgo },
          isDeleted: false,
          'sourceInfo.source': {
            $in: ['website', 'freelance_agent', 'admin']
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // ==================== CASES OVER TIME ====================

    const casesOverTime = await Case.aggregate([
      {
        $match: {
          createdAt: { $gte: monthAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // ==================== DISBURSEMENT GRAPH ====================

    const disbursementsOverTime = await Case.aggregate([
      {
        $match: {
          currentStatus: 'Disbursed',
          updatedAt: { $gte: monthAgo },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$updatedAt'
            }
          },
          count: { $sum: 1 },
          totalAmount: {
            $sum: '$loanInfo.disbursedAmount'
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // ==================== LEADS BY SOURCE ====================

    const leadsBySource = await VaultLead.aggregate([
      {
        $match: {
          isDeleted: false,
          'sourceInfo.source': {
            $in: ['website', 'freelance_agent', 'admin']
          },
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$sourceInfo.source',
          count: { $sum: 1 }
        }
      }
    ]);

    const sourceBreakdown = leadsBySource.map(item => ({
      name:
        item._id === 'website'
          ? 'Website'
          : item._id === 'freelance_agent'
          ? 'Freelance Agent'
          : 'Admin',
      value: item.count
    }));

    // ==================== OPS MONITORING ====================

    const queueCount = await Case.countDocuments({
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    });

    const urgentCases = await Case.find({
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    }).select('createdAt');

    const urgentCount = urgentCases.filter(c => {
      const hours =
        (Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60);

      return hours > 48;
    }).length;

    // ==================== ADVISOR MONITORING ====================

    const advisors = await XotoAdvisor.find({
      isDeleted: false,
      isActive: true
    }).select(
      'workload performanceMetrics'
    );

    const overloadedAdvisors = advisors.filter(
      a =>
        a.workload.currentLeads >=
        a.workload.maxLeadsCapacity
    ).length;

    const availableAdvisors = advisors.filter(
      a =>
        a.workload.currentLeads <
        a.workload.maxLeadsCapacity
    ).length;

    // ==================== FINAL RESPONSE ====================

    return res.status(200).json({
      success: true,

      filters: {
        range: range || null,
        fromDate: fromDate || null,
        toDate: toDate || null
      },

      data: {

        kpis: {
          totalLeads,
          activeCases,
          totalPartners,
          totalFreelanceAgents,
          totalAdvisors,
          totalOpsExecutives,
          leadToCaseConversionRate,
          disbursedCases,
          pendingCases,
          slaBreachedLeads
        },

        leadStatus,

        caseStatus,

        graphs: {

          leadsOverTime: leadsOverTime.map(item => ({
            date: item._id,
            count: item.count
          })),

          casesOverTime: casesOverTime.map(item => ({
            date: item._id,
            count: item.count
          })),

          disbursementsOverTime:
            disbursementsOverTime.map(item => ({
              date: item._id,
              count: item.count,
              totalAmount: item.totalAmount || 0
            })),

          leadsBySource: sourceBreakdown
        },

        opsMonitoring: {
          queueCount,
          urgentCount
        },

        advisorMonitoring: {
          overloadedAdvisors,
          availableAdvisors
        },

        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {

    console.error(
      'Admin dashboard stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


// ==================== PARTNER DASHBOARD STATISTICS ====================
// ==================== PARTNER DASHBOARD STATISTICS ====================

export const getPartnerDashboardStats = async (req, res) => {
  try {

    const partnerId = req.user._id;

    // ==================== GET PARTNER ====================

    const partner = await Partner.findById(partnerId);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const isCompany =
      partner.partnerCategory === 'company';

    // ==================== DATE FILTER ====================

    const { range, fromDate, toDate } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    let dateFilter = {};

    if (range === 'today') {

      dateFilter = {
        createdAt: { $gte: today }
      };

    } else if (range === 'week') {

      dateFilter = {
        createdAt: { $gte: weekAgo }
      };

    } else if (range === 'month') {

      dateFilter = {
        createdAt: { $gte: monthAgo }
      };

    } else if (fromDate && toDate) {

      dateFilter = {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        }
      };

    }

    // ==================== GET AGENTS ====================

    let affiliatedAgents = [];
    let agentIds = [];

    if (isCompany) {

      affiliatedAgents = await VaultAgent.find({
        partnerId,
        agentType: 'PartnerAffiliatedAgent',
        isDeleted: false
      }).select('_id');

      agentIds = affiliatedAgents.map(a => a._id);

    }

    // ==================== LEAD FILTER ====================

    let leadFilter = {
      isDeleted: false,
      ...dateFilter
    };

  if (isCompany) {

  leadFilter = {
    ...leadFilter,

    $or: [

      // Direct partner-created leads
      {
        'sourceInfo.createdById': partnerId,
        'sourceInfo.createdByModel': 'Partner'
      },

      // Affiliated agent-created leads
      {
        'sourceInfo.createdById': {
          $in: agentIds
        },
        'sourceInfo.createdByModel': 'VaultAgent'
      }

    ]
  };

}else {

      leadFilter = {
        ...leadFilter,
        'sourceInfo.createdById': partnerId,
        'sourceInfo.createdByModel': 'Partner'
      };

    }

    // ==================== CASE FILTER ====================

  // ==================== CASE FILTER ====================

let caseFilter = {
  isDeleted: false,
  ...dateFilter
};

if (isCompany) {

  caseFilter = {
    ...caseFilter,

    $or: [

      // Direct partner-created cases
      {
        'createdBy.role': 'partner',
        'createdBy.partnerId': partnerId
      },

      // Affiliated agent-created cases
      {
        'createdBy.role': 'affiliated_agent',
        'createdBy.userId': {
          $in: agentIds
        }
      }

    ]
  };

} else {

  // Individual partner direct cases

  caseFilter = {
    ...caseFilter,
    'createdBy.partnerId': partnerId,
    'createdBy.role': 'partner'
  };

}

    // ==================== COMMISSION FILTER ====================

    const commissionFilter = {
      recipientId: partnerId,
      recipientRole: 'partner',
      isDeleted: false,
      ...dateFilter
    };

    // ==================== KPI COUNTS ====================

    const [

      totalLeads,

      activeCases,

      disbursedLeads,

      disbursedCases,

      totalCases,

      totalCommissionEarned,

      pendingCommission,

      confirmedCommission,

      paidCommission

    ] = await Promise.all([

      // TOTAL LEADS
      VaultLead.countDocuments(leadFilter),

      // ACTIVE CASES
      Case.countDocuments({
        ...caseFilter,
        currentStatus: {
          $nin: ['Disbursed', 'Rejected', 'Lost']
        }
      }),

      // DISBURSED LEADS
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Disbursed'
      }),

      // DISBURSED CASES
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Disbursed'
      }),

      // TOTAL CASES
      Case.countDocuments(caseFilter),

      // TOTAL COMMISSION EARNED
      Commission.aggregate([
        {
          $match: {
            ...commissionFilter,
            status: 'Paid'
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$commissionAmount'
            }
          }
        }
      ]),

      // PENDING COMMISSION
      Commission.aggregate([
        {
          $match: {
            ...commissionFilter,
            status: {
              $in: ['Pending', 'Confirmed']
            }
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$commissionAmount'
            }
          }
        }
      ]),

      // CONFIRMED COMMISSION
      Commission.aggregate([
        {
          $match: {
            ...commissionFilter,
            status: 'Confirmed'
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$commissionAmount'
            }
          }
        }
      ]),

      // PAID COMMISSION
      Commission.aggregate([
        {
          $match: {
            ...commissionFilter,
            status: 'Paid'
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$commissionAmount'
            }
          }
        }
      ])

    ]);

    // ==================== CONVERSION RATE ====================

    // ==================== TOTAL SUCCESSFUL DISBURSALS ====================

const totalDisbursed =
  disbursedCases;

    const conversionRate =
      totalLeads > 0
        ? Number(
            (
              (totalDisbursed / totalLeads) * 100
            ).toFixed(2)
          )
        : 0;

    // ==================== LEAD STATUS ====================

    const leadsByStatus = await VaultLead.aggregate([

      {
        $match: leadFilter
      },

      {
        $group: {
          _id: '$currentStatus',
          count: { $sum: 1 }
        }
      }

    ]);

    const leadStatusMap = {};

    leadsByStatus.forEach(item => {
      leadStatusMap[item._id] = item.count;
    });

    const leadStatus = {

      new:
        leadStatusMap['New'] || 0,

      contacted:
        leadStatusMap['Contacted'] || 0,

      qualified:
        leadStatusMap['Qualified'] || 0,

      collectingDocuments:
        leadStatusMap['Collecting Documentation'] || 0,

      applicationOpened:
        leadStatusMap['Application Opened'] || 0,

      disbursed:
        leadStatusMap['Disbursed'] || 0,

      lost:
        leadStatusMap['Lost'] || 0

    };

    // ==================== CASE STATUS ====================

    const casesByStatus = await Case.aggregate([

      {
        $match: caseFilter
      },

      {
        $group: {
          _id: '$currentStatus',
          count: { $sum: 1 }
        }
      }

    ]);

    const caseStatusMap = {};

    casesByStatus.forEach(item => {
      caseStatusMap[item._id] = item.count;
    });

    const caseStatus = {

      underReview:
        caseStatusMap['Under Review'] || 0,

      bankApplication:
        caseStatusMap['Bank Application'] || 0,

      preApproved:
        caseStatusMap['Pre-Approved'] || 0,

      valuation:
        caseStatusMap['Valuation'] || 0,

      folIssued:
        caseStatusMap['FOL Issued'] || 0,

      folSigned:
        caseStatusMap['FOL Signed'] || 0,

      disbursed:
        caseStatusMap['Disbursed'] || 0,

      rejected:
        caseStatusMap['Rejected'] || 0

    };

    // ==================== LEADS OVER TIME ====================

    const leadsOverTime = await VaultLead.aggregate([

      {
        $match: leadFilter
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },

          count: { $sum: 1 }
        }
      },

      {
        $sort: { _id: 1 }
      }

    ]);

    // ==================== DISBURSEMENT TREND ====================

    const disbursementTrend = await Case.aggregate([

      {
        $match: {
          ...caseFilter,
          currentStatus: 'Disbursed'
        }
      },

      {
        $group: {

          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$updatedAt'
            }
          },

          count: { $sum: 1 },

          amount: {
            $sum: '$calculations.loanAmount'
          }

        }
      },

      {
        $sort: { _id: 1 }
      }

    ]);

    // ==================== COMMISSION TREND ====================

    const commissionsOverTime = await Commission.aggregate([

      {
        $match: commissionFilter
      },

      {
        $group: {

          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$createdAt'
            }
          },

          earned: {
            $sum: '$commissionAmount'
          }

        }
      },

      {
        $sort: { _id: 1 }
      }

    ]);

    // ==================== COMPANY AGENT SUMMARY ====================

    let agentsSummary = null;

    if (isCompany) {

      const totalAgents =
        affiliatedAgents.length;

      const activeAgents =
        await VaultAgent.countDocuments({
          partnerId,
          agentType: 'PartnerAffiliatedAgent',
          affiliationStatus: 'verified',
          isActive: true,
          isDeleted: false
        });

      const pendingAgents =
        await VaultAgent.countDocuments({
          partnerId,
          agentType: 'PartnerAffiliatedAgent',
          affiliationStatus: 'pending',
          isDeleted: false
        });

      agentsSummary = {

        totalAgents,

        activeAgents,

        pendingAgents

      };

    }

    // ==================== FINAL RESPONSE ====================

    return res.status(200).json({

      success: true,

      filters: {
        range: range || null,
        fromDate: fromDate || null,
        toDate: toDate || null
      },

      data: {

        // ==================== PARTNER INFO ====================

        partnerInfo: {

          _id: partner._id,

          name:
            isCompany
              ? partner.companyName
              : `${partner.firstName} ${partner.lastName}`,

          partnerCategory:
            partner.partnerCategory,

          status:
            partner.status,

          joinedAt:
            partner.createdAt,

          commissionTier: {

            below5M:
              partner.commissionTier?.below5M || 80,

            above5M:
              partner.commissionTier?.above5M || 85

          }

        },

        // ==================== KPI ====================

        kpis: {

          totalLeads,

          activeCases,

          totalDisbursed,

          conversionRate,

          totalCommissionEarned:
            totalCommissionEarned?.[0]?.total || 0,

          pendingCommission:
            pendingCommission?.[0]?.total || 0

        },

        // ==================== LEAD STATUS ====================

        leadStatus,

        // ==================== CASE STATUS ====================

        caseStatus,

        // ==================== COMMISSION ====================

        commissions: {

          totalEarned:
            totalCommissionEarned?.[0]?.total || 0,

          pending:
            pendingCommission?.[0]?.total || 0,

          confirmed:
            confirmedCommission?.[0]?.total || 0,

          paid:
            paidCommission?.[0]?.total || 0

        },

        // ==================== PERFORMANCE ====================

        performance: {

          conversionRate,

          totalLeadsSubmitted:
            totalLeads,

          totalSuccessfulDisbursals:
            totalDisbursed

        },

        // ==================== GRAPH DATA ====================

        graphs: {

          leadsOverTime:
            leadsOverTime.map(item => ({
              date: item._id,
              count: item.count
            })),

          disbursementTrend:
            disbursementTrend.map(item => ({
              date: item._id,
              count: item.count,
              amount: item.amount || 0
            })),

          commissionsOverTime:
            commissionsOverTime.map(item => ({
              month: item._id,
              earned: item.earned || 0
            }))

        },

        // ==================== COMPANY ONLY ====================

        agentsSummary,

        timestamp:
          new Date().toISOString()

      }

    });

  } catch (error) {

    console.error(
      'Partner dashboard stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

// ==================== ADVISOR DASHBOARD STATISTICS ====================
// ==================== ADVISOR DASHBOARD STATISTICS ====================
// ==================== ADVISOR DASHBOARD STATISTICS ====================

export const getAdvisorDashboardStats = async (req, res) => {
  try {

    const advisorId = req.user._id;

    // ==================== DATE FILTER ====================

    const { range, fromDate, toDate } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    let dateFilter = {};

    if (range === 'today') {

      dateFilter = {
        createdAt: { $gte: today }
      };

    } else if (range === 'week') {

      dateFilter = {
        createdAt: { $gte: weekAgo }
      };

    } else if (range === 'month') {

      dateFilter = {
        createdAt: { $gte: monthAgo }
      };

    } else if (fromDate && toDate) {

      dateFilter = {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        }
      };

    }

    // ==================== GET ADVISOR ====================

    const advisor = await XotoAdvisor.findById(advisorId);

    if (!advisor) {
      return res.status(404).json({
        success: false,
        message: 'Advisor not found'
      });
    }

    // ==================== LEAD FILTER ====================

    const leadFilter = {
      'assignedTo.advisorId': advisorId,
      isDeleted: false,
      ...dateFilter
    };

    // ==================== CASE FILTER ====================

    const caseFilter = {
      'assignedTo.advisorId': advisorId,
      isDeleted: false,
      ...dateFilter
    };

    // ==================== KPI COUNTS ====================

    const [

      totalLeads,

      newLeads,

      contactedLeads,

      qualifiedLeads,

      collectingDocuments,

      documentsComplete,

      applicationOpened,

      disbursedLeads,

      notProceeding,

      totalCases,

      activeCases,

      disbursedCases,

      rejectedCases,

      lostCases,

      slaBreached,

      recentLeads

    ] = await Promise.all([

      // TOTAL LEADS
      VaultLead.countDocuments(leadFilter),

      // NEW
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'New'
      }),

      // CONTACTED
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Contacted'
      }),

      // QUALIFIED
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Qualified'
      }),

      // COLLECTING DOCS
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Collecting Documents'
      }),

      // DOCS COMPLETE
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Documents Complete'
      }),

      // APPLICATION OPENED
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Application Opened'
      }),

      // DISBURSED
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Disbursed'
      }),

      // NOT PROCEEDING
      VaultLead.countDocuments({
        ...leadFilter,
        currentStatus: 'Not Proceeding'
      }),

      // TOTAL CASES
      Case.countDocuments(caseFilter),

      // ACTIVE CASES
      Case.countDocuments({
        ...caseFilter,
        currentStatus: {
          $nin: ['Disbursed', 'Rejected', 'Lost']
        }
      }),

      // DISBURSED CASES
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Disbursed'
      }),

      // REJECTED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Rejected'
      }),

      // LOST
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Lost'
      }),

      // SLA BREACH
      VaultLead.countDocuments({
        ...leadFilter,
        'sla.breached': true
      }),

      // RECENT LEADS
      VaultLead.find(leadFilter)
        .sort({ createdAt: -1 })
        .limit(5)

    ]);

    // ==================== CONVERSION RATES ====================

    const contactRate =
      totalLeads > 0
        ? Number(
            (
              (contactedLeads / totalLeads) * 100
            ).toFixed(1)
          )
        : 0;

    const qualificationRate =
      contactedLeads > 0
        ? Number(
            (
              (qualifiedLeads / contactedLeads) * 100
            ).toFixed(1)
          )
        : 0;

    // SUCCESSFUL BUSINESS ONLY
    const conversionRate =
      qualifiedLeads > 0
        ? Number(
            (
              (disbursedLeads / qualifiedLeads) * 100
            ).toFixed(1)
          )
        : 0;

    const overallConversionRate =
      totalLeads > 0
        ? Number(
            (
              (disbursedLeads / totalLeads) * 100
            ).toFixed(1)
          )
        : 0;

    // ==================== SLA PERFORMANCE ====================

    const slaComplianceRate =
      totalLeads > 0
        ? Number(
            (
              (
                (totalLeads - slaBreached) /
                totalLeads
              ) * 100
            ).toFixed(1)
          )
        : 100;

    // ==================== RESPONSE TIME ====================

    const leadsWithResponse = await VaultLead.find({
      ...leadFilter,
      'sla.firstContactAt': { $ne: null },
      'assignedTo.assignedAt': { $ne: null }
    }).select(
      'sla.firstContactAt assignedTo.assignedAt'
    );

    let totalResponseTime = 0;

    leadsWithResponse.forEach(lead => {

      const responseHours =
        (
          new Date(lead.sla.firstContactAt) -
          new Date(lead.assignedTo.assignedAt)
        ) / (1000 * 60 * 60);

      totalResponseTime += responseHours;

    });

    const averageResponseTimeHours =
      leadsWithResponse.length > 0
        ? Number(
            (
              totalResponseTime /
              leadsWithResponse.length
            ).toFixed(1)
          )
        : 0;

    // ==================== APPROACHING SLA ====================

    const allNewLeads = await VaultLead.find({
      ...leadFilter,
      currentStatus: 'New',
      'sla.breached': false
    }).select(
      'assignedTo.assignedAt'
    );

    const approachingSLA =
      allNewLeads.filter(lead => {

        if (!lead.assignedTo?.assignedAt) {
          return false;
        }

        const hours =
          (
            Date.now() -
            new Date(
              lead.assignedTo.assignedAt
            )
          ) / (1000 * 60 * 60);

        return hours >= 3 && hours < 4;

      }).length;

    // ==================== WORKLOAD ====================

    const workload = {

      currentLeads:
        advisor.workload?.currentLeads || 0,

      maxCapacity:
        advisor.workload?.maxLeadsCapacity || 20,

      capacityUtilization:
        advisor.workload?.maxLeadsCapacity > 0
          ? Number(
              (
                (
                  advisor.workload.currentLeads /
                  advisor.workload.maxLeadsCapacity
                ) * 100
              ).toFixed(1)
            )
          : 0,

      isOverloaded:
        advisor.workload?.currentLeads >=
        advisor.workload?.maxLeadsCapacity,

      leadsAssignedThisMonth:
        advisor.workload?.leadsAssignedThisMonth || 0,

      leadsConvertedThisMonth:
        advisor.workload?.leadsConvertedThisMonth || 0

    };

    // ==================== LEAD STATUS ====================

    const leadStatus = {

      new:
        newLeads,

      contacted:
        contactedLeads,

      qualified:
        qualifiedLeads,

      collectingDocuments:
        collectingDocuments,

      documentsComplete:
        documentsComplete,

      applicationOpened:
        applicationOpened,

      disbursed:
        disbursedLeads,

      notProceeding:
        notProceeding

    };

    // ==================== CASE STATUS ====================

    const casesByStatus = await Case.aggregate([

      {
        $match: caseFilter
      },

      {
        $group: {
          _id: '$currentStatus',
          count: { $sum: 1 }
        }
      }

    ]);

    const caseStatusMap = {};

    casesByStatus.forEach(item => {
      caseStatusMap[item._id] = item.count;
    });

    const caseStatus = {

      draft:
        caseStatusMap['Draft'] || 0,

      submittedToXoto:
        caseStatusMap['Submitted to Xoto'] || 0,

      inOpsQueue:
        caseStatusMap['In Ops Queue - Pending Pick-up'] || 0,

      assignedPendingReview:
        caseStatusMap['Assigned - Pending Review'] || 0,

      underReview:
        caseStatusMap['Under Review'] || 0,

      bankApplication:
        caseStatusMap['Bank Application'] || 0,

      preApproved:
        caseStatusMap['Pre-Approved'] || 0,

      valuation:
        caseStatusMap['Valuation'] || 0,

      folIssued:
        caseStatusMap['FOL Issued'] || 0,

      folSigned:
        caseStatusMap['FOL Signed'] || 0,

      disbursed:
        caseStatusMap['Disbursed'] || 0,

      rejected:
        caseStatusMap['Rejected'] || 0,

      lost:
        caseStatusMap['Lost'] || 0

    };

    // ==================== LEADS OVER TIME ====================

    const leadsOverTime = await VaultLead.aggregate([

      {
        $match: leadFilter
      },

      {
        $group: {

          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },

          count: {
            $sum: 1
          }

        }
      },

      {
        $sort: {
          _id: 1
        }
      }

    ]);

    // ==================== CASE PROGRESSION ====================

    const caseProgression = Object.entries(
      caseStatus
    ).map(([status, count]) => ({
      status,
      count
    }));

    // ==================== SLA TREND ====================

    const slaTrend = await VaultLead.aggregate([

      {
        $match: leadFilter
      },

      {
        $group: {

          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },

          breached: {
            $sum: {
              $cond: [
                {
                  $eq: ['$sla.breached', true]
                },
                1,
                0
              ]
            }
          },

          compliant: {
            $sum: {
              $cond: [
                {
                  $eq: ['$sla.breached', false]
                },
                1,
                0
              ]
            }
          }

        }
      },

      {
        $sort: {
          _id: 1
        }
      }

    ]);

    // ==================== RECENT LEADS ====================

    const formattedRecentLeads =
      recentLeads.map(lead => {

        let timeSinceAssignment = null;
        let slaStatus = 'within_limit';

        if (
          lead.assignedTo?.assignedAt &&
          lead.currentStatus === 'New'
        ) {

          const hours =
            (
              Date.now() -
              new Date(
                lead.assignedTo.assignedAt
              )
            ) / (1000 * 60 * 60);

          timeSinceAssignment =
            hours.toFixed(1);

          if (hours >= 4) {

            slaStatus = 'breached';

          } else if (hours >= 3) {

            slaStatus = 'warning';

          }

        }

        return {

          _id:
            lead._id,

          customerName:
            lead.customerInfo?.fullName || 'N/A',

          propertyValue:
            lead.propertyDetails?.propertyValue || 0,

          status:
            lead.currentStatus,

          createdAt:
            lead.createdAt,

          timeSinceAssignment,

          slaStatus,

          hasUploadedDocs:
            (
              lead.documentStatus
                ?.documentsUploadedCount || 0
            ) > 0

        };

      });

    // ==================== FINAL RESPONSE ====================

    return res.status(200).json({

      success: true,

      filters: {
        range: range || null,
        fromDate: fromDate || null,
        toDate: toDate || null
      },

      data: {

        // ==================== ADVISOR INFO ====================

        advisorInfo: {

          _id:
            advisor._id,

          name:
            `${advisor.name?.first_name || ''} ${advisor.name?.last_name || ''}`,

          email:
            advisor.email,

          department:
            advisor.department,

          designation:
            advisor.designation

        },

        // ==================== WORKLOAD ====================

        workload,

        // ==================== LEADS ====================

        leads: {

          total:
            totalLeads,

          byStatus:
            leadStatus,

          contacted:
            contactedLeads,

          qualified:
            qualifiedLeads,

          collectingDocuments:
            collectingDocuments,

          documentsComplete:
            documentsComplete,

          applicationOpened:
            applicationOpened,

          converted:
            disbursedLeads,

          notProceeding:
            notProceeding,

          funnel: {

            contactRate,

            qualificationRate,

            conversionRate,

            overallConversionRate

          },

          recent:
            formattedRecentLeads

        },

        // ==================== CASES ====================

        cases: {

          total:
            totalCases,

          byStatus:
            caseStatus,

          active:
            activeCases,

          pending:
            activeCases,

          completed:
            disbursedCases,

          rejected:
            rejectedCases + lostCases

        },

        // ==================== SLA METRICS ====================

        slaMetrics: {

          targetHours:
            4,

          complianceRate:
            slaComplianceRate,

          breached:
            slaBreached,

          approachingBreach:
            approachingSLA,

          averageResponseTimeHours,

          status:
            slaComplianceRate >= 90
              ? 'good'
              : slaComplianceRate >= 75
              ? 'warning'
              : 'critical'

        },

        // ==================== QUICK ACTIONS ====================

        quickActions: {

          needsContact:
            newLeads,

          needsUpdate:
            contactedLeads +
            collectingDocuments,

          canCreateApplication:
            qualifiedLeads +
            documentsComplete

        },

        // ==================== GRAPH DATA ====================

        graphs: {

          leadsOverTime:
            leadsOverTime.map(item => ({
              date: item._id,
              count: item.count
            })),

          caseProgression,

          slaTrend:
            slaTrend.map(item => ({
              date: item._id,
              breached: item.breached,
              compliant: item.compliant
            }))

        },

        timestamp:
          new Date().toISOString()

      }

    });

  } catch (error) {

    console.error(
      'Advisor dashboard stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

// ==================== OPS DASHBOARD STATISTICS ====================
// ==================== OPS DASHBOARD STATISTICS ====================
// ==================== OPS DASHBOARD STATISTICS ====================

export const getOpsDashboardStats = async (req, res) => {
  try {

    const opsId = req.user._id;

    // ==================== DATE FILTER ====================

    const { range, fromDate, toDate } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    let dateFilter = {};

    if (range === 'today') {

      dateFilter = {
        createdAt: { $gte: today }
      };

    } else if (range === 'week') {

      dateFilter = {
        createdAt: { $gte: weekAgo }
      };

    } else if (range === 'month') {

      dateFilter = {
        createdAt: { $gte: monthAgo }
      };

    } else if (fromDate && toDate) {

      dateFilter = {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        }
      };

    }

    // ==================== GET OPS ====================

    const ops = await MortgageOps.findById(opsId);

    if (!ops) {
      return res.status(404).json({
        success: false,
        message: 'Ops executive not found'
      });
    }

    // ==================== CASE FILTER ====================

    const caseFilter = {
      'assignedTo.opsId': opsId,
      isDeleted: false,
      ...dateFilter
    };

    // ==================== QUEUE FILTER ====================

    const queueFilter = {
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    };

    // ==================== KPI COUNTS ====================

    const [

      totalAssignedCases,

      pendingReview,

      underReview,

      returnedCases,

      bankApplication,

      preApproved,

      valuation,

      folIssued,

      folSigned,

      disbursedCases,

      rejectedCases,

      lostCases,

      queueCount,

      urgentQueueCount,

      warningQueueCount,

      stuckCases,

      totalBankSubmissions,

      recentCases,

      queueCases

    ] = await Promise.all([

      // TOTAL ASSIGNED
      Case.countDocuments(caseFilter),

      // PENDING REVIEW
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Assigned - Pending Review'
      }),

      // UNDER REVIEW
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Under Review'
      }),

      // RETURNED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: {
          $in: [
            'Returned - Pending Correction',
            'Returned'
          ]
        }
      }),

      // BANK APPLICATION
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Bank Application'
      }),

      // PRE APPROVED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Pre-Approved'
      }),

      // VALUATION
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Valuation'
      }),

      // FOL ISSUED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'FOL Issued'
      }),

      // FOL SIGNED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'FOL Signed'
      }),

      // DISBURSED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Disbursed'
      }),

      // REJECTED
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Rejected'
      }),

      // LOST
      Case.countDocuments({
        ...caseFilter,
        currentStatus: 'Lost'
      }),

      // OPS QUEUE
      Case.countDocuments(queueFilter),

      // URGENT QUEUE
      Case.countDocuments({
        ...queueFilter,
        createdAt: {
          $lt: new Date(
            Date.now() - 48 * 60 * 60 * 1000
          )
        }
      }),

      // WARNING QUEUE
      Case.countDocuments({
        ...queueFilter,
        createdAt: {
          $lt: new Date(
            Date.now() - 24 * 60 * 60 * 1000
          ),
          $gte: new Date(
            Date.now() - 48 * 60 * 60 * 1000
          )
        }
      }),

      // STUCK CASES
      Case.countDocuments({
        ...caseFilter,
        updatedAt: {
          $lt: new Date(
            Date.now() - 5 * 24 * 60 * 60 * 1000
          )
        },
        currentStatus: {
          $nin: [
            'Disbursed',
            'Rejected',
            'Lost'
          ]
        }
      }),

      // TOTAL BANK SUBMISSIONS
      Case.countDocuments({
        ...caseFilter,
        'bankSubmission.submittedToBankAt': {
          $ne: null
        }
      }),

      // RECENT CASES
      Case.find(caseFilter)
        .sort({ updatedAt: -1 })
        .limit(5),

      // QUEUE CASES
      Case.find(queueFilter)
        .sort({ createdAt: 1 })
        .limit(10)

    ]);

    // ==================== WORKLOAD ====================

    const inProgress =
      bankApplication +
      preApproved +
      valuation +
      folIssued +
      folSigned;

    const completed =
      disbursedCases;

    const rejected =
      rejectedCases +
      lostCases;

    const needsAction =
      pendingReview +
      underReview +
      returnedCases;

    const activeCases =
      totalAssignedCases -
      completed -
      rejected;

    // ==================== WORKLOAD METRICS ====================

    const workload = {

      currentApplications:
        activeCases,

      maxCapacity:
        ops.workload?.maxCapacity || 30,

      applicationsProcessedThisMonth:
        disbursedCases

    };

    const capacityUtilization =
      workload.maxCapacity > 0
        ? Number(
            (
              (
                workload.currentApplications /
                workload.maxCapacity
              ) * 100
            ).toFixed(1)
          )
        : 0;

    const isOverloaded =
      workload.currentApplications >=
      workload.maxCapacity;

    // ==================== PROCESSING METRICS ====================

    const disbursedCasesList =
      await Case.find({
        ...caseFilter,
        currentStatus: 'Disbursed'
      }).select(
        'assignedTo.assignedAt updatedAt'
      );

    let totalProcessingDays = 0;

    disbursedCasesList.forEach(c => {

      if (
        c.assignedTo?.assignedAt &&
        c.updatedAt
      ) {

        const days =
          (
            new Date(c.updatedAt) -
            new Date(c.assignedTo.assignedAt)
          ) /
          (1000 * 60 * 60 * 24);

        totalProcessingDays += days;

      }

    });

    const averageProcessingDays =
      disbursedCasesList.length > 0
        ? Number(
            (
              totalProcessingDays /
              disbursedCasesList.length
            ).toFixed(1)
          )
        : 0;

    // ==================== PERFORMANCE ====================

    const successRate =
      totalAssignedCases > 0
        ? Number(
            (
              (
                completed /
                totalAssignedCases
              ) * 100
            ).toFixed(1)
          )
        : 0;

    const returnRate =
      totalAssignedCases > 0
        ? Number(
            (
              (
                returnedCases /
                totalAssignedCases
              ) * 100
            ).toFixed(1)
          )
        : 0;

    // ==================== CASE STATUS ====================

    const caseStatusBreakdown = {

      pendingReview,

      underReview,

      returned:
        returnedCases,

      bankApplication,

      preApproved,

      valuation,

      folIssued,

      folSigned,

      disbursed:
        disbursedCases,

      rejected:
        rejectedCases,

      lost:
        lostCases

    };

    // ==================== QUEUE DETAILS ====================

    const formattedQueueCases =
      queueCases.map(c => {

        const hoursInQueue =
          Math.floor(
            (
              Date.now() -
              new Date(c.createdAt)
            ) / (1000 * 60 * 60)
          );

        let urgency = 'normal';

        if (hoursInQueue >= 48) {

          urgency = 'urgent';

        } else if (hoursInQueue >= 24) {

          urgency = 'warning';

        }

        return {

          _id:
            c._id,

          caseReference:
            c.caseReference,

          customerName:
            c.clientInfo?.fullName || 'N/A',

          submittedAt:
            c.createdAt,

          hoursInQueue,

          urgency,

          loanAmount:
            c.calculations?.loanAmount || 0,

          selectedBank:
            c.loanInfo?.selectedBank || null,

          documentsComplete:
            c.documentStatus
              ?.allDocumentsUploaded || false

        };

      });

    // ==================== RECENT CASES ====================

    const formattedRecentCases =
      recentCases.map(c => {

        const daysSinceUpdate =
          Math.ceil(
            (
              Date.now() -
              new Date(c.updatedAt)
            ) / (1000 * 60 * 60 * 24)
          );

        let actionRequired = false;

        let actionType = null;

        if (
          c.currentStatus ===
          'Assigned - Pending Review'
        ) {

          actionRequired = true;
          actionType = 'review';

        } else if (
          c.currentStatus ===
          'Returned - Pending Correction'
        ) {

          actionRequired = true;
          actionType = 'correction';

        } else if (
          c.currentStatus ===
          'Under Review'
        ) {

          actionRequired = true;
          actionType = 'continue';

        } else if (
          [
            'Bank Application',
            'Pre-Approved',
            'Valuation'
          ].includes(c.currentStatus)
        ) {

          actionRequired = true;
          actionType = 'bank_followup';

        }

        return {

          _id:
            c._id,

          caseReference:
            c.caseReference,

          customerName:
            c.clientInfo?.fullName || 'N/A',

          status:
            c.currentStatus,

          loanAmount:
            c.calculations?.loanAmount || 0,

          selectedBank:
            c.loanInfo?.selectedBank || null,

          updatedAt:
            c.updatedAt,

          daysSinceUpdate,

          actionRequired,

          actionType

        };

      });

    // ==================== CASES OVER TIME ====================

    const casesOverTime =
      await Case.aggregate([

        {
          $match: caseFilter
        },

        {
          $group: {

            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },

            count: {
              $sum: 1
            }

          }
        },

        {
          $sort: {
            _id: 1
          }
        }

      ]);

    // ==================== QUEUE TREND ====================

    const queueTrend =
      await Case.aggregate([

        {
          $match: {
            currentStatus:
              'In Ops Queue - Pending Pick-up',
            isDeleted: false
          }
        },

        {
          $group: {

            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },

            count: {
              $sum: 1
            }

          }
        },

        {
          $sort: {
            _id: 1
          }
        }

      ]);

    // ==================== DISBURSEMENT TREND ====================

    const disbursementTrend =
      await Case.aggregate([

        {
          $match: {
            ...caseFilter,
            currentStatus: 'Disbursed'
          }
        },

        {
          $group: {

            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$updatedAt'
              }
            },

            count: {
              $sum: 1
            },

            amount: {
              $sum: '$calculations.loanAmount'
            }

          }
        },

        {
          $sort: {
            _id: 1
          }
        }

      ]);

    // ==================== FINAL RESPONSE ====================

    return res.status(200).json({

      success: true,

      filters: {
        range: range || null,
        fromDate: fromDate || null,
        toDate: toDate || null
      },

      data: {

        // ==================== OPS INFO ====================

        opsInfo: {

          _id:
            ops._id,

          name:
            `${ops.name?.first_name || ''} ${ops.name?.last_name || ''}`,

          email:
            ops.email,

          department:
            ops.department,

          designation:
            ops.designation

        },

        // ==================== KPI ====================

        kpis: {

          totalAssignedCases,

          activeCases,

          completed,

          rejected,

          queueCount,

          urgentQueueCount,

          stuckCases,

          successRate

        },

        // ==================== WORKLOAD ====================

        workload: {

          pendingReview,

          underReview,

          returned:
            returnedCases,

          inProgress,

          completed,

          rejected,

          needsAction,

          currentCapacity:
            workload.currentApplications,

          maxCapacity:
            workload.maxCapacity,

          capacityUtilization,

          isOverloaded,

          processedThisMonth:
            workload.applicationsProcessedThisMonth,

          stuckCases

        },

        // ==================== CASE STATUS ====================

        caseStatusBreakdown,

        // ==================== OPS QUEUE ====================

        queue: {

          total:
            queueCount,

          urgent:
            urgentQueueCount,

          warning:
            warningQueueCount,

          normal:
            queueCount -
            urgentQueueCount -
            warningQueueCount,

          canPickUp:
            queueCount > 0 &&
            !isOverloaded,

          cases:
            formattedQueueCases

        },

        // ==================== PERFORMANCE ====================

        performance: {

          averageProcessingDays,

          totalBankSubmissions,

          returnRate,

          successRate,

          totalProcessed:
            totalAssignedCases,

          totalDisbursed:
            completed

        },

        // ==================== RECENT CASES ====================

        recentCases:
          formattedRecentCases,

        // ==================== QUICK ACTIONS ====================

        quickActions: {

          availableInQueue:
            queueCount,

          canPickUp:
            queueCount > 0 &&
            !isOverloaded,

          needsReview:
            pendingReview,

          needsBankUpdate:
            bankApplication +
            preApproved +
            valuation

        },

        // ==================== GRAPHS ====================

        graphs: {

          casesOverTime:
            casesOverTime.map(item => ({
              date: item._id,
              count: item.count
            })),

          queueTrend:
            queueTrend.map(item => ({
              date: item._id,
              count: item.count
            })),

          disbursementTrend:
            disbursementTrend.map(item => ({
              date: item._id,
              count: item.count,
              amount: item.amount || 0
            })),

          caseStatusDistribution:
            Object.entries(
              caseStatusBreakdown
            ).map(([status, count]) => ({
              status,
              count
            }))

        },

        timestamp:
          new Date().toISOString()

      }

    });

  } catch (error) {

    console.error(
      'Ops dashboard stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};
// ==================== FREELANCE AGENT DASHBOARD STATISTICS ====================

export const getAgentDashboardStats = async (req, res) => {
  try {

    const agentId = req.user._id;

    // ==================== DATE FILTER ====================

    const { range, fromDate, toDate } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    let dateFilter = {};

    if (range === 'today') {

      dateFilter = {
        createdAt: { $gte: today }
      };

    } else if (range === 'week') {

      dateFilter = {
        createdAt: { $gte: weekAgo }
      };

    } else if (range === 'month') {

      dateFilter = {
        createdAt: { $gte: monthAgo }
      };

    } else if (fromDate && toDate) {

      dateFilter = {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        }
      };

    }

    // ==================== BASE FILTERS ====================

    const leadFilter = {
      'sourceInfo.createdById': agentId,
      isDeleted: false,
      ...dateFilter
    };

    const commissionFilter = {
      recipientId: agentId,
      recipientRole: 'freelance_agent',
      isDeleted: false,
      ...dateFilter
    };

    // ==================== FETCH LEADS + COMMISSIONS ====================

    const [
      leads,
      commissions
    ] = await Promise.all([

      VaultLead.find(leadFilter)
        .sort({ createdAt: -1 }),

      Commission.find(commissionFilter)

    ]);

    // ==================== KPI CALCULATIONS ====================

    const totalLeads = leads.length;

    const qualifiedLeads = leads.filter(
      lead => lead.currentStatus === 'Qualified'
    ).length;

    const disbursedLeads = leads.filter(
      lead => lead.currentStatus === 'Disbursed'
    ).length;

    const contactedLeads = leads.filter(
      lead => lead.currentStatus === 'Contacted'
    ).length;

    const collectingDocumentsLeads = leads.filter(
      lead => lead.currentStatus === 'Collecting Documents'
    ).length;

    const applicationCreatedLeads = leads.filter(
      lead => lead.currentStatus === 'Application Created'
    ).length;

    const notProceedingLeads = leads.filter(
      lead => lead.currentStatus === 'Not Proceeding'
    ).length;

    // ==================== COMMISSION CALCULATIONS ====================

    const totalCommissionEarned = commissions
      .filter(c => c.status === 'Paid')
      .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

    const pendingCommission = commissions
      .filter(c => ['Pending', 'Confirmed'].includes(c.status))
      .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

    const confirmedCommission = commissions
      .filter(c => c.status === 'Confirmed')
      .reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

    // ==================== PERFORMANCE METRICS ====================

    const conversionRate =
      totalLeads > 0
        ? Number(((disbursedLeads / totalLeads) * 100).toFixed(2))
        : 0;

    const qualificationRate =
      totalLeads > 0
        ? Number(((qualifiedLeads / totalLeads) * 100).toFixed(2))
        : 0;

    const disbursementRate =
      totalLeads > 0
        ? Number(((disbursedLeads / totalLeads) * 100).toFixed(2))
        : 0;

    const avgCommissionPerCase =
      disbursedLeads > 0
        ? Number((totalCommissionEarned / disbursedLeads).toFixed(2))
        : 0;

    // ==================== LEAD STATUS ====================

    const leadStatus = {
      new: leads.filter(l => l.currentStatus === 'New').length,
      contacted: contactedLeads,
      qualified: qualifiedLeads,
      collectingDocuments: collectingDocumentsLeads,
      applicationCreated: applicationCreatedLeads,
      disbursed: disbursedLeads,
      notProceeding: notProceedingLeads
    };

    // ==================== LEADS OVER TIME ====================

    const leadsOverTime = await VaultLead.aggregate([

      {
        $match: leadFilter
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },

      {
        $sort: { _id: 1 }
      }

    ]);

    // ==================== DISBURSEMENT TREND ====================

    const disbursementTrend = await VaultLead.aggregate([

      {
        $match: {
          ...leadFilter,
          currentStatus: 'Disbursed'
        }
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$updatedAt'
            }
          },

          count: { $sum: 1 },

          totalAmount: {
            $sum: '$loanRequirements.loanAmount'
          }
        }
      },

      {
        $sort: { _id: 1 }
      }

    ]);

    // ==================== COMMISSION TREND ====================

    const commissionTrend = await Commission.aggregate([

      {
        $match: commissionFilter
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$createdAt'
            }
          },

          earned: {
            $sum: '$commissionAmount'
          }
        }
      },

      {
        $sort: { _id: 1 }
      }

    ]);

    // ==================== RECENT LEADS ====================

    const recentLeads = leads
      .slice(0, 5)
      .map(lead => ({
        _id: lead._id,

        customerName:
          lead.customerInfo?.fullName || 'N/A',

        mobileNumber:
          lead.customerInfo?.mobileNumber || 'N/A',

        currentStatus:
          lead.currentStatus,

        propertyValue:
          lead.propertyDetails?.propertyValue || 0,

        createdAt:
          lead.createdAt
      }));

    // ==================== FINAL RESPONSE ====================

    return res.status(200).json({

      success: true,

      filters: {
        range: range || null,
        fromDate: fromDate || null,
        toDate: toDate || null
      },

      data: {

        // ==================== KPI CARDS ====================

        kpis: {

          totalLeads,

          qualifiedLeads,

          disbursedLeads,

          conversionRate,

          totalCommissionEarned,

          pendingCommission

        },

        // ==================== LEAD STATUS ====================

        leadStatus,

        // ==================== EARNINGS ====================

        earnings: {

          totalEarned: totalCommissionEarned,

          pendingCommission,

          confirmedCommission

        },

        // ==================== GRAPH DATA ====================

        graphs: {

          leadsOverTime:
            leadsOverTime.map(item => ({
              date: item._id,
              count: item.count
            })),

          disbursementTrend:
            disbursementTrend.map(item => ({
              date: item._id,
              count: item.count,
              amount: item.totalAmount || 0
            })),

          commissionTrend:
            commissionTrend.map(item => ({
              month: item._id,
              earned: item.earned || 0
            }))

        },

        // ==================== RECENT LEADS ====================

        recentLeads,

        // ==================== PERFORMANCE ====================

        performance: {

          qualificationRate,

          disbursementRate,

          avgCommissionPerCase

        },

        timestamp: new Date().toISOString()

      }

    });

  } catch (error) {

    console.error(
      'Agent dashboard stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

// ==================== GET DASHBOARD STATS BY ROLE ====================
export const getDashboardStatsByRole = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    const roleCode = roleDoc?.code;

    let stats = null;

    switch (roleCode) {
      case '18': // Admin
        stats = await getAdminDashboardStats(req, res);
        return stats;
      case '21': // Partner
        stats = await getPartnerDashboardStats(req, res);
        return stats;
      case '26': // Advisor
        stats = await getAdvisorDashboardStats(req, res);
        return stats;
      case '23': // Mortgage Ops
        stats = await getOpsDashboardStats(req, res);
        return stats;
      case '22': // Agent (Freelance)
        stats = await getAgentDashboardStats(req, res);
        return stats;
      default:
        return res.status(403).json({ success: false, message: "Access denied. Invalid role." });
    }

  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};