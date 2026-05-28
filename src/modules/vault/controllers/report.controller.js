import mongoose from 'mongoose';
import VaultLead from '../models/VaultLead.js';
import Case from '../models/Case.js';
import Commission from '../models/Commission.js';
import XotoAdvisor from '../models/XotoAdvisor.js';
import MortgageOps from '../models/MortgageOps.js';
import Partner from '../models/Partner.js';
import VaultAgent from '../models/Agent.js';
import Bank from '../../mortgages/models/BankModel.js';
import PDFDocument from 'pdfkit';

// Helper to build filters
const buildFilters = async (query) => {
  const { dateFrom, dateTo, advisorId, opsId, partnerId, bankId, loanType } = query;

  const leadFilter = { isDeleted: false };
  const caseFilter = { isDeleted: false };
  const commissionFilter = { isDeleted: false };

  // Date Range
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = new Date(dateFrom);
    if (dateTo) range.$lte = new Date(dateTo);
    leadFilter.createdAt = range;
    caseFilter.createdAt = range;
    commissionFilter.createdAt = range;
  }

  // Advisor Filter
  if (advisorId) {
    leadFilter['assignedTo.advisorId'] = new mongoose.Types.ObjectId(advisorId);
    // Find all leads for this advisor to filter cases
    const leads = await VaultLead.find({ 'assignedTo.advisorId': advisorId, isDeleted: false }).select('_id');
    const leadIds = leads.map(l => l._id);
    caseFilter.sourceLeadId = { $in: leadIds };
    commissionFilter.sourceLeadId = { $in: leadIds };
  }

  // Ops Filter
  if (opsId) {
    const opsObjId = new mongoose.Types.ObjectId(opsId);
    caseFilter.$or = [
      { 'opsQueue.pickedUpBy.opsId': opsObjId },
      { 'assignedTo.opsId': opsObjId }
    ];
    // Find cases to filter leads/commissions
    const cases = await Case.find({
      $or: [
        { 'opsQueue.pickedUpBy.opsId': opsObjId },
        { 'assignedTo.opsId': opsObjId }
      ],
      isDeleted: false
    }).select('sourceLeadId _id');
    const caseIds = cases.map(c => c._id);
    const leadIds = cases.map(c => c.sourceLeadId).filter(Boolean);
    leadFilter._id = { $in: leadIds };
    commissionFilter.caseId = { $in: caseIds };
  }

  // Partner Filter
  if (partnerId) {
    const partnerObjId = new mongoose.Types.ObjectId(partnerId);
    leadFilter.$or = [
      { partnerId: partnerObjId },
      { 'sourceInfo.createdById': partnerObjId }
    ];
    caseFilter.partnerId = partnerObjId;
    commissionFilter.$or = [
      { recipientId: partnerObjId },
      { sourcePartnerId: partnerObjId }
    ];
  }

  // Bank Filter
  if (bankId) {
    const bankObjId = new mongoose.Types.ObjectId(bankId);
    caseFilter['bankSelection.bankId'] = bankObjId;
    // Find cases to filter leads/commissions
    const cases = await Case.find({ 'bankSelection.bankId': bankObjId, isDeleted: false }).select('sourceLeadId _id');
    const caseIds = cases.map(c => c._id);
    const leadIds = cases.map(c => c.sourceLeadId).filter(Boolean);
    leadFilter._id = { $in: leadIds };
    commissionFilter.caseId = { $in: caseIds };
  }

  // Loan Type (Transaction Type)
  if (loanType) {
    leadFilter['propertyDetails.transactionType'] = loanType;
    caseFilter['propertyInfo.transactionType'] = loanType;
    // Find cases to filter commissions
    const cases = await Case.find({ 'propertyInfo.transactionType': loanType, isDeleted: false }).select('_id');
    const caseIds = cases.map(c => c._id);
    commissionFilter.caseId = { $in: caseIds };
  }

  return { leadFilter, caseFilter, commissionFilter };
};

