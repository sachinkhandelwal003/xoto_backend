const jwt = require("jsonwebtoken");
const GridReferralPartner = require("../Model/ReferralPartner.model.js");
const { Role } = require("../../../../modules/auth/models/role/role.model.js");

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
    const { firstName, lastName, email, dateOfBirth } = req.body;

    const partner = await GridReferralPartner.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, email, dateOfBirth },
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
