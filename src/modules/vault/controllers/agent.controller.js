import VaultAgent from '../models/Agent.js';
import Partner    from '../models/Partner.js';
import bcrypt     from 'bcryptjs';
import { Role }   from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import crypto     from 'crypto';
import { logAudit } from '../services/auditLog.service.js';
import { emitVaultNotification } from '../services/vaultNotification.service.js';
import sendEmail from '../../../utils/sendEmail.js';

// ─── Email template ───────────────────────────────────────────────────────────
const credentialEmailHtml = (name, email, password, role) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;">
  <div style="background:#5C039B;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;">Xoto Vault</h1>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
    <h2 style="color:#111;margin-top:0;">Welcome, ${name}!</h2>
    <p style="color:#555;">Your <strong>${role}</strong> account on Xoto Vault has been created.</p>
    <div style="background:#F5F0FF;border:1px solid #E9D5FF;border-radius:8px;padding:16px;margin:24px 0;">
      <p style="margin:0 0 8px;"><strong>Email:</strong> ${email}</p>
      <p style="margin:0;"><strong>Password:</strong> ${password}</p>
    </div>
    <p style="color:#c0392b;font-size:13px;"><strong>Important:</strong> Log in and change your password immediately.</p>
    <p style="color:#555;margin-bottom:0;">— Xoto Vault Team</p>
  </div>
