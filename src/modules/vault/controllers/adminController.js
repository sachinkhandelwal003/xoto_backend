const Admin      = require("../models/Admin");
const Client     = require("../models/Client");
const Agent      = require("../models/Agent");
const Partner    = require("../models/Partner");
const Case       = require("../models/Case");
const Lead       = require("../models/Lead");       // was "Referral" — renamed
const Commission = require("../models/Commission");
const Role       = require("../models/Role");
// const Notification = require("../models/Notification.model");
// const AuditLog   = require("../models/AuditLog.model");

const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const VALID_CASE_STATUSES = [
  "Draft",
  "Submitted to Xoto",
  "New",
  "Contacted",
  "Qualified",
  "Collecting Documentation",
  "Bank Application",
  "Pre-Approved",
  "Valuation",
  "FOL Processed",
  "FOL Issued",
  "FOL Signed",
  "Disbursed",
  "Lost",
];

const VALID_LEAD_STATUSES = [
  "New",
  "Contacted",
  "Qualified",
  "Collecting Documentation",
  "Bank Application",
  "Pre-Approved",
  "Valuation",
  "FOL Processed",
  "FOL Issued",
  "FOL Signed",
  "Disbursed",
  "Lost",
];

// ==============================
// 🔐 ADMIN LOGIN
// ==============================
exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    // ✅ Find admin with role populated
    const admin = await Admin.findOne({ email, is_deleted: false }).populate("role");
    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // ✅ bcrypt compare — never plain-text
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // ✅ Update last login
    admin.lastLoginAt = new Date();
    await admin.save();

    // ✅ JWT with env secret
    const token = jwt.sign(
      { id: admin._id, role: { id: admin.role._id, name: admin.role.name, code: admin.role.code } },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "1d" }
    );

    const adminData = admin.toObject();
    delete adminData.password;

    return res.status(200).json({ success: true, message: "Login successful", token, admin: adminData });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ==============================
