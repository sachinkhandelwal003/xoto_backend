const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Developer = require("../../Developer/models/developer.model");
const Property  = require("../../../properties/models/property.model");
const { Role }  = require('../../../../modules/auth/models/role/role.model');
const { createToken } = require('../../../../middleware/auth');
const sendEmail = require("../../../../utils/sendEmail");

const normalizeEmail = (email = "") => email.toLowerCase().trim();

const generateTempPassword = () => `Xoto@${Math.floor(1000 + Math.random() * 9000)}`;

const buildDeveloperSnapshot = (developer) => ({
    _id:                         developer._id,
    name:                        developer.name,
    companyName:                 developer.companyName,
    email:                       developer.email,
    phone_number:                developer.phone_number,
    country_code:                developer.country_code,
    role:                        developer.role,
    developerLicenseNumber:      developer.developerLicenseNumber,
    dldNumber:                   developer.dldNumber,
    dldRegistrationNumber:       developer.dldRegistrationNumber,
    primaryContactName:          developer.primaryContactName,
    tradeLicenseDocument:        developer.tradeLicenseDocument,
    applicationStatus:           developer.applicationStatus,
    onboardingStatus:            developer.onboardingStatus,
    onboardingSource:            developer.onboardingSource,
    commercialAgreementStatus:   developer.commercialAgreementStatus,
    accessGranted:               developer.accessGranted,
    accountStatus:               developer.accountStatus,
    isVerifiedByAdmin:           developer.isVerifiedByAdmin,
    createdAt:                   developer.createdAt,
    applicationSubmittedAt:      developer.applicationSubmittedAt,
    onboardingCompletedAt:       developer.onboardingCompletedAt,
});

const sendDeveloperCredentials = async (developer, tempPassword) => {
    try {
        await sendEmail({
            to:      developer.email,
            subject: "Your Xoto GRID Developer Account - Login Credentials",
            html:    developerWelcomeEmail({
                name:         developer.companyName || developer.name,
                email:        developer.email,
                phone_number: developer.phone_number,
                tempPassword,
            }),
        });
    } catch (emailErr) {
        console.error("Developer credentials email failed to send:", emailErr.message);
    }
};

