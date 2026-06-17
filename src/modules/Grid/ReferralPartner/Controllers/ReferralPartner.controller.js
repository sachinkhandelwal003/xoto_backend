const jwt = require("jsonwebtoken");
const GridReferralPartner = require("../Model/ReferralPartner.model.js");
const { Role } = require("../../../../modules/auth/models/role/role.model.js");
const GridLead = require("../../Lead/model/gridLead.model.js");
const GridNotification = require('../../Notification/gridnotificationmodal.js').default;

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
  await GridNotification.create({
  eventType:     'REFERRAL_PARTNER_REGISTERED',
  title:         'New Referral Partner Registered',
  message:       `New referral partner registered: ${firstName} ${lastName} (${phone}) — Access granted, compliance review recommended`,
  entityId:      partner._id,
  entityModel:   'GridReferralPartner',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: `${firstName} ${lastName}`,
  createdByRole: 'referral_partner',
});
await GridNotification.create({
  eventType:     'REFERRAL_PARTNER_REGISTERED',
  title:         'Welcome to Xoto GRID! 🎉',
  message:       `Hi ${firstName} ${lastName}, your registration is complete! To unlock commission payouts, please complete your profile by uploading your ID (Passport or Emirates ID) and bank details.`,
  entityId:      partner._id,
  entityModel:   'GridReferralPartner',
  recipientId:   partner._id,
  recipientModel:'GridReferralPartner',
  recipientRole: 'gridreferralpartner', 
  createdByName: 'Xoto System',
  createdByRole: 'system',
}).catch(err => console.error('Partner welcome notification failed:', err.message));
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
    const { firstName, lastName, email, phone, dateOfBirth, profilePhotoUrl } = req.body;

    if (phone) {
      const existingUser = await GridReferralPartner.findOne({ phone, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(409).json({ status: "fail", message: "Phone number already registered by another user" });
      }
    }

    const partner = await GridReferralPartner.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, email, phone, dateOfBirth, profilePhotoUrl },
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

exports.getAllReferralPartners = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    
    const filter = {};
    
    if (status) {
      const allowed = ["active", "inactive", "deactivated", "suspended"];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          status: "fail",
          message: `status must be one of: ${allowed.join(", ")}`,
        });
      }
      filter.status = status;
    }
    
    if (search) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex }
      ];
    }
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    
    const sortAllowed = ["createdAt", "firstName", "lastName", "status"];
    const sortField = sortAllowed.includes(sortBy) ? sortBy : "createdAt";
    const sortDir = sortOrder === "asc" ? 1 : -1;
    
    const [partners, total] = await Promise.all([
      GridReferralPartner.find(filter)
        .select("-password")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      GridReferralPartner.countDocuments(filter)
    ]);
    
    res.status(200).json({
      status: "success",
      results: partners.length,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      },
      data: { partners }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.getReferralPartnerById = async (req, res) => {
  try {
    const partner = await GridReferralPartner.findById(req.params.id)
      .select("-password");
    
    if (!partner) {
      return res.status(404).json({ status: "fail", message: "Partner not found" });
    }
    
    const totalLeads = await GridLead.countDocuments({
      "source.referralPartnerId": partner._id,
      "source.channel": "referral_partner"
    });
    
    const convertedLeads = await GridLead.countDocuments({
      "source.referralPartnerId": partner._id,
      "source.channel": "referral_partner",
      status: "Disbursed"
    });
    
    const commissionEarned = convertedLeads * 500;
    
    res.status(200).json({
      status: "success",
      data: {
        partner: {
          ...partner.toObject(),
          totalLeads,
          convertedLeads,
          commissionEarned
        }
      }
    });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ status: "fail", message: "Invalid partner ID format" });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.suspendReferralPartner = async (req, res) => {
  try {
    const { action, reason } = req.body;
    
    if (!action || !["suspend", "unsuspend"].includes(action)) {
      return res.status(400).json({
        status: "fail",
        message: 'action must be "suspend" or "unsuspend"'
      });
    }
    
    const partner = await GridReferralPartner.findById(req.params.id);
    
    if (!partner) {
      return res.status(404).json({ status: "fail", message: "Partner not found" });
    }
    
    if (partner.status === "deactivated") {
      return res.status(400).json({
        status: "fail",
        message: "Cannot suspend a deactivated partner. Reactivate first."
      });
    }
    
    if (action === "suspend") {
      partner.status = "suspended";
      partner.deactivationReason = reason;
      partner.deactivatedAt = new Date();
    } else if (action === "unsuspend") {
      partner.status = "active";
      partner.deactivationReason = undefined;
      partner.deactivatedAt = undefined;
    }
    
    await partner.save();
    
    res.status(200).json({
      status: "success",
      message: `Partner ${action}ed successfully`,
      data: {
        partner: {
          status: partner.status,
          deactivationReason: partner.deactivationReason,
          deactivatedAt: partner.deactivatedAt
        }
      }
    });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ status: "fail", message: "Invalid partner ID format" });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

exports.getReferralLeaderboard = async (req, res) => {
  try {
    const { period = "all" } = req.query;
    
    console.log('Fetching referral partners...');
    const partners = await GridReferralPartner.find().select("firstName lastName phone email createdAt");
    console.log('Found partners:', partners.length);
    
    const GridLead = require("../../Lead/model/gridLead.model.js");
    
    const startDate = new Date();
    if (period === "weekly" || period === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "monthly" || period === "month") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === "quarterly") {
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (period === "annual") {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      startDate.setFullYear(2020, 0, 1);
    }
    
    console.log('Fetching lead stats...');
    const leadStats = await GridLead.aggregate([
      {
        $match: {
          "source.channel": "referral_partner",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$source.referralPartnerId",
          totalLeads: { $sum: 1 },
          convertedLeads: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }
        }
      }
    ]);
    console.log('Lead stats:', leadStats.length);
    
    const statsMap = new Map(leadStats.map(stat => [String(stat._id), stat]));
    
    const leaderboard = partners.map((partner) => {
      const id = String(partner._id);
      const stats = statsMap.get(id) || { totalLeads: 0, convertedLeads: 0 };
      const conversionRate = stats.totalLeads ? Math.round((stats.convertedLeads / stats.totalLeads * 100)) : 0;
      const commissionEarned = stats.convertedLeads * 500;
      
      // Score = 70% earnings weight + 30% conversion rate weight (PRD: ranked by earnings and conversion rate)
      const score = (commissionEarned * 0.7) + (conversionRate * 100 * 0.3);
      return {
        id: partner._id,
        name: `${partner.firstName} ${partner.lastName}`,
        rank: 1,
        totalLeads: stats.totalLeads,
        conversionRate: conversionRate,
        commissionEarned: commissionEarned,
        score,
        change: "stable",
        changeValue: 0
      };
    }).sort((a, b) => b.score - a.score).map((partner, index) => ({
      ...partner,
      rank: index + 1
    }));
    
    console.log('Leaderboard:', leaderboard.length);
    
    let myRank = null;
    if (req.user?._id) {
      const userId = String(req.user._id);
      const myEntry = leaderboard.find(p => String(p.id) === userId);
      if (myEntry) {
        myRank = {
          rank: myEntry.rank,
          totalLeads: myEntry.totalLeads,
          conversionRate: myEntry.conversionRate,
          commissionEarned: myEntry.commissionEarned
        };
      }
    }
    
    res.status(200).json({
      status: "success",
      data: {
        leaderboard,
        myRank
      }
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ status: "error", message: err.message });
  }
};
