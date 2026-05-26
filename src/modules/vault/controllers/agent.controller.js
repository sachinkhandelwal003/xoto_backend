import VaultAgent from '../models/Agent.js';
import Partner    from '../models/Partner.js';
import bcrypt     from 'bcryptjs';
import { Role }   from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import crypto     from 'crypto';
import { logAudit } from '../services/auditLog.service.js';
import { emitVaultNotification } from '../services/vaultNotification.service.js';

// ══════════════════════════════════════════════════════════════════
// HELPER — profile completion (used only for in-memory objects
//          before .save(). Pre-save hook handles DB saves automatically)
// ══════════════════════════════════════════════════════════════════
const checkProfileCompleteness = (agent) => {
  let completed = 0;
  if (agent.name?.first_name && agent.name?.last_name) completed++;
  if (agent.phone?.number)                             completed++;
  if (agent.email)                                     completed++;
  if (agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) completed++;
  if (agent.bankDetails?.iban)                         completed++;

  agent.profileCompletionPercentage = Math.round((completed / 5) * 100);
  agent.isProfileComplete            = agent.profileCompletionPercentage === 100;

  // Auto-enable commission only for FreelanceAgent when complete + verified
  if (agent.agentType === 'ReferralPartner') {
    agent.commissionEligible = agent.isProfileComplete && agent.isVerified;
  }
  // PartnerAffiliatedAgent — never eligible directly
  return agent;
};

