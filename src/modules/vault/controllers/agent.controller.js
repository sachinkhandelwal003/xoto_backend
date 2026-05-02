  import VaultAgent from '../models/Agent.js';
  import Partner from '../models/Partner.js';
  import Lead from '../models/VaultLead.js';
  import Commission from '../models/Commission.js';
  import HistoryService from '../services/history.service.js';
  import bcrypt from 'bcryptjs';
  import { Role } from '../../../modules/auth/models/role/role.model.js';
  import { createToken } from '../../../middleware/auth.js';

  /* =====================================
    HELPER FUNCTION
  ===================================== */
  const checkProfileCompleteness = (agent) => {
    let completedFields = 0;
    let totalFields = 5;
    
    if (agent.name?.first_name && agent.name?.last_name) completedFields++;
    if (agent.phone?.number) completedFields++;
    if (agent.email) completedFields++;
    if (agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) completedFields++;
    if (agent.bankDetails?.iban) completedFields++;
    
    const percentage = Math.round((completedFields / totalFields) * 100);
    agent.profileCompletionPercentage = percentage;
    agent.isProfileComplete = percentage === 100;
    
    return agent.isProfileComplete;
  };

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
        } else if (req.user?.agentType === 'FreelanceAgent') {
          userRole = 'FreelanceAgent';
        } else if (req.user?.agentType === 'PartnerAffiliatedAgent') {
          userRole = 'PartnerAffiliatedAgent';
        } else {
          userRole = 'Agent';
        }
      } else {
        if (req.user?.agentType === 'FreelanceAgent') {
          userRole = 'FreelanceAgent';
        } else if (req.user?.agentType === 'PartnerAffiliatedAgent') {
          userRole = 'PartnerAffiliatedAgent';
        } else {
          userRole = 'Agent';
        }
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
    1. AGENT SELF SIGNUP
  ===================================== */
  export const agentSignup = async (req, res) => {
    try {
      const {
        first_name,
        last_name,
        email,
        phone_number,
        country_code,
        password,
        agentMode, // 'freelance' | 'partner'
        partnerId,
        maritalStatus,
        numberOfDependents,
        dependents,
        nationality,
        dateOfBirth,
        gender
      } = req.body;

      if (!first_name || !last_name || !password || !phone_number) {
        return res.status(400).json({
          success: false,
          message: "First name, last name, password and phone number are required"
        });
      }

      if (!agentMode || !['freelance', 'partner'].includes(agentMode)) {
        return res.status(400).json({
          success: false,
          message: "agentMode must be 'freelance' or 'partner'"
        });
      }

      const roleDoc = await Role.findOne({ code: '22' });
      if (!roleDoc) {
        return res.status(404).json({
          success: false,
          message: "Role not found"
        });
      }

      const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Phone number already registered"
        });
      }

      if (email) {
        const existingEmail = await VaultAgent.findOne({ email });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: "Email already registered"
          });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      let agentType = 'FreelanceAgent';
      let partner = null;
      let affiliationStatus = 'none';

      if (agentMode === 'partner') {
        if (!partnerId) {
          return res.status(400).json({
            success: false,
            message: "Partner selection required"
          });
        }

        partner = await Partner.findById(partnerId);
        if (!partner) {
          return res.status(404).json({
            success: false,
            message: "Partner not found"
          });
        }

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
        partnerId: partner ? partner._id : null,
        affiliationStatus,
        maritalStatus: maritalStatus || null,
        numberOfDependents: numberOfDependents || 0,
        dependents: dependents || [],
        nationality: nationality || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        isActive: false,
        isVerified: false,
        isPhoneVerified: false,
        isEmailVerified: false,
        commissionEligible: false
      });

      await HistoryService.logAgentActivity(
        newAgent,
        'AGENT_REGISTERED',
        await getUserInfo(req),
        { description: `Agent ${newAgent.fullName} registered (${agentType})` }
      );

      const agentResponse = newAgent.toObject();
      delete agentResponse.password;

      return res.status(201).json({
        success: true,
        message: agentMode === 'partner'
          ? "Registered successfully. Awaiting partner approval."
          : "Freelance agent registered successfully. Awaiting admin verification.",
        data: agentResponse
      });

    } catch (error) {
      console.error("Agent signup error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  };

  /* =====================================
    2. ADMIN ONBOARD FREELANCE AGENT
  ===================================== */
  export const adminOnboardFreelanceAgent = async (req, res) => {
    try {
      const userRole = req.user.role;
      const roleDoc = await Role.findById(userRole);
      
      if (!roleDoc || roleDoc.code !== '18') {
        return res.status(403).json({ success: false, message: "Access denied. Only Admin can onboard agents." });
      }

      const {
        first_name, last_name, email, phone_number, country_code, password,
        maritalStatus, numberOfDependents, dependents, nationality, dateOfBirth, gender,
        address, emergencyContact, emiratesIdNumber, emiratesIdExpiryDate,
        emiratesIdFrontImage, emiratesIdBackImage, passportNumber, passportExpiryDate,
        passportImage, visaNumber, visaExpiryDate, visaImage, beneficiaryName,
        bankName, accountNumber, iban, swiftCode, accountType
      } = req.body;

      if (!first_name || !last_name || !email || !phone_number || !password) {
        return res.status(400).json({
          success: false,
          message: "First name, last name, email, phone number and password are required"
        });
      }

      const freelanceRole = await Role.findOne({ code: '22' });
      if (!freelanceRole) {
        return res.status(404).json({ success: false, message: "Freelance Agent role not found" });
      }

      const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: "Phone number already registered" });
      }

      if (email) {
        const existingEmail = await VaultAgent.findOne({ email });
        if (existingEmail) {
          return res.status(400).json({ success: false, message: "Email already registered" });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const agentData = {
        name: { first_name, last_name },
      phone: { country_code: country_code || '+971', number: phone_number },
      email: email,
      password: hashedPassword,
      role: freelanceRole._id,
      agentType: 'FreelanceAgent',
      partnerId: null,
      affiliationStatus: 'none',
      maritalStatus: maritalStatus || null,
      numberOfDependents: numberOfDependents || 0,
      dependents: dependents || [],
      nationality: nationality || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      isActive: true,
      isVerified: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
      commissionEligible: true
    };

    if (address) agentData.address = address;
    if (emergencyContact) agentData.emergencyContact = emergencyContact;
    if (emiratesIdNumber) {
      agentData.emiratesId = {
        number: emiratesIdNumber,
        expiryDate: emiratesIdExpiryDate || null,
        frontImageUrl: emiratesIdFrontImage || null,
        backImageUrl: emiratesIdBackImage || null,
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: req.user._id
      };
    }
    if (passportNumber) {
      agentData.passport = {
        number: passportNumber,
        expiryDate: passportExpiryDate || null,
        imageUrl: passportImage || null,
        verified: true,
        verifiedAt: new Date()
      };
    }
    if (visaNumber) {
      agentData.visa = {
        number: visaNumber,
        expiryDate: visaExpiryDate || null,
        imageUrl: visaImage || null,
        verified: true,
        verifiedAt: new Date()
      };
    }
    if (iban) {
      agentData.bankDetails = {
        beneficiaryName: beneficiaryName || `${first_name} ${last_name}`,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        iban: iban,
        swiftCode: swiftCode || null,
        accountType: accountType || null,
        verified: true,
        verifiedAt: new Date()
      };
    }

    const newAgent = await VaultAgent.create(agentData);
    checkProfileCompleteness(newAgent);
    await newAgent.save();

    await HistoryService.logAgentActivity(newAgent, 'AGENT_VERIFIED', await getUserInfo(req), {
      description: `Admin onboarded freelance agent ${newAgent.fullName}`,
      metadata: { onboardedBy: req.user?.email },
    });

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: "Freelance agent onboarded successfully by Admin",
      data: agentResponse
    });

  } catch (error) {
    console.error("Admin onboard error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   3. PARTNER ONBOARD AFFILIATED AGENT
===================================== */
export const partnerOnboardAffiliatedAgent = async (req, res) => {
  try {
    const partnerId = req.user._id;

    const {
      first_name, last_name, email, phone_number, country_code, password,
      maritalStatus, numberOfDependents, dependents, nationality, dateOfBirth, gender,
      address, emergencyContact
    } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, phone number and password are required"
      });
    }

    const partner = await Partner.findOne({ _id: partnerId, isDeleted: false });
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    if (partner.status !== 'active') {
      return res.status(403).json({ success: false, message: "Partner account is not active" });
    }

    const affiliatedRole = await Role.findOne({ code: '22' });
    if (!affiliatedRole) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    const existingPhone = await VaultAgent.findOne({ 'phone.number': phone_number });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "Phone number already registered" });
    }

    if (email) {
      const existingEmail = await VaultAgent.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: "Email already registered" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const agentData = {
      name: { first_name, last_name },
      phone: { country_code: country_code || '+971', number: phone_number },
      email: email,
      password: hashedPassword,
      role: affiliatedRole._id,
      agentType: 'PartnerAffiliatedAgent',
      partnerId: partnerId,
      affiliationStatus: 'verified',
      affiliationVerifiedBy: req.user._id,
      affiliationVerifiedAt: new Date(),
      maritalStatus: maritalStatus || null,
      numberOfDependents: numberOfDependents || 0,
      dependents: dependents || [],
      nationality: nationality || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      commissionEligible: true
    };

    if (address) agentData.address = address;
    if (emergencyContact) agentData.emergencyContact = emergencyContact;

    const newAgent = await VaultAgent.create(agentData);

    partner.numberOfAgents += 1;
    await partner.save();

    await HistoryService.logAgentActivity(newAgent, 'AGENT_VERIFIED', await getUserInfo(req), {
      description: `Partner ${partner.companyName} onboarded affiliated agent ${newAgent.fullName}`,
      metadata: { partnerName: partner.companyName },
    });

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: "Partner affiliated agent onboarded successfully",
      data: {
        _id: agentResponse._id,
        name: agentResponse.name,
        email: agentResponse.email,
        agentType: agentResponse.agentType,
        partnerId: partnerId,
        partnerName: partner.companyName,
        affiliationStatus: 'verified',
        isActive: true
      }
    });

  } catch (error) {
    console.error("Partner onboard error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   4. AGENT LOGIN
===================================== */
export const agentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const agent = await VaultAgent.findOne({ email })
      .select('+password')
      .populate('role')
      .populate('partnerId', 'companyName status');

    if (!agent) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!agent.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    if (agent.suspendedAt) {
      return res.status(403).json({ success: false, message: `Account suspended. Reason: ${agent.suspensionReason}` });
    }

    if (agent.agentType === 'PartnerAffiliatedAgent' && agent.affiliationStatus !== 'verified') {
      return res.status(403).json({ success: false, message: `Affiliation status: ${agent.affiliationStatus}` });
    }

    agent.lastLoginAt = new Date();
    await agent.save();

    await HistoryService.logSecurityEvent(agent, 'LOGIN', await getUserInfo(req), {
      description: `Agent ${agent.fullName} logged in`,
    });

    const token = createToken(agent);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: agentResponse
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   5. ADMIN VERIFY AGENT
===================================== */
/* =====================================
   5. ADMIN VERIFY AGENT (Auto-verify all documents)
===================================== */
export const verifyAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, action, rejectionReason } = req.body;

    const agent = await VaultAgent.findById(id);

    if (!agent || agent.isDeleted) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const isAdmin = roleDoc.code === '18';
    const isPartner = roleDoc.code === '21';

    // Partner Affiliated Agent Flow
    if (agent.agentType === 'PartnerAffiliatedAgent') {
      if (status === 'verified') {
        agent.affiliationStatus = 'verified';
        agent.affiliationVerifiedBy = req.user._id;
        agent.affiliationVerifiedAt = new Date();
        agent.isActive = true;
        agent.isVerified = true;
      } else {
        agent.affiliationStatus = 'rejected';
        agent.affiliationRejectionReason = rejectionReason;
        agent.isActive = false;
      }
    }
    // Freelance Agent Flow
    else if (agent.agentType === 'FreelanceAgent') {
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: "Admin only" });
      }

      if (action === 'approve_login') {
        // Only approve login, don't verify documents yet
        agent.isActive = true;
        agent.isVerified = false;
        agent.commissionEligible = false;
        
        await HistoryService.logAgentActivity(agent, 'LOGIN_APPROVED', await getUserInfo(req), {
          description: `Admin approved login for agent ${agent.fullName}`,
          metadata: { action: 'approve_login' }
        });
        
      } else if (action === 'verify_profile' || (action === 'verify_all' && status === 'verified')) {
        
        // ✅ AUTO-VERIFY ALL DOCUMENTS WHEN ADMIN VERIFIES PROFILE
        
        // Check if agent has uploaded required documents
        const hasEmiratesId = !!(agent.emiratesId?.number && agent.emiratesId?.frontImageUrl);
        const hasBankDetails = !!(agent.bankDetails?.iban && agent.bankDetails?.beneficiaryName);
        const hasPassport = !!(agent.passport?.number && agent.passport?.imageUrl);
        const hasVisa = !!(agent.visa?.number && agent.visa?.imageUrl);
        
        // Auto-verify Emirates ID if uploaded
        if (hasEmiratesId) {
          agent.emiratesId.verified = true;
          agent.emiratesId.verifiedAt = new Date();
          agent.emiratesId.verifiedBy = req.user._id;
        }
        
        // Auto-verify Passport if uploaded
        if (hasPassport) {
          agent.passport.verified = true;
          agent.passport.verifiedAt = new Date();
        }
        
        // Auto-verify Visa if uploaded
        if (hasVisa) {
          agent.visa.verified = true;
          agent.visa.verifiedAt = new Date();
        }
        
        // Auto-verify Bank Details if uploaded
        if (hasBankDetails) {
          agent.bankDetails.verified = true;
          agent.bankDetails.verifiedAt = new Date();
        }
        
        // Mark agent as verified
        agent.isVerified = true;
        agent.isActive = true;
        agent.verifiedBy = req.user._id;
        agent.verifiedAt = new Date();
        
        // Check if both Emirates ID and Bank Details are uploaded to make commission eligible
        if (hasEmiratesId && hasBankDetails) {
          agent.commissionEligible = true;
          agent.commissionEligibilityReason = "All required documents verified by Admin";
        } else {
          agent.commissionEligible = false;
          agent.commissionEligibilityReason = hasEmiratesId ? "Bank details not uploaded/verified" : "Emirates ID not uploaded/verified";
        }
        
        // Update profile completion percentage
        let completedFields = 0;
        let totalFields = 5;
        if (agent.name.first_name && agent.name.last_name) completedFields++;
        if (agent.phone.number) completedFields++;
        if (agent.email) completedFields++;
        if (hasEmiratesId) completedFields++;
        if (hasBankDetails) completedFields++;
        
        agent.profileCompletionPercentage = Math.round((completedFields / totalFields) * 100);
        agent.isProfileComplete = agent.profileCompletionPercentage === 100;
        
        await HistoryService.logAgentActivity(agent, 'PROFILE_VERIFIED', await getUserInfo(req), {
          description: `Admin verified all documents for agent ${agent.fullName}`,
          metadata: { 
            emiratesIdVerified: hasEmiratesId,
            bankDetailsVerified: hasBankDetails,
            passportVerified: hasPassport,
            visaVerified: hasVisa,
            commissionEligible: agent.commissionEligible,
            profileCompletion: agent.profileCompletionPercentage
          }
        });
      }

      if (status === 'rejected') {
        agent.isActive = false;
        agent.isVerified = false;
        agent.commissionEligible = false;
        agent.rejectionReason = rejectionReason;
        
        await HistoryService.logAgentActivity(agent, 'AGENT_REJECTED', await getUserInfo(req), {
          description: `Admin rejected agent ${agent.fullName}`,
          metadata: { rejectionReason }
        });
      }
    }

    await agent.save();

    // Prepare response with document verification status
    const responseData = {
      _id: agent._id,
      agentType: agent.agentType,
      isActive: agent.isActive,
      isVerified: agent.isVerified,
      affiliationStatus: agent.affiliationStatus,
      commissionEligible: agent.commissionEligible,
      documents: {
        emiratesId: {
          uploaded: !!(agent.emiratesId?.number && agent.emiratesId?.frontImageUrl),
          verified: agent.emiratesId?.verified || false
        },
        passport: {
          uploaded: !!(agent.passport?.number && agent.passport?.imageUrl),
          verified: agent.passport?.verified || false
        },
        visa: {
          uploaded: !!(agent.visa?.number && agent.visa?.imageUrl),
          verified: agent.visa?.verified || false
        },
        bankDetails: {
          uploaded: !!(agent.bankDetails?.iban && agent.bankDetails?.beneficiaryName),
          verified: agent.bankDetails?.verified || false
        }
      },
      profileCompletionPercentage: agent.profileCompletionPercentage
    };

    return res.status(200).json({
      success: true,
      message: action === 'approve_login' 
        ? "Agent login approved successfully" 
        : "Agent verified successfully with all documents",
      data: responseData
    });

  } catch (error) {
    console.error("verifyAgent error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   6. SUSPEND AGENT
===================================== */
export const suspendAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspensionReason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Admin
    if (roleDoc.code === '18') {
      agent.suspendedAt = new Date();
      agent.suspensionReason = suspensionReason || "Suspended by Admin";
      agent.isActive = false;
      await agent.save();

      await HistoryService.logAgentActivity(agent, 'AGENT_SUSPENDED', await getUserInfo(req), {
        description: `Admin suspended agent ${agent.fullName}`,
        notes: suspensionReason
      });

      return res.status(200).json({ success: true, message: "Agent suspended successfully", data: agent });
    }

    // Partner
    if (roleDoc.code === '21') {
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only suspend your own agents" });
      }

      agent.suspendedAt = new Date();
      agent.suspensionReason = suspensionReason || "Suspended by Partner";
      agent.isActive = false;
      await agent.save();

      await HistoryService.logAgentActivity(agent, 'AGENT_SUSPENDED', await getUserInfo(req), {
        description: `Partner suspended agent ${agent.fullName}`,
        notes: suspensionReason
      });

      return res.status(200).json({ success: true, message: "Agent suspended successfully", data: agent });
    }

    return res.status(403).json({ success: false, message: "Access denied" });

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
    if (!agent || agent.isDeleted) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Admin
    if (roleDoc.code === '18') {
      agent.suspendedAt = null;
      agent.suspensionReason = null;
      agent.isActive = true;
      await agent.save();

      await HistoryService.logAgentActivity(agent, 'AGENT_ACTIVATED', await getUserInfo(req), {
        description: `Admin activated agent ${agent.fullName}`,
      });

      return res.status(200).json({ success: true, message: "Agent activated successfully", data: agent });
    }

    // Partner
    if (roleDoc.code === '21') {
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only activate your own agents" });
      }

      agent.suspendedAt = null;
      agent.suspensionReason = null;
      agent.isActive = true;
      await agent.save();

      await HistoryService.logAgentActivity(agent, 'AGENT_ACTIVATED', await getUserInfo(req), {
        description: `Partner activated agent ${agent.fullName}`,
      });

      return res.status(200).json({ success: true, message: "Agent activated successfully", data: agent });
    }

    return res.status(403).json({ success: false, message: "Access denied" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   8. DELETE AGENT (Soft Delete)
===================================== */
export const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id);
    if (!agent || agent.isDeleted) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Admin
    if (roleDoc.code === '18') {
      agent.isDeleted = true;
      agent.deletedAt = new Date();
      agent.isActive = false;
      await agent.save();

      await HistoryService.logAgentActivity(agent, 'AGENT_DELETED', await getUserInfo(req), {
        description: `Admin deleted agent ${agent.fullName}`,
      });

      return res.status(200).json({ success: true, message: "Agent deleted successfully" });
    }

    // Partner
    if (roleDoc.code === '21') {
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only delete your own agents" });
      }

      agent.isDeleted = true;
      agent.deletedAt = new Date();
      agent.isActive = false;
      await agent.save();

      await Partner.findByIdAndUpdate(agent.partnerId, { $inc: { numberOfAgents: -1 } });

      await HistoryService.logAgentActivity(agent, 'AGENT_DELETED', await getUserInfo(req), {
        description: `Partner deleted agent ${agent.fullName}`,
      });

      return res.status(200).json({ success: true, message: "Agent deleted successfully" });
    }

    return res.status(403).json({ success: false, message: "Access denied" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   9. GET ALL AGENTS (Admin only)
===================================== */
export const getAllAgents = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { isActive, search, isVerified } = req.query;

    // ✅ CORRECTED: Only fetch FreelanceAgents
    let query = {
      isDeleted: false,
      agentType: 'FreelanceAgent'  // Only freelance agents, no PartnerAffiliatedAgent at all
    };

    // Optional filters
    if (isActive !== undefined && isActive !== '') query.isActive = isActive === 'true';
    if (isVerified !== undefined && isVerified !== '') query.isVerified = isVerified === 'true';

    // Search functionality
    if (search) {
      query.$or = [
        { 'name.first_name': { $regex: search, $options: 'i' } },
        { 'name.last_name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'phone.number': { $regex: search, $options: 'i' } }
      ];
    }

    const agents = await VaultAgent.find(query)
      .select('-password')
      .populate('role', 'name code')
      .populate('partnerId', 'companyName dbaName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: agents,
      total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
/* =====================================
   10. GET PARTNER'S AGENTS (Partner only)
===================================== */
export const getAgentsByPartner = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '21') {
      return res.status(403).json({ success: false, message: "Access denied. Partner only." });
    }

    const partnerId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { isActive, search } = req.query;

    let query = {
      partnerId,
      agentType: 'PartnerAffiliatedAgent',
      isDeleted: false
    };

    if (isActive !== undefined) query.isActive = isActive === 'true';

    if (search) {
      query.$or = [
        { 'name.first_name': { $regex: search, $options: 'i' } },
        { 'name.last_name': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'phone.number': { $regex: search, $options: 'i' } }
      ];
    }

    const agents = await VaultAgent.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: agents,
      total,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   11. GET AGENT BY ID
===================================== */
export const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id)
      .select('-password')
      .populate('role', 'name code')
      .populate('partnerId', 'companyName status');

    if (!agent || agent.isDeleted) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    return res.status(200).json({ success: true, data: agent });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   12. UPDATE AGENT PROFILE (Self)
===================================== */
export const updateAgentProfile = async (req, res) => {
  try {
    const agentId = req.user._id;
    const agent = await VaultAgent.findOne({ _id: agentId, isDeleted: false });
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const allowedFields = [
      'email', 'profilePic', 'address', 'emergencyContact',
      'languagePreference', 'communicationPreference', 'maritalStatus',
      'numberOfDependents', 'dependents', 'nationality', 'dateOfBirth', 'gender'
    ];

    const blockedFields = ['agentType', 'partnerId', 'affiliationStatus', 'role',
      'isVerified', 'commissionEligible', 'isActive', 'password',
      'freelanceCommission', 'earnings'];

    for (const field of blockedFields) {
      if (req.body[field] !== undefined) {
        return res.status(403).json({ success: false, message: `Field '${field}' cannot be updated by agent` });
      }
    }

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (req.body.emiratesId) {
      const eid = req.body.emiratesId;
      updates['emiratesId.number'] = eid.number ?? agent.emiratesId.number;
      updates['emiratesId.issuanceDate'] = eid.issuanceDate ?? agent.emiratesId.issuanceDate;
      updates['emiratesId.expiryDate'] = eid.expiryDate ?? agent.emiratesId.expiryDate;
      updates['emiratesId.frontImageUrl'] = eid.frontImageUrl ?? agent.emiratesId.frontImageUrl;
      updates['emiratesId.backImageUrl'] = eid.backImageUrl ?? agent.emiratesId.backImageUrl;
    }

    if (req.body.bankDetails) {
      const bd = req.body.bankDetails;
      updates['bankDetails.beneficiaryName'] = bd.beneficiaryName ?? agent.bankDetails.beneficiaryName;
      updates['bankDetails.bankName'] = bd.bankName ?? agent.bankDetails.bankName;
      updates['bankDetails.accountNumber'] = bd.accountNumber ?? agent.bankDetails.accountNumber;
      updates['bankDetails.iban'] = bd.iban ?? agent.bankDetails.iban;
      updates['bankDetails.swiftCode'] = bd.swiftCode ?? agent.bankDetails.swiftCode;
      updates['bankDetails.accountType'] = bd.accountType ?? agent.bankDetails.accountType;
      updates['bankDetails.verified'] = false;
      updates['bankDetails.verifiedAt'] = null;
    }

    if (req.body.passport) {
      const pp = req.body.passport;
      updates['passport.number'] = pp.number ?? agent.passport.number;
      updates['passport.countryOfIssue'] = pp.countryOfIssue ?? agent.passport.countryOfIssue;
      updates['passport.issueDate'] = pp.issueDate ?? agent.passport.issueDate;
      updates['passport.expiryDate'] = pp.expiryDate ?? agent.passport.expiryDate;
      updates['passport.imageUrl'] = pp.imageUrl ?? agent.passport.imageUrl;
      updates['passport.verified'] = false;
    }

    if (req.body.visa) {
      const v = req.body.visa;
      updates['visa.number'] = v.number ?? agent.visa.number;
      updates['visa.residencyStatus'] = v.residencyStatus ?? agent.visa.residencyStatus;
      updates['visa.sponsor'] = v.sponsor ?? agent.visa.sponsor;
      updates['visa.expiryDate'] = v.expiryDate ?? agent.visa.expiryDate;
      updates['visa.imageUrl'] = v.imageUrl ?? agent.visa.imageUrl;
      updates['visa.verified'] = false;
    }

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      agentId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    checkProfileCompleteness(updatedAgent);
    await updatedAgent.save();

    const canEarnCommission = updatedAgent.isVerified && updatedAgent.emiratesId?.verified && updatedAgent.bankDetails?.verified;
    if (updatedAgent.commissionEligible !== canEarnCommission) {
      updatedAgent.commissionEligible = canEarnCommission;
      await updatedAgent.save();
    }

    await HistoryService.logAgentActivity(updatedAgent, 'PROFILE_UPDATED', await getUserInfo(req), {
      description: `Agent ${updatedAgent.fullName} updated their profile`,
      metadata: { updatedFields: Object.keys(updates) }
    });

    return res.status(200).json({ success: true, message: "Profile updated successfully", data: updatedAgent });

  } catch (error) {
    console.error("updateAgentProfile error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   13. CHANGE PASSWORD
===================================== */
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const agentId = req.user._id;

    const agent = await VaultAgent.findById(agentId).select('+password');
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, agent.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Old password is incorrect" });
    }

    agent.password = await bcrypt.hash(newPassword, 10);
    await agent.save();

    await HistoryService.logSecurityEvent(agent, 'PASSWORD_CHANGED', await getUserInfo(req), {
      description: `Agent ${agent.fullName} changed password`,
    });

    return res.status(200).json({ success: true, message: "Password changed successfully" });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   14. GET AGENT DASHBOARD
===================================== */
export const getAgentDashboard = async (req, res) => {
  try {
    const agentId = req.user._id;

    const leads = await Lead.find({ 'sourceInfo.createdById': agentId, isDeleted: false });
    const commissions = await Commission.find({ recipientId: agentId, isDeleted: false });

    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => l.currentStatus === 'Qualified').length;
    const disbursedLeads = leads.filter(l => l.currentStatus === 'Disbursed').length;
    const totalCommissionEarned = commissions.filter(c => c.status === 'Paid').reduce((sum, c) => sum + c.commissionAmount, 0);
    const pendingCommission = commissions.filter(c => ['Confirmed', 'Pending'].includes(c.status)).reduce((sum, c) => sum + c.commissionAmount, 0);

    return res.status(200).json({
      success: true,
      data: {
        leads: {
          total: totalLeads,
          qualified: qualifiedLeads,
          disbursed: disbursedLeads,
          conversionRate: totalLeads > 0 ? (disbursedLeads / totalLeads) * 100 : 0
        },
        commissions: { totalEarned: totalCommissionEarned, pending: pendingCommission },
        recentLeads: leads.slice(0, 5)
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   15. GET AGENT PROFILE
===================================== */
export const getAgentProfile = async (req, res) => {
  try {
    const agent = await VaultAgent.findOne({ _id: req.user._id, isDeleted: false })
      .select('-password')
      .populate('role', 'name code')
      .populate('partnerId', 'companyName status tradeLicenseNumber');

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    return res.status(200).json({ success: true, data: agent });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   16. ADMIN UPDATE AGENT
===================================== */
export const adminUpdateAgent = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const { id } = req.params;
    const agent = await VaultAgent.findOne({ _id: id, isDeleted: false });
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const {
      first_name, last_name, email, nationality, dateOfBirth, gender,
      maritalStatus, numberOfDependents, dependents, address, emergencyContact,
      languagePreference, communicationPreference, profilePic,
      emiratesIdNumber, emiratesIdIssuanceDate, emiratesIdExpiryDate,
      emiratesIdFrontImage, emiratesIdBackImage, emiratesIdVerified,
      beneficiaryName, bankName, accountNumber, iban, swiftCode, accountType, bankVerified,
      passportNumber, passportCountry, passportIssueDate, passportExpiry, passportImage,
      visaNumber, visaResidency, visaSponsor, visaExpiry, visaImage,
      commissionEligible, commissionEligibilityReason,
    } = req.body;

    const updates = {};

    if (first_name) updates['name.first_name'] = first_name;
    if (last_name) updates['name.last_name'] = last_name;
    if (email !== undefined) updates.email = email;
    if (nationality !== undefined) updates.nationality = nationality;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;
    if (gender !== undefined) updates.gender = gender;
    if (maritalStatus !== undefined) updates.maritalStatus = maritalStatus;
    if (numberOfDependents !== undefined) updates.numberOfDependents = numberOfDependents;
    if (dependents !== undefined) updates.dependents = dependents;
    if (address !== undefined) updates.address = address;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (languagePreference !== undefined) updates.languagePreference = languagePreference;
    if (communicationPreference !== undefined) updates.communicationPreference = communicationPreference;
    if (profilePic !== undefined) updates.profilePic = profilePic;

    if (emiratesIdNumber !== undefined) updates['emiratesId.number'] = emiratesIdNumber;
    if (emiratesIdIssuanceDate !== undefined) updates['emiratesId.issuanceDate'] = emiratesIdIssuanceDate;
    if (emiratesIdExpiryDate !== undefined) updates['emiratesId.expiryDate'] = emiratesIdExpiryDate;
    if (emiratesIdFrontImage !== undefined) updates['emiratesId.frontImageUrl'] = emiratesIdFrontImage;
    if (emiratesIdBackImage !== undefined) updates['emiratesId.backImageUrl'] = emiratesIdBackImage;
    if (emiratesIdVerified !== undefined) {
      updates['emiratesId.verified'] = emiratesIdVerified;
      updates['emiratesId.verifiedAt'] = emiratesIdVerified ? new Date() : null;
      updates['emiratesId.verifiedBy'] = emiratesIdVerified ? req.user._id : null;
    }

    if (beneficiaryName !== undefined) updates['bankDetails.beneficiaryName'] = beneficiaryName;
    if (bankName !== undefined) updates['bankDetails.bankName'] = bankName;
    if (accountNumber !== undefined) updates['bankDetails.accountNumber'] = accountNumber;
    if (iban !== undefined) updates['bankDetails.iban'] = iban;
    if (swiftCode !== undefined) updates['bankDetails.swiftCode'] = swiftCode;
    if (accountType !== undefined) updates['bankDetails.accountType'] = accountType;
    if (bankVerified !== undefined) {
      updates['bankDetails.verified'] = bankVerified;
      updates['bankDetails.verifiedAt'] = bankVerified ? new Date() : null;
    }

    if (passportNumber !== undefined) updates['passport.number'] = passportNumber;
    if (passportCountry !== undefined) updates['passport.countryOfIssue'] = passportCountry;
    if (passportIssueDate !== undefined) updates['passport.issueDate'] = passportIssueDate;
    if (passportExpiry !== undefined) updates['passport.expiryDate'] = passportExpiry;
    if (passportImage !== undefined) updates['passport.imageUrl'] = passportImage;

    if (visaNumber !== undefined) updates['visa.number'] = visaNumber;
    if (visaResidency !== undefined) updates['visa.residencyStatus'] = visaResidency;
    if (visaSponsor !== undefined) updates['visa.sponsor'] = visaSponsor;
    if (visaExpiry !== undefined) updates['visa.expiryDate'] = visaExpiry;
    if (visaImage !== undefined) updates['visa.imageUrl'] = visaImage;

    if (commissionEligible !== undefined) {
      updates.commissionEligible = commissionEligible;
      updates.commissionEligibilityReason = commissionEligibilityReason || null;
    }

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    checkProfileCompleteness(updatedAgent);
    await updatedAgent.save();

    await HistoryService.logAgentActivity(updatedAgent, 'PROFILE_UPDATED', await getUserInfo(req), {
      description: `Admin updated agent ${updatedAgent.fullName}'s profile`,
      metadata: { updatedFields: Object.keys(updates) }
    });

    return res.status(200).json({ success: true, message: "Agent updated successfully by Admin", data: updatedAgent });

  } catch (error) {
    console.error("adminUpdateAgent error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   17. PARTNER UPDATE AGENT
===================================== */
export const partnerUpdateAgent = async (req, res) => {
  try {
    const roleDoc = await Role.findById(req.user.role);
    if (!roleDoc || roleDoc.code !== '21') {
      return res.status(403).json({ success: false, message: "Access denied. Partner only." });
    }

    const { id } = req.params;
    const agent = await VaultAgent.findOne({
      _id: id,
      partnerId: req.user._id,
      agentType: 'PartnerAffiliatedAgent',
      isDeleted: false
    });

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found or does not belong to your company" });
    }

    const allowedByPartner = [
      'email', 'profilePic', 'address', 'emergencyContact',
      'languagePreference', 'communicationPreference',
      'maritalStatus', 'numberOfDependents', 'dependents'
    ];

    const updates = {};
    allowedByPartner.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields to update" });
    }

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    await HistoryService.logAgentActivity(updatedAgent, 'PROFILE_UPDATED', await getUserInfo(req), {
      description: `Partner updated affiliated agent ${updatedAgent.fullName}'s profile`,
      metadata: { updatedFields: Object.keys(updates) }
    });

    return res.status(200).json({
      success: true,
      message: "Agent updated successfully",
      data: { _id: updatedAgent._id, name: updatedAgent.name, email: updatedAgent.email, ...updates }
    });

  } catch (error) {
    console.error("partnerUpdateAgent error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};