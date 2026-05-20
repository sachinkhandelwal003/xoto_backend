import VaultAgent from '../models/Agent.js';
import Partner from '../models/Partner.js';
import bcrypt from 'bcryptjs';
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import crypto from 'crypto';

/* =====================================
   HELPER FUNCTION
===================================== */
const checkProfileCompleteness = (agent) => {
  let completed = 0;
  if (agent.name?.first_name && agent.name?.last_name) completed++;
  if (agent.phone?.number) completed++;
  if (agent.email) completed++;
  if (agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) completed++;
  if (agent.bankDetails?.iban) completed++;
  
  agent.profileCompletionPercentage = Math.round((completed / 5) * 100);
  agent.isProfileComplete = agent.profileCompletionPercentage === 100;
  
  // Auto-enable commission for Freelance when profile complete AND verified
  if (agent.agentType === 'FreelanceAgent' && agent.isProfileComplete && agent.isVerified) {
    agent.commissionEligible = true;
  } else if (agent.agentType === 'FreelanceAgent') {
    agent.commissionEligible = false;
  }
  
  return agent;
};

/* =====================================
   1. AGENT SELF SIGNUP
===================================== */
export const agentSignup = async (req, res) => {
  try {
    const { first_name, last_name, email, phone_number, country_code, password, agentMode, partnerId } = req.body;

    if (!first_name || !last_name || !password || !phone_number) {
      return res.status(400).json({ success: false, message: "Name, password and phone are required" });
    }

    const roleDoc = await Role.findOne({ code: '22' });
    if (!roleDoc) return res.status(404).json({ success: false, message: "Role not found" });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) return res.status(400).json({ success: false, message: "Phone already registered" });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let agentType = 'FreelanceAgent';
    let affiliationStatus = 'none';
    let partner = null;

    if (agentMode === 'partner') {
      if (!partnerId) return res.status(400).json({ success: false, message: "Partner selection required" });
      partner = await Partner.findById(partnerId);
      if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });
      agentType = 'PartnerAffiliatedAgent';
      affiliationStatus = 'pending';
    }

    const newAgent = await VaultAgent.create({
      name: { first_name, last_name },
      phone: { country_code: country_code || '+971', number: phone_number },
      email: email || null,
      password: hashedPassword,
      role: roleDoc._id,
      agentType,
      partnerId: partner?._id || null,
      affiliationStatus,
      isActive: true,
      isVerified: false,
      isPhoneVerified: true,
      isEmailVerified: true,
      commissionEligible: false,
    });

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    const message = agentMode === 'partner' 
      ? "Registration successful. Waiting for partner approval."
      : "Registration successful. Complete your profile to earn commission.";

    return res.status(201).json({ success: true, message, data: agentResponse });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   2. AGENT LOGIN
===================================== */
export const agentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const agent = await VaultAgent.findOne({ email }).select('+password').populate('role').populate('partnerId', 'companyName');
    if (!agent) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (!agent.isActive) return res.status(403).json({ success: false, message: "Account deactivated" });
    if (agent.suspendedAt) return res.status(403).json({ success: false, message: `Account suspended: ${agent.suspensionReason}` });
    if (agent.agentType === 'PartnerAffiliatedAgent' && agent.affiliationStatus === 'rejected') {
      return res.status(403).json({ success: false, message: "Affiliation rejected by partner" });
    }

    agent.lastLoginAt = new Date();
    await agent.save();

    const token = createToken(agent);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    let warning = null;
    if (agent.agentType === 'FreelanceAgent' && !agent.commissionEligible) {
      if (agent.profileCompletionPercentage < 100) warning = "Complete Emirates ID & Bank details to earn commission";
      else if (!agent.isVerified) warning = "Pending admin verification";
    }
    if (agent.agentType === 'PartnerAffiliatedAgent' && agent.affiliationStatus === 'pending') {
      warning = "Pending partner approval";
    }

    return res.status(200).json({ success: true, token, warning, data: agentResponse });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   3. ADMIN ONBOARD FREELANCE AGENT (Minimum Details)
