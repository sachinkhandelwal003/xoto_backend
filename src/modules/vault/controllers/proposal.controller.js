import Proposal from '../models/Proposal.js';
import Partner from '../models/Partner.js';
import Customer from '../../../modules/auth/models/user/customer.model.js';
import HistoryService from '../services/history.service.js';
import crypto from 'crypto';
import { Role } from '../../../modules/auth/models/role/role.model.js';

const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'Partner';
  if (roleId) {
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
    if (!partner || !partner.isActive()) {
      return res.status(403).json({ success: false, message: "Partner not active" });
    }
    
    const { clientInfo, clientRequirements, selectedBankProducts, coverNote } = req.body;
    if (selectedBankProducts.length > 3) {
      return res.status(400).json({ success: false, message: "Max 3 bank products" });
    }
    
    // ✅ Find or create customer using Customer model
    let customer = await Customer.findOne({ 
      email: clientInfo.email,
      is_deleted: false 
    });
    
    if (!customer) {
      // Get Customer role
      const customerRole = await Role.findOne({ name: "Customer" });
      
      // Create new customer
      const firstName = clientInfo.name.split(' ')[0];
      const lastName = clientInfo.name.split(' ').slice(1).join(' ') || '';
      
      customer = await Customer.create({
        name: {
          first_name: firstName,
          last_name: lastName,
        },
        email: clientInfo.email,
        mobile: {
          country_code: '+971',
          number: clientInfo.phone.replace(/^\+971/, ''),
        },
        role: customerRole?._id || null,
        assignedTo: partnerId,
        source: 'vault',
        isActive: true,
      });
      
      console.log(`✅ New customer created: ${customer._id}`);
    } else {
      console.log(`✅ Customer already exists: ${customer._id}`);
    }
    
    // ✅ Create proposal - MongoDB generates _id automatically
    const proposal = await Proposal.create({
      createdBy: { 
        partnerId, 
        partnerName: partner.companyName, 
        createdAt: new Date() 
      },
      clientInfo: {
        ...clientInfo,
        customerId: customer._id,  // Store reference to customer
      },
      clientRequirements,
      selectedBankProducts,
      coverNote: coverNote || null,
      status: 'Draft',
    });
    
    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_CREATED', await getUserInfo(req), {
      description: `Proposal created for ${clientInfo.name}`,
      metadata: { customerId: customer._id },
    });
    
    return res.status(201).json({ 
      success: true, 
      message: "Proposal created", 
      data: proposal 
    });
  } catch (error) {
    console.error("Create proposal error:", error);
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
    
    // ✅ Find by MongoDB _id
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    await proposal.send(clientEmail);
    await proposal.generateSecureLink();
    
    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_SENT', await getUserInfo(req), {
      description: `Proposal sent to ${clientEmail}`,
    });
    
    return res.status(200).json({ 
      success: true, 
      message: "Proposal sent", 
      data: proposal 
    });
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
    
    // ✅ Find by MongoDB _id
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: `/proposal/view/${id}?token=${token}`,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    });
    
    if (!proposal) {
      return res.status(404).json({ success: false, message: "Invalid or expired link" });
    }
    
    await proposal.accept();
    
    // ✅ Update customer interest if customerId exists
    if (proposal.clientInfo?.customerId) {
      await Customer.findByIdAndUpdate(proposal.clientInfo.customerId, {
        $set: { 
          'interests.mortgage': true,
          source: 'vault'
        }
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Proposal accepted", 
      data: proposal 
    });
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
    
    // ✅ Find by MongoDB _id
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: `/proposal/view/${id}?token=${token}`,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    });
    
    if (!proposal) {
      return res.status(404).json({ success: false, message: "Invalid or expired link" });
    }
    
    await proposal.reject(reason || 'Client rejected');
    
    return res.status(200).json({ 
      success: true, 
      message: "Proposal rejected", 
      data: proposal 
    });
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
    
    const proposals = await Proposal.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Proposal.countDocuments(query);
    
    return res.status(200).json({ 
      success: true, 
      data: proposals, 
      total, 
      pagination: { 
        totalPages: Math.ceil(total / limit), 
        currentPage: parseInt(page), 
        limit 
      } 
    });
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
    
    // ✅ Find by MongoDB _id and populate customer if needed
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    // Get customer details if customerId exists
    let customer = null;
    if (proposal.clientInfo?.customerId) {
      customer = await Customer.findById(proposal.clientInfo.customerId)
        .select('name email mobile assignedTo');
    }
    
    return res.status(200).json({ 
      success: true, 
      data: {
        proposal,
        customer
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};