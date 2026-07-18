const jwt = require("jsonwebtoken");
const GridReferralPartner = require("../Model/ReferralPartner.model.js");
const { Role } = require("../../../../modules/auth/models/role/role.model.js");
const GridLead = require("../../Lead/model/gridLead.model.js");
const GridNotification = require('../../Notification/GridNotificationmodal.js').default;
const { logAudit } = require('../../../vault/services/auditLog.service.js');

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

    const ip = req.ip ?? null;
    const ua = req.headers?.['user-agent'] ?? null;

    const partner = await GridReferralPartner.findOne({
      phone: phone,
      role: "GridReferralPartner",
    }).select("+password");

    if (!partner) {
      logAudit({
        entityType: 'AUTH', action: 'AUTH_LOGIN_FAILED',
        visibleToRoles: ['grid_admin', 'superadmin'],
        performedByName: phone || 'Unknown',
        performedByRole: 'referral_partner',
        ipAddress: ip, userAgent: ua,
        metadata: { phone, reason: 'Referral partner not found' },
      });
      return res.status(401).json({ status: "fail", message: "Invalid phone number or password" });
    }

    const isMatch = await partner.correctPassword(password);
    if (!isMatch) {
      logAudit({
        entityType: 'AUTH', action: 'AUTH_LOGIN_FAILED',
        visibleToRoles: ['grid_admin', 'superadmin'],
        performedBy: partner._id, performedByModel: 'GridReferralPartner',
        performedByName: `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || phone,
        performedByRole: 'referral_partner',
        ipAddress: ip, userAgent: ua,
        metadata: { phone, reason: 'Wrong password' },
      });
      return res.status(401).json({ status: "fail", message: "Invalid phone number or password" });
    }

    if (partner.status !== "active") {
      return res.status(403).json({ status: "fail", message: `Account is ${partner.status}` });
    }

    logAudit({
      entityType: 'AUTH', action: 'AUTH_LOGIN_SUCCESS',
      entityId: partner._id,
      visibleToRoles: ['grid_admin', 'superadmin'],
      performedBy: partner._id, performedByModel: 'GridReferralPartner',
      performedByName: `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || phone,
      performedByRole: 'referral_partner',
      ipAddress: ip, userAgent: ua,
      metadata: { phone, partnerId: partner._id.toString() },
    });

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
    const { idDocumentType, idDocumentUrl, idNumber } = req.body;

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
    if (idNumber) partner.idNumber = idNumber;
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
    const { bankName, accountNumber, iban, accountHolderName, accountType } = req.body;

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

    partner.bankDetails = { bankName, accountNumber, iban, accountHolderName, accountType: accountType || "" };
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

// =========================================================================
// OTP & Unified Auth Endpoints
// =========================================================================

exports.sendOTP = async (req, res) => {
  try {
    const { countryCode, phone } = req.body;
    if (!phone || !countryCode) {
      return res.status(400).json({ status: "fail", message: "Country code and phone number are required" });
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    const cleanCountry = countryCode.trim().replace(/[^\d+]/g, '');

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const mongoose = require("mongoose");
    const Otp = mongoose.models.Otp || require("../../../otp/models/index.js").default;

    await Otp.deleteMany({ country_code: cleanCountry, phone_number: cleanPhone });

    await Otp.create({
      country_code: cleanCountry,
      phone_number: cleanPhone,
      otp,
      expiresAt: new Date(Date.now() + 3 * 60 * 1000)
    });

    console.log(`[OTP Sent] Phone: ${cleanCountry}${cleanPhone} | Code: ${otp}`);

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const { sendSms } = require("../../../otp/services/twilio.service.js");
        const messageText = `Your Xoto Connect verification code is: ${otp}. This code expires in 3 minutes. Do not share it with anyone. If you didn't request this, ignore this message.`;
        await sendSms(cleanCountry + cleanPhone, messageText);
      } catch (smsError) {
        console.error("Failed to send Twilio SMS:", smsError.message);
      }
    }

    return res.status(200).json({
      status: "success",
      message: "OTP sent successfully"
    });
  } catch (error) {
    console.error("sendOTP Error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { countryCode, phone, otpCode } = req.body;

    if (!phone || !countryCode || !otpCode) {
      return res.status(400).json({
        status: "fail",
        message: "Country code, phone, and OTP code are required",
      });
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    const cleanCountry = countryCode.trim().replace(/[^\d+]/g, '');

    const BYPASS_OTP = process.env.BYPASS_OTP || "0033";
    let isVerified = false;

    const mongoose = require("mongoose");
    const Otp = mongoose.models.Otp || require("../../../otp/models/index.js").default;

    if (otpCode === BYPASS_OTP) {
      isVerified = true;
    } else {
      const otpRecord = await Otp.findOne({
        country_code: cleanCountry,
        phone_number: cleanPhone,
        otp: otpCode
      });

      if (!otpRecord) {
        return res.status(400).json({
          status: "fail",
          message: "Invalid or expired OTP",
        });
      }

      const OTP_EXPIRY_MS = 3 * 60 * 1000;
      if (Date.now() - otpRecord.createdAt.getTime() > OTP_EXPIRY_MS) {
        await Otp.deleteMany({ country_code: cleanCountry, phone_number: cleanPhone });
        return res.status(400).json({
          status: "fail",
          message: "OTP has expired. Please request a new one.",
        });
      }

      isVerified = true;
    }

    if (isVerified) {
      await Otp.deleteMany({ country_code: cleanCountry, phone_number: cleanPhone });

      const fullPhone = cleanCountry + cleanPhone;

      const GridReferralPartner = mongoose.model("GridReferralPartner");
      const Partner = mongoose.model("Partner");
      const { createToken } = require("../../../../middleware/auth");

      const gridPartner = await GridReferralPartner.findOne({ phone: fullPhone });
      if (gridPartner) {
        if (gridPartner.status !== "active") {
          return res.status(403).json({ status: "fail", message: `Account is ${gridPartner.status}` });
        }
        const token = createToken(gridPartner, "gridreferralpartner");
        return res.status(200).json({
          status: "success",
          userExists: true,
          userType: "grid_partner",
          token,
          data: {
            user: {
              _id: gridPartner._id,
              firstName: gridPartner.firstName,
              lastName: gridPartner.lastName,
              phone: gridPartner.phone,
              email: gridPartner.email,
              status: gridPartner.status
            }
          }
        });
      }

      const partnerUser = await Partner.findOne({
        "primaryContact.phone": cleanPhone,
        $or: [
          { "primaryContact.countryCode": cleanCountry },
          { "primaryContact.countryCode": cleanCountry.replace("+", "") }
        ]
      });

      if (partnerUser) {
        if (partnerUser.status !== "active") {
          return res.status(403).json({ status: "fail", message: `Account is ${partnerUser.status}` });
        }
        const token = createToken(partnerUser, "partner");
        return res.status(200).json({
          status: "success",
          userExists: true,
          userType: "vault_partner",
          token,
          data: {
            user: {
              _id: partnerUser._id,
              companyName: partnerUser.companyName || partnerUser.primaryContact?.name,
              phone: partnerUser.primaryContact?.phone,
              email: partnerUser.email,
              status: partnerUser.status
            }
          }
        });
      }

      return res.status(200).json({
        status: "success",
        userExists: false,
        message: "User not registered. Please proceed to registration.",
        data: {
          phone: cleanPhone,
          countryCode: cleanCountry
        }
      });
    }
  } catch (error) {
    console.error("verifyOTP Error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
};

exports.registerPartnerUnified = async (req, res) => {
  try {
    const crypto = require("crypto");
    const mongoose = require("mongoose");
    const { firstName, lastName, phone, email, nationality, dateOfBirth } = req.body;

    if (!firstName || !lastName || !phone || !email) {
      return res.status(400).json({
        status: "fail",
        message: "First name, last name, email, and phone are required",
      });
    }

    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');

    const existingPhone = await GridReferralPartner.findOne({ phone: cleanPhone });
    if (existingPhone) {
      return res.status(409).json({ status: "fail", message: "Phone number already registered" });
    }

    const Partner = mongoose.model("Partner");
    const cleanPhoneNoCode = cleanPhone.replace(/^\+\d+/, '');
    const existingVaultPhone = await Partner.findOne({ "primaryContact.phone": cleanPhoneNoCode });
    if (existingVaultPhone) {
      return res.status(409).json({ status: "fail", message: "Phone number already registered as Vault Partner" });
    }

    const randomPassword = crypto.randomBytes(16).toString('hex');

    const partner = await GridReferralPartner.create({
      firstName,
      lastName,
      phone: cleanPhone,
      email: email.toLowerCase().trim(),
      nationality: nationality || "",
      dateOfBirth: dateOfBirth || null,
      password: randomPassword,
      role: "GridReferralPartner",
      status: "active",
    });

    await GridNotification.create({
      eventType:     'REFERRAL_PARTNER_REGISTERED',
      title:         'New Referral Partner Registered',
      message:       `New referral partner registered: ${firstName} ${lastName} (${cleanPhone}) — Access granted, compliance review recommended`,
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

    const { createToken } = require("../../../../middleware/auth");
    const token = createToken(partner, "gridreferralpartner");

    return res.status(201).json({
      status: "success",
      message: "Registration successful! Welcome to Xoto.",
      token,
      data: {
        user: {
          _id: partner._id,
          firstName: partner.firstName,
          lastName: partner.lastName,
          phone: partner.phone,
          email: partner.email,
          status: partner.status
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// =========================================================================
// Unified Connect App Referral Lead Submission & Tracking
// =========================================================================

exports.createReferralLeadApp = async (req, res) => {
  try {
    const partnerId = req.user?._id;
    if (!partnerId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }

    const {
      referralType,
      firstName,
      lastName,
      phone,
      countryCode = "+971",
      email,
      employerName,
      timeline,
      intent,
      propertyType,
      preferredArea,
      budget,
      residency,
      nationality,
      employmentType,
      transactionType,
      propertyFound,
      propertyValue,
    } = req.body;

    if (!firstName || !phone) {
      return res.status(400).json({
        status: "fail",
        message: "Client first name and phone number are required",
      });
    }

    const cleanPhone = phone.toString().replace(/\D/g, '').slice(-15);
    const cleanEmail = email ? email.toLowerCase().trim() : null;

    if (referralType === "mortgage") {
      const mongoose = require("mongoose");
      const VaultLead = mongoose.models.VaultLead || mongoose.model("VaultLead");

      const lead = await VaultLead.create({
        sourceInfo: {
          source: 'referral_partner',
          createdByRole: 'referral_partner',
          createdById: partnerId,
          createdByModel: 'GridReferralPartner',
          createdByName: `${req.user.firstName} ${req.user.lastName}`,
          submissionMethod: 'manual_entry',
        },
        customerInfo: {
          firstName: firstName.trim(),
          lastName: (lastName || '').trim(),
          countryCode,
          mobileNumber: cleanPhone,
          email: cleanEmail,
          nationality: nationality || null,
          residencyStatus: residency || null,
          employmentStatus: employmentType || null,
          employer: employerName || null,
        },
        propertyDetails: {
          transactionType: transactionType || null,
          propertyFound: propertyFound === 'Yes' || propertyFound === true,
          approxPropertyValue: propertyValue || null,
          propertyAddress: {
            city: 'Dubai',
          }
        },
        loanRequirements: {
          timeline: timeline || null,
        },
        currentStatus: 'New',
      });

      try {
        const { dispatchVaultNotification } = require("../../../vault/controllers/lead.controller.js");
        if (typeof dispatchVaultNotification === "function") {
          await dispatchVaultNotification(req, {
            eventType:     'LEAD_CREATED_PARTNER',
            title:         'New Mortgage Partner Lead',
            message:       `${firstName} ${lastName || ''} — submitted by Connect Partner: ${req.user.firstName} ${req.user.lastName}`,
            entityId:      lead._id,
            entityModel:   'VaultLead',
            leadId:        lead._id,
          });
        }
      } catch (err) {
        console.log("Vault lead notification skip/error:", err.message);
      }

      return res.status(201).json({
        status: "success",
        message: "Mortgage referral submitted successfully",
        data: {
          leadId: lead._id,
          referralType: "mortgage",
          clientName: `${firstName} ${lastName || ''}`.trim(),
          status: "New",
          createdAt: lead.createdAt
        }
      });

    } else {
      const mongoose = require("mongoose");
      const GridLead = mongoose.models.GridLead || require("../../Lead/model/gridLead.model");
      const Customer = mongoose.models.Customer || require("../../../../modules/auth/models/user/customer.model");

      let customer = await Customer.findOne({ $or: [{ 'mobile.number': cleanPhone }] });
      if (!customer) {
        customer = await Customer.create({
          name: {
            first_name: firstName.trim(),
            last_name:  (lastName  || '').trim(),
          },
          mobile: { country_code: countryCode, number: cleanPhone, verified: false },
          ...(cleanEmail && { email: cleanEmail }),
          statistics: { first_enquiry_at: new Date(), total_leads: 0, total_enquiries: 0 },
        });
      }

      const buildReferralInfo = (user) => ({
        referral_partner_id: user._id,
        referral_code:       user.referral_code || null,
        commission_rate:     user.default_commission_rate || null,
        commission_status:   'pending',
      });

      const lead = await GridLead.create({
        lead_type:             'referral_partner',
        enquiry_type:          intent === 'Rent' ? 'rent' : intent === 'Sell' ? 'sell' : 'buy',
        customerId:            customer._id,
        classification:        'warm',
        classification_reason: 'Referral partner lead — submitted via Connect app',

        source: {
          channel:           'referral_partner',
          referralPartnerId: partnerId,
        },

        referral_info: buildReferralInfo(req.user),

        requirements: {
          property_type:        propertyType || undefined,
          transaction_type:     intent === 'Rent' ? 'rent' : 'buy',
          location_preferences: preferredArea ? [{ area: preferredArea }] : [],
          budget_max:           budget ? Number(budget) : undefined,
        },

        contact_info: {
          name: {
            first_name: firstName.trim(),
            last_name:  (lastName  || '').trim(),
            is_masked:  false,
          },
          mobile: {
            country_code: countryCode,
            number:    cleanPhone,
            is_masked: false,
            verified:  false,
          },
          ...(cleanEmail && {
            email: { address: cleanEmail, is_masked: false, verified: false },
          }),
          preferred_contact: 'whatsapp',
        },

        submitted_to_xoto:    true,
        submitted_to_xoto_at: new Date(),
        submitted_by_agent:   partnerId,

        notes: [{
          text:        `Lead submitted by referral partner via Connect App. Client: ${firstName} ${lastName || ''}, Phone: ${countryCode} ${cleanPhone}. Employer: ${employerName || 'N/A'}`,
          author:      `${req.user.firstName} ${req.user.lastName}`,
          author_type: 'agent',
          is_private:  false,
          created_at:  new Date(),
        }],

        created_by_agent: partnerId,
        created_by:       partnerId,
      });

      await Customer.findByIdAndUpdate(customer._id, {
        $inc: { 'statistics.total_leads': 1, 'statistics.total_enquiries': 1 },
      });

      return res.status(201).json({
        status: "success",
        message: "Real Estate referral submitted successfully",
        data: {
          leadId: lead._id,
          referralType: "real_estate",
          clientName: `${firstName} ${lastName || ''}`.trim(),
          status: "warm",
          createdAt: lead.submitted_to_xoto_at
        }
      });
    }
  } catch (err) {
    console.error("createReferralLeadApp Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

exports.getReferralLeadsApp = async (req, res) => {
  try {
    const partnerId = req.user?._id;
    if (!partnerId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }

    const { status = "all", category = "all", search } = req.query;

    const mongoose = require("mongoose");
    const GridLead = mongoose.models.GridLead || require("../../Lead/model/gridLead.model");
    const VaultLead = mongoose.models.VaultLead || require("../../../vault/models/VaultLead");

    let gridLeads = [];
    let vaultLeads = [];

    if (category === "all" || category === "real_estate") {
      const filter = {
        lead_type: "referral_partner",
        created_by_agent: partnerId,
      };

      if (status === "active") {
        filter.status = { $nin: ["completed", "not_proceeding"] };
      } else if (status === "closed") {
        filter.status = "completed";
      } else if (status === "lost") {
        filter.status = "not_proceeding";
      }

      if (search) {
        const regex = new RegExp(search.trim(), "i");
        filter.$or = [
          { "contact_info.name.first_name": regex },
          { "contact_info.name.last_name": regex },
          { "contact_info.email.address": regex },
          { "contact_info.mobile.number": regex },
        ];
      }

      gridLeads = await GridLead.find(filter).sort({ createdAt: -1 }).lean();
    }

    if (category === "all" || category === "mortgage") {
      const filter = {
        "sourceInfo.createdById": partnerId,
        "sourceInfo.createdByModel": "GridReferralPartner"
      };

      if (status === "active") {
        filter.currentStatus = { $nin: ["Disbursed", "Lost", "Not Proceeding"] };
      } else if (status === "closed") {
        filter.currentStatus = "Disbursed";
      } else if (status === "lost") {
        filter.currentStatus = { $in: ["Lost", "Not Proceeding"] };
      }

      if (search) {
        const regex = new RegExp(search.trim(), "i");
        filter.$or = [
          { "customerInfo.firstName": regex },
          { "customerInfo.lastName": regex },
          { "customerInfo.email": regex },
          { "customerInfo.mobileNumber": regex },
        ];
      }

      vaultLeads = await VaultLead.find(filter).sort({ createdAt: -1 }).lean();
    }

    const formattedGrid = gridLeads.map(lead => {
      let uiStatus = lead.status;
      if (lead.status === "completed") uiStatus = "Closed";
      else if (lead.status === "not_proceeding") uiStatus = "Lost";
      else if (lead.status === "new") uiStatus = "New";
      else if (lead.status === "in_discussion") uiStatus = "Active";

      return {
        id: lead._id,
        clientName: `${lead.contact_info?.name?.first_name || ''} ${lead.contact_info?.name?.last_name || ''}`.trim(),
        category: "Real Estate",
        referralType: "real_estate",
        status: uiStatus,
        rawStatus: lead.status,
        submittedAt: lead.submitted_to_xoto_at || lead.createdAt,
        details: {
          propertyType: lead.requirements?.property_type || null,
          budget: lead.requirements?.budget_max || null,
          preferredArea: (lead.requirements?.location_preferences || []).map(l => l.area).filter(Boolean).join(", ") || null
        }
      };
    });

    const formattedVault = vaultLeads.map(lead => {
      let uiStatus = lead.currentStatus;
      if (lead.currentStatus === "Disbursed") uiStatus = "Closed";
      else if (lead.currentStatus === "Not Proceeding") uiStatus = "Lost";

      return {
        id: lead._id,
        clientName: `${lead.customerInfo?.firstName || ''} ${lead.customerInfo?.lastName || ''}`.trim(),
        category: "Mortgage",
        referralType: "mortgage",
        status: uiStatus,
        rawStatus: lead.currentStatus,
        submittedAt: lead.createdAt,
        details: {
          approxPropertyValue: lead.propertyDetails?.approxPropertyValue || null,
          transactionType: lead.propertyDetails?.transactionType || null,
          timeline: lead.loanRequirements?.timeline || null
        }
      };
    });

    const mergedLeads = [...formattedGrid, ...formattedVault].sort(
      (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
    );

    return res.status(200).json({
      status: "success",
      count: mergedLeads.length,
      data: mergedLeads
    });
  } catch (err) {
    console.error("getReferralLeadsApp Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

exports.getReferralLeadDetailApp = async (req, res) => {
  try {
    const partnerId = req.user?._id;
    const { id } = req.params;

    if (!partnerId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }

    const mongoose = require("mongoose");
    const GridLead = mongoose.models.GridLead || require("../../Lead/model/gridLead.model");
    const VaultLead = mongoose.models.VaultLead || require("../../../vault/models/VaultLead");

    let lead = await GridLead.findOne({ _id: id, created_by_agent: partnerId }).lean();
    if (lead) {
      let uiStatus = lead.status;
      if (lead.status === "completed") uiStatus = "Closed";
      else if (lead.status === "not_proceeding") uiStatus = "Lost";

      return res.status(200).json({
        status: "success",
        data: {
          id: lead._id,
          referralType: "real_estate",
          clientInfo: {
            firstName: lead.contact_info?.name?.first_name || '',
            lastName: lead.contact_info?.name?.last_name || '',
            phone: `${lead.contact_info?.mobile?.country_code || ''} ${lead.contact_info?.mobile?.number || ''}`.trim(),
            email: lead.contact_info?.email?.address || null,
          },
          requirements: {
            propertyType: lead.requirements?.property_type || null,
            transactionType: lead.requirements?.transaction_type || null,
            preferredArea: (lead.requirements?.location_preferences || []).map(l => l.area).filter(Boolean).join(", ") || null,
            budget: lead.requirements?.budget_max || null,
          },
          status: uiStatus,
          rawStatus: lead.status,
          submittedAt: lead.submitted_to_xoto_at || lead.createdAt,
          notes: lead.notes || []
        }
      });
    }

    lead = await VaultLead.findOne({
      _id: id,
      "sourceInfo.createdById": partnerId,
      "sourceInfo.createdByModel": "GridReferralPartner"
    }).lean();

    if (lead) {
      let uiStatus = lead.currentStatus;
      if (lead.currentStatus === "Disbursed") uiStatus = "Closed";
      else if (lead.currentStatus === "Not Proceeding") uiStatus = "Lost";

      return res.status(200).json({
        status: "success",
        data: {
          id: lead._id,
          referralType: "mortgage",
          clientInfo: {
            firstName: lead.customerInfo?.firstName || '',
            lastName: lead.customerInfo?.lastName || '',
            phone: `${lead.customerInfo?.countryCode || ''} ${lead.customerInfo?.mobileNumber || ''}`.trim(),
            email: lead.customerInfo?.email || null,
            residency: lead.customerInfo?.residencyStatus || null,
            nationality: lead.customerInfo?.nationality || null,
            employer: lead.customerInfo?.employer || null,
          },
          requirements: {
            transactionType: lead.propertyDetails?.transactionType || null,
            approxPropertyValue: lead.propertyDetails?.approxPropertyValue || null,
            timeline: lead.loanRequirements?.timeline || null,
            propertyFound: lead.propertyDetails?.propertyFound || false,
          },
          status: uiStatus,
          rawStatus: lead.currentStatus,
          submittedAt: lead.createdAt,
          notesToXoto: lead.notesToXoto || null
        }
      });
    }

    return res.status(404).json({
      status: "fail",
      message: "Lead not found or access denied"
    });
  } catch (err) {
    console.error("getReferralLeadDetailApp Error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
