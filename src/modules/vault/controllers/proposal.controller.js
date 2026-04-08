import Proposal from '../models/Proposal.js';
import Partner from '../models/Partner.js';
import Client from '../models/Client.js';
import HistoryService from '../services/history.service.js';
import crypto from 'crypto';

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
   CREATE PROPOSAL
===================================== */
export const createProposal = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const partner = await Partner.findById(partnerId);
    if (!partner || !partner.isActive()) return res.status(403).json({ success: false, message: "Partner not active" });
    
    const { clientInfo, clientRequirements, selectedBankProducts, coverNote } = req.body;
    if (selectedBankProducts.length > 3) return res.status(400).json({ success: false, message: "Max 3 bank products" });
    
    let client = await Client.findOne({ email: clientInfo.email });
    if (!client) {
      client = await Client.create({
        name: { first_name: clientInfo.name.split(' ')[0], last_name: clientInfo.name.split(' ').slice(1).join(' ') },
        email: clientInfo.email, phone: { number: clientInfo.phone },
        residencyStatus: clientInfo.residencyStatus, employmentStatus: clientInfo.employmentStatus,
        monthlySalary: clientInfo.monthlySalary, nationality: clientInfo.nationality,
        createdByType: 'Partner', createdBy: partnerId, partnerId,
        role: (await import('../../../modules/auth/models/role/role.model.js')).Role.findOne({ code: '23' })._id,
      });
    }
    
    const proposalId = `PR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const proposal = await Proposal.create({
      proposalId, createdBy: { partnerId, partnerName: partner.companyName, createdAt: new Date() },
      clientInfo, clientRequirements, selectedBankProducts, coverNote: coverNote || null, status: 'Draft',
    });
    
    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_CREATED', await getUserInfo(req), {
      description: `Proposal ${proposalId} created for ${clientInfo.name}`,
    });
    
    return res.status(201).json({ success: true, message: "Proposal created", data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   SEND PROPOSAL
===================================== */
export const sendProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientEmail } = req.body;
    const proposal = await Proposal.findOne({ proposalId: id, isDeleted: false });
    if (!proposal) return res.status(404).json({ success: false, message: "Proposal not found" });
    
    proposal.status = 'Sent';
    proposal.sentAt = new Date();
    proposal.sentTo = clientEmail;
    if (!proposal.expiresAt) {
      proposal.expiresAt = new Date();
      proposal.expiresAt.setDate(proposal.expiresAt.getDate() + proposal.expiryDays);
    }
    await proposal.save();
    
    const token = crypto.randomBytes(32).toString('hex');
    proposal.secureLink = `/proposal/view/${proposal.proposalId}?token=${token}`;
    proposal.secureLinkExpiry = new Date();
    proposal.secureLinkExpiry.setDate(proposal.secureLinkExpiry.getDate() + 7);
    await proposal.save();
    
    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_SENT', await getUserInfo(req), {
      description: `Proposal ${id} sent to ${clientEmail}`,
    });
    
    return res.status(200).json({ success: true, message: "Proposal sent", data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   ACCEPT PROPOSAL (Client via link)
===================================== */
export const acceptProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    const proposal = await Proposal.findOne({ proposalId: id, secureLink: `/proposal/view/${id}?token=${token}`, secureLinkExpiry: { $gt: new Date() } });
    if (!proposal) return res.status(404).json({ success: false, message: "Invalid or expired link" });
    
    proposal.status = 'Accepted';
    proposal.acceptedAt = new Date();
    await proposal.save();
    
    return res.status(200).json({ success: true, message: "Proposal accepted", data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   REJECT PROPOSAL
===================================== */
export const rejectProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { token, reason } = req.query;
    const proposal = await Proposal.findOne({ proposalId: id, secureLink: `/proposal/view/${id}?token=${token}`, secureLinkExpiry: { $gt: new Date() } });
    if (!proposal) return res.status(404).json({ success: false, message: "Invalid or expired link" });
    
    proposal.status = 'Rejected';
    proposal.rejectedAt = new Date();
    proposal.rejectionReason = reason || 'Client rejected';
    await proposal.save();
    
    return res.status(200).json({ success: true, message: "Proposal rejected", data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER PROPOSALS
===================================== */
export const getPartnerProposals = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;
    let query = { 'createdBy.partnerId': partnerId, isDeleted: false };
    if (status) query.status = status;
    
    const proposals = await Proposal.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Proposal.countDocuments(query);
    
    return res.status(200).json({ success: true, data: proposals, total, pagination: { totalPages: Math.ceil(total / limit), currentPage: parseInt(page), limit } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PROPOSAL BY ID
===================================== */
export const getProposalById = async (req, res) => {
  try {
    const { id } = req.params;
    const proposal = await Proposal.findOne({ proposalId: id, isDeleted: false });
    if (!proposal) return res.status(404).json({ success: false, message: "Proposal not found" });
    return res.status(200).json({ success: true, data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default { createProposal, sendProposal, acceptProposal, rejectProposal, getPartnerProposals, getProposalById };