// =========================
// EMAIL TEMPLATE
// =========================
const developerWelcomeEmail = ({ name, email, phone_number, tempPassword }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
    <div style="background: #0f172a; padding: 28px 32px; border-radius: 12px 12px 0 0; text-align: center;">
      <h2 style="color: #fff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">Welcome to Xoto GRID</h2>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Developer Portal Access</p>
    </div>
    <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
      <p style="margin: 0 0 16px; font-size: 15px;">Hi <strong>${name}</strong>,</p>
      <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
        Your developer account has been created on Xoto GRID.
        You can now log in using the credentials below and complete your KYC to get started.
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 140px;">Email</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 500;">${email}</td>
          </tr>
          ${phone_number ? `
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Phone</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 500;">${phone_number}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Password</td>
            <td style="padding: 8px 0;">
              <span style="background: #fef3c7; color: #92400e; font-family: monospace; font-size: 15px; font-weight: 700; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.05em;">
                ${tempPassword}
              </span>
            </td>
          </tr>
        </table>
      </div>
      <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #9a3412; line-height: 1.5;">
          <strong>⚠ Important:</strong> This is a temporary password. Please change it immediately after your first login from your profile settings.
        </p>
      </div>
      <div style="margin-bottom: 24px;">
        <p style="margin: 0 0 10px; font-size: 14px; color: #475569; font-weight: 600;">Next Steps:</p>
        <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
          <li>Log in using the credentials above</li>
          <li>Complete your KYC (Passport, Emirates ID, Trade License)</li>
          <li>Upload your agreement documents</li>
          <li>Wait for admin verification to activate your account</li>
        </ol>
      </div>
      <p style="margin: 0; font-size: 13px; color: #94a3b8;">
        If you have any questions, please contact your account manager.<br/>
        — Xoto GRID Team
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">© Xoto GRID. All rights reserved.</p>
    </div>
  </div>
`;


// =========================
// PUBLIC ROUTES
// =========================

/**
 * @route   POST /api/developer/register
 * @desc    PRD hybrid onboarding: developer submits self-service application, no portal access yet
 */
exports.submitDeveloperApplication = async (req, res) => {
    try {
        const {
            companyName,
            name,
            developerLicenseNumber,
            dldNumber,
            dldRegistrationNumber,
            primaryContactName,
            email,
            phone,
            phone_number,
            country_code,
            tradeLicenseDocument,
            city,
            country,
            address,
            websiteUrl,
            description,
        } = req.body;

        const finalCompanyName = (companyName || name || "").trim();
        const finalEmail = normalizeEmail(email);
        const finalPhone = phone_number || phone || "";
        const finalDldNumber = dldRegistrationNumber || dldNumber || "";

        if (!finalCompanyName || !developerLicenseNumber || !finalDldNumber || !primaryContactName || !finalEmail || !finalPhone) {
            return res.status(400).json({
                success: false,
                message: "companyName, developerLicenseNumber, dldRegistrationNumber, primaryContactName, email, and phone are required"
            });
        }

        if (!tradeLicenseDocument?.url) {
            return res.status(400).json({
                success: false,
                message: "Trade licence upload is required"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(finalEmail)) {
            return res.status(400).json({ success: false, message: "Please provide a valid email address" });
        }

        const existingDeveloper = await Developer.findOne({ email: finalEmail });
        if (existingDeveloper) {
            return res.status(409).json({ success: false, message: "A developer with this email already exists" });
        }

        const developer = await Developer.create({
            name:                      finalCompanyName,
            companyName:               finalCompanyName,
            email:                     finalEmail,
            phone_number:              finalPhone,
            country_code:              country_code || "+971",
            developerLicenseNumber:    developerLicenseNumber.trim(),
            reraNumber:                developerLicenseNumber.trim(),
            dldNumber:                 finalDldNumber.trim(),
            dldRegistrationNumber:     finalDldNumber.trim(),
            primaryContactName:        primaryContactName.trim(),
            authorizedPersonName:      primaryContactName.trim(),
            tradeLicenseDocument: {
                name:       tradeLicenseDocument.name || "Trade licence",
                url:        tradeLicenseDocument.url,
                uploadedAt: new Date(),
            },
            city:                      city || "",
            country:                   country || "",
            address:                   address || "",
            websiteUrl:                websiteUrl || "",
            description:               description || "",
            onboardingSource:          "self_service",
            applicationStatus:         "pending_review",
            applicationSubmittedAt:    new Date(),
            onboardingStatus:          "application_submitted",
            commercialAgreementStatus: "not_started",
            accountStatus:             "pending",
            accessGranted:             false,
            isVerifiedByAdmin:         false,
            kycStatus:                 "not_submitted",
        });

        return res.status(201).json({
            success: true,
            message: "Developer application submitted successfully. Xoto admin will review it before access is granted.",
            data: buildDeveloperSnapshot(developer)
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({ success: false, message: `A developer with this ${field} already exists` });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/create-developer
 * @desc    Admin creates a developer account — sends login credentials via email
 */
exports.createDeveloper = async (req, res) => {
    try {
        const {
            name, companyName, email, phone_number, phone, country_code,
            city, country, address, reraNumber, developerLicenseNumber,
            dldNumber, dldRegistrationNumber, primaryContactName,
            tradeLicenseDocument, description, websiteUrl,
        } = req.body;

        const finalCompanyName = (companyName || name || "").trim();
        const finalEmail = normalizeEmail(email || req.body.email || req.body.officialEmailId || "");
        const finalPhone = (phone_number || phone || req.body.mobile || req.body.mobile_number || "").trim();
        const finalDeveloperLicenseNumber = (developerLicenseNumber || reraNumber || req.body.rera_number || req.body.developer_license_number || "").trim();
        const finalDldNumber = (dldRegistrationNumber || dldNumber || req.body.dld_registration_number || req.body.dld_number || "").trim();
        const finalPrimaryContactName = (primaryContactName || req.body.primary_contact_name || req.body.contactName || req.body.primaryContact || req.body.authorizedPersonName || "").trim();

        const missingFields = [];
        if (!finalCompanyName) missingFields.push("companyName/name");
        if (!finalEmail) missingFields.push("email");
        if (!finalDeveloperLicenseNumber) missingFields.push("developerLicenseNumber/reraNumber");
        if (!finalPrimaryContactName) missingFields.push("primaryContactName/authorizedPersonName");
        if (!finalPhone) missingFields.push("phone_number/phone");

        if (missingFields.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(", ")}`
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(finalEmail)) {
            return res.status(400).json({ success: false, message: "Please provide a valid email address" });
        }

        const existingDeveloper = await Developer.findOne({ email: finalEmail });
        if (existingDeveloper) {
            return res.status(409).json({ success: false, message: "A developer with this email already exists" });
        }

        const roleDoc = await Role.findOne({ code: 17 });
        if (!roleDoc) {
            return res.status(404).json({ success: false, message: "Role configuration not found. Please contact system admin." });
        }

        const tempPassword   = generateTempPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        const now = new Date();

        const developer = await Developer.create({
            name:                           finalCompanyName,
            companyName:                    finalCompanyName,
            email:                          finalEmail,
            password:                       hashedPassword,
            phone_number:                   finalPhone,
            country_code:                   country_code || "+971",
            role:                           roleDoc._id,
            city:                           city || "",
            country:                        country || "",
            address:                        address || "",
            reraNumber:                     finalDeveloperLicenseNumber.trim(),
            developerLicenseNumber:         finalDeveloperLicenseNumber.trim(),
            dldNumber:                      finalDldNumber.trim(),
            dldRegistrationNumber:          finalDldNumber.trim(),
            primaryContactName:             finalPrimaryContactName.trim(),
            authorizedPersonName:           finalPrimaryContactName.trim(),
            tradeLicenseDocument:           tradeLicenseDocument?.url ? {
                name:       tradeLicenseDocument.name || "Trade licence",
                url:        tradeLicenseDocument.url,
                uploadedAt: now,
            } : undefined,
            description:                    description || "",
            websiteUrl:                     websiteUrl || "",
            onboardingSource:               "admin_created",
            applicationStatus:              "approved",
            applicationReviewedAt:          now,
            applicationReviewedBy:          req.user?._id || null,
            commercialAgreementStatus:      "completed",
            commercialAgreementCompletedAt: now,
            commercialAgreementCompletedBy: req.user?._id || null,
            accessGranted:                  true,
            accessGrantedAt:                now,
            accessGrantedBy:                req.user?._id || null,
            accountStatus:                  "active",
            onboardingStatus:               "completed",
            onboardingCompletedAt:          now,
            isVerifiedByAdmin:              true,
            kycStatus:                      "approved",
        });

        try {
            await sendEmail({
                to:      developer.email,
                subject: "Your Xoto GRID Developer Account — Login Credentials",
                html:    developerWelcomeEmail({
                    name:         developer.name,
                    email:        developer.email,
                    phone_number: developer.phone_number,
                    tempPassword,
                }),
            });
        } catch (emailErr) {
            console.error("Welcome email failed to send:", emailErr.message);
        }

        return res.status(201).json({
            success: true,
            message: `Developer account created successfully after offline agreement. Login credentials sent to ${developer.email}.`,
            data: buildDeveloperSnapshot(developer)
        });

    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({ success: false, message: `A developer with this ${field} already exists` });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/login-developer
 * @desc    Developer login
 */
exports.loginDeveloper = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password required" });
        }

        const developer = await Developer.findOne({ email: normalizeEmail(email) })
            .select("+password")
            .populate({ path: "role", model: Role });

        if (!developer) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (!developer.accessGranted || developer.accountStatus !== "active") {
            return res.status(403).json({
                success: false,
                message: "Developer portal access is not granted yet. Xoto admin approval and offline commercial agreement completion are required.",
                data: {
                    applicationStatus:         developer.applicationStatus,
                    onboardingStatus:          developer.onboardingStatus,
                    commercialAgreementStatus: developer.commercialAgreementStatus,
                    accountStatus:             developer.accountStatus,
                    accessGranted:             developer.accessGranted,
                }
            });
        }

        const isMatch = await bcrypt.compare(password, developer.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const token = createToken(developer);
        const developerResponse = developer.toObject();
        delete developerResponse.password;

        return res.status(200).json({
            success: true,
            message: "Developer login successful",
            token,
            data: developerResponse,
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};


// =========================
// DEVELOPER ROUTES (AUTHENTICATED)
// =========================

/**
 * @route   GET /api/developer/me
 */
exports.getMyProfile = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }
        return res.status(200).json({ success: true, data: developer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/profile
 */
exports.updateMyProfile = async (req, res) => {
    try {
        const allowedUpdates = [
            'name', 'phone_number', 'country_code', 'logo', 'description',
            'websiteUrl', 'country', 'city', 'address', 'reraNumber',
            'operatingYears', 'authorizedPersonName', 'officialEmailId', 'selectedPlan'
        ];

        const updateData = {};
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        });

        const developer = await Developer.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        );

        return res.status(200).json({ success: true, message: "Profile updated successfully", data: developer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/kyc/submit
 */
exports.submitKYC = async (req, res) => {
    try {
        const { kycDocuments } = req.body;

        if (!kycDocuments || kycDocuments.length === 0) {
            return res.status(400).json({ success: false, message: "Please upload at least one KYC document" });
        }

        const developer = await Developer.findById(req.user._id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        const hasRequiredDocs = ['passport', 'emirates_id', 'trade_license'].every(
            requiredType => kycDocuments.some(doc => doc.type === requiredType)
        );

        if (!hasRequiredDocs) {
            return res.status(400).json({ success: false, message: "Please upload passport, emirates_id, and trade_license" });
        }

        developer.kycDocuments     = kycDocuments;
        developer.kycStatus        = 'pending';
        developer.onboardingStatus = 'kyc_submitted';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "KYC submitted successfully. Waiting for admin approval.",
            data: developer
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   GET /api/developer/kyc/status
 */
exports.getKYCStatus = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id).select(
            'kycStatus kycRejectionReason onboardingStatus accountStatus'
        );

        return res.status(200).json({
            success: true,
            data: {
                kycStatus:          developer.kycStatus,
                kycRejectionReason: developer.kycRejectionReason,
                onboardingStatus:   developer.onboardingStatus,
                accountStatus:      developer.accountStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/agreement/upload
 */
exports.uploadAgreement = async (req, res) => {
    try {
        const { agreementDocuments } = req.body;

        if (!agreementDocuments || agreementDocuments.length === 0) {
            return res.status(400).json({ success: false, message: "Please upload at least one agreement document" });
        }

        const developer = await Developer.findById(req.user._id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (developer.kycStatus !== 'approved') {
            return res.status(400).json({
                success: false,
                message: "Please complete KYC approval first. Current status: " + developer.kycStatus
            });
        }

        const docsWithUploader = agreementDocuments.map(doc => ({
            ...doc,
            uploadedBy: 'developer',
            uploadedAt: new Date()
        }));

        developer.agreementDocuments = docsWithUploader;
        developer.agreementSigned    = true;
        developer.agreementSignedAt  = new Date();
        developer.agreementStatus    = 'pending_review';
        developer.onboardingStatus   = 'agreement_pending';
        developer.accountStatus      = 'pending';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Agreement uploaded successfully. Waiting for admin verification.",
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementStatus:    developer.agreementStatus,
                onboardingStatus:   developer.onboardingStatus,
                accountStatus:      developer.accountStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   GET /api/developer/agreement
 */
exports.getAgreement = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id).select(
            'agreementDocuments agreementSigned agreementSignedAt agreementStatus onboardingStatus accountStatus'
        );

        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        return res.status(200).json({
            success: true,
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementSigned:    developer.agreementSigned,
                agreementSignedAt:  developer.agreementSignedAt,
                agreementStatus:    developer.agreementStatus,
                onboardingStatus:   developer.onboardingStatus,
                accountStatus:      developer.accountStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};


// =========================
// ADMIN ROUTES
// =========================

/**
 * @route   PUT /api/developer/admin/review-application/:id
 * @desc    Admin approves/rejects a self-service developer application
 */
exports.reviewDeveloperApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejectionReason, commercialAgreementCompleted } = req.body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Action must be 'approve' or 'reject'" });
        }

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        const now = new Date();
        developer.applicationReviewedAt = now;
        developer.applicationReviewedBy = req.user?._id || null;

        if (action === 'reject') {
            developer.applicationStatus = 'rejected';
            developer.applicationRejectionReason = rejectionReason || "Developer application rejected by admin";
            developer.onboardingStatus = 'rejected';
            developer.accountStatus = 'rejected';
            developer.accessGranted = false;
            developer.isVerifiedByAdmin = false;

            await developer.save();

            return res.status(200).json({
                success: true,
                message: "Developer application rejected successfully",
                data: buildDeveloperSnapshot(developer)
            });
        }

        developer.applicationStatus = 'approved';
        developer.applicationRejectionReason = "";
        developer.isVerifiedByAdmin = true;

        if (commercialAgreementCompleted === true) {
            const tempPassword = generateTempPassword();
            developer.password = await bcrypt.hash(tempPassword, 10);
            developer.commercialAgreementStatus = 'completed';
            developer.commercialAgreementCompletedAt = now;
            developer.commercialAgreementCompletedBy = req.user?._id || null;
            developer.accessGranted = true;
            developer.accessGrantedAt = now;
            developer.accessGrantedBy = req.user?._id || null;
            developer.accountStatus = 'active';
            developer.onboardingStatus = 'completed';
            developer.onboardingCompletedAt = now;
            developer.kycStatus = 'approved';

            await developer.save();
            await sendDeveloperCredentials(developer, tempPassword);

            return res.status(200).json({
                success: true,
                message: `Developer application approved and access granted. Login credentials sent to ${developer.email}.`,
                data: buildDeveloperSnapshot(developer)
            });
        }

        developer.commercialAgreementStatus = 'pending';
        developer.onboardingStatus = 'commercial_agreement_pending';
        developer.accountStatus = 'pending';
        developer.accessGranted = false;

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Developer application approved. Complete the offline commercial agreement before granting access.",
            data: buildDeveloperSnapshot(developer)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/grant-access/:id
 * @desc    Marks offline commercial agreement complete and grants developer portal access
 */
exports.grantDeveloperAccess = async (req, res) => {
    try {
        const { id } = req.params;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (developer.applicationStatus !== 'approved') {
            return res.status(400).json({ success: false, message: "Developer application must be approved before access can be granted" });
        }

        const roleDoc = await Role.findOne({ code: 17 });
        if (!roleDoc) {
            return res.status(404).json({ success: false, message: "Role configuration not found. Please contact system admin." });
        }

        const now = new Date();
        const tempPassword = generateTempPassword();

        developer.role = developer.role || roleDoc._id;
        developer.password = await bcrypt.hash(tempPassword, 10);
        developer.commercialAgreementStatus = 'completed';
        developer.commercialAgreementCompletedAt = now;
        developer.commercialAgreementCompletedBy = req.user?._id || null;
        developer.accessGranted = true;
        developer.accessGrantedAt = now;
        developer.accessGrantedBy = req.user?._id || null;
        developer.accountStatus = 'active';
        developer.onboardingStatus = 'completed';
        developer.onboardingCompletedAt = now;
        developer.isVerifiedByAdmin = true;
        developer.kycStatus = 'approved';

        await developer.save();
        await sendDeveloperCredentials(developer, tempPassword);

        return res.status(200).json({
            success: true,
            message: `Commercial agreement completed and developer access granted. Login credentials sent to ${developer.email}.`,
            data: buildDeveloperSnapshot(developer)
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   GET /api/developer/get-all-developers
 */
exports.getAllDevelopers = async (req, res) => {
    try {
        const page  = Number(req.query.page)  || 1;
        const limit = Number(req.query.limit) || 10;
        const skip  = (page - 1) * limit;

        const search           = req.query.search || "";
        const status           = req.query.status;
        const onboardingStatus = req.query.onboardingStatus;
        const kycStatus        = req.query.kycStatus;
        const applicationStatus = req.query.applicationStatus;

        let query = {};

        if (search) {
            query.$or = [
                { name:         { $regex: search, $options: "i" } },
                { email:        { $regex: search, $options: "i" } },
                { phone_number: { $regex: search, $options: "i" } }
            ];
        }

        if (status)           query.accountStatus    = status;
        if (onboardingStatus) query.onboardingStatus = onboardingStatus;
        if (kycStatus)        query.kycStatus        = kycStatus;
        if (applicationStatus) query.applicationStatus = applicationStatus;

        const total = await Developer.countDocuments(query);

        const [active, pending, suspended] = await Promise.all([
            Developer.countDocuments({ accountStatus: 'active' }),
            Developer.countDocuments({ accountStatus: 'pending' }),
            Developer.countDocuments({ accountStatus: 'suspended' }),
        ]);

        const developers = await Developer.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-password');

        return res.status(200).json({
            success: true,
            message: "Developers fetched successfully",
            data:    developers,
            count:   developers.length,
            pagination: {
                totalPages:  Math.ceil(total / limit),
                currentPage: page,
                totalItems:  total,
                limit,
                active,
                pending,
                suspended
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   GET /api/developer/get-developer-by-id
 */
exports.getDeveloperrById = async (req, res) => {
    try {
        const id        = req.query.id;
        const developer = await Developer.findOne({ _id: id });
        return res.status(200).json({ success: true, message: "Developer fetched", data: developer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   GET /api/developer/admin/stats
 */
exports.getDeveloperStats = async (req, res) => {
    try {
        const stats = {
            total:                      await Developer.countDocuments(),
            pending:                    await Developer.countDocuments({ accountStatus: 'pending' }),
            active:                     await Developer.countDocuments({ accountStatus: 'active' }),
            suspended:                  await Developer.countDocuments({ accountStatus: 'suspended' }),
            applicationsPending:        await Developer.countDocuments({ applicationStatus: 'pending_review' }),
            applicationsApproved:       await Developer.countDocuments({ applicationStatus: 'approved' }),
            applicationsRejected:       await Developer.countDocuments({ applicationStatus: 'rejected' }),
            kycNotSubmitted:            await Developer.countDocuments({ kycStatus: 'not_submitted' }),
            kycPending:                 await Developer.countDocuments({ kycStatus: 'pending' }),
            kycApproved:                await Developer.countDocuments({ kycStatus: 'approved' }),
            kycRejected:                await Developer.countDocuments({ kycStatus: 'rejected' }),
            onboardingNew:              await Developer.countDocuments({ onboardingStatus: 'new' }),
            onboardingApplicationSubmitted: await Developer.countDocuments({ onboardingStatus: 'application_submitted' }),
            onboardingCommercialAgreementPending: await Developer.countDocuments({ onboardingStatus: 'commercial_agreement_pending' }),
            onboardingKycSubmitted:     await Developer.countDocuments({ onboardingStatus: 'kyc_submitted' }),
            onboardingAgreementPending: await Developer.countDocuments({ onboardingStatus: 'agreement_pending' }),
            onboardingCompleted:        await Developer.countDocuments({ onboardingStatus: 'completed' }),
            avgTAT: await Developer.aggregate([
                { $match: { tatDays: { $gt: 0 } } },
                { $group: { _id: null, avg: { $avg: "$tatDays" } } }
            ])
        };

        return res.status(200).json({ success: true, data: stats });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/review-kyc/:id
 */
exports.reviewKYC = async (req, res) => {
    try {
        const { id }                      = req.params;
        const { action, rejectionReason } = req.body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: "Action must be 'approve' or 'reject'" });
        }

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (action === 'approve') {
            developer.kycStatus          = 'approved';
            developer.isVerifiedByAdmin  = true;
            developer.onboardingStatus   = 'agreement_pending';
            developer.kycRejectionReason = "";
        } else {
            developer.kycStatus          = 'rejected';
            developer.isVerifiedByAdmin  = false;
            developer.kycRejectionReason = rejectionReason || "KYC rejected by admin";
            developer.onboardingStatus   = 'new';
        }

        developer.kycReviewedBy = req.user._id;
        developer.kycReviewedAt = new Date();

        await developer.save();

        return res.status(200).json({ success: true, message: `KYC ${action}d successfully`, data: developer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/upload-agreement/:id
 */
exports.adminUploadAgreement = async (req, res) => {
    try {
        const { id }                 = req.params;
        const { agreementDocuments } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (developer.kycStatus !== 'approved') {
            return res.status(400).json({ success: false, message: "KYC must be approved first" });
        }

        const docsWithUploader = agreementDocuments.map(doc => ({
            ...doc,
            uploadedBy: 'admin',
            uploadedAt: new Date()
        }));

        developer.agreementDocuments = docsWithUploader;
        developer.agreementSigned    = true;
        developer.agreementSignedAt  = new Date();
        developer.agreementStatus    = 'pending_review';
        developer.onboardingStatus   = 'agreement_pending';
        developer.accountStatus      = 'pending';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Agreement uploaded. Waiting for admin verification.",
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementStatus:    developer.agreementStatus,
                onboardingStatus:   developer.onboardingStatus,
                accountStatus:      developer.accountStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/verify-agreement/:id
 */
exports.verifyAgreement = async (req, res) => {
    try {
        const { id }      = req.params;
        const { remarks } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (!developer.agreementSigned) {
            return res.status(400).json({ success: false, message: "No agreement uploaded yet" });
        }

        developer.agreementStatus         = 'verified';
        developer.agreementVerified       = true;
        developer.agreementVerifiedAt     = new Date();
        developer.agreementVerifiedBy     = req.user._id;
        developer.agreementRemarks        = remarks || "Agreement verified successfully";
        developer.agreementLastReviewedAt = new Date();
        developer.agreementLastReviewedBy = req.user._id;
        developer.onboardingStatus        = 'completed';
        developer.onboardingCompletedAt   = new Date();
        developer.accountStatus           = 'active';
        developer.isVerifiedByAdmin       = true;

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Agreement verified successfully. Account activated!",
            data: {
                agreementStatus:     developer.agreementStatus,
                agreementVerified:   developer.agreementVerified,
                agreementVerifiedAt: developer.agreementVerifiedAt,
                onboardingStatus:    developer.onboardingStatus,
                accountStatus:       developer.accountStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/admin/request-changes/:id
 */
exports.requestAgreementChanges = async (req, res) => {
    try {
        const { id }               = req.params;
        const { message, remarks } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: "Please provide feedback message for developer" });
        }

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (!developer.agreementSigned) {
            return res.status(400).json({ success: false, message: "No agreement uploaded yet" });
        }

        developer.agreementFeedback = {
            message,
            remarks:     remarks || "",
            requestedAt: new Date(),
            requestedBy: req.user._id
        };

        developer.agreementStatus    = 'changes_requested';
        developer.agreementVerified  = false;
        developer.agreementSigned    = false;
        developer.agreementDocuments = [];
        developer.onboardingStatus   = 'agreement_pending';
        developer.accountStatus      = 'pending';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Changes requested. Developer notified to re-upload agreement.",
            data: {
                feedback:         developer.agreementFeedback,
                agreementStatus:  developer.agreementStatus,
                onboardingStatus: developer.onboardingStatus,
                accountStatus:    developer.accountStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/approve-plan/:id
 */
exports.approvePlan = async (req, res) => {
    try {
        const { id }                       = req.params;
        const { paymentStatus, invoiceUrl } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (!developer.requestedPlan) {
            return res.status(400).json({ success: false, message: "No plan requested by developer" });
        }

        let price = 0;
        if (developer.requestedPlan === 'basic')   price = 500;
        if (developer.requestedPlan === 'premium')  price = 1500;

        developer.engagementPlan = {
            type:          developer.requestedPlan,
            price,
            startDate:     new Date(),
            endDate:       new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            paymentStatus: paymentStatus || 'unpaid',
            paymentDate:   paymentStatus === 'paid' ? new Date() : null,
            invoiceUrl:    invoiceUrl || "",
        };

        developer.planRequestStatus = 'approved';
        await developer.save();

        return res.status(200).json({
            success: true,
            message: `Plan ${developer.requestedPlan} activated successfully`,
            data: {
                engagementPlan:    developer.engagementPlan,
                planRequestStatus: developer.planRequestStatus
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/set-plan/:id
 */
exports.setEngagementPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, price, startDate, endDate, paymentStatus, invoiceUrl } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        if (developer.onboardingStatus !== 'completed') {
            return res.status(400).json({ success: false, message: "Developer must complete onboarding first" });
        }

        developer.engagementPlan = {
            type, price, startDate, endDate,
            paymentStatus,
            paymentDate: paymentStatus === 'paid' ? new Date() : null,
            invoiceUrl:  invoiceUrl || ""
        };

        await developer.save();

        return res.status(200).json({ success: true, message: "Engagement plan set successfully", data: developer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   GET /api/developer/admin/:id  (param version)
 */
exports.getDeveloperById = async (req, res) => {
    try {
        const { id }    = req.params;
        const developer = await Developer.findById(id).select('-password');

        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        return res.status(200).json({ success: true, data: developer });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/edit-developer
 */
exports.editDeveloper = async (req, res) => {
    try {
        const { id } = req.params;

        const developerExists = await Developer.findById(id);
        if (!developerExists) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        const updatedDeveloper = await Developer.findByIdAndUpdate(
            id,
            { ...req.body },
            { new: true, runValidators: true }
        ).select('-password');

        return res.status(200).json({ success: true, message: "Developer updated successfully", data: updatedDeveloper });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   POST /api/developer/delete-developer-by-id
 */
exports.deleteDeveloper = async (req, res) => {
    try {
        const { id } = req.params;

        const properties = await Property.deleteMany({ developer: id });
        const developer  = await Developer.findByIdAndDelete(id);

        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Developer deleted successfully",
            data: { developer, deletedProperties: properties.deletedCount }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @route   PUT /api/developer/admin/suspend/:id
 */
exports.toggleAccountStatus = async (req, res) => {
    try {
        const { id }     = req.params;
        const { action } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({ success: false, message: "Developer not found" });
        }

        developer.accountStatus = action === 'suspend' ? 'suspended' : 'active';
        await developer.save();

        return res.status(200).json({
            success: true,
            message: `Developer account ${action}d successfully`,
            data:    developer
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
