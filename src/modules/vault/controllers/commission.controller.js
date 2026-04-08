                                                                                                                                                                                                import Commission from '../models/Commission.js';
import Case from '../models/Case.js';
import Lead from '../models/Lead.js';
import Partner from '../models/Partner.js';
import VaultAgent from '../models/Agent.js';
import HistoryService from '../services/history.service.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'System';
  if (roleId) {
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(roleId);
    if (roleDoc?.code === '18') userRole = 'Admin';
    else if (roleDoc?.code === '21') userRole = 'Partner';
    else if (req.user?.agentType === 'FreelanceAgent') userRole = 'FreelanceAgent';
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

/* =====================================
   CREATE COMMISSION (Auto on Disbursement)
===================================== */
export const createCommission = async (req, res) => {
  try {
    const { caseId } = req.body;
    const caseData = await Case.findOne({ caseId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    if (caseData.currentStatus !== 'Disbursed') return res.status(400).json({ success: false, message: "Case not disbursed" });
    if (caseData.commissionInfo) return res.status(400).json({ success: false, message: "Commission already created" });
    
    const partner = await Partner.findById(caseData.createdBy.partnerId);
    const loanAmount = caseData.loanInfo.approvedAmount || caseData.loanInfo.requestedAmount;
    const partnerPercentage = partner.getCommissionPercentage(loanAmount);
    const bankCommissionToXoto = loanAmount * 0.01;
    const { commissionAmount, calculationFormula } = Commission.calculateCommission(bankCommissionToXoto, partnerPercentage);
    
    const commissionId = `COM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const commission = await Commission.create({
      commissionId, caseId, leadId: caseData.sourceLeadId, proposalId: caseData.proposalId,
      recipientRole: 'partner', recipientId: partner._id, recipientModel: 'Partner', recipientName: partner.companyName,
      loanAmount, loanTier: Commission.getLoanTier(loanAmount), bankCommissionToXoto, recipientPercentage: partnerPercentage,
      commissionAmount, calculationFormula, disbursedAt: new Date(), status: 'Pending',
    });
    
    caseData.commissionInfo = { loanAmount, loanTier: commission.loanTier, partnerPercentage, xotoCommissionFromBank: bankCommissionToXoto, partnerCommissionAmount: commissionAmount, calculation: calculationFormula, status: 'Pending Disbursement' };
    await caseData.save();
    
    if (caseData.sourceLeadId) {
      const lead = await Lead.findOne({ leadId: caseData.sourceLeadId });
      if (lead && lead.sourceInfo.createdByRole === 'freelance_agent') {
        const agent = await VaultAgent.findById(lead.sourceInfo.createdById);
        if (agent && agent.isVerified) {
          const agentPercentage = agent.getCommissionPercentage(lead.propertyDetails.propertyValue, lead.referralType);
          const agentCommissionAmount = (bankCommissionToXoto * agentPercentage) / 100;
          await Commission.create({
            commissionId: `COM-${Date.now()}-${Math.floor(Math.random() * 1000)}`, caseId, leadId: caseData.sourceLeadId,
            recipientRole: 'freelance_agent', recipientId: agent._id, recipientModel: 'VaultAgent', recipientName: agent.fullName,
            loanAmount, loanTier: Commission.getLoanTier(loanAmount), bankCommissionToXoto, recipientPercentage: agentPercentage,
            commissionAmount: agentCommissionAmount, calculationFormula: `${bankCommissionToXoto} × ${agentPercentage}% = ${agentCommissionAmount}`,
            referralType: lead.referralType, disbursedAt: new Date(), status: 'Pending',
          });
        }
      }
    }
    
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_CREATED', await getUserInfo(req), { description: `Commission ${commissionId} created for ${commission.recipientName}` });
    return res.status(201).json({ success: true, message: "Commission created", data: commission });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   CONFIRM COMMISSION (Admin)
===================================== */
export const confirmCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const commission = await Commission.findOne({ commissionId: id });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    await commission.confirm(req.user._id);
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_CONFIRMED', await getUserInfo(req), { description: `Commission ${id} confirmed` });
    return res.status(200).json({ success: true, message: "Commission confirmed", data: commission });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   MARK COMMISSION AS PAID (Admin)
===================================== */
export const markCommissionAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentMethod } = req.body;
    const commission = await Commission.findOne({ commissionId: id });
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });
    await commission.markAsPaid(paymentReference, paymentMethod);
    await HistoryService.logCommissionActivity(commission, 'COMMISSION_PAID', await getUserInfo(req), { description: `Commission ${id} paid`, metadata: { paymentReference } });
    return res.status(200).json({ success: true, message: "Commission marked as paid", data: commission });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET MY COMMISSIONS (Agent/Partner)
===================================== */
export const getMyCommissions = async (req, res) => {
  try {
    const userId = req.user._id;
    const roleId = req.user.role;
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(roleId);
    let query = { isDeleted: false };
    if (roleDoc.code === '21') query = { recipientRole: 'partner', recipientId: userId };
    else query = { recipientRole: 'freelance_agent', recipientId: userId };
    
    const commissions = await Commission.find(query).sort({ createdAt: -1 });
    const summary = { totalEarned: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0), pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0) };
    return res.status(200).json({ success: true, summary, data: commissions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER COMMISSIONS (Partner)
===================================== */
export const getPartnerCommissions = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const commissions = await Commission.find({ recipientId: partnerId, recipientRole: 'partner', isDeleted: false }).sort({ createdAt: -1 });
    const summary = { totalEarned: commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.commissionAmount, 0), pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((s, c) => s + c.commissionAmount, 0) };
    return res.status(200).json({ success: true, summary, data: commissions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET ALL COMMISSIONS (Admin)
===================================== */
export const adminGetAllCommissions = async (req, res) => {
  try {
    const { status, role, page = 1, limit = 20 } = req.query;
    let query = { isDeleted: false };
    if (status) query.status = status;
    if (role) query.recipientRole = role;
    const commissions = await Commission.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Commission.countDocuments(query);
    return res.status(200).json({ success: true, data: commissions, total, pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default { createCommission, confirmCommission, markCommissionAsPaid, getMyCommissions, getPartnerCommissions, adminGetAllCommissions };