// ── 1. LEAD VOLUME REPORT ─────────────────────────────────────────
const getLeadVolumeReport = async (leadFilter) => {
  const list = await VaultLead.aggregate([
    { $match: leadFilter },
    {
      $group: {
        _id: {
          period: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          source: '$sourceInfo.source',
          advisor: '$assignedTo.advisorName'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.period': -1, count: -1 } }
  ]);

  return list.map(item => ({
    period: item._id.period || 'N/A',
    source: item._id.source || 'Walk-in / Website',
    advisor: item._id.advisor || 'Unassigned',
    count: item.count
  }));
};

// ── 2. APPLICATIONS PIPELINE REPORT ────────────────────────────────
const getApplicationsPipelineReport = async (caseFilter) => {
  const statusCounts = await Case.aggregate([
    { $match: caseFilter },
    { $group: { _id: '$currentStatus', count: { $sum: 1 } } }
  ]);

  const cases = await Case.find(caseFilter).select('currentStatus timeline opsQueue.pickedUpBy.pickedUpAt').lean();

  // Average time in status in hours
  const statusTimes = {
    'Draft to Submitted': { sum: 0, count: 0 },
    'Queue to Pick-up': { sum: 0, count: 0 },
    'Ops Review to Bank': { sum: 0, count: 0 },
    'Bank to Pre-Approved': { sum: 0, count: 0 },
    'Pre-Approved to FOL Signed': { sum: 0, count: 0 },
    'FOL Signed to Disbursed': { sum: 0, count: 0 }
  };

  cases.forEach(c => {
    const t = c.timeline || {};
    if (t.createdAt && t.submittedToXotoAt) {
      statusTimes['Draft to Submitted'].sum += (new Date(t.submittedToXotoAt) - new Date(t.createdAt));
      statusTimes['Draft to Submitted'].count++;
    }
    if (c.opsQueue?.enteredQueueAt && c.opsQueue?.pickedUpBy?.pickedUpAt) {
      statusTimes['Queue to Pick-up'].sum += (new Date(c.opsQueue.pickedUpBy.pickedUpAt) - new Date(c.opsQueue.enteredQueueAt));
      statusTimes['Queue to Pick-up'].count++;
    }
    if (t.assignedToOpsAt && t.submittedToBankAt) {
      statusTimes['Ops Review to Bank'].sum += (new Date(t.submittedToBankAt) - new Date(t.assignedToOpsAt));
      statusTimes['Ops Review to Bank'].count++;
    }
    if (t.submittedToBankAt && t.preApprovedAt) {
      statusTimes['Bank to Pre-Approved'].sum += (new Date(t.preApprovedAt) - new Date(t.submittedToBankAt));
      statusTimes['Bank to Pre-Approved'].count++;
    }
    if (t.preApprovedAt && t.folSignedAt) {
      statusTimes['Pre-Approved to FOL Signed'].sum += (new Date(t.folSignedAt) - new Date(t.preApprovedAt));
      statusTimes['Pre-Approved to FOL Signed'].count++;
    }
    if (t.folSignedAt && t.disbursedAt) {
      statusTimes['FOL Signed to Disbursed'].sum += (new Date(t.disbursedAt) - new Date(t.folSignedAt));
      statusTimes['FOL Signed to Disbursed'].count++;
    }
  });

  const durationMetrics = Object.entries(statusTimes).map(([stage, metric]) => {
    const avgHours = metric.count > 0 ? (metric.sum / (1000 * 60 * 60 * metric.count)).toFixed(1) : '0.0';
    return { stage, avgHours: parseFloat(avgHours), count: metric.count };
  });

  // Bottleneck Identification (longest status time)
  let bottleneck = 'None';
  let maxTime = 0;
  durationMetrics.forEach(m => {
    if (m.avgHours > maxTime) {
      maxTime = m.avgHours;
      bottleneck = m.stage;
    }
  });

  return {
    pipeline: statusCounts.map(item => ({ status: item._id || 'Draft', count: item.count })),
    averages: durationMetrics,
    bottleneck: maxTime > 0 ? `${bottleneck} (${maxTime} hrs)` : 'No bottlenecks identified'
  };
};

// ── 3. CONVERSION FUNNEL ──────────────────────────────────────────
const getConversionFunnelReport = async (leadFilter, caseFilter) => {
  const totalLeads = await VaultLead.countDocuments(leadFilter);
  const qualifiedLeads = await VaultLead.countDocuments({ ...leadFilter, currentStatus: { $in: ['Qualified', 'Application Opened', 'Collecting Documents', 'Documents Complete', 'Bank Application', 'Pre-Approved', 'Valuation', 'FOL Processed', 'FOL Issued', 'FOL Signed', 'Disbursed'] } });
  const casesCreated = await Case.countDocuments(caseFilter);
  const submittedCases = await Case.countDocuments({ ...caseFilter, 'timeline.submittedToBankAt': { $ne: null } });
  const disbursedCases = await Case.countDocuments({ ...caseFilter, currentStatus: 'Disbursed' });

  return [
    { stage: 'Total Leads', count: totalLeads, conversion: 100 },
    { stage: 'Qualified Leads', count: qualifiedLeads, conversion: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0 },
    { stage: 'Cases Created', count: casesCreated, conversion: qualifiedLeads > 0 ? Math.round((casesCreated / qualifiedLeads) * 100) : 0 },
    { stage: 'Submitted to Bank', count: submittedCases, conversion: casesCreated > 0 ? Math.round((submittedCases / casesCreated) * 100) : 0 },
    { stage: 'Disbursed Cases', count: disbursedCases, conversion: submittedCases > 0 ? Math.round((disbursedCases / submittedCases) * 100) : 0 }
  ];
};

// ── 4. ADVISOR PERFORMANCE REPORT ─────────────────────────────────
const getAdvisorPerformanceReport = async (leadFilter, caseFilter) => {
  // Get all active advisors
  const advisors = await XotoAdvisor.find({ isDeleted: false }).lean();

  const report = [];
  for (const adv of advisors) {
    const advFilter = { ...leadFilter, 'assignedTo.advisorId': adv._id };
    const totalLeads = await VaultLead.countDocuments(advFilter);
    const slaBreached = await VaultLead.countDocuments({ ...advFilter, 'sla.breached': true });
    
    // Find all cases corresponding to this advisor's leads
    const leads = await VaultLead.find({ 'assignedTo.advisorId': adv._id, isDeleted: false }).select('_id');
    const leadIds = leads.map(l => l._id);
    const advCaseFilter = { ...caseFilter, sourceLeadId: { $in: leadIds } };

    const totalCases = await Case.countDocuments(advCaseFilter);
    const disbursed = await Case.countDocuments({ ...advCaseFilter, currentStatus: 'Disbursed' });
    const submitted = await Case.countDocuments({ ...advCaseFilter, 'timeline.submittedToBankAt': { $ne: null } });

    // Time calculations
    const cases = await Case.find(advCaseFilter).populate('sourceLeadId').lean();
    let sumLeadToApp = 0;
    let countLeadToApp = 0;
    let sumAppToSub = 0;
    let countAppToSub = 0;

    cases.forEach(c => {
      if (c.sourceLeadId?.assignedTo?.assignedAt && c.createdAt) {
        sumLeadToApp += (new Date(c.createdAt) - new Date(c.sourceLeadId.assignedTo.assignedAt));
        countLeadToApp++;
      }
      if (c.createdAt && c.timeline?.submittedToBankAt) {
        sumAppToSub += (new Date(c.timeline.submittedToBankAt) - new Date(c.createdAt));
        countAppToSub++;
      }
    });

    report.push({
      advisor: `${adv.name?.first_name || ''} ${adv.name?.last_name || ''}`.trim() || adv.email,
      leadsAssigned: totalLeads,
      conversionRate: totalLeads > 0 ? parseFloat(((disbursed / totalLeads) * 100).toFixed(1)) : 0,
      avgLeadToAppHrs: countLeadToApp > 0 ? parseFloat((sumLeadToApp / (1000 * 60 * 60 * countLeadToApp)).toFixed(1)) : 0,
      avgAppToSubHrs: countAppToSub > 0 ? parseFloat((sumAppToSub / (1000 * 60 * 60 * countAppToSub)).toFixed(1)) : 0,
      slaComplianceRate: totalLeads > 0 ? parseFloat((((totalLeads - slaBreached) / totalLeads) * 100).toFixed(1)) : 100
    });
  }
  return report;
};

// ── 5. OPS PERFORMANCE REPORT ─────────────────────────────────────
const getOpsPerformanceReport = async (caseFilter) => {
  const opsList = await MortgageOps.find({ isDeleted: false }).lean();

  const report = [];
  for (const ops of opsList) {
    const opsFilter = {
      ...caseFilter,
      $or: [
        { 'opsQueue.pickedUpBy.opsId': ops._id },
        { 'assignedTo.opsId': ops._id }
      ]
    };

    const totalAssigned = await Case.countDocuments(opsFilter);
    const returned = await Case.countDocuments({ ...opsFilter, 'opsQueue.returnCount': { $gt: 0 } });
    const cases = await Case.find(opsFilter).lean();

    let sumAppToSub = 0;
    let countAppToSub = 0;
    let slaCompliantCount = 0;

    cases.forEach(c => {
      const pickUpDate = c.opsQueue?.pickedUpBy?.pickedUpAt;
      const subDate = c.timeline?.submittedToBankAt;
      if (pickUpDate && subDate) {
        const diffMs = new Date(subDate) - new Date(pickUpDate);
        sumAppToSub += diffMs;
        countAppToSub++;
        if (diffMs <= 48 * 60 * 60 * 1000) { // SLA within 48 hours
          slaCompliantCount++;
        }
      }
    });

    report.push({
      opsName: `${ops.name?.first_name || ''} ${ops.name?.last_name || ''}`.trim() || ops.email,
      applicationsAssigned: totalAssigned,
      returnRate: totalAssigned > 0 ? parseFloat(((returned / totalAssigned) * 100).toFixed(1)) : 0,
      avgAppToSubHrs: countAppToSub > 0 ? parseFloat((sumAppToSub / (1000 * 60 * 60 * countAppToSub)).toFixed(1)) : 0,
      slaComplianceRate: countAppToSub > 0 ? parseFloat(((slaCompliantCount / countAppToSub) * 100).toFixed(1)) : 100
    });
  }
  return report;
};

// ── 6. REFERRAL PARTNER PERFORMANCE ───────────────────────────────
const getReferralPartnerPerformanceReport = async (leadFilter) => {
  const agents = await VaultAgent.find({ agentType: 'ReferralPartner', isDeleted: false }).lean();

  const report = [];
  for (const agent of agents) {
    const rpFilter = { ...leadFilter, 'sourceInfo.createdById': agent._id, 'sourceInfo.createdByModel': 'VaultAgent' };
    const totalLeads = await VaultLead.countDocuments(rpFilter);
    
    // Converted leads (disbursed status)
    const disbursed = await VaultLead.countDocuments({ ...rpFilter, currentStatus: 'Disbursed' });

    // Paid commission
    const commissions = await Commission.aggregate([
      { $match: { recipientId: agent._id, recipientRole: 'referral_partner', status: 'Paid', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const commissionEarned = commissions[0]?.total || 0;

    report.push({
      partnerName: agent.fullName || agent.email,
      leadsSubmitted: totalLeads,
      conversionRate: totalLeads > 0 ? parseFloat(((disbursed / totalLeads) * 100).toFixed(1)) : 0,
      commissionEarned
    });
  }
  return report;
};

// ── 7. PARTNER PERFORMANCE REPORT ─────────────────────────────────
const getPartnerPerformanceReport = async (caseFilter) => {
  const partners = await Partner.find({ isDeleted: false }).lean();

  const report = [];
  for (const p of partners) {
    const pFilter = { ...caseFilter, partnerId: p._id };
    const totalCases = await Case.countDocuments(pFilter);
    const disbursed = await Case.countDocuments({ ...pFilter, currentStatus: 'Disbursed' });

    // Total Paid + Pending Commission
    const commissions = await Commission.aggregate([
      { $match: { recipientId: p._id, recipientRole: 'partner', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const totalCommission = commissions[0]?.total || 0;

    let partnerName = '';
    if (p.partnerCategory === 'company') {
      partnerName = p.companyName || p.dbaName || 'Company Partner';
    } else {
      partnerName = p.individualDetails ? `${p.individualDetails.firstName} ${p.individualDetails.lastName}` : 'Individual Partner';
    }

    report.push({
      partnerName,
      applicationsSubmitted: totalCases,
      disbursementRate: totalCases > 0 ? parseFloat(((disbursed / totalCases) * 100).toFixed(1)) : 0,
      totalCommission
    });
  }
  return report;
};

// ── 8. COMMISSION REPORT ──────────────────────────────────────────
const getCommissionReport = async (commissionFilter) => {
  const list = await Commission.find(commissionFilter).lean();

  let received = 0;
  let paidOut = 0;
  let outstanding = 0;

  list.forEach(c => {
    // Bank commission
    received += (c.xotoCommissionReceived || 0);

    if (c.status === 'Paid') {
      paidOut += (c.commissionAmount || 0);
    } else if (['Pending', 'Confirmed'].includes(c.status)) {
      outstanding += (c.commissionAmount || 0);
    }
  });

  return {
    received,
    paidOut,
    outstanding,
    totalRecords: list.length
  };
};

// ══════════════════════════════════════════════════════════════════
// MAIN REPORTS FETCH CONTROLLER
// ══════════════════════════════════════════════════════════════════
export const getAdminReports = async (req, res) => {
  try {
    const { reportType } = req.query;

    if (!reportType) {
      return res.status(400).json({ success: false, message: 'reportType query parameter is required' });
    }

    const { leadFilter, caseFilter, commissionFilter } = await buildFilters(req.query);

    let reportData = null;
    switch (reportType) {
      case 'lead_volume':
        reportData = await getLeadVolumeReport(leadFilter);
        break;
      case 'applications_pipeline':
        reportData = await getApplicationsPipelineReport(caseFilter);
        break;
      case 'conversion_funnel':
        reportData = await getConversionFunnelReport(leadFilter, caseFilter);
        break;
      case 'advisor_performance':
        reportData = await getAdvisorPerformanceReport(leadFilter, caseFilter);
        break;
      case 'ops_performance':
        reportData = await getOpsPerformanceReport(caseFilter);
        break;
      case 'referral_performance':
        reportData = await getReferralPartnerPerformanceReport(leadFilter);
        break;
      case 'partner_performance':
        reportData = await getPartnerPerformanceReport(caseFilter);
        break;
      case 'commission_report':
        reportData = await getCommissionReport(commissionFilter);
        break;
      default:
        return res.status(400).json({ success: false, message: `Invalid reportType: ${reportType}` });
    }

    return res.status(200).json({ success: true, data: reportData });
  } catch (error) {
    console.error('getAdminReports error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// EXPORT REPORTS AS CSV / PDF
// ══════════════════════════════════════════════════════════════════
export const exportAdminReport = async (req, res) => {
  try {
    const { reportType, format = 'csv' } = req.query;

    if (!reportType) {
      return res.status(400).send('reportType query parameter is required');
    }

    const { leadFilter, caseFilter, commissionFilter } = await buildFilters(req.query);
    let rawData = null;

    switch (reportType) {
      case 'lead_volume':
        rawData = await getLeadVolumeReport(leadFilter);
        break;
      case 'applications_pipeline':
        rawData = await getApplicationsPipelineReport(caseFilter);
        break;
      case 'conversion_funnel':
        rawData = await getConversionFunnelReport(leadFilter, caseFilter);
        break;
      case 'advisor_performance':
        rawData = await getAdvisorPerformanceReport(leadFilter, caseFilter);
        break;
      case 'ops_performance':
        rawData = await getOpsPerformanceReport(caseFilter);
        break;
      case 'referral_performance':
        rawData = await getReferralPartnerPerformanceReport(leadFilter);
        break;
      case 'partner_performance':
        rawData = await getPartnerPerformanceReport(caseFilter);
        break;
      case 'commission_report':
        rawData = await getCommissionReport(commissionFilter);
        break;
      default:
        return res.status(400).send('Invalid reportType');
    }

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=report_${reportType}_${Date.now()}.csv`);

      let csvContent = '';
      if (reportType === 'lead_volume') {
        csvContent += 'Period,Source,Advisor,Lead Count\n';
        rawData.forEach(row => {
          csvContent += `"${row.period}","${row.source}","${row.advisor}",${row.count}\n`;
        });
      } else if (reportType === 'applications_pipeline') {
        csvContent += 'Stage,Count / Value\n';
        rawData.pipeline.forEach(row => {
          csvContent += `"${row.status}",${row.count}\n`;
        });
        csvContent += '\nAverage Hours spent in each stage:\nStage,Avg Hours,Record Count\n';
        rawData.averages.forEach(row => {
          csvContent += `"${row.stage}",${row.avgHours},${row.count}\n`;
        });
        csvContent += `\nBottleneck:,"${rawData.bottleneck}"\n`;
      } else if (reportType === 'conversion_funnel') {
        csvContent += 'Funnel Stage,Leads Count,Conversion Rate (%)\n';
        rawData.forEach(row => {
          csvContent += `"${row.stage}",${row.count},${row.conversion}\n`;
        });
      } else if (reportType === 'advisor_performance') {
        csvContent += 'Advisor Name,Leads Assigned,Conversion Rate (%),Avg Lead-to-App (Hrs),Avg App-to-Sub (Hrs),SLA Compliance (%)\n';
        rawData.forEach(row => {
          csvContent += `"${row.advisor}",${row.leadsAssigned},${row.conversionRate},${row.avgLeadToAppHrs},${row.avgAppToSubHrs},${row.slaComplianceRate}\n`;
        });
      } else if (reportType === 'ops_performance') {
        csvContent += 'Ops Name,Applications Assigned,Return Rate (%),Avg App-to-Sub (Hrs),SLA Compliance (%)\n';
        rawData.forEach(row => {
          csvContent += `"${row.opsName}",${row.applicationsAssigned},${row.returnRate},${row.avgAppToSubHrs},${row.slaComplianceRate}\n`;
        });
      } else if (reportType === 'referral_performance') {
        csvContent += 'Referral Partner,Leads Submitted,Conversion Rate (%),Commission Earned (AED)\n';
        rawData.forEach(row => {
          csvContent += `"${row.partnerName}",${row.leadsSubmitted},${row.conversionRate},${row.commissionEarned}\n`;
        });
      } else if (reportType === 'partner_performance') {
        csvContent += 'Partner Name,Applications Submitted,Disbursement Rate (%),Total Commission (AED)\n';
        rawData.forEach(row => {
          csvContent += `"${row.partnerName}",${row.applicationsSubmitted},${row.disbursementRate},${row.totalCommission}\n`;
        });
      } else if (reportType === 'commission_report') {
        csvContent += 'Metric,Amount (AED)\n';
        csvContent += `Total Received from Banks,${rawData.received}\n`;
        csvContent += `Total Paid Out to Partners,${rawData.paidOut}\n`;
        csvContent += `Outstanding Payouts,${rawData.outstanding}\n`;
        csvContent += `Total Commission Records,${rawData.totalRecords}\n`;
      }
      return res.status(200).send(csvContent);

    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=report_${reportType}_${Date.now()}.pdf`);

      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(res);

      // Title & Branding
      doc.fontSize(22).fillColor('#5C039B').text('XOTO VAULT REPORT', { align: 'center', bold: true });
      doc.fontSize(10).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, { align: 'center' });
      doc.moveDown(2);

      const titleFormatted = reportType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      doc.fontSize(16).fillColor('#0f172a').text(titleFormatted, { align: 'left', underline: true });
      doc.moveDown(1.5);

      // Render Tables based on type
      if (reportType === 'lead_volume') {
        doc.fontSize(11).fillColor('#475569');
        let y = doc.y;
        doc.text('Period', 40, y, { bold: true });
        doc.text('Source', 140, y, { bold: true });
        doc.text('Advisor', 300, y, { bold: true });
        doc.text('Leads Count', 450, y, { bold: true });
        doc.moveDown(0.5);

        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        rawData.forEach(row => {
          y = doc.y;
          if (y > 700) { doc.addPage(); y = 40; }
          doc.text(row.period, 40, y);
          doc.text(row.source, 140, y);
          doc.text(row.advisor, 300, y);
          doc.text(String(row.count), 450, y);
          doc.moveDown(0.8);
        });
      } else if (reportType === 'applications_pipeline') {
        doc.fontSize(12).fillColor('#0f172a').text('Pipeline Status Distribution:', { bold: true });
        doc.moveDown(0.5);
        rawData.pipeline.forEach(row => {
          doc.fontSize(10).fillColor('#475569').text(`- ${row.status}: ${row.count} applications`);
        });
        doc.moveDown(1.5);

        doc.fontSize(12).fillColor('#0f172a').text('Average Time spent in status:', { bold: true });
        doc.moveDown(0.5);
        rawData.averages.forEach(row => {
          doc.fontSize(10).fillColor('#475569').text(`- ${row.stage}: ${row.avgHours} hours (sample: ${row.count})`);
        });
        doc.moveDown(1.5);
        doc.fontSize(12).fillColor('#b91c1c').text(`Bottleneck Identified: ${rawData.bottleneck}`);
      } else if (reportType === 'conversion_funnel') {
        doc.fontSize(11).fillColor('#475569');
        let y = doc.y;
        doc.text('Funnel Stage', 40, y, { bold: true });
        doc.text('Leads Count', 250, y, { bold: true });
        doc.text('Conversion Rate', 420, y, { bold: true });
        doc.moveDown(0.5);

        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        rawData.forEach(row => {
          y = doc.y;
          doc.text(row.stage, 40, y);
          doc.text(String(row.count), 250, y);
          doc.text(`${row.conversion}%`, 420, y);
          doc.moveDown(0.8);
        });
      } else if (reportType === 'advisor_performance') {
        doc.fontSize(10).fillColor('#475569');
        let y = doc.y;
        doc.text('Advisor', 40, y, { bold: true });
        doc.text('Leads', 180, y, { bold: true });
        doc.text('Conv %', 230, y, { bold: true });
        doc.text('Lead->App (H)', 290, y, { bold: true });
        doc.text('App->Sub (H)', 380, y, { bold: true });
        doc.text('SLA %', 470, y, { bold: true });
        doc.moveDown(0.5);

        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        rawData.forEach(row => {
          y = doc.y;
          if (y > 700) { doc.addPage(); y = 40; }
          doc.text(row.advisor, 40, y);
          doc.text(String(row.leadsAssigned), 180, y);
          doc.text(`${row.conversionRate}%`, 230, y);
          doc.text(String(row.avgLeadToAppHrs), 290, y);
          doc.text(String(row.avgAppToSubHrs), 380, y);
          doc.text(`${row.slaComplianceRate}%`, 470, y);
          doc.moveDown(0.8);
        });
      } else if (reportType === 'ops_performance') {
        doc.fontSize(10).fillColor('#475569');
        let y = doc.y;
        doc.text('Ops Name', 40, y, { bold: true });
        doc.text('Assigned', 180, y, { bold: true });
        doc.text('Return %', 250, y, { bold: true });
        doc.text('Avg Sub (H)', 320, y, { bold: true });
        doc.text('SLA Compliance', 430, y, { bold: true });
        doc.moveDown(0.5);

        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        rawData.forEach(row => {
          y = doc.y;
          if (y > 700) { doc.addPage(); y = 40; }
          doc.text(row.opsName, 40, y);
          doc.text(String(row.applicationsAssigned), 180, y);
          doc.text(`${row.returnRate}%`, 250, y);
          doc.text(String(row.avgAppToSubHrs), 320, y);
          doc.text(`${row.slaComplianceRate}%`, 430, y);
          doc.moveDown(0.8);
        });
      } else if (reportType === 'referral_performance') {
        doc.fontSize(10).fillColor('#475569');
        let y = doc.y;
        doc.text('Referral Partner', 40, y, { bold: true });
        doc.text('Leads Submitted', 200, y, { bold: true });
        doc.text('Conversion Rate', 320, y, { bold: true });
        doc.text('Commission (AED)', 440, y, { bold: true });
        doc.moveDown(0.5);

        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        rawData.forEach(row => {
          y = doc.y;
          if (y > 700) { doc.addPage(); y = 40; }
          doc.text(row.partnerName, 40, y);
          doc.text(String(row.leadsSubmitted), 200, y);
          doc.text(`${row.conversionRate}%`, 320, y);
          doc.text(row.commissionEarned.toLocaleString(), 440, y);
          doc.moveDown(0.8);
        });
      } else if (reportType === 'partner_performance') {
        doc.fontSize(10).fillColor('#475569');
        let y = doc.y;
        doc.text('Partner Name', 40, y, { bold: true });
        doc.text('Applications Submitted', 200, y, { bold: true });
        doc.text('Disbursement Rate', 320, y, { bold: true });
        doc.text('Total Commission (AED)', 440, y, { bold: true });
        doc.moveDown(0.5);

        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        rawData.forEach(row => {
          y = doc.y;
          if (y > 700) { doc.addPage(); y = 40; }
          doc.text(row.partnerName, 40, y);
          doc.text(String(row.applicationsSubmitted), 200, y);
          doc.text(`${row.disbursementRate}%`, 320, y);
          doc.text(row.totalCommission.toLocaleString(), 440, y);
          doc.moveDown(0.8);
        });
      } else if (reportType === 'commission_report') {
        doc.fontSize(12).fillColor('#475569');
        doc.text(`Total Bank Commissions Received: AED ${rawData.received.toLocaleString()}`);
        doc.moveDown(0.5);
        doc.text(`Total Payouts Completed: AED ${rawData.paidOut.toLocaleString()}`);
        doc.moveDown(0.5);
        doc.text(`Outstanding Commissions Owed: AED ${rawData.outstanding.toLocaleString()}`);
        doc.moveDown(0.5);
        doc.text(`Total Database Records Evaluated: ${rawData.totalRecords}`);
      }

      doc.end();
    } else {
      res.status(400).send('Invalid export format');
    }
  } catch (error) {
    console.error('exportAdminReport error:', error);
    res.status(500).send(error.message);
  }
};
