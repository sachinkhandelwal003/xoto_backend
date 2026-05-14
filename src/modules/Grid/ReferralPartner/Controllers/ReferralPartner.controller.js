const jwt = require("jsonwebtoken");
const GridReferralPartner = require("../Model/ReferralPartner.model.js");
const { Role } = require("../../../../modules/auth/models/role/role.model.js");
const GridLead = require("../../../Grid/Lead/model/gridLead.model.js"); // adjust path

const signToken = (user, roleData) => {
  return jwt.sign(
    {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      type: "gridreferralpartner",
      role: {
        _id: roleData._id || null,
        code: roleData.code || 25,
        name: "GridReferralPartner",
        isSuperAdmin: roleData.isSuperAdmin || false,
      },
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "7d" }
  );
};

const sendTokenResponse = async (user, statusCode, message, res) => {
  try {
    let userRole = await Role.findOne({ name: "GridReferralPartner" });

    if (!userRole) {
      userRole = { _id: null, code: 25, name: "GridReferralPartner", isSuperAdmin: false };
    }

    const token = signToken(user, userRole);

    res.status(statusCode).json({
      status: "success",
      message: message,
      token,
      data: {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          email: user.email,
          role: userRole,
          status: user.status,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Token generation failed" });
  }
};

exports.registerReferralPartner = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, dateOfBirth, password } = req.body;

    if (!firstName || !lastName || !phone || !password) {
      return res.status(400).json({
        status: "fail",
        message: "First name, last name, phone, and password are required",
      });
    }

    const existingUser = await GridReferralPartner.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({ status: "fail", message: "Phone number already registered" });
    }

    const partner = await GridReferralPartner.create({
      firstName,
      lastName,
      phone,
      email,
      dateOfBirth,
      password,
      role: "GridReferralPartner",
      status: "active",
    });

    await sendTokenResponse(partner, 201, "Registration successful! Welcome to Xoto GRID.", res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.loginReferralPartner = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide phone number and password",
      });
    }

    const partner = await GridReferralPartner.findOne({
      phone: phone,
      role: "GridReferralPartner",
    }).select("+password");

    if (!partner || !(await partner.correctPassword(password))) {
      return res.status(401).json({ status: "fail", message: "Invalid phone number or password" });
    }

    if (partner.status !== "active") {
      return res.status(403).json({ status: "fail", message: `Account is ${partner.status}` });
    }

    await sendTokenResponse(partner, 200, "Login successful", res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const partner = await GridReferralPartner.findById(req.user._id).select("-password");
    if (!partner) {
      return res.status(404).json({ status: "fail", message: "Partner not found" });
    }

    const steps = {
      basicInfo:  true,
      idVerified: !!partner.idDocumentUrl,
      bankAdded:  !!(partner.bankDetails?.iban && partner.bankDetails?.accountNumber),
    };
    const completedSteps = Object.values(steps).filter(Boolean).length;
    const completionPercentage = Math.round((completedSteps / Object.keys(steps).length) * 100);

    return res.status(200).json({
      status: "success",
      data: {
        ...partner.toObject(),
        completionPercentage,
        profileCompletionSteps: steps,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

exports.updateBasicInfo = async (req, res) => {
  try {
    const { firstName, lastName, email, dateOfBirth, profilePhotoUrl } = req.body; // ✅ add profilePhotoUrl

    const partner = await GridReferralPartner.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, email, dateOfBirth, profilePhotoUrl }, // ✅ add here too
      { new: true, runValidators: true }
    ).select("-password");

    return res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: partner,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

exports.updateIdDocument = async (req, res) => {
  try {
    const { idDocumentType, idDocumentUrl } = req.body;

    if (!idDocumentType || !idDocumentUrl) {
      return res.status(400).json({
        status: "fail",
        message: "Document type and URL are required",
      });
    }

    if (!["passport", "emirates_id"].includes(idDocumentType)) {
      return res.status(400).json({
        status: "fail",
        message: "idDocumentType must be passport or emirates_id",
      });
    }

    const partner = await GridReferralPartner.findById(req.user._id);
    if (!partner) {
      return res.status(404).json({ status: "fail", message: "Partner not found" });
    }

    partner.idDocumentType = idDocumentType;
    partner.idDocumentUrl  = idDocumentUrl;
    await partner.save();

    return res.status(200).json({
      status: "success",
      message: "ID document uploaded successfully",
      data: {
        idDocumentType:    partner.idDocumentType,
        idDocumentUrl:     partner.idDocumentUrl,
        isPayoutEligible:  partner.isPayoutEligible,
        isProfileComplete: partner.isProfileComplete,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

exports.updateBankDetails = async (req, res) => {
  try {
    const { bankName, accountNumber, iban, accountHolderName } = req.body;

    if (!accountNumber || !iban || !accountHolderName) {
      return res.status(400).json({
        status: "fail",
        message: "Account number, IBAN and account holder name are required",
      });
    }

    const partner = await GridReferralPartner.findById(req.user._id);
    if (!partner) {
      return res.status(404).json({ status: "fail", message: "Partner not found" });
    }

    partner.bankDetails = { bankName, accountNumber, iban, accountHolderName };
    await partner.save();

    return res.status(200).json({
      status: "success",
      message: "Bank details saved successfully",
      data: {
        bankDetails:       partner.bankDetails,
        isPayoutEligible:  partner.isPayoutEligible,
        isProfileComplete: partner.isProfileComplete,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ─── Referral Partner Dashboard ─────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const partnerId = req.user._id; // from protectMulti middleware

    // 1. Partner profile
    const partner = await GridReferralPartner.findById(partnerId).lean();
    if (!partner) {
      return res.status(404).json({ status: "fail", message: "Partner not found" });
    }

    // 2. All leads referred by this partner (not deleted)
    const leads = await GridLead.find({
      referred_by_partner: partnerId,
      is_deleted: false,
    }).lean();

    // ── Stats ────────────────────────────────────────────────────────────
    const activeLeads = leads.filter(
      l => !["completed", "not_proceeding"].includes(l.status)
    );
    const convertedLeads = leads.filter(l => l.status === "completed");
    const totalSubmitted = leads.length;
    const totalConverted = convertedLeads.length;
    const conversionRate = totalSubmitted > 0
      ? `${Math.round((totalConverted / totalSubmitted) * 100)}%`
      : "0%";

    // Commission earned: sum of deal_record.commission_amount
    const commissionEarned = convertedLeads.reduce(
      (sum, l) => sum + (l.deal_record?.commission_amount || 0), 0
    );

    // Profile completion (use the fields from your partner model)
    const idDone   = !!partner.idDocumentUrl;
    const bankDone = !!(
      partner.bankDetails?.iban &&
      partner.bankDetails?.accountNumber
    );
    const profileComplete = partner.isPayoutEligible && partner.isProfileComplete;

    const stats = {
      activeLeads: activeLeads.length,
      submitted: totalSubmitted,
      converted: totalConverted,
      conversionRate,
      commissionEarned,
    };

    // ── Recent Leads (latest 5) ──────────────────────────────────────────
    const recentLeads = leads
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5)
      .map(l => ({
        _id: l._id,
        customerName: l.full_name || l.contact_info?.name?.first_name
          ? `${l.contact_info.name.first_name || ""} ${l.contact_info.name.last_name || ""}`.trim()
          : "Unknown",
        customerPhone: l.contact_info?.mobile?.number || "—",
        requirements: {
          area: l.requirements?.location_preferences?.[0]?.area || "Not specified",
          budget: l.requirements?.budget_min || l.requirements?.budget_max || null,
        },
        status: l.status, // as stored (e.g. "in_discussion", "site_visit_scheduled")
        lastActivity: l.updatedAt,
      }));

    // ── Leaderboard (top referral partners by total earnings) ────────────
    const partnerEarnings = await GridLead.aggregate([
      {
        $match: {
          status: "completed",
          referred_by_partner: { $ne: null },
          is_deleted: false,
        },
      },
      {
        $group: {
          _id: "$referred_by_partner",
          totalEarnings: { $sum: { $ifNull: ["$deal_record.commission_amount", 0] } },
          convertedCount: { $sum: 1 },
        },
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 },
    ]);

    // Get partner details for these IDs
    const topIds = partnerEarnings.map(p => p._id);
    const topPartners = await GridReferralPartner.find({
      _id: { $in: topIds },
    }).lean();

    const partnerMap = {};
    topPartners.forEach(p => {
      partnerMap[p._id.toString()] = p;
    });

    let leaderboard = partnerEarnings.map((entry, idx) => {
      const p = partnerMap[entry._id.toString()];
      if (!p) return null;
      return {
        rank: idx + 1,
        name: `${p.firstName} ${p.lastName}`,
        earnings: entry.totalEarnings,
        conversionRate: "N/A", // could compute if needed
        isCurrentUser: p._id.toString() === partnerId.toString(),
      };
    }).filter(Boolean);

    // Ensure current partner is always present
    const currentInList = leaderboard.some(lb => lb.isCurrentUser);
    if (!currentInList && totalConverted > 0) {
      leaderboard.push({
        rank: leaderboard.length + 1,
        name: `${partner.firstName} ${partner.lastName}`,
        earnings: commissionEarned,
        conversionRate,
        isCurrentUser: true,
      });
    } else if (!currentInList) {
      leaderboard.push({
        rank: leaderboard.length + 1,
        name: `${partner.firstName} ${partner.lastName}`,
        earnings: 0,
        conversionRate: "0%",
        isCurrentUser: true,
      });
    }

    // Monthly rank: find position of current partner in leaderboard
    const monthlyRank = leaderboard.findIndex(lb => lb.isCurrentUser) + 1;

    res.status(200).json({
      status: "success",
      data: {
        partner: {
          firstName: partner.firstName,
          lastName: partner.lastName,
          profileCompletion: {
            percentage: profileComplete ? 100 : (idDone ? 66 : 33),
            basicInfo: true,
            identity: idDone,
            bankDetails: bankDone,
          },
          leaderboard: {
            monthlyRank: monthlyRank || null,
          },
        },
        stats,
        leads: recentLeads,
        leaderboard: leaderboard.slice(0, 5),
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// In ReferralPartner.controller.js
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const partner = await GridReferralPartner.findById(req.user._id).select("+password");
    if (!partner) return res.status(404).json({ message: "Not found" });

    const isCorrect = await partner.correctPassword(oldPassword);
    if (!isCorrect) return res.status(401).json({ message: "Current password is incorrect" });

    partner.password = newPassword;
    await partner.save();

    res.status(200).json({ status: "success", message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const { period = "monthly" } = req.query; // monthly, quarterly, annual, weekly
    const currentPartnerId = req.user._id;

    // Define date range based on period
    const now = new Date();
    let startDate;
    switch (period) {
      case "weekly":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "quarterly":
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case "annual":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case "monthly":
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Aggregate completed leads within period, grouped by referral partner
    const earningsAgg = await GridLead.aggregate([
      {
        $match: {
          status: "completed",
          referred_by_partner: { $ne: null },
          is_deleted: false,
          updatedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$referred_by_partner",
          totalEarnings: { $sum: { $ifNull: ["$deal_record.commission_amount", 0] } },
          convertedCount: { $sum: 1 },
        },
      },
      { $sort: { totalEarnings: -1 } },
    ]);

    // Aggregate total leads submitted (not just completed) in the same period
    const totalLeadsAgg = await GridLead.aggregate([
      {
        $match: {
          referred_by_partner: { $ne: null },
          is_deleted: false,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$referred_by_partner",
          totalLeads: { $sum: 1 },
        },
      },
    ]);

    // Build a map from partner ID to total leads
    const totalLeadsMap = {};
    totalLeadsAgg.forEach(item => {
      totalLeadsMap[item._id.toString()] = item.totalLeads;
    });

    // Get partner details for those who have earnings
    const partnerIds = earningsAgg.map(e => e._id);
    const partners = await GridReferralPartner.find({
      _id: { $in: partnerIds },
    }).lean();

    const partnerMap = {};
    partners.forEach(p => {
      partnerMap[p._id.toString()] = p;
    });

    // Build leaderboard array
    let leaderboard = earningsAgg.map((entry, index) => {
      const p = partnerMap[entry._id.toString()];
      if (!p) return null;
      const totalLeads = totalLeadsMap[entry._id.toString()] || 0;
      const conversionRate = totalLeads > 0
        ? `${Math.round((entry.convertedCount / totalLeads) * 100)}%`
        : "0%";
      return {
        rank: index + 1,
        name: `${p.firstName} ${p.lastName}`,
        earnings: entry.totalEarnings,
        conversionRate,
        isCurrentUser: p._id.toString() === currentPartnerId.toString(),
      };
    }).filter(Boolean);

    // If current partner not in list (maybe zero earnings), add them at the end
    const currentInList = leaderboard.some(lb => lb.isCurrentUser);
    if (!currentInList) {
      // Find current partner's total leads and earnings in period
      const currentEarningsData = earningsAgg.find(
        e => e._id.toString() === currentPartnerId.toString()
      );
      const currentTotalLeads = totalLeadsMap[currentPartnerId.toString()] || 0;
      const currentEarnings = currentEarningsData ? currentEarningsData.totalEarnings : 0;
      const currentConverted = currentEarningsData ? currentEarningsData.convertedCount : 0;
      const currentConversionRate = currentTotalLeads > 0
        ? `${Math.round((currentConverted / currentTotalLeads) * 100)}%`
        : "0%";

      leaderboard.push({
        rank: leaderboard.length + 1,
        name: `${req.user.firstName} ${req.user.lastName}`,
        earnings: currentEarnings,
        conversionRate: currentConversionRate,
        isCurrentUser: true,
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        period,
        leaderboard,
      },
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};