</div>`;

// ─── Helper: build commission status for dashboard banner ────────────────────
// PRD Section 4.6 — commission requires Emirates ID + bank details verified
function buildCommissionStatus(agent) {
  if (agent.agentType === 'ReferralPartner') {
    const steps = [
      { key: 'phone',     label: 'Phone verified',            done: agent.isPhoneVerified },
      { key: 'eid',       label: 'Emirates ID uploaded',      done: !!(agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) },
      { key: 'eidVerif',  label: 'Emirates ID verified',      done: !!agent.emiratesId?.verified },
      { key: 'bank',      label: 'Bank details provided',     done: !!agent.bankDetails?.iban },
      { key: 'bankVerif', label: 'Bank details verified',     done: !!agent.bankDetails?.verified },
      { key: 'admin',     label: 'Admin account verification',done: agent.isVerified },
    ];
    const pending = steps.filter(s => !s.done);
    return {
      type:               'referral_partner',
      isActive:           agent.isActive,
      canSubmitLeads:     agent.isActive,
      commissionEligible: agent.commissionEligible,
      pendingSteps:       pending,
      allDone:            pending.length === 0,
      message: pending.length === 0
        ? 'Account fully verified — you can earn commission on all disbursed leads.'
        : `Complete ${pending.length} step${pending.length > 1 ? 's' : ''} to unlock commission.`,
    };
  }

  if (agent.agentType === 'PartnerAffiliatedAgent') {
    const steps = [
      { key: 'affiliation', label: 'Affiliation approved by partner', done: agent.affiliationStatus === 'verified' },
      { key: 'eid',         label: 'Emirates ID uploaded',            done: !!(agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) },
      { key: 'bank',        label: 'Bank details provided',           done: !!agent.bankDetails?.iban },
    ];
    const pending = steps.filter(s => !s.done);
    return {
      type:              'partner_affiliated_agent',
      isActive:          agent.isActive,
      canSubmitLeads:    agent.isActive,
      affiliationStatus: agent.affiliationStatus,
      commissionEligible: false,
      // PRD: commission paid to partner company — agent pay decided internally by partner
      commissionNote:    'Commission for your leads is paid to your partner company.',
      partnerName:       agent.partnerId?.companyName ?? null,
      pendingSteps:      pending,
      allDone:           pending.length === 0,
      message: agent.affiliationStatus === 'pending'
        ? 'Waiting for partner approval.'
        : pending.length === 0
          ? 'Account fully set up.'
          : `Complete ${pending.length} step${pending.length > 1 ? 's' : ''} to finish profile.`,
    };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// 1. AGENT SELF SIGNUP
//    POST /agents/signup
//    PRD 4.1 — Phone + OTP. Partner affiliation optional.
//    PRD 3.1 — Referral Partner: immediate access, no verification gate
//    PRD 5.5 — PartnerAffiliatedAgent: pending partner approval
// ══════════════════════════════════════════════════════════════════
export const agentSignup = async (req, res) => {
  try {
    const {
      first_name, last_name, email,
      phone_number, country_code,
      password, agentMode, partnerId,
    } = req.body;

    if (!first_name || !last_name || !password || !phone_number)
      return res.status(400).json({ success: false, message: 'Name, password and phone are required' });

    const roleDoc = await Role.findOne({ code: '22' });
    if (!roleDoc)
      return res.status(404).json({ success: false, message: 'Role not found' });

    // PRD: duplicate check on phone number
    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone)
      return res.status(400).json({ success: false, message: 'Phone already registered' });

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail)
        return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword  = await bcrypt.hash(password, 10);
    let agentType         = 'ReferralPartner';
    let affiliationStatus = 'none';
    let partner           = null;

    if (agentMode === 'partner') {
      // PRD 3.1 — agent selects partner from dropdown, sent for partner approval
      if (!partnerId)
        return res.status(400).json({ success: false, message: 'Partner selection required' });
      partner = await Partner.findById(partnerId);
      if (!partner)
        return res.status(404).json({ success: false, message: 'Partner not found' });
      agentType         = 'PartnerAffiliatedAgent';
      affiliationStatus = 'pending';
    }

    const newAgent = await VaultAgent.create({
      name:                   { first_name, last_name },
      phone:                  { country_code: country_code || '+971', number: phone_number },
      email:                  email || null,
      password:               hashedPassword,
      role:                   roleDoc._id,
      agentType,
      partnerId:              partner?._id || null,
      affiliationStatus,
      // PRD 5.5 — record when affiliation was requested (for 2-week / 1-month timeout)
      affiliationRequestedAt: agentMode === 'partner' ? new Date() : null,
      isActive:               true,
      isVerified:             false,
      isPhoneVerified:        false, // OTP not yet done
      isEmailVerified:        false,
      commissionEligible:     false,
    });

    await logAudit({
      entityType:      'AGENT',
      entityId:        newAgent._id,
      action:          'USER_CREATED',
      performedBy:     newAgent._id,
      performedByName: `${first_name} ${last_name}`,
      performedByRole: agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent',
      visibleToRoles:  ['admin', agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent'],
      metadata:        { agentType, partnerId: partner?._id },
    });

    // PRD 11.1 — Admin notified of new referral partner registration
    if (agentType === 'ReferralPartner') {
      await emitVaultNotification({
        eventType:       'NEW_REFERRAL_PARTNER_REGISTRATION',
        title:           'New Referral Partner Registration',
        message:         `${first_name} ${last_name} has self-registered as a Referral Partner.`,
        entityId:        newAgent._id,
        entityModel:     'Agent',
        recipientRole:   'admin',
        sendToAllOfRole: true,
        createdByName:   `${first_name} ${last_name}`,
        createdByRole:   'referral_partner',
      });
    } else {
      // PRD 11.1 — Partner notified of new affiliation request
      if (partner) {
        await emitVaultNotification({
          eventType:      'AGENT_AFFILIATION_PENDING',
          title:          'New Agent Affiliation Request',
          message:        `${first_name} ${last_name} is requesting affiliation with your company.`,
          entityId:       newAgent._id,
          entityModel:    'Agent',
          recipientId:    partner._id,
          recipientModel: 'Partner',
          recipientRole:  'partner',
          createdByName:  `${first_name} ${last_name}`,
          createdByRole:  'partner_affiliated_agent',
        });
      }
      // PRD 11.1 — Admin notified of new affiliated agent registration
      await emitVaultNotification({
        eventType:       'NEW_AFFILIATED_AGENT_REGISTRATION',
        title:           'New Affiliated Agent Registration',
        message:         `${first_name} ${last_name} registered for partner ${partner?.companyName || 'unknown'}.`,
        entityId:        newAgent._id,
        entityModel:     'Agent',
        recipientRole:   'admin',
        sendToAllOfRole: true,
        createdByName:   `${first_name} ${last_name}`,
        createdByRole:   'partner_affiliated_agent',
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

    const roleLabel = agent?.agentType === 'ReferralPartner'
      ? 'referral_partner' : 'partner_affiliated_agent';

    if (!agent) {
      await logAudit({ entityType: 'USER', action: 'USER_FAILED_LOGIN',
        performedByName: email, performedByRole: 'referral_partner',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin'], metadata: { reason: 'Email not found' } });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) {
      await logAudit({ entityType: 'USER', entityId: agent._id,
        action: 'USER_FAILED_LOGIN', performedBy: agent._id,
        performedByName: `${agent.name?.first_name} ${agent.name?.last_name}`,
        performedByRole: roleLabel, ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin', roleLabel],
        metadata: { reason: 'Password mismatch' } });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!agent.isActive || agent.suspendedAt) {
      const reason = agent.suspendedAt
        ? `Account suspended: ${agent.suspensionReason}` : 'Account inactive';
      await logAudit({ entityType: 'USER', entityId: agent._id,
        action: 'USER_FAILED_LOGIN', performedBy: agent._id,
        performedByName: `${agent.name?.first_name} ${agent.name?.last_name}`,
        performedByRole: roleLabel, ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        visibleToRoles: ['admin', roleLabel], metadata: { reason } });
      if (!agent.isActive)   return res.status(403).json({ success: false, message: 'Account deactivated' });
      if (agent.suspendedAt) return res.status(403).json({ success: false, message: `Account suspended: ${agent.suspensionReason}` });
    }

    agent.lastLoginAt = new Date();
    await agent.save();

    await logAudit({ entityType: 'USER', entityId: agent._id,
      action: 'USER_LOGIN', performedBy: agent._id,
      performedByName: `${agent.name?.first_name} ${agent.name?.last_name}`,
      performedByRole: roleLabel, ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      visibleToRoles: ['admin', roleLabel] });

    const token = createToken(agent);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    // Warning hints for incomplete setup
    let warning = null;
    if (agent.agentType === 'ReferralPartner' && !agent.commissionEligible) {
      if (agent.profileCompletionPercentage < 100)
        warning = 'Complete Emirates ID & Bank details to earn commission';
      else if (!agent.isVerified)
        warning = 'Pending admin verification';
    }
    if (agent.agentType === 'PartnerAffiliatedAgent' && agent.affiliationStatus === 'pending')
      warning = 'Pending partner approval';

    return res.status(200).json({ success: true, token, warning, data: agentResponse });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 3. ADMIN ONBOARD REFERRAL PARTNER
//    POST /agents/admin/onboard-freelance
//    PRD 8.5 — Admin creates account, issues credentials via email
//    Agent is pre-verified. Still needs EID + bank for commission.
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
    if (!freelanceRole)
      return res.status(404).json({ success: false, message: 'Role not found' });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone)
      return res.status(400).json({ success: false, message: 'Phone already registered' });

    const existingEmail = await VaultAgent.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ success: false, message: 'Email already registered' });

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
      isVerified:       true,        // Admin onboard = pre-verified
      verifiedBy:       req.user._id,
      verifiedAt:       new Date(),
      isPhoneVerified:  true,
      isEmailVerified:  true,
      commissionEligible: false,     // Still needs EID + bank details
    });

    // PRD 8.5 — send login credentials via email
    try {
      await sendEmail({
        to:      email,
        subject: 'Your Xoto Vault Referral Partner Account',
        html:    credentialEmailHtml(`${first_name} ${last_name}`, email, password, 'Referral Partner'),
      });
    } catch (emailErr) {
      console.error('Credential email failed:', emailErr.message);
    }

    await logAudit({
      entityType:      'AGENT',
      entityId:        newAgent._id,
      action:          'USER_CREATED',
      performedBy:     req.user._id,
      performedByName: req.user.email,
      performedByRole: 'admin',
      visibleToRoles:  ['admin', 'referral_partner'],
      metadata:        { onboardedBy: 'admin', agentType: 'ReferralPartner' },
    });

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: 'Referral Partner onboarded. Agent needs Emirates ID & Bank details to earn commission.',
      data: agentResponse,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 4. PARTNER ONBOARD AFFILIATED AGENT
//    POST /agents/partner/onboard-affiliate
//    PRD 5.5 — Partner creates agent directly = immediately verified
//    commissionEligible always false — commission goes to partner
// ══════════════════════════════════════════════════════════════════
export const partnerOnboardAffiliatedAgent = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const { first_name, last_name, email, phone_number, country_code, password } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password)
      return res.status(400).json({ success: false, message: 'First name, last name, email, phone, password required' });

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner)
      return res.status(404).json({ success: false, message: 'Partner not found' });
    if (partner.status !== 'active')
      return res.status(403).json({ success: false, message: 'Partner account not active' });

    const affiliatedRole = await Role.findOne({ code: '22' });
    if (!affiliatedRole)
      return res.status(404).json({ success: false, message: 'Role not found' });

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone)
      return res.status(400).json({ success: false, message: 'Phone already registered' });

    const existingEmail = await VaultAgent.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAgent = await VaultAgent.create({
      name:                  { first_name, last_name },
      phone:                 { country_code: country_code || '+971', number: phone_number },
      email,
      password:              hashedPassword,
      role:                  affiliatedRole._id,
      agentType:             'PartnerAffiliatedAgent',
      partnerId,
      affiliationStatus:     'verified',      // Partner onboards = immediately verified
      affiliationRequestedAt: new Date(),
      affiliationVerifiedBy: req.user._id,
      affiliationVerifiedAt: new Date(),
      isActive:              true,
      isVerified:            true,
      isPhoneVerified:       true,
      isEmailVerified:       true,
      commissionEligible:    false,           // PRD: NEVER true — commission goes to partner
    });

    partner.numberOfAgents = (partner.numberOfAgents || 0) + 1;
    await partner.save();

    await logAudit({
      entityType:      'AGENT',
      entityId:        newAgent._id,
      action:          'USER_CREATED',
      performedBy:     req.user._id,
      performedByName: partner.companyName,
      performedByRole: 'partner',
      visibleToRoles:  ['admin', 'partner'],
      metadata:        { onboardedBy: 'partner', partnerName: partner.companyName },
    });

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
// 5. VERIFY AGENT (affiliation or account)
//    POST /agents/admin/verify/:id  — Admin verifies ReferralPartner
//    POST /agents/partner/verify/:id — Partner approves/rejects
//                                      PartnerAffiliatedAgent
//    PRD 5.5 — partner has 2 weeks to respond (timeout tracked via
//              affiliationRequestedAt), 1 month = account terminated
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

    // ── Partner approves / rejects PartnerAffiliatedAgent ────────────────────
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
        // PRD 5.5 — partner rejects: agent notified, can re-register with different partner
        agent.affiliationStatus          = 'rejected';
        agent.isActive                   = false;
        agent.affiliationRejectedAt      = new Date();
        agent.affiliationRejectionReason = rejectionReason || null;
      }
    }

    // ── Admin verifies ReferralPartner ────────────────────────────────────────
    else if (agent.agentType === 'ReferralPartner') {
      if (!isAdmin)
        return res.status(403).json({ success: false, message: 'Only admin can verify referral partners' });

      if (action === 'verify') {
        agent.isVerified  = true;
        agent.verifiedBy  = req.user._id;
        agent.verifiedAt  = new Date();

        // Auto-verify EID if already uploaded
        if (agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) {
          agent.emiratesId.verified   = true;
          agent.emiratesId.verifiedAt = new Date();
          agent.emiratesId.verifiedBy = req.user._id;
        }
        // Auto-verify bank if already provided
        if (agent.bankDetails?.iban) {
          agent.bankDetails.verified   = true;
          agent.bankDetails.verifiedAt = new Date();
        }
        // Recalculate commission eligibility
        const eligibility = agent.getCommissionEligibilityStatus();
        agent.commissionEligible          = eligibility.eligible;
        agent.commissionEligibilityReason = eligibility.reason;

      } else if (action === 'reject') {
        agent.isActive        = false;
        agent.rejectionReason = rejectionReason || null;
      }
    }

    await agent.save();

    // Audit + notification
    if (agent.agentType === 'PartnerAffiliatedAgent') {
      await logAudit({
        entityType:      'AGENT', entityId: agent._id,
        action:          action === 'approve' ? 'PARTNER_AFFILIATION_APPROVED' : 'PARTNER_AFFILIATION_REJECTED',
        performedBy:     req.user._id,
        performedByName: req.user.companyName || req.user.email,
        performedByRole: 'partner',
        visibleToRoles:  ['admin', 'partner', 'partner_affiliated_agent'],
        metadata:        { action, reason: rejectionReason },
      });
      await emitVaultNotification({
        eventType:      'AFFILIATION_VERIFICATION_STATUS',
        title:          action === 'approve' ? 'Affiliation Approved' : 'Affiliation Rejected',
        message:        action === 'approve'
          ? `Your affiliation with ${req.user.companyName} has been approved.`
          : `Your affiliation with ${req.user.companyName} was rejected: ${rejectionReason}`,
        entityId:       agent._id, entityModel: 'Agent',
        recipientId:    agent._id, recipientModel: 'Agent',
        recipientRole:  'partner_affiliated_agent',
        createdByName:  req.user.companyName || 'Partner',
        createdByRole:  'partner',
      });
    } else {
      await logAudit({
        entityType:      'AGENT', entityId: agent._id,
        action:          action === 'verify' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
        performedBy:     req.user._id,
        performedByName: req.user.email,
        performedByRole: 'admin',
        visibleToRoles:  ['admin', 'referral_partner'],
        metadata:        { action, reason: rejectionReason },
      });
      await emitVaultNotification({
        eventType:      'AFFILIATION_VERIFICATION_STATUS',
        title:          action === 'verify' ? 'Account Verified' : 'Account Rejected',
        message:        action === 'verify'
          ? 'Your Referral Partner account has been verified by Xoto Admin.'
          : `Your account was rejected: ${rejectionReason}`,
        entityId:       agent._id, entityModel: 'Agent',
        recipientId:    agent._id, recipientModel: 'Agent',
        recipientRole:  'referral_partner',
        createdByName:  'Xoto Admin',
        createdByRole:  'admin',
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
    const { id }     = req.params;
    const { reason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (isAdmin) {
      agent.suspendedAt      = new Date();
      agent.suspensionReason = reason || 'Suspended by Admin';
      agent.suspendedBy      = req.user._id;
      agent.isActive         = false;
    } else if (isPartner && agent.partnerId?.toString() === req.user._id.toString()) {
      agent.suspendedAt      = new Date();
      agent.suspensionReason = reason || 'Suspended by Partner';
      agent.suspendedBy      = req.user._id;
      agent.isActive         = false;
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
      agent.suspendedAt      = null;
      agent.suspensionReason = null;
      agent.suspendedBy      = null;
      agent.isActive         = true;
    } else if (isPartner && agent.partnerId?.toString() === req.user._id.toString()) {
      agent.suspendedAt      = null;
      agent.suspensionReason = null;
      agent.suspendedBy      = null;
      agent.isActive         = true;
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

    const agent = await VaultAgent.findById(id)
      .select('-password')
      .populate('partnerId', 'companyName');
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
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
// 9. GET ALL REFERRAL PARTNERS — Admin only
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
//     PRD 5.5 — partner sees all affiliated agents with status
// ══════════════════════════════════════════════════════════════════
export const getAgentsByPartner = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (roleDoc?.code !== '21')
      return res.status(403).json({ success: false, message: 'Partner only' });

    const { page = 1, limit = 10, isActive, affiliationStatus } = req.query;
    const query = { partnerId: req.user._id, agentType: 'PartnerAffiliatedAgent', isDeleted: false };
    if (isActive !== undefined)                           query.isActive          = isActive === 'true';
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
      .populate('partnerId', 'companyName status');
    if (!agent)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    return res.status(200).json({
      success: true,
      data:   agent,
      commissionStatus: buildCommissionStatus(agent),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 12. UPDATE OWN PROFILE
//     PUT /agents/profile
//     PRD 4.6 — allowed fields: personal info, Emirates ID,
//               passport, bank details, profile photo
//     Removed from original: visa, address, emergencyContact,
//     maritalStatus, dependents, languagePreference,
//     communicationPreference (not in PRD)
//     EID/bank update resets verified + commissionEligible
// ══════════════════════════════════════════════════════════════════
export const updateAgentProfile = async (req, res) => {
  try {
    const agent = await VaultAgent.findById(req.user._id);
    if (!agent)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const updates = {};

    // ── PRD 4.6 personal fields ───────────────────────────────────────────────
    // email, profilePic, dateOfBirth, nationality, gender
    const personalFields = ['email', 'profilePic', 'nationality', 'gender'];
    personalFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (req.body.dateOfBirth)
      updates.dateOfBirth = new Date(req.body.dateOfBirth);

    // ── PRD 4.6 — Emirates ID (number + front/back upload) ───────────────────
    if (req.body.emiratesId) {
      const eid = req.body.emiratesId;
      if (eid.number        !== undefined) updates['emiratesId.number']        = eid.number;
      if (eid.frontImageUrl !== undefined) updates['emiratesId.frontImageUrl'] = eid.frontImageUrl;
      if (eid.backImageUrl  !== undefined) updates['emiratesId.backImageUrl']  = eid.backImageUrl;
      if (eid.issuanceDate  !== undefined) updates['emiratesId.issuanceDate']  = eid.issuanceDate;
      if (eid.expiryDate    !== undefined) updates['emiratesId.expiryDate']    = eid.expiryDate;
      // Reset verification on any EID change
      updates['emiratesId.verified']   = false;
      updates['emiratesId.verifiedAt'] = null;
      updates['emiratesId.verifiedBy'] = null;
      if (agent.agentType === 'ReferralPartner')
        updates['commissionEligible'] = false;
    }

    // ── PRD 4.6 — Passport (number + upload) ─────────────────────────────────
    if (req.body.passport) {
      const p = req.body.passport;
      if (p.number         !== undefined) updates['passport.number']         = p.number;
      if (p.countryOfIssue !== undefined) updates['passport.countryOfIssue'] = p.countryOfIssue;
      if (p.issueDate      !== undefined) updates['passport.issueDate']      = p.issueDate;
      if (p.expiryDate     !== undefined) updates['passport.expiryDate']     = p.expiryDate;
      if (p.imageUrl       !== undefined) updates['passport.imageUrl']       = p.imageUrl;
      updates['passport.verified']   = false;
      updates['passport.verifiedAt'] = null;
    }

    // ── PRD 4.6 — Bank details (bank name, account number, IBAN, holder name) ─
    if (req.body.bankDetails) {
      const bd = req.body.bankDetails;
      if (bd.beneficiaryName !== undefined) updates['bankDetails.beneficiaryName'] = bd.beneficiaryName;
      if (bd.bankName        !== undefined) updates['bankDetails.bankName']        = bd.bankName;
      if (bd.accountNumber   !== undefined) updates['bankDetails.accountNumber']   = bd.accountNumber;
      if (bd.iban            !== undefined) updates['bankDetails.iban']            = bd.iban;
      // Reset verification on any bank change
      updates['bankDetails.verified']   = false;
      updates['bankDetails.verifiedAt'] = null;
      if (agent.agentType === 'ReferralPartner')
        updates['commissionEligible'] = false;
    }

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password').populate('partnerId', 'companyName');

    // Recalculate commission eligibility after update
    if (updatedAgent.agentType === 'ReferralPartner') {
      const eligibility = updatedAgent.getCommissionEligibilityStatus();
      if (eligibility.eligible !== updatedAgent.commissionEligible) {
        updatedAgent.commissionEligible          = eligibility.eligible;
        updatedAgent.commissionEligibilityReason = eligibility.reason;
        await updatedAgent.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data:    updatedAgent,
    });
  } catch (err) {
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
    if (!agent)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const isMatch = await bcrypt.compare(oldPassword, agent.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Old password incorrect' });

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
// ══════════════════════════════════════════════════════════════════
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const agent = await VaultAgent.findOne({ email });
    if (!agent)
      return res.status(404).json({ success: false, message: 'Email not found' });

    const token                    = crypto.randomBytes(32).toString('hex');
    agent.resetPasswordToken       = crypto.createHash('sha256').update(token).digest('hex');
    agent.resetPasswordExpires     = Date.now() + 3600000; // 1 hour
    await agent.save();

    // TODO: send email with /reset-password/{token}

    return res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email',
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
    if (!agent)
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    agent.password             = await bcrypt.hash(password, 10);
    agent.resetPasswordToken   = null;
    agent.resetPasswordExpires = null;
    await agent.save();

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// 16. VERIFY AGENT DOCUMENT — Admin or Partner
//     PATCH /agents/admin/verify-document/:id
//     PATCH /agents/partner/verify-document/:id
//     PRD 4.6 — valid docs: emiratesId, passport, bankDetails
//     Removed: visa (not in PRD agent profile)
// ══════════════════════════════════════════════════════════════════
export const verifyAgentDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, action } = req.body;

    // PRD 4.6 — only these three documents on agent profile
    const validDocTypes = ['emiratesId', 'passport', 'bankDetails'];
    if (!validDocTypes.includes(documentType))
      return res.status(400).json({
        success: false,
        message: `Invalid documentType. Must be one of: ${validDocTypes.join(', ')}`,
      });

    if (!['verify', 'reject'].includes(action))
      return res.status(400).json({ success: false, message: 'action must be "verify" or "reject"' });

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (!isAdmin && !isPartner)
      return res.status(403).json({ success: false, message: 'Admin or Partner only' });
    if (isPartner && agent.partnerId?.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not your agent' });

    if (!agent[documentType])
      return res.status(400).json({ success: false, message: `${documentType} data not found` });

    if (action === 'verify') {
      agent[documentType].verified   = true;
      agent[documentType].verifiedAt = new Date();
      if (documentType === 'emiratesId') agent[documentType].verifiedBy = req.user._id;

      // Recalculate commission eligibility for ReferralPartner
      if (['bankDetails', 'emiratesId'].includes(documentType) && agent.agentType === 'ReferralPartner') {
        const eligibility = agent.getCommissionEligibilityStatus();
        agent.commissionEligible          = eligibility.eligible;
        agent.commissionEligibilityReason = eligibility.reason;
      }
    } else {
      agent[documentType].verified   = false;
      agent[documentType].verifiedAt = null;
      if (agent.agentType === 'ReferralPartner') {
        agent.commissionEligible          = false;
        agent.commissionEligibilityReason = `${documentType} verification rejected`;
      }
    }

    await agent.save();

    await logAudit({
      entityType:      'AGENT', entityId: agent._id,
      action:          action === 'verify' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      performedBy:     req.user._id,
      performedByName: req.user.companyName || req.user.email,
      performedByRole: isAdmin ? 'admin' : 'partner',
      visibleToRoles:  ['admin', 'partner', agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent'],
      metadata:        { documentType, action },
    });

    await emitVaultNotification({
      eventType:      'DOCUMENT_VERIFICATION_STATUS',
      title:          action === 'verify' ? 'Document Verified' : 'Document Rejected',
      message:        action === 'verify'
        ? `Your ${documentType} has been verified.`
        : `Your ${documentType} was rejected. Please re-upload the correct document.`,
      entityId:       agent._id, entityModel: 'Agent',
      recipientId:    agent._id, recipientModel: 'Agent',
      recipientRole:  agent.agentType === 'ReferralPartner' ? 'referral_partner' : 'partner_affiliated_agent',
      createdByName:  isAdmin ? 'Xoto Admin' : (req.user.companyName || 'Partner'),
      createdByRole:  isAdmin ? 'admin' : 'partner',
    });

    return res.status(200).json({
      success: true,
      message: `${documentType} ${action === 'verify' ? 'verified' : 'rejected'} successfully`,
      data: {
        agentId:            agent._id,
        documentType,
        verified:           action === 'verify',
        commissionEligible: agent.commissionEligible,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
// ══════════════════════════════════════════════════════════════════
// 17. CONFIRM COMMISSION ELIGIBLE — Admin or Partner
//     PATCH /agents/admin/confirm-commission/:id
//     PATCH /agents/partner/confirm-commission/:id
//     Manually marks an agent as commission eligible after all
//     required documents are verified (EID + bank + account).
//     For ReferralPartner only — PAA commission always goes to partner.
// ══════════════════════════════════════════════════════════════════
export const setCommissionEligible = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted)
      return res.status(404).json({ success: false, message: 'Agent not found' });

    const roleDoc   = await Role.findById(req.user.role);
    const isAdmin   = roleDoc?.code === '18';
    const isPartner = roleDoc?.code === '21';

    if (!isAdmin && !isPartner)
      return res.status(403).json({ success: false, message: 'Admin or Partner only' });

    if (isPartner && agent.partnerId?.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not your agent' });

    if (agent.agentType !== 'ReferralPartner')
      return res.status(400).json({ success: false, message: 'Commission eligibility only applies to Referral Partners' });

    if (!agent.isVerified)
      return res.status(400).json({ success: false, message: 'Agent account must be verified before enabling commission' });

    if (!agent.emiratesId?.verified)
      return res.status(400).json({ success: false, message: 'Emirates ID must be verified before enabling commission' });

    if (!agent.bankDetails?.verified)
      return res.status(400).json({ success: false, message: 'Bank details must be verified before enabling commission' });

    if (agent.commissionEligible)
      return res.status(400).json({ success: false, message: 'Agent is already commission eligible' });

    agent.commissionEligible          = true;
    agent.commissionEligibilityReason = null;
    await agent.save();

    await logAudit({
      entityType:      'AGENT',
      entityId:        agent._id,
      action:          'COMMISSION_ELIGIBLE_CONFIRMED',
      performedBy:     req.user._id,
      performedByName: req.user.companyName || req.user.email,
      performedByRole: isAdmin ? 'admin' : 'partner',
      visibleToRoles:  ['admin', 'referral_partner'],
      metadata:        { confirmedBy: isAdmin ? 'admin' : 'partner', agentName: `${agent.name.first_name} ${agent.name.last_name}` },
    });

    await emitVaultNotification({
      eventType:      'COMMISSION_ELIGIBLE_CONFIRMED',
      title:          'Commission Enabled',
      message:        'Congratulations! Your account is now commission eligible. You will earn commission on all disbursed leads.',
      entityId:       agent._id,
      entityModel:    'Agent',
      recipientId:    agent._id,
      recipientModel: 'Agent',
      recipientRole:  'referral_partner',
      createdByName:  isAdmin ? 'Xoto Admin' : (req.user.companyName || 'Partner'),
      createdByRole:  isAdmin ? 'admin' : 'partner',
    });

    return res.status(200).json({
      success: true,
      message: `${agent.name.first_name} ${agent.name.last_name} is now commission eligible`,
      data: { agentId: agent._id, commissionEligible: true },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
