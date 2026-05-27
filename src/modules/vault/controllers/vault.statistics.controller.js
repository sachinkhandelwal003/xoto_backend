import mongoose from 'mongoose';
import Case from '../models/Case.js';
// ✅ CORRECT IMPORTS
import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import XotoAdvisor from '../models/XotoAdvisor.js';
import MortgageOps from '../models/MortgageOps.js';
import Commission from '../models/Commission.js';
import VaultLead from '../models/VaultLead.js';

import { Role } from '../../../modules/auth/models/role/role.model.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role?._id || req.user?.role;
  let userRole = 'System';
  if (roleId) {
    let roleDoc = null;
    if (req.user?.role?.code) {
      roleDoc = req.user.role;
    } else {
      roleDoc = await Role.findById(roleId);
    }
    if (roleDoc?.code === '18') userRole = 'Admin';
    else if (roleDoc?.code === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'ReferralPartner') userRole = 'ReferralPartner';
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

// ==================== HELPER: Get Date Range Filter ====================
const getDateFilter = (range, fromDate, toDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  if (range === 'today') return { createdAt: { $gte: today } };
  if (range === 'week') return { createdAt: { $gte: weekAgo } };
  if (range === 'month') return { createdAt: { $gte: monthAgo } };
  if (range === '6months') return { createdAt: { $gte: sixMonthsAgo } };
  if (range === 'year') return { createdAt: { $gte: yearAgo } };
  if (fromDate && toDate) return { createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) } };
  return {};
};

