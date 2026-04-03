import Partner from "../models/Partner.js";
import VaultAgent from "../models/Agent.js";
import Case from "../models/Case.js";
import Lead from "../models/Lead.js";
import Commission from "../models/Commission.js";
import Proposal from "../models/Proposal.js";
import bcrypt from "bcryptjs";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';

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
      isOffline_aggrement,
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
      username,
      password
    } = req.body;

    // Check role code 21 for Partner
    const roleDoc = await Role.findOne({ code: 21 });
    if (!roleDoc) {
      return res.status(404).json({
        success: false,
        message: "Role with code 21 not found"
      });
    }

    // Check if partner already exists
    const existingPartner = await Partner.findOne({
      $or: [{ companyName }, { tradeLicenseNumber }]
    });

    if (existingPartner) {
      return res.status(400).json({
        success: false,
        message: "Partner already exists"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const partner = await Partner.create({
      companyName,
      legalEntityType,
      tradeLicenseNumber,
      tradeLicenseIssueDate,
      isOffline_aggrement,
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
      username,
      password: hashedPassword,
      role: roleDoc._id,
      status: 'active',
      onboardingCompleted: true,
      onboardedAt: new Date(),
      dropdownAvailableFrom: new Date(),
      isVerified: true
    });

    const partnerResponse = partner.toObject();
    delete partnerResponse.password;

    return res.status(201).json({
      success: true,
      message: "Partner onboarded successfully",
      data: partnerResponse
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   PARTNER LOGIN
===================================== */
export const partnerLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const partner = await Partner.findOne({ username }).select('+password').populate('role');

    if (!partner) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const isMatch = await bcrypt.compare(password, partner.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (partner.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${partner.status}`
      });
    }

    partner.lastLoginAt = new Date();
    partner.loginCount = (partner.loginCount || 0) + 1;
    await partner.save();

    const token = createToken(partner);
    const partnerResponse = partner.toObject();
    delete partnerResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: partnerResponse
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
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

    const query = { isDeleted: false };

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
    return res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: partner
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   UPDATE PARTNER
===================================== */
export const updatePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const partner = await Partner.findById(id);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
    }

    // If password is being updated, hash it
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updatedPartner = await Partner.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: "Partner updated successfully",
      data: updatedPartner
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
    }

    partner.isDeleted = true;
    partner.deletedAt = new Date();
    partner.status = 'inactive';
    await partner.save();

    // Deactivate all affiliated agents
    await VaultAgent.updateMany(
      { partnerId: id, agentType: 'PartnerAffiliatedAgent' },
      { isActive: false, isDeleted: true, deletedAt: new Date() }
    );

    return res.status(200).json({
      success: true,
      message: "Partner deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
    }

    partner.status = 'suspended';
    partner.suspendedAt = new Date();
    partner.suspensionReason = suspensionReason;
    await partner.save();

    return res.status(200).json({
      success: true,
      message: "Partner suspended successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
    }

    partner.status = 'active';
    partner.suspendedAt = null;
    partner.suspensionReason = null;
    await partner.save();

    return res.status(200).json({
      success: true,
      message: "Partner activated successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET PARTNER DASHBOARD STATS
===================================== */
export const getPartnerDashboard = async (req, res) => {
  try {
    const partnerId = req.user._id;

    // Get cases
    const cases = await Case.find({ 'createdBy.partnerId': partnerId, isDeleted: false });
    
    // Get affiliated agents
    const affiliatedAgents = await VaultAgent.find({ 
      partnerId: partnerId, 
      agentType: 'PartnerAffiliatedAgent',
      isDeleted: false 
    });
    
    const agentIds = affiliatedAgents.map(a => a._id);
    
    // Get leads from affiliated agents
    const leads = await Lead.find({ 
      'sourceInfo.createdById': { $in: agentIds },
      isDeleted: false 
    });

    // Get commissions
    const commissions = await Commission.find({ 
      recipientId: partnerId, 
      recipientRole: 'partner',
      isDeleted: false 
    });

    const totalCases = cases.length;
    const activeCases = cases.filter(c => !['Disbursed', 'Rejected'].includes(c.currentStatus)).length;
    const completedCases = cases.filter(c => c.currentStatus === 'Disbursed').length;
    
    const totalCommissionEarned = commissions
      .filter(c => c.status === 'Paid')
      .reduce((sum, c) => sum + c.commissionAmount, 0);
    
    const pendingCommission = commissions
      .filter(c => ['Confirmed', 'Pending'].includes(c.status))
      .reduce((sum, c) => sum + c.commissionAmount, 0);

    return res.status(200).json({
      success: true,
      data: {
        cases: {
          total: totalCases,
          active: activeCases,
          completed: completedCases
        },
        leads: {
          total: leads.length
        },
        commissions: {
          totalEarned: totalCommissionEarned,
          pending: pendingCommission
        },
        agents: {
          total: affiliatedAgents.length,
          active: affiliatedAgents.filter(a => a.isActive).length
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   CREATE CASE (Partner only)
===================================== */
export const createCase = async (req, res) => {
  try {
    const caseData = req.body;
    const partnerId = req.user._id;

    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
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
      statusHistory: [{
        status: 'Submitted to Xoto',
        updatedBy: partner.companyName,
        notes: 'Case created and submitted to Xoto',
        timestamp: new Date()
      }]
    });

    // Update partner performance metrics
    partner.performanceMetrics.totalCasesSubmitted += 1;
    await partner.save();

    return res.status(201).json({
      success: true,
      message: "Case created successfully",
      data: newCase
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET ALL CASES FOR PARTNER
===================================== */
export const getPartnerCases = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const cases = await Case.find({ 'createdBy.partnerId': partnerId, isDeleted: false })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: cases
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET CASE BY ID
===================================== */
export const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;

    const caseData = await Case.findOne({
      caseId: id,
      'createdBy.partnerId': partnerId,
      isDeleted: false
    });

    if (!caseData) {
      return res.status(404).json({
        success: false,
        message: "Case not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: caseData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
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
      statusHistory: [{
        status: 'Draft',
        timestamp: new Date(),
        notes: 'Proposal created'
      }]
    });

    return res.status(201).json({
      success: true,
      message: "Proposal created successfully",
      data: proposal
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET ALL PROPOSALS FOR PARTNER
===================================== */
export const getPartnerProposals = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const proposals = await Proposal.find({ 'createdBy.partnerId': partnerId, isDeleted: false })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: proposals
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET AFFILIATED AGENTS
===================================== */
export const getAffiliatedAgents = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const agents = await VaultAgent.find({ 
      partnerId: partnerId, 
      agentType: 'PartnerAffiliatedAgent',
      isDeleted: false 
    }).select('-password');

    return res.status(200).json({
      success: true,
      data: agents
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* =====================================
   GET PARTNER COMMISSIONS
===================================== */
export const getPartnerCommissions = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const commissions = await Commission.find({ 
      recipientId: partnerId, 
      recipientRole: 'partner',
      isDeleted: false 
    }).sort({ createdAt: -1 });

    const summary = {
      totalEarned: commissions.filter(c => c.status === 'Paid').reduce((sum, c) => sum + c.commissionAmount, 0),
      pending: commissions.filter(c => ['Pending', 'Confirmed'].includes(c.status)).reduce((sum, c) => sum + c.commissionAmount, 0)
    };

    return res.status(200).json({
      success: true,
      summary,
      data: commissions
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: "Partner not found"
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, partner.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password is incorrect"
      });
    }

    partner.password = await bcrypt.hash(newPassword, 10);
    await partner.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};