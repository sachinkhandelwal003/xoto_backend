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
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // FIXED: Removed duplicate customerId declaration
    const { customerId, range, fromDate, toDate } = req.query;

    let dateFilter = {};

    // FIXED: Using pre-defined date variables instead of redeclaring
    if (range === 'today') {
      dateFilter = { createdAt: { $gte: today } };
    } else if (range === 'week') {
      dateFilter = { createdAt: { $gte: weekAgo } };
    } else if (range === 'month') {
      dateFilter = { createdAt: { $gte: monthAgo } };
    } else if (fromDate && toDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate)
        }
      };
    }
    
    const leadFilter = {
      isDeleted: false,
      'sourceInfo.source': { $in: ['freelance_agent', 'website'] },
      ...dateFilter
    };

    if (customerId) {
      leadFilter.customerId = customerId;
    }
    
    // ==================== PLATFORM HEALTH STATS ====================
    
    // Total Users by Persona (ONLY COUNTS)
    const [referralPartnersCount, partnersCount, advisorsCount, opsMembersCount] = await Promise.all([
      VaultAgent.countDocuments({ agentType: 'FreelanceAgent', isDeleted: false }),
      Partner.countDocuments({ isDeleted: false, status: 'active' }),
      XotoAdvisor.countDocuments({ isDeleted: false, isActive: true }),
      MortgageOps.countDocuments({ isDeleted: false, isActive: true })
    ]);

    // FIXED: Properly structured Promise.all for Leads Statistics
    const [totalLeads, leadsToday, leadsThisWeek, leadsThisMonth] = await Promise.all([
      VaultLead.countDocuments(leadFilter),
      VaultLead.countDocuments({
        ...leadFilter,
        createdAt: { $gte: today }
      }),
      VaultLead.countDocuments({
        ...leadFilter,
        createdAt: { $gte: weekAgo }
      }),
      VaultLead.countDocuments({
        ...leadFilter,
        createdAt: { $gte: monthAgo }
      })
    ]);

    // ==================== LEADS BY STATUS ====================
    const leadsByStatus = await VaultLead.aggregate([
      { $match: leadFilter },
      { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
    ]);

    const leadStatusMap = {};
    leadsByStatus.forEach(s => { leadStatusMap[s._id] = s.count; });

    // ==================== LEADS BY SOURCE (ONLY FREELANCE AGENT) ====================
    // Only show leads from Freelance Agents - NO individual partners
    const leadsBySource = await VaultLead.aggregate([
      { $match: { 
          isDeleted: false,
          'sourceInfo.source': 'freelance_agent'
        } 
      },
      { $group: {
        _id: "$sourceInfo.source",
        count: { $sum: 1 }
      }}
    ]);

    // TOP 5 RECENT LEADS (from Freelance Agents only)
    const top5RecentLeads = await VaultLead.find({ 
        isDeleted: false,
        'sourceInfo.source': 'freelance_agent'
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('customerInfo.fullName customerInfo.mobileNumber propertyDetails.propertyValue createdAt sourceInfo.source');

    // Applications by Status
    const applicationsByStatus = await Case.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
    ]);

    const statusMap = {};
    applicationsByStatus.forEach(s => { statusMap[s._id] = s.count; });

    // ==================== SLA BREACH (WITH CASE IDs) ====================
    const slaBreachedLeads = await VaultLead.find({ 
      'sla.breached': true, 
      isDeleted: false 
    }).select('_id caseReference customerInfo.fullName sla.breachedAt');

    const slaBreachCount = slaBreachedLeads.length;
    const slaBreachIds = slaBreachedLeads.map(lead => lead._id);
    const slaBreachDetails = slaBreachedLeads.map(lead => ({
      id: lead._id,
      caseReference: lead.caseReference,
      customerName: lead.customerInfo?.fullName,
      breachedAt: lead.sla?.breachedAt
    }));

    // ==================== OPS QUEUE MONITOR ====================
    const opsQueueApplications = await Case.find({
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false
    }).sort({ createdAt: 1 }).lean();

    const opsQueueCount = opsQueueApplications.length;
    const urgentCount = opsQueueApplications.filter(c => {
      const hoursInQueue = (Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60);
      return hoursInQueue > 48;
    }).length;

    const opsQueueList = opsQueueApplications.slice(0, 10).map(c => ({
      _id: c._id,
      caseReference: c.caseReference,
      clientName: c.clientInfo?.fullName,
      createdAt: c.createdAt,
      hoursInQueue: Math.floor((Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60)),
      loanAmount: c.loanInfo?.requestedAmount,
      bankName: c.loanInfo?.selectedBank
    }));

    // ==================== UNASSIGNED LEADS ====================
    const unassignedLeadsList = await VaultLead.find({
      currentStatus: 'New',
      isDeleted: false,
      'assignedTo.advisorId': null
    }).sort({ createdAt: 1 }).limit(10);

    const unassignedLeadsCount = await VaultLead.countDocuments({
      currentStatus: 'New',
      isDeleted: false,
      'assignedTo.advisorId': null
    });

    const oldestUnassignedLead = await VaultLead.findOne({
      currentStatus: 'New',
      isDeleted: false,
      'assignedTo.advisorId': null
    }).sort({ createdAt: 1 });

    const unassignedLeads = unassignedLeadsList.map(lead => ({
      _id: lead._id,
      customerName: lead.customerInfo?.fullName,
      mobileNumber: lead.customerInfo?.mobileNumber,
      propertyValue: lead.propertyDetails?.propertyValue,
      createdAt: lead.createdAt,
      source: lead.sourceInfo?.source
    }));

    // ==================== RECENT ACTIVITIES ====================
    const recentActivities = [];

    // Top 3 recent agents
    const recentAgents = await VaultAgent.find({
      createdAt: { $gte: weekAgo },
      isDeleted: false
    }).sort({ createdAt: -1 }).limit(3);

    recentAgents.forEach(agent => {
      recentActivities.push({
        type: 'new_agent',
        message: `${agent.agentType === 'FreelanceAgent' ? 'Freelance Agent' : 'Partner Affiliated Agent'} ${agent.fullName} registered`,
        timestamp: agent.createdAt
      });
    });

    // Top 3 recent leads (from Freelance Agents only)
    const recentLeadsData = await VaultLead.find({
      createdAt: { $gte: weekAgo },
      isDeleted: false,
      'sourceInfo.source': 'freelance_agent'
    }).sort({ createdAt: -1 }).limit(3);

    recentLeadsData.forEach(lead => {
      recentActivities.push({
        type: 'new_lead',
        message: `New lead from ${lead.sourceInfo?.createdByName || 'Freelance Agent'}`,
        timestamp: lead.createdAt
      });
    });

    // Top 3 recent cases
    const recentCasesData = await Case.find({
      createdAt: { $gte: weekAgo },
      isDeleted: false
    }).sort({ createdAt: -1 }).limit(3);

    recentCasesData.forEach(c => {
      recentActivities.push({
        type: 'new_case',
        message: `New case ${c.caseReference} created for ${c.clientInfo?.fullName}`,
        timestamp: c.createdAt
      });
    });

    // Top 3 SLA breaches
    const recentSlaBreaches = slaBreachedLeads
      .filter(lead => lead.sla?.breachedAt && new Date(lead.sla.breachedAt) >= weekAgo)
      .slice(0, 3);

    recentSlaBreaches.forEach(lead => {
      recentActivities.push({
        type: 'sla_breach',
        message: `Lead ${lead.caseReference?.slice(-8) || lead._id.slice(-8)} exceeded SLA deadline`,
        timestamp: lead.sla?.breachedAt,
        urgent: true
      });
    });

    recentActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topRecentActivities = recentActivities.slice(0, 10);

    // ==================== COMMISSION STATISTICS ====================
    const commissionStats = await Commission.aggregate([
      { $match: { isDeleted: false } },
      { $group: {
        _id: '$status',
        totalAmount: { $sum: '$commissionAmount' },
        count: { $sum: 1 }
      }}
    ]);

    const commissionMap = { pending: 0, confirmed: 0, paid: 0 };
    commissionStats.forEach(s => {
      if (s._id === 'Pending') commissionMap.pending = s.totalAmount;
      else if (s._id === 'Confirmed') commissionMap.confirmed = s.totalAmount;
      else if (s._id === 'Paid') commissionMap.paid = s.totalAmount;
    });

    // ==================== GRAPH DATA ====================
    
    // Leads over time (last 30 days) - Only Freelance Agent leads
    const leadsOverTime = await VaultLead.aggregate([
      { $match: { 
          createdAt: { $gte: monthAgo }, 
          isDeleted: false,
          'sourceInfo.source': 'freelance_agent'
        } 
      },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Cases over time (last 30 days)
    const casesOverTime = await Case.aggregate([
      { $match: { createdAt: { $gte: monthAgo }, isDeleted: false } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Disbursements over time
    const disbursementsOverTime = await Case.aggregate([
      { $match: { 
        currentStatus: 'Disbursed',
        updatedAt: { $gte: monthAgo },
        isDeleted: false 
      }},
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
        count: { $sum: 1 },
        totalAmount: { $sum: "$loanInfo.disbursedAmount" }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Monthly summary
    const monthlySummary = await Case.aggregate([
      { $match: { createdAt: { $gte: monthAgo }, isDeleted: false } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        totalCases: { $sum: 1 },
        disbursed: { $sum: { $cond: [{ $eq: ["$currentStatus", "Disbursed"] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Leads by source - Only Freelance Agent (count)
    const leadsBySourceFormatted = leadsBySource.length > 0 ? [{
      name: 'Freelance Agent',
      value: leadsBySource[0]?.count || 0,
      color: '#5C039B'
    }] : [{ name: 'Freelance Agent', value: 0, color: '#5C039B' }];

    // ==================== LEAD STATUS SUMMARY ====================
    const leadStatusSummary = {
      new: leadStatusMap['New'] || 0,
      assigned: leadStatusMap['Assigned'] || 0,
      contacted: leadStatusMap['Contacted'] || 0,
      qualified: leadStatusMap['Qualified'] || 0,
      collectingDocuments: leadStatusMap['Collecting Documents'] || 0,
      applicationCreated: leadStatusMap['Application Created'] || 0,
      notProceeding: leadStatusMap['Not Proceeding'] || 0,
      disbursed: leadStatusMap['Disbursed'] || 0
    };

    // ==================== RESPONSE ====================
    return res.status(200).json({
      success: true,
      data: {
        platformHealth: {
          totalUsers: {
            referralPartners: referralPartnersCount,
            partners: partnersCount,
            advisors: advisorsCount,
            opsMembers: opsMembersCount,
            total: referralPartnersCount + partnersCount + advisorsCount + opsMembersCount
          },
          leads: {
            total: totalLeads,
            today: leadsToday,
            thisWeek: leadsThisWeek,
            thisMonth: leadsThisMonth,
            top5Recent: top5RecentLeads.map(lead => ({
              _id: lead._id,
              customerName: lead.customerInfo?.fullName,
              mobileNumber: lead.customerInfo?.mobileNumber,
              propertyValue: lead.propertyDetails?.propertyValue,
              createdAt: lead.createdAt,
              source: lead.sourceInfo?.source
            }))
          },
          leadStatus: leadStatusSummary,
          applicationsByStatus: {
            draft: statusMap['Draft'] || 0,
            submittedToXoto: statusMap['Submitted to Xoto'] || 0,
            inOpsQueue: statusMap['In Ops Queue - Pending Pick-up'] || 0,
            underReview: statusMap['Under Review'] || 0,
            bankApplication: statusMap['Bank Application'] || 0,
            preApproved: statusMap['Pre-Approved'] || 0,
            valuation: statusMap['Valuation'] || 0,
            folIssued: statusMap['FOL Issued'] || 0,
            folSigned: statusMap['FOL Signed'] || 0,
            disbursed: statusMap['Disbursed'] || 0,
            rejected: statusMap['Rejected'] || 0,
            lost: statusMap['Lost'] || 0
          },
          slaBreach: {
            count: slaBreachCount,
            ids: slaBreachIds,
            details: slaBreachDetails
          }
        },
        opsQueue: {
          count: opsQueueCount,
          urgentCount,
          applications: opsQueueList
        },
        unassignedLeads: {
          count: unassignedLeadsCount,
          oldestLead: oldestUnassignedLead?.createdAt || null,
          leads: unassignedLeads
        },
        recentActivities: topRecentActivities,
        commissionStats: {
          pending: commissionMap.pending,
          confirmed: commissionMap.confirmed,
          paid: commissionMap.paid,
          total: commissionMap.pending + commissionMap.confirmed + commissionMap.paid
        },
        graphData: {
          leadsOverTime: leadsOverTime.map(d => ({ date: d._id, count: d.count })),
          casesOverTime: casesOverTime.map(d => ({ date: d._id, count: d.count })),
          disbursementsOverTime: disbursementsOverTime.map(d => ({ 
            date: d._id, 
            count: d.count, 
            totalAmount: d.totalAmount 
          })),
          monthlySummary: monthlySummary.map(m => ({
            month: m._id,
            totalCases: m.totalCases,
            disbursed: m.disbursed
          })),
          leadsBySource: leadsBySourceFormatted
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ==================== PARTNER DASHBOARD STATISTICS ====================
export const getPartnerDashboardStats = async (req, res) => {
  try {
    const partnerId = req.user._id;
    
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    // Get affiliated agents
    const affiliatedAgents = await VaultAgent.find({ 
      partnerId, 
      agentType: 'PartnerAffiliatedAgent',
      isDeleted: false 
    });

    const agentIds = affiliatedAgents.map(a => a._id);

    // Cases created by partner and affiliated agents
    const cases = await Case.find({
      $or: [
        { 'createdBy.partnerId': partnerId },
        { 'createdBy.userId': { $in: agentIds } }
      ],
      isDeleted: false
    });

    // Leads from affiliated agents
    const leads = await VaultLead.find({
      'sourceInfo.createdById': { $in: agentIds },
      isDeleted: false
    });

    // Commissions
    const commissions = await Commission.find({ 
      recipientId: partnerId, 
      recipientRole: 'partner',
      isDeleted: false 
    });

    const totalCommissionEarned = commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0);
    const pendingCommission = commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0);

    // Cases by status
    const casesByStatus = {
      total: cases.length,
      active: cases.filter(c => !['Disbursed', 'Rejected', 'Lost'].includes(c.currentStatus)).length,
      completed: cases.filter(c => c.currentStatus === 'Disbursed').length,
      rejected: cases.filter(c => c.currentStatus === 'Rejected').length,
      lost: cases.filter(c => c.currentStatus === 'Lost').length
    };

    return res.status(200).json({
      success: true,
      data: {
        partnerInfo: {
          name: partner.companyName || partner.displayName,
          status: partner.status,
          joinedAt: partner.createdAt
        },
        agents: {
          total: affiliatedAgents.length,
          active: affiliatedAgents.filter(a => a.isActive).length,
          list: affiliatedAgents.map(a => ({
            _id: a._id,
            name: a.fullName,
            email: a.email,
            isActive: a.isActive,
            leadsSubmitted: leads.filter(l => l.sourceInfo?.createdById?.toString() === a._id.toString()).length
          }))
        },
        cases: casesByStatus,
        leads: {
          total: leads.length,
          qualified: leads.filter(l => l.currentStatus === 'Qualified').length,
          disbursed: leads.filter(l => l.currentStatus === 'Disbursed').length
        },
        commissions: {
          totalEarned: totalCommissionEarned,
          pending: pendingCommission,
          totalCount: commissions.length
        },
        recentCases: cases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
      }
    });

  } catch (error) {
    console.error("Partner dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ADVISOR DASHBOARD STATISTICS ====================
export const getAdvisorDashboardStats = async (req, res) => {
  try {
    const advisorId = req.user._id;

    // Leads assigned to this advisor
    const leads = await VaultLead.find({ 
      'assignedTo.advisorId': advisorId,
      isDeleted: false 
    });

    // Cases created by this advisor
    const cases = await Case.find({ 
      'createdBy.advisorId': advisorId,
      isDeleted: false 
    });

    const totalLeads = leads.length;
    const contactedLeads = leads.filter(l => l.currentStatus === 'Contacted').length;
    const qualifiedLeads = leads.filter(l => l.currentStatus === 'Qualified').length;
    const convertedLeads = leads.filter(l => l.currentStatus === 'Application Created' || l.currentStatus === 'Disbursed').length;

    const activeCases = cases.filter(c => !['Disbursed', 'Rejected', 'Lost'].includes(c.currentStatus)).length;
    const completedCases = cases.filter(c => c.currentStatus === 'Disbursed').length;

    // SLA Compliance
    const slaBreached = leads.filter(l => l.sla?.breached === true).length;
    const slaComplianceRate = totalLeads > 0 ? ((totalLeads - slaBreached) / totalLeads) * 100 : 100;

    return res.status(200).json({
      success: true,
      data: {
        leads: {
          total: totalLeads,
          contacted: contactedLeads,
          qualified: qualifiedLeads,
          converted: convertedLeads,
          conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0
        },
        cases: {
          total: cases.length,
          active: activeCases,
          completed: completedCases
        },
        performance: {
          slaComplianceRate: Math.round(slaComplianceRate),
          slaBreached,
          averageResponseTime: leads.reduce((sum, l) => {
            if (l.sla?.firstContactAt && l.createdAt) {
              return sum + (new Date(l.sla.firstContactAt) - new Date(l.createdAt));
            }
            return sum;
          }, 0) / (leads.length || 1)
        },
        recentLeads: leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
      }
    });

  } catch (error) {
    console.error("Advisor dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== OPS DASHBOARD STATISTICS ====================
export const getOpsDashboardStats = async (req, res) => {
  try {
    const opsId = req.user._id;

    // Cases assigned to this Ops
    const assignedCases = await Case.find({ 
      'assignedTo.opsId': opsId,
      isDeleted: false 
    });

    const pendingReview = assignedCases.filter(c => c.currentStatus === 'Assigned - Pending Review').length;
    const underReview = assignedCases.filter(c => c.currentStatus === 'Under Review').length;
    const returned = assignedCases.filter(c => c.currentStatus === 'Returned - Pending Correction').length;
    const completed = assignedCases.filter(c => c.currentStatus === 'Disbursed').length;

    // Ops Queue (all unassigned)
    const queueCount = await Case.countDocuments({ 
      currentStatus: 'In Ops Queue - Pending Pick-up',
      isDeleted: false 
    });

    const urgentQueueCount = await Case.countDocuments({ 
      currentStatus: 'In Ops Queue - Pending Pick-up',
      createdAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      isDeleted: false 
    });

    return res.status(200).json({
      success: true,
      data: {
        myWorkload: {
          totalAssigned: assignedCases.length,
          pendingReview,
          underReview,
          returned,
          completed
        },
        opsQueue: {
          count: queueCount,
          urgentCount: urgentQueueCount
        },
        performance: {
          averageProcessingDays: assignedCases.reduce((sum, c) => {
            if (c.currentStatus === 'Disbursed' && c.updatedAt && c.createdAt) {
              return sum + Math.ceil((new Date(c.updatedAt) - new Date(c.createdAt)) / (1000 * 60 * 60 * 24));
            }
            return sum;
          }, 0) / (completed || 1),
          totalBankSubmissions: assignedCases.filter(c => c.bankSubmission?.submittedToBankAt).length
        },
        recentCases: assignedCases.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5)
      }
    });

  } catch (error) {
    console.error("Ops dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== FREELANCE AGENT DASHBOARD STATISTICS ====================
export const getAgentDashboardStats = async (req, res) => {
  try {
    const agentId = req.user._id;

    // Leads created by this agent
    const leads = await VaultLead.find({ 
      'sourceInfo.createdById': agentId,
      isDeleted: false 
    });

    // Commissions for this agent
    const commissions = await Commission.find({ 
      recipientId: agentId,
      recipientRole: 'freelance_agent',
      isDeleted: false 
    });

    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => l.currentStatus === 'Qualified').length;
    const disbursedLeads = leads.filter(l => l.currentStatus === 'Disbursed').length;
    
    const totalCommissionEarned = commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0);
    const pendingCommission = commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0);

    return res.status(200).json({
      success: true,
      data: {
        leads: {
          total: totalLeads,
          qualified: qualifiedLeads,
          disbursed: disbursedLeads,
          conversionRate: totalLeads > 0 ? (disbursedLeads / totalLeads) * 100 : 0
        },
        commissions: {
          totalEarned: totalCommissionEarned,
          pending: pendingCommission,
          totalCount: commissions.length
        },
        recentLeads: leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
      }
    });

  } catch (error) {
    console.error("Agent dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
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