// ══════════════════════════════════════════════════════════════════
// 1. AGENT SELF SIGNUP
//    POST /agents/signup
//    FreelanceAgent (Referral Partner) self-registers
//    PartnerAffiliatedAgent registers and waits for partner approval
// ══════════════════════════════════════════════════════════════════
export const agentSignup = async (req, res) => {
  try {
    const { first_name, last_name, email, phone_number, country_code, password, agentMode, partnerId } = req.body;

    if (!first_name || !last_name || !password || !phone_number)
      return res.status(400).json({ success: false, message: 'Name, password and phone are required' });

    const roleDoc = await Role.findOne({ code: '22' });
    if (!roleDoc) return res.status(404).json({ success: false, message: 'Role not found' });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) return res.status(400).json({ success: false, message: 'Phone already registered' });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword  = await bcrypt.hash(password, 10);
    let agentType         = 'ReferralPartner';
    let affiliationStatus = 'none';
    let partner           = null;

    if (agentMode === 'partner') {
      if (!partnerId) return res.status(400).json({ success: false, message: 'Partner selection required' });
      partner = await Partner.findById(partnerId);
      if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
      agentType         = 'PartnerAffiliatedAgent';
      affiliationStatus = 'pending'; // ✅ pending — partner must approve
    }

    const newAgent = await VaultAgent.create({
      name:             { first_name, last_name },
      phone:            { country_code: country_code || '+971', number: phone_number },
      email:            email || null,
      password:         hashedPassword,
      role:             roleDoc._id,
      agentType,
      partnerId:        partner?._id || null,
      affiliationStatus,
      isActive:         true,
      isVerified:       false,
      isPhoneVerified:  false, // ✅ not verified — no OTP done yet
      isEmailVerified:  false, // ✅ not verified — no OTP done yet
      commissionEligible: false,
    });

    // Log Audit
    await logAudit({
      entityType: 'AGENT',
      entityId: newAgent._id,
      action: 'USER_CREATED',
      performedBy: newAgent._id,
      performedByName: `${first_name} ${last_name}`,
      performedByRole: agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent',
      visibleToRoles: ['admin', agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent'],
      metadata: { agentType, partnerId: partner?._id }
    });

    if (agentType === 'ReferralPartner') {
      // Notify Admin (New Referral Partner registration)
      await emitVaultNotification({
        eventType: 'NEW_REFERRAL_PARTNER_REGISTRATION',
        title: 'New Referral Partner Registration',
        message: `New Referral Partner ${first_name} ${last_name} has registered and is pending verification.`,
        entityId: newAgent._id,
        entityModel: 'Agent',
        recipientRole: 'admin',
        sendToAllOfRole: true,
        createdByName: `${first_name} ${last_name}`,
        createdByRole: 'referral_partner',
      });
    } else {
      // PartnerAffiliatedAgent
      // Notify Partner Admin (New agent affiliation request)
      if (partner) {
        await emitVaultNotification({
          eventType: 'AGENT_AFFILIATION_PENDING',
          title: 'New Agent Affiliation Request',
          message: `Agent ${first_name} ${last_name} is requesting affiliation with your company.`,
          entityId: newAgent._id,
          entityModel: 'Agent',
          recipientId: partner._id,
          recipientModel: 'Partner',
          recipientRole: 'partner',
          createdByName: `${first_name} ${last_name}`,
          createdByRole: 'partner_affiliated_agent',
        });
      }
      // Notify Xoto Admin (New partner-affiliated agent registration awaiting partner approval)
      await emitVaultNotification({
        eventType: 'NEW_AFFILIATED_AGENT_REGISTRATION',
        title: 'New Affiliated Agent Registration',
        message: `New affiliated agent ${first_name} ${last_name} registered for partner ${partner?.companyName || 'unknown'}.`,
        entityId: newAgent._id,
        entityModel: 'Agent',
        recipientRole: 'admin',
        sendToAllOfRole: true,
        createdByName: `${first_name} ${last_name}`,
        createdByRole: 'partner_affiliated_agent',
      });
    }

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: agentMode === 'partner'
        ? 'Registration successful. Waiting for partner approval.'
        : 'Registration successful. Complete your profile to earn commission.',
      data: agentResponse,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 2. AGENT LOGIN
//    POST /agents/login
//    ✅ Sets lastLoginAt on every successful login
// ══════════════════════════════════════════════════════════════════
export const agentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password required' });

    const agent = await VaultAgent.findOne({ email })
      .select('+password')
      .populate('role')
      .populate('partnerId', 'companyName');

    if (!agent) {
      // Log login failure
      await logAudit({
        entityType: 'USER',
        action: 'USER_FAILED_LOGIN',
        performedByName: email,
        performedByRole: 'referral_partner',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin'],
        metadata: { reason: 'Email not found' }
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) {
      // Log login failure
      await logAudit({
        entityType: 'USER',
        entityId: agent._id,
        action: 'USER_FAILED_LOGIN',
        performedBy: agent._id,
        performedByName: `${agent.name?.first_name} ${agent.name?.last_name}`,
        performedByRole: agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin', agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent'],
        metadata: { reason: 'Password mismatch' }
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!agent.isActive || agent.suspendedAt) {
      const reason = agent.suspendedAt ? `Account suspended: ${agent.suspensionReason}` : 'Account inactive';
      // Log login failure
      await logAudit({
        entityType: 'USER',
        entityId: agent._id,
        action: 'USER_FAILED_LOGIN',
        performedBy: agent._id,
        performedByName: `${agent.name?.first_name} ${agent.name?.last_name}`,
        performedByRole: agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin', agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent'],
        metadata: { reason }
      });
      if (!agent.isActive)    return res.status(403).json({ success: false, message: 'Account deactivated' });
      if (agent.suspendedAt)  return res.status(403).json({ success: false, message: `Account suspended: ${agent.suspensionReason}` });
    }

    // ✅ Update lastLoginAt
    agent.lastLoginAt = new Date();
    await agent.save();

    // Log successful login
    await logAudit({
      entityType: 'USER',
      entityId: agent._id,
      action: 'USER_LOGIN',
      performedBy: agent._id,
      performedByName: `${agent.name?.first_name} ${agent.name?.last_name}`,
      performedByRole: agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      visibleToRoles: ['admin', agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent'],
    });

    const token = createToken(agent);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    // Warning hints for incomplete setup
    let warning = null;
    if (agent.agentType === 'ReferralPartner' && !agent.commissionEligible) {
      if (agent.profileCompletionPercentage < 100) warning = 'Complete Emirates ID & Bank details to earn commission';
      else if (!agent.isVerified)                  warning = 'Pending admin verification';
    }
    if (agent.agentType === 'PartnerAffiliatedAgent' && agent.affiliationStatus === 'pending')
      warning = 'Pending partner approval';

    return res.status(200).json({ success: true, token, warning, data: agentResponse });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 3. ADMIN ONBOARD FREELANCE AGENT
//    POST /agents/admin/onboard-freelance
//    ✅ Admin creates agent — agent is pre-verified
//    ✅ Still needs EID + bank to become commission eligible
// ══════════════════════════════════════════════════════════════════
export const adminOnboardFreelanceAgent = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const { first_name, last_name, email, phone_number, country_code, password } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password)
      return res.status(400).json({ success: false, message: 'First name, last name, email, phone, password required' });

    const freelanceRole = await Role.findOne({ code: '22' });
    if (!freelanceRole) return res.status(404).json({ success: false, message: 'Role not found' });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) return res.status(400).json({ success: false, message: 'Phone already registered' });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await VaultAgent.create({
      name:             { first_name, last_name },
      phone:            { country_code: country_code || '+971', number: phone_number },
      email,
      password:         hashedPassword,
      role:             freelanceRole._id,
      agentType:        'ReferralPartner',
      partnerId:        null,
      affiliationStatus:'none',
      isActive:         true,
      isVerified:       true,       // ✅ Admin onboards = pre-verified
      verifiedBy:       req.user._id,
      verifiedAt:       new Date(),
      isPhoneVerified:  true,
      isEmailVerified:  true,
      commissionEligible: false,    // ✅ Still needs EID + bank details
    });
    // Pre-save hook handles profileCompletionPercentage automatically

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: 'Freelance agent onboarded. Agent needs to add Emirates ID & Bank details to earn commission.',
      data: agentResponse,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 4. PARTNER ONBOARD AFFILIATED AGENT
//    POST /agents/partner/onboard-affiliate
//    ✅ Partner creates their agent — immediately verified
//    ✅ commissionEligible always false — commission goes to partner
// ══════════════════════════════════════════════════════════════════
export const partnerOnboardAffiliatedAgent = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const { first_name, last_name, email, phone_number, country_code, password } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password)
      return res.status(400).json({ success: false, message: 'First name, last name, email, phone, password required' });

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner)                   return res.status(404).json({ success: false, message: 'Partner not found' });
    if (partner.status !== 'active') return res.status(403).json({ success: false, message: 'Partner account not active' });

    const affiliatedRole = await Role.findOne({ code: '22' });
    if (!affiliatedRole) return res.status(404).json({ success: false, message: 'Role not found' });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) return res.status(400).json({ success: false, message: 'Phone already registered' });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await VaultAgent.create({
      name:                   { first_name, last_name },
      phone:                  { country_code: country_code || '+971', number: phone_number },
      email,
      password:               hashedPassword,
      role:                   affiliatedRole._id,
      agentType:              'PartnerAffiliatedAgent',
      partnerId,
      affiliationStatus:      'verified',    // ✅ Partner onboards = immediately verified
      affiliationVerifiedBy:  req.user._id,
      affiliationVerifiedAt:  new Date(),
      isActive:               true,
      isVerified:             true,          // ✅ Verified by partner
      isPhoneVerified:        true,
      isEmailVerified:        true,
      commissionEligible:     false,         // ✅ NEVER true — commission goes to partner
    });

    partner.numberOfAgents += 1;
    await partner.save();

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: 'Affiliated agent onboarded. Commission will be paid to partner company.',
      data: {
        _id:              agentResponse._id,
        name:             agentResponse.name,
        email:            agentResponse.email,
        agentType:        agentResponse.agentType,
        partnerId,
        partnerName:      partner.companyName,
        affiliationStatus:'verified',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 5. VERIFY AGENT
//    POST /agents/admin/verify/:id  — Admin verifies FreelanceAgent
//    POST /agents/partner/verify/:id — Partner verifies AffiliatedAgent
// ══════════════════════════════════════════════════════════════════
export const verifyAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    // Partner verifies AffiliatedAgent
    if (agent.agentType === 'PartnerAffiliatedAgent') {
      if (!isPartner)
        return res.status(403).json({ success: false, message: 'Only partner can verify affiliated agents' });
      if (agent.partnerId?.toString() !== req.user._id.toString())
        return res.status(403).json({ success: false, message: 'Not your agent' });

      if (action === 'approve') {
        agent.affiliationStatus     = 'verified';
        agent.isVerified            = true;
        agent.affiliationVerifiedBy = req.user._id;
        agent.affiliationVerifiedAt = new Date();
      } else if (action === 'reject') {
        agent.affiliationStatus          = 'rejected';
        agent.isActive                   = false;
        agent.affiliationRejectionReason = rejectionReason;
      }
    }

    // Admin verifies FreelanceAgent
    else if (agent.agentType === 'ReferralPartner') {
      if (!isAdmin)
        return res.status(403).json({ success: false, message: 'Only admin can verify freelance agents' });

      if (action === 'verify') {
        agent.isVerified  = true;
        agent.verifiedBy  = req.user._id;
        agent.verifiedAt  = new Date();

        // Auto-verify EID if already uploaded
        if (agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) {
          agent.emiratesId.verified   = true;
          agent.emiratesId.verifiedAt = new Date();
        }
        // Auto-verify bank if already provided
        if (agent.bankDetails?.iban) {
          agent.bankDetails.verified   = true;
          agent.bankDetails.verifiedAt = new Date();
        }

        // Recalculate commission eligibility after verification
        checkProfileCompleteness(agent);

      } else if (action === 'reject') {
        agent.isActive       = false;
        agent.rejectionReason = rejectionReason;
      }
    }

    await agent.save();

    // Log Audit
    if (agent.agentType === 'PartnerAffiliatedAgent') {
      await logAudit({
        entityType: 'AGENT',
        entityId: agent._id,
        action: action === 'approve' ? 'PARTNER_AFFILIATION_APPROVED' : 'PARTNER_AFFILIATION_REJECTED',
        performedBy: req.user._id,
        performedByName: req.user.companyName || req.user.email,
        performedByRole: 'partner',
        visibleToRoles: ['admin', 'partner', 'partner_affiliated_agent'],
        metadata: { action, reason: rejectionReason }
      });

      // Notify Agent
      await emitVaultNotification({
        eventType: 'AFFILIATION_VERIFICATION_STATUS',
        title: action === 'approve' ? 'Affiliation Approved' : 'Affiliation Rejected',
        message: action === 'approve'
          ? `Your affiliation with partner ${req.user.companyName} has been approved.`
          : `Your affiliation with partner ${req.user.companyName} was rejected: ${rejectionReason}`,
        entityId: agent._id,
        entityModel: 'Agent',
        recipientId: agent._id,
        recipientModel: 'Agent',
        recipientRole: 'partner_affiliated_agent',
        createdByName: req.user.companyName || 'Partner',
        createdByRole: 'partner',
      });
    } else {
      // FreelanceAgent (Referral Partner) verified by Admin
      await logAudit({
        entityType: 'AGENT',
        entityId: agent._id,
        action: action === 'verify' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
        performedBy: req.user._id,
        performedByName: req.user.email,
        performedByRole: 'admin',
        visibleToRoles: ['admin', 'referral_partner'],
        metadata: { action, reason: rejectionReason }
      });

      // Notify Agent
      await emitVaultNotification({
        eventType: 'AFFILIATION_VERIFICATION_STATUS',
        title: action === 'verify' ? 'Account Verified' : 'Account Rejected',
        message: action === 'verify'
          ? 'Your Referral Partner account has been verified by Xoto Admin.'
          : `Your Referral Partner account was rejected: ${rejectionReason}`,
        entityId: agent._id,
        entityModel: 'Agent',
        recipientId: agent._id,
        recipientModel: 'Agent',
        recipientRole: 'referral_partner',
        createdByName: 'Xoto Admin',
        createdByRole: 'admin',
      });
    }

    return res.status(200).json({ success: true, message: `Agent ${action}d successfully` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 6. SUSPEND AGENT
//    PATCH /agents/suspend/:id
// ══════════════════════════════════════════════════════════════════
export const suspendAgent = async (req, res) => {
  try {
    const { id }    = req.params;
    const { reason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (isAdmin) {
      agent.suspendedAt     = new Date();
      agent.suspensionReason = reason || 'Suspended by Admin';
      agent.isActive        = false;
    } else if (isPartner && agent.partnerId?.toString() === req.user._id.toString()) {
      agent.suspendedAt     = new Date();
      agent.suspensionReason = reason || 'Suspended by Partner';
      agent.isActive        = false;
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await agent.save();
    return res.status(200).json({ success: true, message: 'Agent suspended' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 7. ACTIVATE AGENT
//    PATCH /agents/activate/:id
// ══════════════════════════════════════════════════════════════════
export const activateAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (isAdmin) {
      agent.suspendedAt     = null;
      agent.suspensionReason = null;
      agent.isActive        = true;
    } else if (isPartner && agent.partnerId?.toString() === req.user._id.toString()) {
      agent.suspendedAt     = null;
      agent.suspensionReason = null;
      agent.isActive        = true;
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await agent.save();
    return res.status(200).json({ success: true, message: 'Agent activated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 8. GET AGENT BY ID
//    GET /agents/get/:id
// ══════════════════════════════════════════════════════════════════
export const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id).select('-password').populate('partnerId', 'companyName');
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';
    const isSelf    = req.user._id.toString() === agent._id.toString();

    if (!isAdmin && !isPartner && !isSelf)
      return res.status(403).json({ success: false, message: 'Access denied' });

    return res.status(200).json({ success: true, data: agent });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 9. GET ALL FREELANCE AGENTS — Admin only
//    GET /agents/admin/all-agents
// ══════════════════════════════════════════════════════════════════
export const getAllAgents = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '18')
      return res.status(403).json({ success: false, message: 'Admin only' });

    const { page = 1, limit = 10, isActive, search } = req.query;
    const query = { isDeleted: false, agentType: 'ReferralPartner' };
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { 'name.first_name': { $regex: search, $options: 'i' } },
        { 'name.last_name':  { $regex: search, $options: 'i' } },
        { email:             { $regex: search, $options: 'i' } },
      ];
    }

    const [agents, total] = await Promise.all([
      VaultAgent.find(query).select('-password').sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(parseInt(limit)),
      VaultAgent.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true, data: agents, total,
      page: parseInt(page), totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 10. GET PARTNER'S AFFILIATED AGENTS — Partner only
//     GET /agents/partner/agents
// ══════════════════════════════════════════════════════════════════
export const getAgentsByPartner = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '21')
      return res.status(403).json({ success: false, message: 'Partner only' });

    const { page = 1, limit = 10, isActive, affiliationStatus } = req.query;
    const query = { partnerId: req.user._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false };
    if (isActive !== undefined)                         query.isActive          = isActive === 'true';
    if (affiliationStatus && affiliationStatus !== 'all') query.affiliationStatus = affiliationStatus;

    const [agents, total] = await Promise.all([
      VaultAgent.find(query).select('-password').sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(parseInt(limit)),
      VaultAgent.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true, data: agents, total,
      page: parseInt(page), totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 11. GET OWN PROFILE
//     GET /agents/me
// ══════════════════════════════════════════════════════════════════
export const getAgentProfile = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id)
      .select('-password')
      .populate('partnerId', 'companyName');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    return res.status(200).json({ success: true, data: agent });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 12. UPDATE OWN PROFILE
//     PUT /agents/profile
//     ✅ EID/bank update resets verified + commissionEligible
//     ✅ PartnerAffiliatedAgent blocked from updating bank details
//     ✅ No double-save — pre-save hook handles profileCompletionPercentage
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// 12. UPDATE OWN PROFILE
//     PUT /agents/profile
//     ✅ Complete profile update with all fields
// ══════════════════════════════════════════════════════════════════
export const updateAgentProfile = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    // Allowed top-level fields
    const allowedFields = [
      'email', 'profilePic', 'address', 'emergencyContact',
      'maritalStatus', 'numberOfDependents', 'dependents',
      'nationality', 'dateOfBirth', 'gender',
      'languagePreference', 'communicationPreference',
    ];
    
    const updates = {};
    
    // Process top-level fields
    allowedFields.forEach(field => { 
      if (req.body[field] !== undefined) updates[field] = req.body[field]; 
    });

    // ==================== EMIRATES ID ====================
    if (req.body.emiratesId) {
      const eid = req.body.emiratesId;
      if (eid.number !== undefined) updates['emiratesId.number'] = eid.number;
      if (eid.frontImageUrl !== undefined) updates['emiratesId.frontImageUrl'] = eid.frontImageUrl;
      if (eid.backImageUrl !== undefined) updates['emiratesId.backImageUrl'] = eid.backImageUrl;
      if (eid.issuanceDate !== undefined) updates['emiratesId.issuanceDate'] = eid.issuanceDate;
      if (eid.expiryDate !== undefined) updates['emiratesId.expiryDate'] = eid.expiryDate;
      
      // Reset verification if any field changed
      if (Object.keys(eid).length > 0) {
        updates['emiratesId.verified'] = false;
        updates['emiratesId.verifiedAt'] = null;
        updates['commissionEligible'] = false;
      }
    }

    // ==================== PASSPORT ====================
    if (req.body.passport) {
      const passport = req.body.passport;
      if (passport.number !== undefined) updates['passport.number'] = passport.number;
      if (passport.countryOfIssue !== undefined) updates['passport.countryOfIssue'] = passport.countryOfIssue;
      if (passport.issueDate !== undefined) updates['passport.issueDate'] = passport.issueDate;
      if (passport.expiryDate !== undefined) updates['passport.expiryDate'] = passport.expiryDate;
      if (passport.imageUrl !== undefined) updates['passport.imageUrl'] = passport.imageUrl;
      
      if (Object.keys(passport).length > 0) {
        updates['passport.verified'] = false;
        updates['passport.verifiedAt'] = null;
      }
    }

    // ==================== VISA ====================
    if (req.body.visa) {
      const visa = req.body.visa;
      if (visa.number !== undefined) updates['visa.number'] = visa.number;
      if (visa.residencyStatus !== undefined) updates['visa.residencyStatus'] = visa.residencyStatus;
      if (visa.sponsor !== undefined) updates['visa.sponsor'] = visa.sponsor;
      if (visa.expiryDate !== undefined) updates['visa.expiryDate'] = visa.expiryDate;
      if (visa.imageUrl !== undefined) updates['visa.imageUrl'] = visa.imageUrl;
      
      if (Object.keys(visa).length > 0) {
        updates['visa.verified'] = false;
        updates['visa.verifiedAt'] = null;
      }
    }

    // ==================== BANK DETAILS ====================
    if (req.body.bankDetails) {
      // Block affiliated agents from updating bank details
      if (agent.agentType === 'PartnerAffiliatedAgent') {
        return res.status(403).json({
          success: false,
          message: 'Affiliated agents do not receive commission directly. Commission is paid to partner company.',
        });
      }
      
      const bd = req.body.bankDetails;
      if (bd.beneficiaryName !== undefined) updates['bankDetails.beneficiaryName'] = bd.beneficiaryName;
      if (bd.bankName !== undefined) updates['bankDetails.bankName'] = bd.bankName;
      if (bd.accountNumber !== undefined) updates['bankDetails.accountNumber'] = bd.accountNumber;
      if (bd.iban !== undefined) updates['bankDetails.iban'] = bd.iban;
      if (bd.swiftCode !== undefined) updates['bankDetails.swiftCode'] = bd.swiftCode;
      if (bd.accountType !== undefined) updates['bankDetails.accountType'] = bd.accountType;
      
      if (Object.keys(bd).length > 0) {
        updates['bankDetails.verified'] = false;
        updates['bankDetails.verifiedAt'] = null;
        updates['commissionEligible'] = false;
      }
    }

    // ==================== ADDRESS (handle nested) ====================
    if (req.body.address) {
      const addr = req.body.address;
      if (addr.building !== undefined) updates['address.building'] = addr.building;
      if (addr.apartment !== undefined) updates['address.apartment'] = addr.apartment;
      if (addr.area !== undefined) updates['address.area'] = addr.area;
      if (addr.city !== undefined) updates['address.city'] = addr.city;
      if (addr.poBox !== undefined) updates['address.poBox'] = addr.poBox;
      if (addr.country !== undefined) updates['address.country'] = addr.country;
    }

    // ==================== EMERGENCY CONTACT (handle nested) ====================
    if (req.body.emergencyContact) {
      const ec = req.body.emergencyContact;
      if (ec.name !== undefined) updates['emergencyContact.name'] = ec.name;
      if (ec.relationship !== undefined) updates['emergencyContact.relationship'] = ec.relationship;
      if (ec.phone !== undefined) updates['emergencyContact.phone'] = ec.phone;
    }

    // ==================== DEPENDENTS ====================
    if (req.body.dependents !== undefined) {
      updates.dependents = req.body.dependents;
    }

    // ==================== DATE OF BIRTH formatting ====================
    if (req.body.dateOfBirth) {
      updates.dateOfBirth = new Date(req.body.dateOfBirth);
    }

    // Execute update
    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password').populate('partnerId', 'companyName');

    // Recalculate commission eligibility after profile update
    if (updatedAgent.agentType === 'ReferralPartner') {
      const eligibility = updatedAgent.getCommissionEligibilityStatus();
      if (eligibility.eligible !== updatedAgent.commissionEligible) {
        updatedAgent.commissionEligible = eligibility.eligible;
        updatedAgent.commissionEligibilityReason = eligibility.reason;
        await updatedAgent.save();
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Profile updated successfully', 
      data: updatedAgent 
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 13. CHANGE PASSWORD
//     POST /agents/change-password
// ══════════════════════════════════════════════════════════════════
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const agent = await VaultAgent.findById(req.user._id).select('+password');
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    const isMatch = await bcrypt.compare(oldPassword, agent.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Old password incorrect' });

    agent.password = await bcrypt.hash(newPassword, 10);
    await agent.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 14. REQUEST PASSWORD RESET
//     POST /agents/reset-password
//     ✅ Token NOT returned in response (security)
// ══════════════════════════════════════════════════════════════════
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const agent = await VaultAgent.findOne({ email });
    if (!agent) return res.status(404).json({ success: false, message: 'Email not found' });

    const token    = crypto.randomBytes(32).toString('hex');
    agent.resetPasswordToken   = crypto.createHash('sha256').update(token).digest('hex');
    agent.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await agent.save();

    // TODO: Send email with link: /reset-password/{token}
    // await sendResetEmail(agent.email, token);

    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email',
      // ✅ token NOT returned — email only
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 15. RESET PASSWORD
//     POST /agents/reset-password/:token
// ══════════════════════════════════════════════════════════════════
export const resetPassword = async (req, res) => {
  try {
    const { token }    = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const agent = await VaultAgent.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!agent) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    agent.password             = await bcrypt.hash(password, 10);
    agent.resetPasswordToken   = null;
    agent.resetPasswordExpires = null;
    await agent.save();

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};