===================================== */
export const adminOnboardFreelanceAgent = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { first_name, last_name, email, phone_number, country_code, password } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({ success: false, message: "First name, last name, email, phone, password required" });
    }

    const freelanceRole = await Role.findOne({ code: '22' });
    if (!freelanceRole) return res.status(404).json({ success: false, message: "Role not found" });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) return res.status(400).json({ success: false, message: "Phone already registered" });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await VaultAgent.create({
      name: { first_name, last_name },
      phone: { country_code: country_code || '+971', number: phone_number },
      email: email,
      password: hashedPassword,
      role: freelanceRole._id,
      agentType: 'FreelanceAgent',
      partnerId: null,
      affiliationStatus: 'none',
      isActive: true,
      isVerified: false,
      isPhoneVerified: true,
      isEmailVerified: true,
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
      commissionEligible: false,  // Needs documents
    });

    checkProfileCompleteness(newAgent);
    await newAgent.save();

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: "Freelance agent onboarded. Agent needs to add Emirates ID & Bank details to earn commission.",
      data: agentResponse
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   4. PARTNER ONBOARD AFFILIATED AGENT (Minimum Details)
===================================== */
export const partnerOnboardAffiliatedAgent = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const { first_name, last_name, email, phone_number, country_code, password } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({ success: false, message: "First name, last name, email, phone, password required" });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });
    if (partner.status !== 'active') return res.status(403).json({ success: false, message: "Partner account not active" });

    const affiliatedRole = await Role.findOne({ code: '22' });
    if (!affiliatedRole) return res.status(404).json({ success: false, message: "Role not found" });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) return res.status(400).json({ success: false, message: "Phone already registered" });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await VaultAgent.create({
      name: { first_name, last_name },
      phone: { country_code: country_code || '+971', number: phone_number },
      email: email,
      password: hashedPassword,
      role: affiliatedRole._id,
      agentType: 'PartnerAffiliatedAgent',
      partnerId: partnerId,
      affiliationStatus: 'none',  // Partner approves immediately
      affiliationVerifiedBy: req.user._id,
      affiliationVerifiedAt: new Date(),
      isActive: true,
      isVerified: false,
      isPhoneVerified: true,
      isEmailVerified: true,
      commissionEligible: false,  // NEVER true for affiliated agents
    });

    partner.numberOfAgents += 1;
    await partner.save();

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: "Affiliated agent onboarded. Commission will be paid to partner company.",
      data: {
        _id: agentResponse._id,
        name: agentResponse.name,
        email: agentResponse.email,
        agentType: agentResponse.agentType,
        partnerId: partnerId,
        partnerName: partner.companyName,
        affiliationStatus: 'verified'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   5. VERIFY AGENT (Admin for Freelance, Partner for Affiliated)
===================================== */
export const verifyAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted) return res.status(404).json({ success: false, message: "Agent not found" });

    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    // Partner verifies affiliated agent
    if (agent.agentType === 'PartnerAffiliatedAgent') {
      if (!isPartner) return res.status(403).json({ success: false, message: "Only partner can verify affiliated agents" });
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "Not your agent" });
      }

      if (action === 'approve') {
        agent.affiliationStatus = 'verified';
        agent.isVerified = true;
        agent.affiliationVerifiedBy = req.user._id;
        agent.affiliationVerifiedAt = new Date();
      } else if (action === 'reject') {
        agent.affiliationStatus = 'rejected';
        agent.isActive = false;
        agent.affiliationRejectionReason = rejectionReason;
      }
    }
    // Admin verifies freelance agent
    else if (agent.agentType === 'FreelanceAgent') {
      if (!isAdmin) return res.status(403).json({ success: false, message: "Only admin can verify freelance agents" });

      if (action === 'verify') {
        agent.isVerified = true;
        agent.verifiedBy = req.user._id;
        agent.verifiedAt = new Date();
        
        // Auto-verify documents if uploaded
        if (agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) {
          agent.emiratesId.verified = true;
          agent.emiratesId.verifiedAt = new Date();
        }
        if (agent.bankDetails?.iban) {
          agent.bankDetails.verified = true;
          agent.bankDetails.verifiedAt = new Date();
        }
        
        checkProfileCompleteness(agent);
      } else if (action === 'reject') {
        agent.isActive = false;
        agent.rejectionReason = rejectionReason;
      }
    }

    await agent.save();
    return res.status(200).json({ success: true, message: `Agent ${action}d successfully` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   6. SUSPEND AGENT
===================================== */
export const suspendAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted) return res.status(404).json({ success: false, message: "Agent not found" });

    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (isAdmin) {
      agent.suspendedAt = new Date();
      agent.suspensionReason = reason || "Suspended by Admin";
      agent.isActive = false;
    } else if (isPartner && agent.partnerId?.toString() === req.user._id.toString()) {
      agent.suspendedAt = new Date();
      agent.suspensionReason = reason || "Suspended by Partner";
      agent.isActive = false;
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await agent.save();
    return res.status(200).json({ success: true, message: "Agent suspended" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   7. ACTIVATE AGENT
===================================== */
export const activateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted) return res.status(404).json({ success: false, message: "Agent not found" });

    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (isAdmin) {
      agent.suspendedAt = null;
      agent.suspensionReason = null;
      agent.isActive = true;
    } else if (isPartner && agent.partnerId?.toString() === req.user._id.toString()) {
      agent.suspendedAt = null;
      agent.suspensionReason = null;
      agent.isActive = true;
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await agent.save();
    return res.status(200).json({ success: true, message: "Agent activated" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   8. GET AGENT BY ID
===================================== */
export const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await VaultAgent.findById(id).select('-password').populate('partnerId', 'companyName');
    if (!agent || agent.isDeleted) return res.status(404).json({ success: false, message: "Agent not found" });

    const roleDoc = await Role.findById(req.user.role);
    const isAdmin = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    const isSelf = req.user._id.toString() === agent._id.toString();

    if (!isAdmin && !isPartner && !isSelf) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.status(200).json({ success: true, data: agent });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   9. GET ALL FREELANCE AGENTS (Admin Only)
===================================== */
export const getAllAgents = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18') return res.status(403).json({ success: false, message: "Admin only" });

    const { page = 1, limit = 10, isActive, search } = req.query;
    const query = { isDeleted: false, agentType: 'FreelanceAgent' };
    if (isActive) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { 'name.first_name': { $regex: search, $options: 'i' } },
        { 'name.last_name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const agents = await VaultAgent.find(query).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({ success: true, data: agents, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   10. GET PARTNER'S AFFILIATED AGENTS (Partner Only)
===================================== */
export const getAgentsByPartner = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '21') return res.status(403).json({ success: false, message: "Partner only" });

    const { page = 1, limit = 10, isActive, affiliationStatus } = req.query;
    const query = { partnerId: req.user._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false };
    if (isActive) query.isActive = isActive === 'true';
    if (affiliationStatus && affiliationStatus !== 'all') query.affiliationStatus = affiliationStatus;

    const agents = await VaultAgent.find(query).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({ success: true, data: agents, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   11. GET OWN PROFILE
===================================== */
export const getAgentProfile = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id).select('-password').populate('partnerId', 'companyName');
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    return res.status(200).json({ success: true, data: agent });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   12. UPDATE OWN PROFILE (Auto Commission Eligibility)
===================================== */
export const updateAgentProfile = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    const allowedFields = ['email', 'profilePic', 'address', 'emergencyContact', 'maritalStatus', 'numberOfDependents', 'dependents', 'nationality', 'dateOfBirth', 'gender'];
    const updates = {};
    allowedFields.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    if (req.body.emiratesId) {
      const eid = req.body.emiratesId;
      updates['emiratesId.number'] = eid.number;
      updates['emiratesId.frontImageUrl'] = eid.frontImageUrl;
      updates['emiratesId.backImageUrl'] = eid.backImageUrl;
      updates['emiratesId.verified'] = false;
    }

    if (req.body.bankDetails) {
      const bd = req.body.bankDetails;
      updates['bankDetails.iban'] = bd.iban;
      updates['bankDetails.beneficiaryName'] = bd.beneficiaryName;
      updates['bankDetails.bankName'] = bd.bankName;
      updates['bankDetails.verified'] = false;
    }

    const updatedAgent = await VaultAgent.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true }).select('-password');
    checkProfileCompleteness(updatedAgent);
    await updatedAgent.save();

    return res.status(200).json({ success: true, message: "Profile updated", data: updatedAgent });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   13. CHANGE PASSWORD
===================================== */
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const agent = await VaultAgent.findById(req.user._id).select('+password');
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    const isMatch = await bcrypt.compare(oldPassword, agent.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Old password incorrect" });

    agent.password = await bcrypt.hash(newPassword, 10);
    await agent.save();

    return res.status(200).json({ success: true, message: "Password changed" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   14. REQUEST PASSWORD RESET
===================================== */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const agent = await VaultAgent.findOne({ email });
    if (!agent) return res.status(404).json({ success: false, message: "Email not found" });

    const token = crypto.randomBytes(32).toString('hex');
    agent.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    agent.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await agent.save();

    // TODO: Send email with reset link
    return res.status(200).json({ success: true, message: "Reset email sent", token: token }); // Remove token in production
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   15. RESET PASSWORD
===================================== */
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const agent = await VaultAgent.findOne({ resetPasswordToken: hashedToken, resetPasswordExpires: { $gt: Date.now() } });
    if (!agent) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    agent.password = await bcrypt.hash(password, 10);
    agent.resetPasswordToken = null;
    agent.resetPasswordExpires = null;
    await agent.save();

    return res.status(200).json({ success: true, message: "Password reset successful" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};