// 👥 GET ALL CLIENTS
// ==============================
exports.getAllClients = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    const query = { is_deleted: false };

    if (search) {
      query.$or = [
        { "name.first_name": { $regex: search, $options: "i" } },
        { "name.last_name": { $regex: search, $options: "i" } },
        { "phone.number": { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [clients, total] = await Promise.all([
      Client.find(query)
        .populate("createdBy", "name phone email")       // agent or partner who created
        .populate("partnerId", "companyName email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Client.countDocuments(query),
    ]);

    res.json({ success: true, data: clients, total, page: Number(page), limit: Number(limit) });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// ➕ CREATE CLIENT (Admin)
// ==============================
exports.createClient = async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone, nationality,
      residencyStatus, employmentStatus, monthlySalary,
      salarybankName, dateOfBirth, partnerId, agentId,
    } = req.body;

    if (!firstName || !lastName || !email || !phone?.number || !partnerId) {
      return res.status(400).json({ success: false, message: "firstName, lastName, email, phone.number and partnerId are required" });
    }

    // ✅ Check partner exists
    const partner = await Partner.findById(partnerId);
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    // ✅ Get Client role
    const clientRole = await Role.findOne({ name: "Client" });
    if (!clientRole) return res.status(500).json({ success: false, message: "Client role not seeded" });

    const client = await Client.create({
      name: { first_name: firstName, last_name: lastName },
      email,
      phone: { country_code: phone.country_code || "+971", number: phone.number },
      dateOfBirth,
      nationality,
      residencyStatus,
      employmentStatus,
      monthlySalary,
      salarybankName,
      role: clientRole._id,
      createdByType: agentId ? "Agent" : "Partner",
      createdBy: agentId || partnerId,
      partnerId,
    });

    res.status(201).json({ success: true, message: "Client created", data: client });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 👤 GET ALL AGENTS
// ==============================
exports.getAllAgents = async (req, res) => {
  try {
    const { page = 1, limit = 20, agentType, affiliationStatus } = req.query;
    const skip = (page - 1) * limit;

    const query = { is_deleted: false };
    if (agentType) query.agentType = agentType;
    if (affiliationStatus) query.affiliationStatus = affiliationStatus;

    const [agents, total] = await Promise.all([
      Agent.find(query)
        .populate("role", "name code")
        .populate("partnerId", "companyName")
        .select("-password -resetPasswordToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Agent.countDocuments(query),
    ]);

    res.json({ success: true, data: agents, total, page: Number(page), limit: Number(limit) });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.createAgent = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,           // { country_code, number }
      agentType,
      maritalStatus,
      numberOfDependents,
      dependents,
    } = req.body;
 
    // ── Required fields ──────────────────────────────────────────────────────
    if (!firstName || !lastName || !password || !phone?.number) {
      return res.status(400).json({
        success: false,
        message: "firstName, lastName, password, phone.number are required",
      });
    }
 
    // ── Auto-resolve Agent role ──────────────────────────────────────────────
    let agentRole = await Role.findOne({ name: "Agent" });
    if (!agentRole) {
      agentRole = await Role.create({
        name: "Agent",
        code: "agent",
        isVaultRole: true,
      });
    }
 
    // ── Hash password ────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);
 
    // ── Create agent — exact schema structure ────────────────────────────────
    const agent = await Agent.create({
      name: {                              // ✅ schema: name.first_name
        first_name: firstName,
        last_name:  lastName,
      },
      email:    email || null,
      password: hashedPassword,
      phone: {                             // ✅ schema: phone.number
        country_code: phone.country_code || "+971",
        number:       phone.number,
      },
      agentType:          agentType || "FreelanceAgent",  // ✅ valid enum
      maritalStatus:      maritalStatus || null,
      numberOfDependents: numberOfDependents || 0,
      dependents:         dependents || [],
      role:               agentRole._id,
    });
 
    const agentData = agent.toObject();
    delete agentData.password;
 
    return res.status(201).json({
      success: true,
      message: "Agent created",
      data: agentData,
    });
 
  } catch (err) {
    console.error("createAgent error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// ✅ VERIFY AGENT AFFILIATION
// ==============================
exports.verifyAgentAffiliation = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { action } = req.body; // "approve" or "reject"

    const agent = await Agent.findById(agentId);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    if (agent.affiliationStatus !== "pending") {
      return res.status(400).json({ success: false, message: "No pending affiliation for this agent" });
    }

    if (action === "approve") {
      agent.affiliationStatus = "verified";
      agent.agentType = "PartnerAffiliatedAgent";

      // Get Partner-Affiliated role
      const paRole = await Role.findOne({ name: "PartnerAffiliatedAgent" });
      if (paRole) agent.role = paRole._id;

      agent.affiliationVerifiedBy = req.user.id;
      agent.affiliationVerifiedAt = new Date();

      // Notify agent
      await Notification.create({
        recipientType: "Agent",
        recipientId: agent._id,
        type: "AFFILIATION_VERIFIED",
        title: "Affiliation Verified",
        body: "Your partner affiliation has been verified. You now have Partner Agent access.",
        channels: { inApp: { sent: true }, email: { sent: false }, sms: { sent: false } },
      });

    } else if (action === "reject") {
      agent.affiliationStatus = "rejected";

      await Notification.create({
        recipientType: "Agent",
        recipientId: agent._id,
        type: "AFFILIATION_REJECTED",
        title: "Affiliation Rejected",
        body: "Your partner affiliation request was not approved. Please contact Xoto for details.",
        channels: { inApp: { sent: true }, email: { sent: false }, sms: { sent: false } },
      });
    } else {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'" });
    }

    await agent.save();

    // Audit
    await AuditLog.create({
      performedByType: "Admin",
      performedBy: req.user.id,
      action: action === "approve" ? "AFFILIATION_APPROVED" : "AFFILIATION_REJECTED",
      entityType: "Agent",
      entityId: agent._id,
      description: `Admin ${action}d affiliation for agent ${agent._id}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Affiliation ${action}d`, data: agent });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 🔁 GET ALL LEADS (was Referrals)
// ==============================
exports.getAllLeads = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    const query = { is_deleted: false };
    if (status) query.status = status;

    const [leads, total] = await Promise.all([
      Lead.find(query)
        .populate("agentId", "name phone email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Lead.countDocuments(query),
    ]);

    res.json({ success: true, data: leads, total, page: Number(page), limit: Number(limit) });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 🔄 UPDATE LEAD STATUS
// ==============================
exports.updateLeadStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!VALID_LEAD_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const previousStatus = lead.status;
    lead.status = status;

    // ✅ Append to status history
    lead.statusHistory.push({
      status,
      updatedBy: req.user.id,
      updatedAt: new Date(),
      notes: notes || null,
    });

    await lead.save();

    // ✅ Notify agent on key status changes
    if (["Pre-Approved", "FOL Issued", "Disbursed", "Lost"].includes(status)) {
      await Notification.create({
        recipientType: "Agent",
        recipientId: lead.agentId,
        type: "LEAD_STATUS_CHANGED",
        title: `Lead Status Updated: ${status}`,
        body: `Your referral for ${lead.clientName} has moved to: ${status}`,
        relatedEntityType: "Lead",
        relatedEntityId: lead._id,
        channels: { inApp: { sent: true }, email: { sent: false }, sms: { sent: false } },
      });
    }

    // ✅ Commission on Disbursed — mark confirmed by admin
    if (status === "Disbursed") {
      const existing = await Commission.findOne({ sourceId: lead._id, sourceType: "Lead" });
      if (existing) {
        existing.status = "Confirmed";
        existing.confirmedBy = req.user.id;
        existing.confirmedAt = new Date();
        await existing.save();
        lead.commissionId = existing._id;
        await lead.save();
      }
    }

    // Audit
    await AuditLog.create({
      performedByType: "Admin",
      performedBy: req.user.id,
      action: "LEAD_STATUS_UPDATED",
      entityType: "Lead",
      entityId: lead._id,
      changes: { before: { status: previousStatus }, after: { status } },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: "Lead status updated", data: lead });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 📊 DASHBOARD STATS
// ==============================
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalFreelanceAgents,
      totalPartnerAgents,
      totalPartners,
      totalClients,
      totalCases,
      totalLeads,
      disbursedCases,
      disbursedLeads,
      pendingCommissions,
      confirmedCommissions,
      pendingAffiliations,
    ] = await Promise.all([
      Agent.countDocuments({ agentType: "FreelanceAgent", is_deleted: false }),
      Agent.countDocuments({ agentType: "PartnerAffiliatedAgent", is_deleted: false }),
      Partner.countDocuments({ is_deleted: false }),
      Client.countDocuments({ is_deleted: false }),
      Case.countDocuments({ is_deleted: false }),
      Lead.countDocuments({ is_deleted: false }),
      Case.countDocuments({ status: "Disbursed", is_deleted: false }),
      Lead.countDocuments({ status: "Disbursed", is_deleted: false }),
      Commission.countDocuments({ status: "Pending" }),
      Commission.countDocuments({ status: "Confirmed" }),
      Agent.countDocuments({ affiliationStatus: "pending", is_deleted: false }),
    ]);

    res.json({
      success: true,
      data: {
        agents: { freelance: totalFreelanceAgents, partnerAffiliated: totalPartnerAgents },
        totalPartners,
        totalClients,
        totalCases,
        totalLeads,
        disbursed: { cases: disbursedCases, leads: disbursedLeads },
        commissions: { pending: pendingCommissions, confirmed: confirmedCommissions },
        pendingAffiliations,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 📁 GET ALL CASES
// ==============================
exports.getAllCases = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, partnerId } = req.query;
    const skip = (page - 1) * limit;

    const query = { is_deleted: false };
    if (status) query.status = status;
    if (partnerId) query.partnerId = partnerId;

    const [cases, total] = await Promise.all([
      Case.find(query)
        .populate("partnerId", "companyName email phone")
        .populate("agentId", "name phone")
        .populate("clientId", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Case.countDocuments(query),
    ]);

    res.json({ success: true, data: cases, total, page: Number(page), limit: Number(limit) });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 🔄 UPDATE CASE STATUS
// ==============================
exports.updateCaseStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!VALID_CASE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const caseData = await Case.findById(req.params.id)
      .populate("partnerId")
      .populate("agentId");

    if (!caseData) return res.status(404).json({ success: false, message: "Case not found" });

    const previousStatus = caseData.status;

    // ✅ Sequential flow check (Lost is always allowed)
    const currentIndex = VALID_CASE_STATUSES.indexOf(caseData.status);
    const nextIndex    = VALID_CASE_STATUSES.indexOf(status);

    if (status !== "Lost" && nextIndex !== currentIndex + 1) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition from "${caseData.status}" to "${status}"`,
      });
    }

    caseData.status = status;
    caseData.statusHistory.push({
      status,
      updatedByType: "Admin",
      updatedBy: req.user.id,
      updatedAt: new Date(),
      notes: notes || null,
    });

    // ✅ Commission logic on Disbursed — per PRD:
    //    Commission = commissionPercentage × xotoCommissionReceived
    //    NOT a flat % of loan value
    if (status === "Disbursed" && !caseData.commissionId) {
      const propertyValue    = caseData.clientInfo?.propertyValue || 0;
      const isAboveFiveM     = propertyValue > 5000000;
      const partner          = caseData.partnerId;
      const commissionPct    = isAboveFiveM
        ? partner?.commissionTier?.aboveFiveMillion || 80
        : partner?.commissionTier?.upToFiveMillion  || 75;

      // xotoCommissionReceived must be set by admin when bank pays Xoto
      // For now create commission record at Pending — admin confirms amount later
      const commission = await Commission.create({
        recipientType: "Partner",
        recipientId: caseData.partnerId._id,
        sourceType: "Case",
        sourceId: caseData._id,
        clientId: caseData.clientId,
        propertyValue,
        commissionPercentage: commissionPct,
        tierApplied: isAboveFiveM ? "aboveFiveMillion" : "upToFiveMillion",
        status: "Pending",
        notes: "Commission created on Disbursed status. Admin to confirm amount once Xoto receives from bank.",
      });

      caseData.commissionId = commission._id;

      // Notify partner
      await Notification.create({
        recipientType: "Partner",
        recipientId: caseData.partnerId._id,
        type: "PARTNER_COMMISSION_CONFIRMED",
        title: "Case Disbursed — Commission Pending",
        body: `Your case for client has been disbursed. Commission of ${commissionPct}% will be confirmed shortly.`,
        relatedEntityType: "Case",
        relatedEntityId: caseData._id,
        channels: { inApp: { sent: true }, email: { sent: false }, sms: { sent: false } },
      });
    }

    // ✅ Notify partner on every status change
    await Notification.create({
      recipientType: "Partner",
      recipientId: caseData.partnerId._id || caseData.partnerId,
      type: "CASE_STATUS_UPDATED",
      title: `Case Status: ${status}`,
      body: `Your case has moved to "${status}".`,
      relatedEntityType: "Case",
      relatedEntityId: caseData._id,
      channels: { inApp: { sent: true }, email: { sent: false }, sms: { sent: false } },
    });

    await caseData.save();

    // Audit
    await AuditLog.create({
      performedByType: "Admin",
      performedBy: req.user.id,
      action: "CASE_STATUS_UPDATED",
      entityType: "Case",
      entityId: caseData._id,
      changes: { before: { status: previousStatus }, after: { status } },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: "Case status updated", data: caseData });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 💰 CONFIRM COMMISSION
// ==============================
exports.confirmCommission = async (req, res) => {
  try {
    const { xotoCommissionReceived } = req.body;

    if (!xotoCommissionReceived) {
      return res.status(400).json({ success: false, message: "xotoCommissionReceived is required" });
    }

    const commission = await Commission.findById(req.params.id);
    if (!commission) return res.status(404).json({ success: false, message: "Commission not found" });

    commission.xotoCommissionReceived = xotoCommissionReceived;
    commission.commissionAmount = (xotoCommissionReceived * commission.commissionPercentage) / 100;
    commission.status = "Confirmed";
    commission.confirmedBy = req.user.id;
    commission.confirmedAt = new Date();

    await commission.save();

    // Notify recipient
    await Notification.create({
      recipientType: commission.recipientType === "FreelanceAgent" ? "Agent" : "Partner",
      recipientId: commission.recipientId,
      type: commission.recipientType === "FreelanceAgent" ? "COMMISSION_CONFIRMED" : "PARTNER_COMMISSION_CONFIRMED",
      title: "Commission Confirmed",
      body: `Your commission of AED ${commission.commissionAmount.toLocaleString()} has been confirmed.`,
      relatedEntityType: "Commission",
      relatedEntityId: commission._id,
      channels: { inApp: { sent: true }, email: { sent: false }, sms: { sent: false } },
    });

    res.json({ success: true, message: "Commission confirmed", data: commission });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 🏢 GET ALL PARTNERS
// ==============================
exports.getAllPartners = async (req, res) => {
  try {
    const partners = await Partner.find({ is_deleted: false })
      .select("-password -resetPasswordToken")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: partners });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// ➕ CREATE PARTNER (Admin only — offline onboarding per PRD)
// ==============================
exports.createPartner = async (req, res) => {
  try {
    const {
      companyName, tradeLicenseNumber, primaryContact,
      email, phone, password,
      onboardedBy,                          // ← frontend se bhejo (Admin _id)
      commercialAgreementDate,
      commercialAgreementNotes,
    } = req.body;
 
    // ── Required fields check ────────────────────────────────────────────────
    if (!companyName || !tradeLicenseNumber || !email || !password || !primaryContact?.name) {
      return res.status(400).json({
        success: false,
        message: "companyName, tradeLicenseNumber, email, password and primaryContact.name are required",
      });
    }
 
    // ── Duplicate check ──────────────────────────────────────────────────────
    const existing = await Partner.findOne({
      $or: [{ email }, { tradeLicenseNumber }],
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Partner with this email or trade license already exists",
      });
    }
 
    // ── Auto-seed Partner role agar exist nahi karta ─────────────────────────
    let partnerRole = await Role.findOne({ name: "Partner" });
    if (!partnerRole) {
      partnerRole = await Role.create({
        name: "Partner",
        code: "partner",
        isVaultRole: true,
      });
    }
 
    // ── Hash password ────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);
 
    // ── onboardedBy: req.user?.id (with middleware) OR body se ──────────────
    const adminId = req.user?.id || onboardedBy;
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "onboardedBy (Admin ID) is required",
      });
    }
 
    // ── Create partner ───────────────────────────────────────────────────────
    const partner = await Partner.create({
      companyName,
      tradeLicenseNumber,
      primaryContact,
      email,
      phone: phone || {},
      password: hashedPassword,
      role: partnerRole._id,
      onboardedBy: adminId,
      commercialAgreementDate: commercialAgreementDate || null,
      commercialAgreementNotes: commercialAgreementNotes || null,
      isFirstLogin: true,
    });
 
    const partnerData = partner.toObject();
    delete partnerData.password;
 
    return res.status(201).json({
      success: true,
      message: "Partner created",
      data: partnerData,
    });
 
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ==============================
// 🔇 SUSPEND / ACTIVATE AGENT
// ==============================
exports.toggleAgentStatus = async (req, res) => {
  try {
    const { action, reason } = req.body; // action: "suspend" or "activate"

    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    if (action === "suspend") {
      agent.isActive = false;
      agent.suspendedAt = new Date();
      agent.suspendedBy = req.user.id;
      agent.suspensionReason = reason || null;
    } else if (action === "activate") {
      agent.isActive = true;
      agent.suspendedAt = null;
      agent.suspendedBy = null;
      agent.suspensionReason = null;
    } else {
      return res.status(400).json({ success: false, message: "action must be 'suspend' or 'activate'" });
    }

    await agent.save();

    res.json({ success: true, message: `Agent ${action}d`, data: { isActive: agent.isActive } });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};