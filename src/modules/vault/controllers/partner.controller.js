import Partner from "../models/Partner.js";
import VaultAgent from "../models/Agent.js";
import Case from "../models/Case.js";
import Lead from "../models/VaultLead.js";
import Commission from "../models/Commission.js";
import Proposal from "../models/Proposal.js";
import HistoryService from "../services/history.service.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';

/* =====================================
   HELPER FUNCTION
===================================== */
const getUserInfo = async (req, user = null) => {
  let userRole = 'System';
  
  try {
    const roleId = req.user?.role;
    if (roleId) {
      const roleDoc = await Role.findById(roleId);
      const roleCode = roleDoc?.code;
      
      if (roleCode === '18') {
        userRole = 'Admin';
      } else if (roleCode === '21') {
        userRole = 'Partner';
      } else {
        userRole = 'Partner';
      }
    } else {
      userRole = 'Partner';
    }
  } catch (error) {
    console.error("Error getting user role:", error);
  }
  
  return {
    userId: user?._id || req.user?._id,
    userRole: userRole,
    userName: user?.fullName || user?.name || user?.email || req.user?.fullName || req.user?.email || 'System',
    userEmail: user?.email || req.user?.email || null,
    ipAddress: req?.ip || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
};

/* =====================================
   PARTNER ONBOARDING (Admin only)
===================================== */
export const createPartner = async (req, res) => {
  try {
    const {
      companyName,
      legalEntityType,
      tradeLicenseNumber,
      tradeLicenseIssueDate,
      isOfflineAgreement,
      tradeLicenseExpiryDate,
      taxRegistrationNumber,
      dbaName,
      website,
      yearEstablished,
      numberOfBranches,
      primaryContact,
      secondaryContact,
      billingAddress,
      shippingAddress,
      bankDetails,
      commissionConfiguration,
      agreementDetails,
      email,
      password
    } = req.body;

    if (!companyName || !tradeLicenseNumber || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Company name, trade license, email and password are required"
      });
    }

    const roleDoc = await Role.findOne({ code: '21' });
    if (!roleDoc) {
      return res.status(404).json({
        success: false,
        message: "Role with code 21 not found"
      });
    }

    const existingPartner = await Partner.findOne({
      $or: [
        { companyName: companyName },
        { tradeLicenseNumber: tradeLicenseNumber },
        { email: email }
      ]
    });

    if (existingPartner) {
      return res.status(400).json({
        success: false,
        message: "Partner already exists with this company name, trade license or email"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const username = email.split('@')[0];

    const partner = await Partner.create({
      partnerCategory: 'company',
      companyName,
      legalEntityType,
      tradeLicenseNumber,
      tradeLicenseIssueDate,
      isOfflineAgreement: isOfflineAgreement || true,
      tradeLicenseExpiryDate,
      taxRegistrationNumber,
      dbaName,
      website,
      yearEstablished,
      numberOfBranches,
      primaryContact,
      secondaryContact,
      billingAddress,
      shippingAddress,
      bankDetails,
      commissionConfiguration: commissionConfiguration || {
        tier1: { loanAmountMax: 5000000, commissionPercentage: 80 },
        tier2: { loanAmountMin: 5000001, commissionPercentage: 85 }
      },
      agreementDetails,
      email: email,
      password: hashedPassword,
      role: roleDoc._id,
      status: 'active',
      onboardingCompleted: true,
      onboardedAt: new Date(),
      dropdownAvailableFrom: new Date()
    });

    await HistoryService.logPartnerActivity(partner, 'PARTNER_ONBOARDED', await getUserInfo(req), {
      description: `Partner ${companyName} onboarded successfully`,
      metadata: { onboardedBy: req.user?.email, tradeLicense: tradeLicenseNumber },
      importance: 'HIGH',
    });

    const partnerResponse = partner.toObject();
    delete partnerResponse.password;

    return res.status(201).json({
      success: true,
      message: "Partner onboarded successfully",
      data: {
        _id: partnerResponse._id,
        companyName: partnerResponse.companyName,
        email: partnerResponse.email,
        status: partnerResponse.status
      }
    });

  } catch (error) {
    console.error("Create partner error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   PARTNER LOGIN
===================================== */
export const partnerLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const partner = await Partner.findOne({ email }).select('+password').populate('role');

    if (!partner) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, partner.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (partner.status !== 'active') {
      return res.status(403).json({ success: false, message: `Account is ${partner.status}. Please contact admin.` });
    }

    await HistoryService.logSecurityEvent(partner, 'LOGIN', await getUserInfo(req), {
      description: `Partner ${partner.companyName} logged in`,
    });

    const token = createToken(partner);
    const partnerResponse = partner.toObject();
    delete partnerResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: partnerResponse,
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET ALL PARTNERS
===================================== */
export const getAllPartners = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    let query = { isDeleted: false };
    
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { tradeLicenseNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const partners = await Partner.find(query)
      .select('-password')
      .populate('role', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Partner.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: partners,
      total: total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit: limit
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER BY ID
===================================== */
export const getPartnerById = async (req, res) => {
  try {
    const { id } = req.params;

    const partner = await Partner.findOne({ _id: id, isDeleted: false })
      .select('-password')
      .populate('role', 'name code');

    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    return res.status(200).json({ success: true, data: partner });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   UPDATE PARTNER (Admin only)
===================================== */
export const updatePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    const oldData = {
      companyName: partner.companyName,
      status: partner.status,
      numberOfBranches: partner.numberOfBranches,
    };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    if (updateData.email && updateData.email !== partner.email) {
      updateData.username = updateData.email.split('@')[0];
    }

    const updatedPartner = await Partner.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    await HistoryService.logPartnerActivity(updatedPartner, 'PARTNER_UPDATED', await getUserInfo(req), {
      description: `Partner ${partner.companyName} updated`,
      changes: { old: oldData, new: { companyName: updatedPartner.companyName, status: updatedPartner.status } },
    });

    return res.status(200).json({
      success: true,
      message: "Partner updated successfully",
      data: updatedPartner
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   DELETE PARTNER (Soft Delete)
===================================== */
export const deletePartner = async (req, res) => {
  try {
    const { id } = req.params;

    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    partner.isDeleted = true;
    partner.deletedAt = new Date();
    partner.status = 'inactive';
    await partner.save();

    await VaultAgent.updateMany(
      { partnerId: id, agentType: 'PartnerAffiliatedAgent' },
      { isActive: false, isDeleted: true, deletedAt: new Date() }
    );

    await HistoryService.logPartnerActivity(partner, 'PARTNER_DELETED', await getUserInfo(req), {
      description: `Partner ${partner.companyName} deleted`,
      importance: 'HIGH',
    });

    return res.status(200).json({ success: true, message: "Partner deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   SUSPEND PARTNER
===================================== */
export const suspendPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspensionReason } = req.body;

    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    partner.status = 'suspended';
    partner.suspendedAt = new Date();
    partner.suspensionReason = suspensionReason;
    await partner.save();

    await VaultAgent.updateMany(
      { partnerId: id, agentType: 'PartnerAffiliatedAgent' },
      { suspendedAt: new Date(), suspensionReason: "Partner suspended", isActive: false }
    );

    await HistoryService.logPartnerActivity(partner, 'PARTNER_SUSPENDED', await getUserInfo(req), {
      description: `Partner ${partner.companyName} suspended`,
      notes: suspensionReason,
      importance: 'HIGH',
    });

    return res.status(200).json({ success: true, message: "Partner suspended successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   ACTIVATE PARTNER
===================================== */
export const activatePartner = async (req, res) => {
  try {
    const { id } = req.params;

    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    partner.status = 'active';
    partner.suspendedAt = null;
    partner.suspensionReason = null;
    await partner.save();

    await HistoryService.logPartnerActivity(partner, 'PARTNER_ACTIVATED', await getUserInfo(req), {
      description: `Partner ${partner.companyName} activated`,
      importance: 'HIGH',
    });

    return res.status(200).json({ success: true, message: "Partner activated successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER DASHBOARD
===================================== */
export const getPartnerDashboard = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const cases = await Case.find({ 'createdBy.partnerId': partnerId, isDeleted: false });
    const affiliatedAgents = await VaultAgent.find({ partnerId: partnerId, agentType: 'PartnerAffiliatedAgent', isDeleted: false });
    const agentIds = affiliatedAgents.map(a => a._id);
    const leads = await Lead.find({ 'sourceInfo.createdById': { $in: agentIds }, isDeleted: false });
    const commissions = await Commission.find({ recipientId: partnerId, recipientRole: 'partner', isDeleted: false });

    const totalCases = cases.length;
    const activeCases = cases.filter(c => !['Disbursed', 'Rejected'].includes(c.currentStatus)).length;
    const completedCases = cases.filter(c => c.currentStatus === 'Disbursed').length;
    const totalCommissionEarned = commissions.filter(c => c.status === 'Paid').reduce((sum, c) => sum + c.commissionAmount, 0);
    const pendingCommission = commissions.filter(c => ['Confirmed', 'Pending'].includes(c.status)).reduce((sum, c) => sum + c.commissionAmount, 0);

    return res.status(200).json({
      success: true,
      data: {
        cases: { total: totalCases, active: activeCases, completed: completedCases },
        leads: { total: leads.length },
        commissions: { totalEarned: totalCommissionEarned, pending: pendingCommission },
        agents: { total: affiliatedAgents.length, active: affiliatedAgents.filter(a => a.isActive).length }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   CREATE CASE
===================================== */
export const createCase = async (req, res) => {
  try {
    const caseData = req.body;
    const partnerId = req.user._id;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    const caseId = `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const caseReference = `XOTO-CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;

    const newCase = await Case.create({
      caseId,
      caseReference,
      proposalId: caseData.proposalId || null,
      sourceLeadId: caseData.sourceLeadId || null,
      createdBy: {
        role: 'partner',
        partnerId: partnerId,
        partnerName: partner.companyName,
        createdAt: new Date()
      },
      clientInfo: caseData.clientInfo,
      currentAddress: caseData.currentAddress,
      employmentDetails: caseData.employmentDetails,
      incomeDetails: caseData.incomeDetails,
      expenseDetails: caseData.expenseDetails,
      propertyInfo: caseData.propertyInfo,
      loanInfo: caseData.loanInfo,
      currentStatus: 'Submitted to Xoto',
    });

    partner.performanceMetrics.totalCasesSubmitted += 1;
    await partner.save();

    await HistoryService.logCaseActivity(newCase, 'CASE_CREATED', await getUserInfo(req), {
      description: `Case ${caseId} created for client ${caseData.clientInfo?.fullName}`,
    });

    return res.status(201).json({ success: true, message: "Case created successfully", data: newCase });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNERS FOR DROPDOWN
===================================== */
export const getPartnersForDropdown = async (req, res) => {
  try {
    const today = new Date();

    const partners = await Partner.find({
      isDeleted: false,
      status: 'active',
      $or: [
        { dropdownAvailableFrom: null },
        { dropdownAvailableFrom: { $lte: today } }
      ]
    }).select('_id companyName dbaName').sort({ companyName: 1 });

    return res.status(200).json({ success: true, data: partners });
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
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let query = { 'createdBy.partnerId': partnerId, isDeleted: false };
    if (status) query.currentStatus = status;

    const cases = await Case.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Case.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: cases,
      total: total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: page, totalItems: total, limit: limit }
    });
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
    const partnerId = req.user._id;

    const caseData = await Case.findOne({ caseId: id, 'createdBy.partnerId': partnerId, isDeleted: false });
    if (!caseData) {
      return res.status(404).json({ success: false, message: "Case not found" });
    }

    return res.status(200).json({ success: true, data: caseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   CREATE PROPOSAL
===================================== */
export const createProposal = async (req, res) => {
  try {
    const proposalData = req.body;
    const partnerId = req.user._id;
    const partner = await Partner.findById(partnerId);

    const proposalId = `PR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const proposal = await Proposal.create({
      proposalId,
      createdBy: {
        partnerId: partnerId,
        partnerName: partner.companyName,
        createdAt: new Date()
      },
      clientInfo: proposalData.clientInfo,
      clientRequirements: proposalData.clientRequirements,
      selectedBankProducts: proposalData.selectedBankProducts,
      coverNote: proposalData.coverNote,
      status: 'Draft',
    });

    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_CREATED', await getUserInfo(req), {
      description: `Proposal ${proposalId} created for client ${proposalData.clientInfo?.name}`,
    });

    return res.status(201).json({ success: true, message: "Proposal created successfully", data: proposal });
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
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let query = { 'createdBy.partnerId': partnerId, isDeleted: false };
    if (status) query.status = status;

    const proposals = await Proposal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Proposal.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: proposals,
      total: total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: page, totalItems: total, limit: limit }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET AFFILIATED AGENTS
===================================== */
export const getAffiliatedAgents = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let query = { partnerId: partnerId, agentType: 'PartnerAffiliatedAgent', isDeleted: false };
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    const agents = await VaultAgent.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: agents,
      total: total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: page, totalItems: total, limit: limit }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER COMMISSIONS
===================================== */
export const getPartnerCommissions = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    let query = { recipientId: partnerId, recipientRole: 'partner', isDeleted: false };
    if (status) query.status = status;

    const commissions = await Commission.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Commission.countDocuments(query);

    const summary = {
      totalEarned: commissions.filter(c => c.status === 'Paid').reduce((sum, c) => sum + c.commissionAmount, 0),
      pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((sum, c) => sum + c.commissionAmount, 0)
    };

    return res.status(200).json({
      success: true,
      summary,
      data: commissions,
      total: total,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: page, totalItems: total, limit: limit }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   CHANGE PASSWORD
===================================== */
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const partnerId = req.user._id;

    const partner = await Partner.findById(partnerId).select('+password');
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, partner.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Old password is incorrect" });
    }

    partner.password = await bcrypt.hash(newPassword, 10);
    await partner.save();

    await HistoryService.logSecurityEvent(partner, 'PASSWORD_CHANGED', await getUserInfo(req), {
      description: `Partner ${partner.companyName} changed password`,
    });

    return res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   FORGOT PASSWORD
===================================== */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const partner = await Partner.findOne({ email, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found with this email" });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

    partner.resetPasswordToken = resetToken;
    partner.resetPasswordExpires = resetTokenExpiry;
    await partner.save();

    await HistoryService.logSecurityEvent(partner, 'PASSWORD_RESET_REQUESTED', await getUserInfo(req), {
      description: `Password reset requested for partner ${partner.companyName}`,
    });

    return res.status(200).json({ success: true, message: "Password reset email sent" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   RESET PASSWORD
===================================== */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const partner = await Partner.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
      isDeleted: false
    });

    if (!partner) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    partner.password = await bcrypt.hash(newPassword, 10);
    partner.resetPasswordToken = null;
    partner.resetPasswordExpires = null;
    await partner.save();

    await HistoryService.logSecurityEvent(partner, 'PASSWORD_RESET_COMPLETED', await getUserInfo(req), {
      description: `Password reset completed for partner ${partner.companyName}`,
    });

    return res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   GET PARTNER PROFILE
===================================== */
export const getPartnerProfile = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false })
      .select('-password')
      .populate('role', 'name code');

    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    return res.status(200).json({ success: true, data: partner });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   UPDATE PARTNER PROFILE (Self)
===================================== */
export const updatePartnerProfile = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const updateData = req.body;

    const allowedFields = ['primaryContact', 'secondaryContact', 'billingAddress', 'shippingAddress', 'bankDetails', 'dbaName', 'website'];

    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) filteredData[field] = updateData[field];
    });

    const updatedPartner = await Partner.findByIdAndUpdate(
      partnerId,
      { ...filteredData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    await HistoryService.logPartnerActivity(updatedPartner, 'PROFILE_UPDATED', await getUserInfo(req), {
      description: `Partner ${updatedPartner.companyName} updated profile`,
    });

    return res.status(200).json({ success: true, message: "Profile updated successfully", data: updatedPartner });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};