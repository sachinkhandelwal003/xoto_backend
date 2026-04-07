const VaultAgent = require('../models/Agent');
const Partner = require('../models/Partner');
const Lead = require('../models/Lead');
const Commission = require('../models/Commission');
const bcrypt = require('bcryptjs');
const { Role } = require('../../../modules/auth/models/role/role.model');
const { createToken } = require('../../../middleware/auth');

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

/* =====================================
   1. AGENT SELF SIGNUP
===================================== */
const agentSignup = async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone_number, country_code, password,
      maritalStatus, numberOfDependents, dependents, nationality, dateOfBirth, gender
    } = req.body;

    if (!first_name || !last_name || !password || !phone_number) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, password and phone number are required"
      });
    }

    const roleDoc = await Role.findOne({ code: '22' });
    if (!roleDoc) {
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

    const newAgent = await VaultAgent.create({
      name: { first_name, last_name },
      phone: { country_code: country_code || '+971', number: phone_number },
      email: email || null,
      password: hashedPassword,
      role: roleDoc._id,
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
      isVerified: false,
      isPhoneVerified: false,
      isEmailVerified: false
    });

    const agentResponse = newAgent.toObject();
    delete agentResponse.password;

    return res.status(201).json({
      success: true,
      message: "Freelance agent registered successfully. Please complete your profile and wait for admin verification.",
      data: agentResponse
    });

  } catch (error) {
    console.error("Agent signup error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   2. ADMIN ONBOARD FREELANCE AGENT (Direct - No verification needed)
===================================== */
const adminOnboardFreelanceAgent = async (req, res) => {
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
const partnerOnboardAffiliatedAgent = async (req, res) => {
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
const agentLogin = async (req, res) => {
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

    await agent.save();

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
   5. ADMIN VERIFY FREELANCE AGENT
===================================== */
const verifyAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    if (agent.agentType !== 'FreelanceAgent') {
      return res.status(400).json({ success: false, message: "This API is only for Freelance Agents" });
    }

    if (status === 'verified') {
      agent.isVerified = true;
      agent.isActive = true;
      agent.verifiedBy = req.user._id;
      agent.verifiedAt = new Date();
      agent.commissionEligible = true;
      agent.rejectionReason = null;
    } else if (status === 'rejected') {
      agent.isVerified = false;
      agent.isActive = false;
      agent.rejectionReason = rejectionReason || 'Application rejected by admin';
    } else {
      return res.status(400).json({ success: false, message: "Status must be 'verified' or 'rejected'" });
    }

    await agent.save();

    return res.status(200).json({
      success: true,
      message: `Agent ${status} successfully`,
      data: { _id: agent._id, isVerified: agent.isVerified, isActive: agent.isActive, rejectionReason: agent.rejectionReason }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   6. SUSPEND AGENT (Admin or Partner can suspend their own)
===================================== */
const suspendAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspensionReason } = req.body;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);

    // Admin can suspend any agent
    if (roleDoc.code === '18') {
      agent.suspendedAt = new Date();
      agent.suspensionReason = suspensionReason || "Suspended by Admin";
      agent.isActive = false;
      await agent.save();
      return res.status(200).json({ success: true, message: "Agent suspended successfully", data: agent });
    }

    // Partner can suspend only their own affiliated agents
    if (roleDoc.code === '21') {
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only suspend your own agents" });
      }
      agent.suspendedAt = new Date();
      agent.suspensionReason = suspensionReason || "Suspended by Partner";
      agent.isActive = false;
      await agent.save();
      return res.status(200).json({ success: true, message: "Agent suspended successfully", data: agent });
    }

    return res.status(403).json({ success: false, message: "Access denied" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   7. ACTIVATE AGENT (Admin or Partner can activate their own)
===================================== */
const activateAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);

    // Admin can activate any agent
    if (roleDoc.code === '18') {
      agent.suspendedAt = null;
      agent.suspensionReason = null;
      agent.isActive = true;
      await agent.save();
      return res.status(200).json({ success: true, message: "Agent activated successfully", data: agent });
    }

    // Partner can activate only their own affiliated agents
    if (roleDoc.code === '21') {
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only activate your own agents" });
      }
      agent.suspendedAt = null;
      agent.suspensionReason = null;
      agent.isActive = true;
      await agent.save();
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
const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await VaultAgent.findById(id);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);

    if (roleDoc.code === '18') {
      agent.isDeleted = true;
      agent.deletedAt = new Date();
      agent.isActive = false;
      await agent.save();
      return res.status(200).json({ success: true, message: "Agent deleted successfully" });
    }

    if (roleDoc.code === '21') {
      if (agent.partnerId?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "You can only delete your own agents" });
      }
      agent.isDeleted = true;
      agent.deletedAt = new Date();
      agent.isActive = false;
      await agent.save();
      await Partner.findByIdAndUpdate(agent.partnerId, { $inc: { numberOfAgents: -1 } });
      return res.status(200).json({ success: true, message: "Agent deleted successfully" });
    }

    return res.status(403).json({ success: false, message: "Access denied" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   9. GET ALL AGENTS (Admin only - sees only Freelance Agents)
===================================== */
const getAllAgents = async (req, res) => {
  try {
    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);
    
    if (!roleDoc || roleDoc.code !== '18') {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { isActive, search, isVerified } = req.query;

    let query = { isDeleted: false, agentType: 'FreelanceAgent' };
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';
    
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
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await VaultAgent.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: agents,
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
   10. GET PARTNER'S AGENTS (Partner only)
===================================== */
const getAgentsByPartner = async (req, res) => {
  try {
    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);
    
    if (!roleDoc || roleDoc.code !== '21') {
      return res.status(403).json({ success: false, message: "Access denied. Partner only." });
    }

    const partnerId = req.user._id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { isActive, search } = req.query;

    let query = { partnerId: partnerId, agentType: 'PartnerAffiliatedAgent', isDeleted: false };
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
   11. GET AGENT BY ID (Any authenticated user can view their own)
===================================== */
const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user._id;
    const userRole = req.user.role;
    const roleDoc = await Role.findById(userRole);

    const agent = await VaultAgent.findOne({ _id: id, isDeleted: false })
      .select('-password')
      .populate('role', 'name code')
      .populate('partnerId', 'companyName status');

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    // Admin can see any agent
    if (roleDoc.code === '18') {
      return res.status(200).json({ success: true, data: agent });
    }

    // Agent can see their own profile
    if (agent._id.toString() === requestingUserId.toString()) {
      return res.status(200).json({ success: true, data: agent });
    }

    // Partner can see their affiliated agents
    if (roleDoc.code === '21' && agent.partnerId?.toString() === requestingUserId.toString()) {
      return res.status(200).json({ success: true, data: agent });
    }

    return res.status(403).json({ success: false, message: "Access denied" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   12. UPDATE AGENT PROFILE (Self)
===================================== */
const updateAgentProfile = async (req, res) => {
  try {
    const agentId = req.user._id;
    const updateData = req.body;

    const allowedFields = [
      'email', 'profilePic', 'address', 'emergencyContact',
      'languagePreference', 'communicationPreference',
      'emiratesId', 'passport', 'visa', 'bankDetails',
      'maritalStatus', 'numberOfDependents', 'dependents',
      'nationality', 'dateOfBirth', 'gender'
    ];

    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

    const updatedAgent = await VaultAgent.findByIdAndUpdate(
      agentId,
      { ...filteredData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    checkProfileCompleteness(updatedAgent);
    await updatedAgent.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedAgent
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   13. CHANGE PASSWORD
===================================== */
const changePassword = async (req, res) => {
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

    return res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* =====================================
   14. GET AGENT DASHBOARD
===================================== */
const getAgentDashboard = async (req, res) => {
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

module.exports = {
  agentSignup,
  adminOnboardFreelanceAgent,
  partnerOnboardAffiliatedAgent,
  agentLogin,
  verifyAgent,
  suspendAgent,
  activateAgent,
  deleteAgent,
  getAllAgents,
  getAgentsByPartner,
  getAgentById,
  updateAgentProfile,
  changePassword,
  getAgentDashboard
};