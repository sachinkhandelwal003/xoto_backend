import Case from '../models/Case.js';
import Lead from '../models/Lead.js';
import Partner from '../models/Partner.js';
import Proposal from '../models/Proposal.js';
import HistoryService from '../services/history.service.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'Partner';
  if (roleId) {
    const Role = (await import('../../../modules/auth/models/role/role.model.js')).Role;
    const roleDoc = await Role.findById(roleId);
    if (roleDoc?.code === '18') userRole = 'Admin';
    else if (roleDoc?.code === '21') userRole = 'Partner';
  }
  return {
    userId: req.user?._id,
    userRole,
    userName: req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

/* =====================================
   CREATE CASE (Partner only)
===================================== */
export const createCase = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const partner = await Partner.findById(partnerId);
    if (!partner || !partner.isActive()) {
      return res.status(403).json({ success: false, message: "Partner account not active" });
    }
    
    const { proposalId, sourceLeadId, clientInfo, currentAddress, employmentDetails, incomeDetails, expenseDetails, propertyInfo, loanInfo } = req.body;
    
    const caseId = `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const caseReference = `XOTO-CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;
    
    const totalMonthlyLiabilities = (expenseDetails?.monthlyRent || 0) + (expenseDetails?.monthlyOtherLoanInstallments || 0) + (expenseDetails?.monthlyCreditCardPayments || 0);
    const dbrPercentage = (totalMonthlyLiabilities / incomeDetails.totalMonthlyIncome) * 100;
    
    const newCase = await Case.create({
      caseId, caseReference, proposalId: proposalId || null, sourceLeadId: sourceLeadId || null,
      createdBy: { role: 'partner', partnerId, partnerName: partner.companyName, createdAt: new Date() },
      clientInfo, currentAddress: currentAddress || null, employmentDetails, incomeDetails,
      expenseDetails: { ...expenseDetails, totalMonthlyLiabilities, dbrPercentage, dbrStatus: dbrPercentage <= 50 ? 'Eligible' : dbrPercentage <= 60 ? 'Borderline' : 'Ineligible' },
      propertyInfo, loanInfo, currentStatus: 'Draft',
    });
    
    if (sourceLeadId) {
      await Lead.findOneAndUpdate({ leadId: sourceLeadId }, {
        'conversionInfo.convertedToCase': true, 'conversionInfo.caseId': caseId,
        'conversionInfo.convertedAt': new Date(), 'conversionInfo.convertedByRole': 'partner',
        'conversionInfo.convertedById': partnerId, 'conversionInfo.convertedByName': partner.companyName
      });
    }
    
    if (proposalId) {
      await Proposal.findOneAndUpdate({ proposalId }, { convertedToCase: true, convertedCaseId: caseId, convertedCaseReference: caseReference, convertedAt: new Date() });
    }
    
    partner.performanceMetrics.totalCasesSubmitted += 1;
    await partner.save();
    
    await HistoryService.logCaseActivity(newCase, 'CASE_CREATED', await getUserInfo(req), {
      description: `Case ${caseId} created for ${clientInfo.fullName}`,
    });
    
    return res.status(201).json({ success: true, message: "Case created", data: newCase });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   SUBMIT CASE TO XOTO (Partner)
===================================== */
export const submitCaseToXoto = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;
    const caseData = await Case.findOne({ caseId: id, 'createdBy.partnerId': partnerId, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    if (caseData.currentStatus !== 'Draft') return res.status(400).json({ success: false, message: "Case already submitted" });
    
    caseData.currentStatus = 'Submitted to Xoto';
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_SUBMITTED', await getUserInfo(req), { description: `Case ${id} submitted to Xoto` });
    
    return res.status(200).json({ success: true, message: "Case submitted to Xoto", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   UPDATE CASE STATUS (Admin)
===================================== */
export const updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const caseData = await Case.findOne({ caseId: id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    const previousStatus = caseData.currentStatus;
    caseData.currentStatus = status;
    await caseData.save();
    
    await HistoryService.logCaseActivity(caseData, 'CASE_STATUS_CHANGED', await getUserInfo(req), {
      description: `Case status changed from ${previousStatus} to ${status}`,
      notes, previousStatus, newStatus: status,
    });
    
    return res.status(200).json({ success: true, message: "Case status updated", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER CASES
===================================== */
export const getPartnerCases = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;
    let query = { 'createdBy.partnerId': partnerId, isDeleted: false };
    if (status) query.currentStatus = status;
    
    const cases = await Case.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Case.countDocuments(query);
    
    return res.status(200).json({ success: true, data: cases, total, pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET CASE BY ID
===================================== */
export const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const caseData = await Case.findOne({ caseId: id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    return res.status(200).json({ success: true, data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   ADD CASE NOTE
===================================== */
export const addCaseNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, isInternal } = req.body;
    const caseData = await Case.findOne({ caseId: id, isDeleted: false });
    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });
    
    if (isInternal) caseData.internalNotes.push({ note, addedBy: req.user?.companyName || req.user?.email, addedAt: new Date() });
    else caseData.customerNotes.push({ note, addedBy: req.user?.companyName || req.user?.email, addedAt: new Date() });
    await caseData.save();
    
    return res.status(200).json({ success: true, message: "Note added", data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET ALL CASES (Admin)
===================================== */
export const adminGetAllCases = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = { isDeleted: false };
    if (status) query.currentStatus = status;
    
    const cases = await Case.find(query).populate('createdBy.partnerId', 'companyName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Case.countDocuments(query);
    
    return res.status(200).json({ success: true, data: cases, total, pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default { createCase, submitCaseToXoto, updateCaseStatus, getPartnerCases, getCaseById, addCaseNote, adminGetAllCases };