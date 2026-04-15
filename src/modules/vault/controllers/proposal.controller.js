import Proposal from '../models/Proposal.js';
import Lead from '../models/VaultLead.js';
import BankProduct from '../../mortgages/models/BankProduct.js';
import HistoryService from '../services/history.service.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import sendEmail from '../../../utils/sendEmail.js'; // Import your email service


const getUserInfo = async (req) => {
  const roleId = req.user?.role;
  let userRole = 'User';
  let partnerId = null;
  
  if (roleId) {
    const roleDoc = await Role.findById(roleId);
    if (roleDoc?.code === '18') {
      userRole = 'Admin';
    } else if (roleDoc?.code === '21') {
      userRole = 'Partner';
      partnerId = req.user._id;
    } else if (req.user?.agentType === 'FreelanceAgent') {
      userRole = 'FreelanceAgent';
    } else if (req.user?.agentType === 'PartnerAffiliatedAgent') {
      userRole = 'PartnerAffiliatedAgent';
    }
  }
  
  // ✅ Ensure userRole matches schema enum
  // Schema expects: ['Admin', 'Partner', 'Agent']
  // So we need to map correctly
  let finalRole = userRole;
  if (userRole === 'FreelanceAgent' || userRole === 'PartnerAffiliatedAgent') {
    finalRole = 'Agent';
  }
  
  return {
    userId: req.user?._id,
    userRole: finalRole,  // ✅ This will be 'Admin', 'Partner', or 'Agent'
    originalRole: userRole, // For reference
    userName: req.user?.fullName || req.user?.companyName || req.user?.email || 'System',
    userEmail: req.user?.email || null,
    partnerId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
};

// ==================== CREATE PROPOSAL ====================
export const createProposal = async (req, res) => {
  try {
    const { leadId, selectedBankProducts, coverNote } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ success: false, message: "leadId is required" });
    }
    
    if (!selectedBankProducts || selectedBankProducts.length === 0) {
      return res.status(400).json({ success: false, message: "selectedBankProducts are required" });
    }
    
    if (selectedBankProducts.length > 3) {
      return res.status(400).json({ success: false, message: "Maximum 3 bank products can be selected" });
    }
    
    // Verify bank products exist
    for (const product of selectedBankProducts) {
      const bankProduct = await BankProduct.findById(product.bankProductId);
      if (!bankProduct) {
        return res.status(400).json({ success: false, message: `Bank product ${product.bankProductId} not found` });
      }
    }
    
    const userInfo = await getUserInfo(req);
    console.log("User Info for proposal:", userInfo); // Debug log
    
    const proposal = await Proposal.createFromLead(leadId, selectedBankProducts, coverNote, userInfo);
    
    await HistoryService.logProposalActivity(proposal, 'PROPOSAL_CREATED', userInfo, {
      description: `Proposal created for lead ${leadId}`,
    });
    
    return res.status(201).json({ success: true, message: "Proposal created", data: proposal });
  } catch (error) {
    console.error("Create proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SEND PROPOSAL ====================
export const sendProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientEmail } = req.body;

    const frontendUrl = 'http://localhost:5173';

    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }

    if (!clientEmail) {
  return res.status(400).json({
    success: false,
    message: "Client email is required",
  });
}
    // Step 1: update status
    await proposal.send(clientEmail);

    // Step 2: generate token
    await proposal.generateSecureLink();

    // Step 3: build FULL link ✅
    const fullSecureLink = `${frontendUrl}/proposal/view/link/${proposal._id}?token=${proposal.secureLink}`;

    // Step 4: SAVE full link (optional but useful)
    proposal.fullSecureLink = fullSecureLink;
    await proposal.save();

    // Step 5: SEND EMAIL ✅
    await sendProposalEmail(clientEmail, {
      customerName: proposal.clientRequirements?.customerName || 'Customer',
      secureLink: fullSecureLink,
      expiryDate: proposal.expiresAt,
    });

    return res.status(200).json({
      success: true,
      message: "Proposal sent",
      data: {
        fullSecureLink,
      }
    });

  } catch (error) {
    console.error("Send proposal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Email service function
const sendProposalEmail = async (toEmail, data) => {
  const emailHtml = `
    <h2>Your Proposal is Ready</h2>
    <p>Hello ${data.customerName},</p>

    <p>Click below to view your proposal:</p>

    <a href="${data.secureLink}" 
       style="padding:10px 20px;background:#4CAF50;color:white;text-decoration:none;">
       View Proposal
    </a>

    <p>Or copy this link:</p>
    <p>${data.secureLink}</p>

    <p>Expires on: ${new Date(data.expiryDate).toDateString()}</p>
  `;

await sendEmail({
  to: toEmail,
  subject: "Your Proposal",
  html: emailHtml
});
};

// ==================== GET PROPOSAL BY SECURE LINK ====================
export const getProposalBySecureLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: token,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    })
      .populate('leadId', 'customerInfo propertyDetails currentStatus')
      .populate('selectedBankProducts.bankProductId', 'bankInfo offerSummary loanDetails costBreakdown features isPopular');
    


      
    if (proposal.expiresAt && new Date() > proposal.expiresAt) {
  proposal.status = 'Expired';
  await proposal.save();

  return res.status(400).json({
    success: false,
    message: "Proposal expired"
  });
}
    await proposal.markViewed();


    return res.status(200).json({ success: true, data: proposal });
  } catch (error) {
    console.error("Get proposal by secure link error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
// ==================== ACCEPT PROPOSAL (Client via link) ====================
export const acceptProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: token,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    });
    


       if (proposal.status !== 'Viewed' && proposal.status !== 'Sent') {
  return res.status(400).json({
    success: false,
    message: "Action not allowed"
  });
}
    if (!proposal) {
      return res.status(404).json({ success: false, message: "Invalid or expired link" });
    }

 
    
    await proposal.accept();
    
    return res.status(200).json({ success: true, message: "Proposal accepted", data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== REJECT PROPOSAL ====================
export const rejectProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const { token, reason } = req.query;
    
    const proposal = await Proposal.findOne({ 
      _id: id, 
      secureLink: token,
      secureLinkExpiry: { $gt: new Date() },
      isDeleted: false 
    });
    

    if (proposal.status !== 'Viewed' && proposal.status !== 'Sent') {
  return res.status(400).json({
    success: false,
    message: "Action not allowed"
  });
}
    if (!proposal) {
      return res.status(404).json({ success: false, message: "Invalid or expired link" });
    }
    
    await proposal.reject(reason || 'Client rejected');
    
    return res.status(200).json({ success: true, message: "Proposal rejected", data: proposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



// ==================== GET MY PROPOSALS ====================
export const getMyProposals = async (req, res) => {
  try {
    const userId = req.user._id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status } = req.query;

    let query = {
      isDeleted: false,
      'createdBy.userId': userId // ✅ only my proposals
    };

    if (status) {
      query.status = status;
    }

    const proposals = await Proposal.find(query)
      .populate('leadId')
      .populate('selectedBankProducts.bankProductId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Proposal.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: proposals,
      total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ==================== GET PROPOSAL BY ID ====================
export const getProposalById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find proposal and populate references immediately
    const proposal = await Proposal.findById(id)
      .populate('leadId')
      .populate('selectedBankProducts.bankProductId');

    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    // Call the schema method to get formatted client info
    const clientInfo = await proposal.getClientInfo();
    
    return res.status(200).json({ 
      success: true, 
      data: {
        proposal,
        clientInfo,
      } 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
// ==================== UPDATE PROPOSAL ====================
export const updateProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user._id;
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    if (proposal.status !== 'Draft') {
      return res.status(400).json({ success: false, message: "Only draft proposals can be updated" });
    }
    
    if (!isAdmin && proposal.createdBy.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only update your own proposals" });
    }
    
    const updatedProposal = await Proposal.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true }
    );
    
    return res.status(200).json({ success: true, message: "Proposal updated", data: updatedProposal });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DELETE PROPOSAL ====================
export const deleteProposal = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    
    const proposal = await Proposal.findById(id);
    if (!proposal || proposal.isDeleted) {
      return res.status(404).json({ success: false, message: "Proposal not found" });
    }
    
    if (!isAdmin && proposal.createdBy.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You can only delete your own proposals" });
    }
    
    proposal.isDeleted = true;
    proposal.deletedAt = new Date();
    proposal.deletedBy = userId;
    await proposal.save();
    
    return res.status(200).json({ success: true, message: "Proposal deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};