// ==================== ADMIN DASHBOARD STATISTICS ====================
export const getAdminDashboardStats = async (req, res) => {
  try {
    let roleCode = req.user?.role?.code;
    if (!roleCode) {
      const roleId = req.user?.role?._id || req.user?.role;
      if (roleId) {
        const roleDoc = await Role.findById(roleId);
        roleCode = roleDoc?.code;
      }
    }
    if (roleCode !== '18') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { range, fromDate, toDate } = req.query;
    const dateFilter = getDateFilter(range, fromDate, toDate);

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
      slaBreachedLeads,
      totalWebsiteLeads,
      totalFreelanceLeads,
      totalAdminLeads
    ] = await Promise.all([
      VaultLead.countDocuments({ isDeleted: false }),
      Case.countDocuments({ isDeleted: false, currentStatus: { $nin: ['Disbursed', 'Rejected', 'Lost'] } }),
      Partner.countDocuments({ isDeleted: false, status: 'active' }),
      VaultAgent.countDocuments({ isDeleted: false, isActive: true, agentType: 'ReferralPartner' }),
      XotoAdvisor.countDocuments({ isDeleted: false, isActive: true }),
      MortgageOps.countDocuments({ isDeleted: false, isActive: true }),
      Case.countDocuments({ isDeleted: false, currentStatus: 'Disbursed' }),
      Case.countDocuments({ isDeleted: false, currentStatus: { $in: ['Draft', 'Submitted to Xoto', 'In Ops Queue - Pending Pick-up', 'Under Review', 'Bank Application', 'Pre-Approved', 'Valuation', 'FOL Issued', 'FOL Signed'] } }),
      VaultLead.countDocuments({ isDeleted: false, 'sla.breached': true }),
      VaultLead.countDocuments({ isDeleted: false, 'sourceInfo.source': 'website' }),
      VaultLead.countDocuments({ isDeleted: false, 'sourceInfo.source': 'referral_partner' }),
      VaultLead.countDocuments({ isDeleted: false, 'sourceInfo.source': 'admin' })
    ]);

    const conversionRate = totalLeads > 0 ? Number(((disbursedCases / totalLeads) * 100).toFixed(2)) : 0;

    // ==================== LEAD STATUS BREAKDOWN ====================
    const leadsByStatus = await VaultLead.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
    ]);
    const leadStatusMap = {};
    leadsByStatus.forEach(item => { leadStatusMap[item._id] = item.count; });

    // ==================== CASE STATUS BREAKDOWN ====================
    const casesByStatus = await Case.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
    ]);
    const caseStatusMap = {};
    casesByStatus.forEach(item => { caseStatusMap[item._id] = item.count; });

    // ==================== 📊 GRAPH: LEADS OVER TIME ====================
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const leadsOverTime = await VaultLead.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const casesOverTime = await Case.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const disbursementsOverTime = await Case.aggregate([
      { $match: { isDeleted: false, currentStatus: 'Disbursed', updatedAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, count: { $sum: 1 }, amount: { $sum: '$disbursementInfo.disbursedAmount' } } },
      { $sort: { _id: 1 } }
    ]);

    const leadsBySource = await VaultLead.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$sourceInfo.source', count: { $sum: 1 } } }
    ]);

    const commissionSummary = await Commission.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } }
    ]);

    // ==================== OPS MONITORING ====================
    const queueCount = await Case.countDocuments({ currentStatus: 'In Ops Queue - Pending Pick-up', isDeleted: false });
    const urgentCount = await Case.countDocuments({ currentStatus: 'In Ops Queue - Pending Pick-up', isDeleted: false, createdAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } });

    // ==================== ADVISOR MONITORING ====================
    const advisors = await XotoAdvisor.find({ isDeleted: false, isActive: true });
    const overloadedAdvisors = advisors.filter(a => a.workload?.currentLeads >= a.workload?.maxLeadsCapacity).length;
    const availableAdvisors = advisors.filter(a => a.workload?.currentLeads < a.workload?.maxLeadsCapacity).length;
    const unassignedLeads = await VaultLead.countDocuments({ isDeleted: false, currentStatus: 'New', 'assignedTo.advisorId': null, 'sourceInfo.source': { $in: ['website', 'referral_partner', 'admin'] } });

    // ==================== RECENT ITEMS ====================
    const recentLeads = await VaultLead.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(10).lean();
    const recentCases = await Case.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(10).lean();

    return res.status(200).json({
      success: true,
      data: {
        kpis: { totalLeads, activeCases, totalPartners, totalFreelanceAgents, totalAdvisors, totalOpsExecutives, conversionRate, disbursedCases, pendingCases, slaBreachedLeads, unassignedLeads, leadsBySource: { website: totalWebsiteLeads, referral_partner: totalFreelanceLeads, admin: totalAdminLeads } },
        leadStatus: { new: leadStatusMap['New'] || 0, assigned: leadStatusMap['Assigned'] || 0, contacted: leadStatusMap['Contacted'] || 0, qualified: leadStatusMap['Qualified'] || 0, collectingDocuments: leadStatusMap['Collecting Documents'] || 0, documentsComplete: leadStatusMap['Documents Complete'] || 0, applicationOpened: leadStatusMap['Application Opened'] || 0, disbursed: leadStatusMap['Disbursed'] || 0, notProceeding: leadStatusMap['Not Proceeding'] || 0 },
        caseStatus: { draft: caseStatusMap['Draft'] || 0, submittedToXoto: caseStatusMap['Submitted to Xoto'] || 0, inOpsQueue: caseStatusMap['In Ops Queue - Pending Pick-up'] || 0, underReview: caseStatusMap['Under Review'] || 0, bankApplication: caseStatusMap['Bank Application'] || 0, preApproved: caseStatusMap['Pre-Approved'] || 0, valuation: caseStatusMap['Valuation'] || 0, folIssued: caseStatusMap['FOL Issued'] || 0, folSigned: caseStatusMap['FOL Signed'] || 0, disbursed: caseStatusMap['Disbursed'] || 0, rejected: caseStatusMap['Rejected'] || 0, lost: caseStatusMap['Lost'] || 0 },
        graphs: { leadsOverTime: leadsOverTime.map(item => ({ date: item._id, count: item.count })), casesOverTime: casesOverTime.map(item => ({ date: item._id, count: item.count })), disbursementsOverTime: disbursementsOverTime.map(item => ({ date: item._id, count: item.count, amount: item.amount || 0 })), leadsBySource: leadsBySource.map(item => ({ source: item._id, count: item.count })), commissionSummary: commissionSummary.map(item => ({ status: item._id, amount: item.total, count: item.count })) },
        opsMonitoring: { queueCount, urgentCount, availableOps: totalOpsExecutives, canAssign: queueCount > 0 && totalOpsExecutives > 0 },
        advisorMonitoring: { totalAdvisors, overloadedAdvisors, availableAdvisors, avgLeadsPerAdvisor: totalAdvisors > 0 ? Math.round(totalLeads / totalAdvisors) : 0 },
        recentLeads: recentLeads.map(l => ({ _id: l._id, customerName: `${l.customerInfo?.firstName || ''} ${l.customerInfo?.lastName || ''}`, status: l.currentStatus, createdAt: l.createdAt })),
        recentCases: recentCases.map(c => ({ _id: c._id, caseReference: c.caseReference, customerName: c.clientInfo?.fullName, status: c.currentStatus, createdAt: c.createdAt })),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== PARTNER DASHBOARD STATISTICS (Handles both Company & Individual) ====================
export const getPartnerDashboardStats = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    const isCompany = partner.partnerCategory === 'company';
    const { range, fromDate, toDate } = req.query;
    const dateFilter = getDateFilter(range, fromDate, toDate);

    let agentIds = [];
    if (isCompany) {
      const agents = await VaultAgent.find({ partnerId, agentType: 'PartnerAffiliatedAgent', isDeleted: false }).select('_id');
      agentIds = agents.map(a => a._id);
    }

    // Lead Filter - Works for both Company and Individual
    const leadFilter = { isDeleted: false, ...dateFilter };
    if (isCompany) {
      leadFilter.$or = [
        { 'sourceInfo.createdById': partnerId, 'sourceInfo.createdByModel': 'Partner' },
        { 'sourceInfo.createdById': { $in: agentIds }, 'sourceInfo.createdByModel': 'VaultAgent' }
      ];
    } else {
      leadFilter['sourceInfo.createdById'] = partnerId;
      leadFilter['sourceInfo.createdByModel'] = 'Partner';
    }

    // Case Filter
    const caseFilter = { isDeleted: false, ...dateFilter };
    if (isCompany) {
      caseFilter.$or = [
        { 'createdBy.userId': partnerId, 'createdBy.role': 'partner' },
        { 'createdBy.userId': { $in: agentIds }, 'createdBy.role': 'affiliated_agent' }
      ];
    } else {
      caseFilter['createdBy.userId'] = partnerId;
      caseFilter['createdBy.role'] = 'partner';
    }

    const commissionFilter = { recipientId: partnerId, recipientRole: 'partner', isDeleted: false, ...dateFilter };

    // ==================== KPI COUNTS ====================
    const [totalLeads, activeCases, disbursedCases, totalCases, totalCommission, pendingCommission] = await Promise.all([
      VaultLead.countDocuments(leadFilter),
      Case.countDocuments({ ...caseFilter, currentStatus: { $nin: ['Disbursed', 'Rejected', 'Lost'] } }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Disbursed' }),
      Case.countDocuments(caseFilter),
      Commission.aggregate([{ $match: { ...commissionFilter, status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$commissionAmount' } } }]),
      Commission.aggregate([{ $match: { ...commissionFilter, status: { $in: ['Pending', 'Confirmed'] } } }, { $group: { _id: null, total: { $sum: '$commissionAmount' } } }])
    ]);

    const totalCommissionEarned = totalCommission[0]?.total || 0;
    const pendingCommissionAmount = pendingCommission[0]?.total || 0;
    const conversionRate = totalLeads > 0 ? Number(((disbursedCases / totalLeads) * 100).toFixed(2)) : 0;

    // ==================== LEAD STATUS ====================
    const leadsByStatus = await VaultLead.aggregate([{ $match: leadFilter }, { $group: { _id: '$currentStatus', count: { $sum: 1 } } }]);
    const leadStatusMap = {};
    leadsByStatus.forEach(item => { leadStatusMap[item._id] = item.count; });

    // ==================== GRAPHS ====================
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const leadsOverTime = await VaultLead.aggregate([
      { $match: { ...leadFilter, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const disbursementTrend = await Case.aggregate([
      { $match: { ...caseFilter, currentStatus: 'Disbursed', updatedAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, count: { $sum: 1 }, amount: { $sum: '$propertyInfo.loanAmount' } } },
      { $sort: { _id: 1 } }
    ]);

    const commissionTrend = await Commission.aggregate([
      { $match: commissionFilter },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, amount: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // ==================== AGENT SUMMARY (Company only) ====================
    let agentsSummary = null;
    if (isCompany) {
      const totalAgents = agentIds.length;
      const activeAgents = await VaultAgent.countDocuments({ partnerId, agentType: 'PartnerAffiliatedAgent', affiliationStatus: 'verified', isActive: true, isDeleted: false });
      const pendingAgents = await VaultAgent.countDocuments({ partnerId, agentType: 'PartnerAffiliatedAgent', affiliationStatus: 'pending', isDeleted: false });
      agentsSummary = { totalAgents, activeAgents, pendingAgents };
    }

    const recentLeads = await VaultLead.find(leadFilter).sort({ createdAt: -1 }).limit(5).lean();

    // Partner Name based on type
    let partnerName = '';
    if (isCompany) {
      partnerName = partner.companyName || partner.dbaName || 'Company Partner';
    } else {
      partnerName = partner.individualDetails ? `${partner.individualDetails.firstName} ${partner.individualDetails.lastName}` : 'Individual Partner';
    }

    return res.status(200).json({
      success: true,
      data: {
        partnerInfo: { _id: partner._id, name: partnerName, partnerCategory: partner.partnerCategory, status: partner.status, commissionTier: { below5M: 80, above5M: 85 } },
        kpis: { totalLeads, activeCases, totalCases, disbursedCases, conversionRate, totalCommissionEarned, pendingCommission: pendingCommissionAmount },
        leadStatus: { new: leadStatusMap['New'] || 0, contacted: leadStatusMap['Contacted'] || 0, qualified: leadStatusMap['Qualified'] || 0, collectingDocuments: leadStatusMap['Collecting Documents'] || 0, bankApplication: leadStatusMap['Bank Application'] || 0, preApproved: leadStatusMap['Pre-Approved'] || 0, valuation: leadStatusMap['Valuation'] || 0, folIssued: leadStatusMap['FOL Issued'] || 0, folSigned: leadStatusMap['FOL Signed'] || 0, disbursed: leadStatusMap['Disbursed'] || 0, lost: leadStatusMap['Lost'] || 0 },
        graphs: { leadsOverTime: leadsOverTime.map(item => ({ date: item._id, count: item.count })), disbursementTrend: disbursementTrend.map(item => ({ date: item._id, count: item.count, amount: item.amount || 0 })), commissionTrend: commissionTrend.map(item => ({ month: item._id, amount: item.amount || 0, count: item.count || 0 })) },
        agentsSummary,
        recentLeads: recentLeads.map(l => ({ _id: l._id, customerName: `${l.customerInfo?.firstName || ''} ${l.customerInfo?.lastName || ''}`, status: l.currentStatus, createdAt: l.createdAt })),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Partner dashboard stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ADVISOR DASHBOARD STATISTICS ====================
export const getAdvisorDashboardStats = async (req, res) => {
  try {
    const advisorId = req.user._id;
    const advisor = await XotoAdvisor.findById(advisorId);
    if (!advisor) {
      return res.status(404).json({ success: false, message: 'Advisor not found' });
    }

    const { range, fromDate, toDate } = req.query;
    const dateFilter = getDateFilter(range, fromDate, toDate);

    const leadFilter = { 'assignedTo.advisorId': advisorId, isDeleted: false, ...dateFilter };
    const caseFilter = { 'assignedTo.advisorId': advisorId, isDeleted: false, ...dateFilter };

    const [totalLeads, newLeads, contactedLeads, qualifiedLeads, collectingDocs, docsComplete, applicationOpened, disbursedLeads, notProceeding, totalCases, activeCases, slaBreached] = await Promise.all([
      VaultLead.countDocuments(leadFilter),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'New' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Contacted' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Qualified' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Collecting Documents' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Documents Complete' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Application Opened' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Disbursed' }),
      VaultLead.countDocuments({ ...leadFilter, currentStatus: 'Not Proceeding' }),
      Case.countDocuments(caseFilter),
      Case.countDocuments({ ...caseFilter, currentStatus: { $nin: ['Disbursed', 'Rejected', 'Lost'] } }),
      VaultLead.countDocuments({ ...leadFilter, 'sla.breached': true })
    ]);

    const contactRate = totalLeads > 0 ? Number(((contactedLeads / totalLeads) * 100).toFixed(1)) : 0;
    const qualificationRate = contactedLeads > 0 ? Number(((qualifiedLeads / contactedLeads) * 100).toFixed(1)) : 0;
    const conversionRate = qualifiedLeads > 0 ? Number(((disbursedLeads / qualifiedLeads) * 100).toFixed(1)) : 0;
    const slaComplianceRate = totalLeads > 0 ? Number((((totalLeads - slaBreached) / totalLeads) * 100).toFixed(1)) : 100;

    const workload = {
      currentLeads: advisor.workload?.currentLeads || totalLeads,
      maxCapacity: advisor.workload?.maxLeadsCapacity || 20,
      capacityUtilization: advisor.workload?.maxLeadsCapacity > 0 ? Number(((totalLeads / advisor.workload.maxLeadsCapacity) * 100).toFixed(1)) : 0,
      isOverloaded: totalLeads >= (advisor.workload?.maxLeadsCapacity || 20)
    };

    const leadFunnel = { new: newLeads, contacted: contactedLeads, qualified: qualifiedLeads, collectingDocs, docsComplete, applicationOpened, disbursed: disbursedLeads, notProceeding };
    const quickActions = { needsContact: newLeads, needsUpdate: contactedLeads + collectingDocs, canCreateApplication: qualifiedLeads + docsComplete };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const leadsOverTime = await VaultLead.aggregate([
      { $match: { ...leadFilter, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const slaTrend = await VaultLead.aggregate([
      { $match: leadFilter },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, breached: { $sum: { $cond: ['$sla.breached', 1, 0] } }, compliant: { $sum: { $cond: ['$sla.breached', 0, 1] } } } },
      { $sort: { _id: 1 } }
    ]);

    const recentLeads = await VaultLead.find(leadFilter).sort({ createdAt: -1 }).limit(5).lean();

    return res.status(200).json({
      success: true,
      data: {
        advisorInfo: { _id: advisor._id, name: `${advisor.name?.first_name || ''} ${advisor.name?.last_name || ''}`, email: advisor.email },
        workload,
        kpis: { totalLeads, activeCases, disbursedLeads, slaComplianceRate, slaBreached },
        leadFunnel,
        conversionRates: { contactRate, qualificationRate, conversionRate },
        quickActions,
        graphs: { leadsOverTime: leadsOverTime.map(item => ({ date: item._id, count: item.count })), slaTrend: slaTrend.map(item => ({ date: item._id, breached: item.breached || 0, compliant: item.compliant || 0 })) },
        recentLeads: recentLeads.map(l => ({ _id: l._id, customerName: `${l.customerInfo?.firstName || ''} ${l.customerInfo?.lastName || ''}`, status: l.currentStatus, createdAt: l.createdAt })),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Advisor dashboard stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== OPS DASHBOARD STATISTICS ====================
export const getOpsDashboardStats = async (req, res) => {
  try {
    const opsId = req.user._id;
    const ops = await MortgageOps.findById(opsId);
    if (!ops) {
      return res.status(404).json({ success: false, message: 'Ops executive not found' });
    }

    const { range, fromDate, toDate } = req.query;
    const dateFilter = getDateFilter(range, fromDate, toDate);

    const caseFilter = { 'assignedTo.opsId': opsId, isDeleted: false, ...dateFilter };
    const queueFilter = { currentStatus: 'In Ops Queue - Pending Pick-up', isDeleted: false };

    const [totalAssigned, pendingReview, underReview, returnedCases, bankApp, preApproved, valuation, folIssued, folSigned, disbursed, rejected, lost, queueCount, urgentQueue] = await Promise.all([
      Case.countDocuments(caseFilter),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Assigned - Pending Review' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Under Review' }),
      Case.countDocuments({ ...caseFilter, currentStatus: { $in: ['Returned - Pending Correction', 'Returned'] } }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Bank Application' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Pre-Approved' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Valuation' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'FOL Issued' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'FOL Signed' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Disbursed' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Rejected' }),
      Case.countDocuments({ ...caseFilter, currentStatus: 'Lost' }),
      Case.countDocuments(queueFilter),
      Case.countDocuments({ ...queueFilter, createdAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } })
    ]);

    const activeCases = totalAssigned - disbursed - rejected - lost;
    const successRate = totalAssigned > 0 ? Number(((disbursed / totalAssigned) * 100).toFixed(1)) : 0;

    const workload = {
      currentApplications: activeCases,
      maxCapacity: ops.workload?.maxCapacity || 30,
      capacityUtilization: ops.workload?.maxCapacity > 0 ? Number(((activeCases / ops.workload.maxCapacity) * 100).toFixed(1)) : 0,
      isOverloaded: activeCases >= (ops.workload?.maxCapacity || 30)
    };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const casesOverTime = await Case.aggregate([
      { $match: caseFilter },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const queueTrend = await Case.aggregate([
      { $match: queueFilter },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const disbursementTrend = await Case.aggregate([
      { $match: { ...caseFilter, currentStatus: 'Disbursed' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, count: { $sum: 1 }, amount: { $sum: '$propertyInfo.loanAmount' } } },
      { $sort: { _id: 1 } }
    ]);

    const queueCases = await Case.find(queueFilter).sort({ createdAt: 1 }).limit(10).lean();
    const formattedQueueCases = queueCases.map(c => {
      const hoursInQueue = Math.floor((Date.now() - new Date(c.createdAt)) / (1000 * 60 * 60));
      let urgency = 'normal';
      if (hoursInQueue >= 48) urgency = 'urgent';
      else if (hoursInQueue >= 24) urgency = 'warning';
      return { _id: c._id, caseReference: c.caseReference, customerName: c.clientInfo?.fullName || 'N/A', hoursInQueue, urgency, loanAmount: c.propertyInfo?.loanAmount || 0 };
    });

    return res.status(200).json({
      success: true,
      data: {
        opsInfo: { _id: ops._id, name: `${ops.name?.first_name || ''} ${ops.name?.last_name || ''}`, email: ops.email },
        workload,
        kpis: { totalAssigned, activeCases, disbursed, successRate, queueCount, urgentQueue },
        caseStatus: { pendingReview, underReview, returned: returnedCases, bankApplication: bankApp, preApproved, valuation, folIssued, folSigned, disbursed, rejected, lost },
        queue: { total: queueCount, urgent: urgentQueue, canPickUp: queueCount > 0 && !workload.isOverloaded, cases: formattedQueueCases },
        quickActions: { availableInQueue: queueCount, needsReview: pendingReview, needsBankUpdate: bankApp + preApproved + valuation },
        graphs: { casesOverTime: casesOverTime.map(item => ({ date: item._id, count: item.count })), queueTrend: queueTrend.map(item => ({ date: item._id, count: item.count })), disbursementTrend: disbursementTrend.map(item => ({ date: item._id, count: item.count, amount: item.amount || 0 })) },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Ops dashboard stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== FREELANCE AGENT DASHBOARD STATISTICS ====================
export const getAgentDashboardStats = async (req, res) => {
  try {
    const agentId = req.user._id;
    const agent = await VaultAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const { range, fromDate, toDate } = req.query;
    const dateFilter = getDateFilter(range, fromDate, toDate);

    const leadFilter = { 'sourceInfo.createdById': agentId, isDeleted: false, ...dateFilter };

    const leads = await VaultLead.find(leadFilter).sort({ createdAt: -1 });

    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => l.currentStatus === 'Qualified').length;
    const disbursedLeads = leads.filter(l => l.currentStatus === 'Disbursed').length;
    const contactedLeads = leads.filter(l => l.currentStatus === 'Contacted').length;
    const collectingDocs = leads.filter(l => l.currentStatus === 'Collecting Documents').length;
    const bankApplication = leads.filter(l => l.currentStatus === 'Bank Application').length;
    const preApproved = leads.filter(l => l.currentStatus === 'Pre-Approved').length;
    const valuation = leads.filter(l => l.currentStatus === 'Valuation').length;
    const folIssued = leads.filter(l => l.currentStatus === 'FOL Issued').length;
    const folSigned = leads.filter(l => l.currentStatus === 'FOL Signed').length;

    // Calculate active Referrals (leads not in ['Disbursed', 'Not Proceeding'])
    const activeReferrals = leads.filter(l => !['Disbursed', 'Not Proceeding'].includes(l.currentStatus)).length;

    let commissions = [];
    let totalCommissionEarned = 0;
    let pendingCommission = 0;

    if (agent.agentType === 'PartnerAffiliatedAgent') {
      const partnerCommFilter = { sourceAgentId: agentId, recipientRole: 'partner', isDeleted: false, ...dateFilter };
      commissions = await Commission.find(partnerCommFilter);
      const internalPercentage = agent.partnerInternalCommission?.percentage || 0;
      
      totalCommissionEarned = commissions
        .filter(c => c.status === 'Paid')
        .reduce((s, c) => s + ((c.commissionAmount || 0) * internalPercentage / 100), 0);
        
      pendingCommission = commissions
        .filter(c => ['Pending', 'Confirmed'].includes(c.status))
        .reduce((s, c) => s + ((c.commissionAmount || 0) * internalPercentage / 100), 0);
    } else {
      const referralCommFilter = { recipientId: agentId, recipientRole: 'referral_partner', isDeleted: false, ...dateFilter };
      commissions = await Commission.find(referralCommFilter);
      
      totalCommissionEarned = commissions
        .filter(c => c.status === 'Paid')
        .reduce((s, c) => s + (c.commissionAmount || 0), 0);
        
      pendingCommission = commissions
        .filter(c => ['Pending', 'Confirmed'].includes(c.status))
        .reduce((s, c) => s + (c.commissionAmount || 0), 0);
    }

    const conversionRate = totalLeads > 0 ? Number(((disbursedLeads / totalLeads) * 100).toFixed(2)) : 0;

    const profileCompletion = {
      percentage: agent.profileCompletionPercentage || 0,
      isComplete: agent.isProfileComplete || false,
      commissionEligible: agent.commissionEligible || false,
      missingFields: []
    };
    if (!agent.emiratesId?.number || !agent.emiratesId?.frontImageUrl) profileCompletion.missingFields.push('Emirates ID');
    if (!agent.bankDetails?.iban) profileCompletion.missingFields.push('Bank Details');
    if (!agent.isVerified) profileCompletion.missingFields.push('Admin Verification');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const leadsOverTime = await VaultLead.aggregate([
      { $match: { ...leadFilter, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Group commissions by month and calculate amount/count based on user type
    const trendMap = {};
    commissions.forEach(c => {
      if (c.createdAt) {
        const month = c.createdAt.toISOString().substring(0, 7);
        let amt = c.commissionAmount || 0;
        if (agent.agentType === 'PartnerAffiliatedAgent') {
          const internalPercentage = agent.partnerInternalCommission?.percentage || 0;
          amt = amt * internalPercentage / 100;
        }
        if (!trendMap[month]) {
          trendMap[month] = { amount: 0, count: 0 };
        }
        trendMap[month].amount += amt;
        trendMap[month].count += 1;
      }
    });
    const commissionTrend = Object.keys(trendMap).sort().map(month => ({
      month,
      amount: trendMap[month].amount,
      count: trendMap[month].count
    }));

    const leadStatus = {
      new: leads.filter(l => l.currentStatus === 'New').length,
      contacted: contactedLeads,
      qualified: qualifiedLeads,
      collectingDocuments: collectingDocs,
      bankApplication,
      preApproved,
      valuation,
      folIssued,
      folSigned,
      disbursed: disbursedLeads,
      notProceeding: leads.filter(l => l.currentStatus === 'Not Proceeding').length
    };

    const recentLeads = leads.slice(0, 5).map(l => ({
      _id: l._id,
      customerName: `${l.customerInfo?.firstName || ''} ${l.customerInfo?.lastName || ''}`,
      status: l.currentStatus,
      createdAt: l.createdAt
    }));

    // Fetch top 3 ReferralPartners for leaderboard preview
    let leaderboardPreview = [];
    if (agent.agentType === 'ReferralPartner') {
      const topAgents = await VaultAgent.find({
        agentType: 'ReferralPartner',
        isDeleted: false,
        isActive: true,
        'earnings.totalCommissionEarned': { $gt: 0 }
      })
      .sort({ 'earnings.totalCommissionEarned': -1 })
      .limit(3)
      .lean();

      leaderboardPreview = topAgents.map(a => {
        const firstName = a.name?.first_name || '';
        const lastName = a.name?.last_name || '';
        const blurredLastName = lastName ? lastName[0] + '***' : '';
        return {
          name: `${firstName} ${blurredLastName}`.trim(),
          totalCommissionEarned: a.earnings?.totalCommissionEarned || 0,
        };
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        agentInfo: { _id: agent._id, name: agent.fullName, email: agent.email, agentType: agent.agentType },
        profileCompletion,
        kpis: { totalLeads, qualifiedLeads, activeReferrals, disbursedLeads, conversionRate, totalCommissionEarned, pendingCommission },
        leadStatus,
        graphs: { leadsOverTime: leadsOverTime.map(item => ({ date: item._id, count: item.count })), commissionTrend },
        recentLeads,
        leaderboardPreview,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Agent dashboard stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET DASHBOARD STATS BY ROLE ====================
export const getDashboardStatsByRole = async (req, res) => {
  try {
    let roleCode = req.user?.role?.code;
    if (!roleCode) {
      const roleId = req.user?.role?._id || req.user?.role;
      if (roleId) {
        const roleDoc = await Role.findById(roleId);
        roleCode = roleDoc?.code;
      }
    }

    switch (roleCode) {
      case '18': return getAdminDashboardStats(req, res);
      case '21': return getPartnerDashboardStats(req, res);
      case '26': return getAdvisorDashboardStats(req, res);
      case '23': return getOpsDashboardStats(req, res);
      case '22': return getAgentDashboardStats(req, res);
      default: return res.status(403).json({ success: false, message: "Access denied. Invalid role." });
    }
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};