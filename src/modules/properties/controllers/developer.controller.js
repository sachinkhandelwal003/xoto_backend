import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Developer from "../models/DeveloperModel.js";
import Property from "../models/PropertyModel.js";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';

// =========================
// PUBLIC ROUTES
// =========================

/**
 * @route   POST /api/developer/register
 * @desc    Developer registration (first step)
 */
export const createDeveloper = async (req, res) => {
    try {
        const { name, email, password, phone_number, country_code } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        // Check if developer already exists
        let existingDeveloper = await Developer.findOne({ email });
        if (existingDeveloper) {
            return res.status(400).json({
                success: false,
                message: "Developer with this email already exists"
            });
        }

        // Get role for developer (code 17)
        const roleDoc = await Role.findOne({ code: 17 });
        if (!roleDoc) {
            return res.status(404).json({
                success: false,
                message: "Role configuration not found"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create developer
        const developer = await Developer.create({
            name,
            email,
            password: hashedPassword,
            phone_number: phone_number || "",
            country_code: country_code || "+971",
            role: roleDoc._id,
            accountStatus: "pending",
            onboardingStatus: "new",
            kycStatus: "not_submitted"
        });

        return res.status(201).json({
            success: true,
            message: "Developer registered successfully. Please complete KYC.",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/developer/login
 * @desc    Developer login
 */
export const loginDeveloper = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password required",
            });
        }

        const developer = await Developer.findOne({ email })
            .select("+password")
            .populate({
                path: "role",
                model: Role,
            });

        if (!developer) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        const isMatch = await bcrypt.compare(password, developer.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
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
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// =========================
// DEVELOPER ROUTES (AUTHENTICATED)
// =========================

/**
 * @route   GET /api/developer/me
 * @desc    Get current developer profile
 */
export const getMyProfile = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id);
        
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/profile
 * @desc    Update developer profile
 */
export const updateMyProfile = async (req, res) => {
    try {
        const allowedUpdates = [
            'name', 'phone_number', 'country_code', 'logo', 'description',
            'websiteUrl', 'country', 'city', 'address', 'reraNumber',
            'operatingYears', 'authorizedPersonName', 'officialEmailId'
        ];
        
        const updateData = {};
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });

        const developer = await Developer.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/developer/kyc/submit
 * @desc    Developer submits KYC documents
 */
export const submitKYC = async (req, res) => {
    try {
        const { kycDocuments } = req.body;

        if (!kycDocuments || kycDocuments.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please upload at least one KYC document"
            });
        }

        const developer = await Developer.findById(req.user._id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        // Validate required document types
        const hasRequiredDocs = ['passport', 'emirates_id', 'trade_license'].every(
            requiredType => kycDocuments.some(doc => doc.type === requiredType)
        );

        if (!hasRequiredDocs) {
            return res.status(400).json({
                success: false,
                message: "Please upload passport, emirates_id, and trade_license"
            });
        }

        developer.kycDocuments = kycDocuments;
        developer.kycStatus = 'pending';
        developer.onboardingStatus = 'kyc_submitted';
        
        await developer.save();

        return res.status(200).json({
            success: true,
            message: "KYC submitted successfully. Waiting for admin approval.",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/kyc/status
 * @desc    Get developer KYC status
 */
export const getKYCStatus = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id).select(
            'kycStatus kycRejectionReason onboardingStatus accountStatus'
        );

        return res.status(200).json({
            success: true,
            data: {
                kycStatus: developer.kycStatus,
                kycRejectionReason: developer.kycRejectionReason,
                onboardingStatus: developer.onboardingStatus,
                accountStatus: developer.accountStatus
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/developer/agreement/upload
 * @desc    Developer uploads agreement documents
 */
export const uploadAgreement = async (req, res) => {
    try {
        const { agreementDocuments } = req.body;

        if (!agreementDocuments || agreementDocuments.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please upload at least one agreement document"
            });
        }

        const developer = await Developer.findById(req.user._id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        // Check if KYC is approved
        if (developer.kycStatus !== 'approved') {
            return res.status(400).json({
                success: false,
                message: "Please complete KYC approval first. Current status: " + developer.kycStatus
            });
        }

        // Add uploadedBy field
        const docsWithUploader = agreementDocuments.map(doc => ({
            ...doc,
            uploadedBy: 'developer',
            uploadedAt: new Date()
        }));

        developer.agreementDocuments = docsWithUploader;
        developer.agreementSigned = true;
        developer.agreementSignedAt = new Date();
        developer.onboardingStatus = 'completed';
        developer.onboardingCompletedAt = new Date();
        developer.accountStatus = 'active';
        
        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Agreement uploaded successfully. Account activated!",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/agreement
 * @desc    Get developer agreement documents
 */
export const getAgreement = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id).select(
            'agreementDocuments agreementSigned agreementSignedAt'
        );

        return res.status(200).json({
            success: true,
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementSigned: developer.agreementSigned,
                agreementSignedAt: developer.agreementSignedAt
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// =========================
// ADMIN ROUTES
// =========================

/**
 * @route   GET /api/developer/admin/all
 * @desc    Admin: Get all developers
 */
export const getAllDevelopers = async (req, res) => {
    try {
        let search = req.query.search || "";
        let status = req.query.status;
        let onboardingStatus = req.query.onboardingStatus;
        let kycStatus = req.query.kycStatus;

        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone_number: { $regex: search, $options: "i" } }
            ];
        }

        if (status) query.accountStatus = status;
        if (onboardingStatus) query.onboardingStatus = onboardingStatus;
        if (kycStatus) query.kycStatus = kycStatus;

        const developers = await Developer.find(query)
            .sort({ createdAt: -1 })
            .select('-password');

        return res.status(200).json({
            success: true,
            message: "Developers fetched successfully",
            data: developers,
            count: developers.length
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/admin/stats
 * @desc    Admin: Get developer onboarding stats
 */
export const getDeveloperStats = async (req, res) => {
    try {
        const stats = {
            total: await Developer.countDocuments(),
            pending: await Developer.countDocuments({ accountStatus: 'pending' }),
            active: await Developer.countDocuments({ accountStatus: 'active' }),
            suspended: await Developer.countDocuments({ accountStatus: 'suspended' }),
            kycNotSubmitted: await Developer.countDocuments({ kycStatus: 'not_submitted' }),
            kycPending: await Developer.countDocuments({ kycStatus: 'pending' }),
            kycApproved: await Developer.countDocuments({ kycStatus: 'approved' }),
            kycRejected: await Developer.countDocuments({ kycStatus: 'rejected' }),
            onboardingNew: await Developer.countDocuments({ onboardingStatus: 'new' }),
            onboardingKycSubmitted: await Developer.countDocuments({ onboardingStatus: 'kyc_submitted' }),
            onboardingAgreementPending: await Developer.countDocuments({ onboardingStatus: 'agreement_pending' }),
            onboardingCompleted: await Developer.countDocuments({ onboardingStatus: 'completed' }),
            avgTAT: await Developer.aggregate([
                { $match: { tatDays: { $gt: 0 } } },
                { $group: { _id: null, avg: { $avg: "$tatDays" } } }
            ])
        };

        return res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/admin/review-kyc/:id
 * @desc    Admin: Approve or reject developer KYC
 */
export const reviewKYC = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejectionReason } = req.body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Action must be 'approve' or 'reject'"
            });
        }

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        if (action === 'approve') {
            developer.kycStatus = 'approved';
            developer.isVerifiedByAdmin = true;
            developer.onboardingStatus = 'agreement_pending';
            developer.kycRejectionReason = "";
        } else {
            developer.kycStatus = 'rejected';
            developer.isVerifiedByAdmin = false;
            developer.kycRejectionReason = rejectionReason || "KYC rejected by admin";
            developer.onboardingStatus = 'new';
        }

        developer.kycReviewedBy = req.user._id;
        developer.kycReviewedAt = new Date();

        await developer.save();

        return res.status(200).json({
            success: true,
            message: `KYC ${action}d successfully`,
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/admin/upload-agreement/:id
 * @desc    Admin: Upload agreement documents on behalf of developer
 */
export const adminUploadAgreement = async (req, res) => {
    try {
        const { id } = req.params;
        const { agreementDocuments } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        // Check if KYC is approved
        if (developer.kycStatus !== 'approved') {
            return res.status(400).json({
                success: false,
                message: "KYC must be approved first"
            });
        }

        const docsWithUploader = agreementDocuments.map(doc => ({
            ...doc,
            uploadedBy: 'admin',
            uploadedAt: new Date()
        }));

        developer.agreementDocuments = docsWithUploader;
        developer.agreementSigned = true;
        developer.agreementSignedAt = new Date();
        developer.onboardingStatus = 'completed';
        developer.onboardingCompletedAt = new Date();
        developer.accountStatus = 'active';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Agreement uploaded and developer activated",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/admin/set-plan/:id
 * @desc    Admin: Set engagement plan for developer
 */
export const setEngagementPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, price, startDate, endDate, paymentStatus, invoiceUrl } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        // Only completed onboarding developers can get plan
        if (developer.onboardingStatus !== 'completed') {
            return res.status(400).json({
                success: false,
                message: "Developer must complete onboarding first"
            });
        }

        developer.engagementPlan = {
            type,
            price,
            startDate,
            endDate,
            paymentStatus,
            paymentDate: paymentStatus === 'paid' ? new Date() : null,
            invoiceUrl: invoiceUrl || ""
        };

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Engagement plan set successfully",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/admin/:id
 * @desc    Admin: Get developer by ID
 */
export const getDeveloperById = async (req, res) => {
    try {
        const { id } = req.params;

        const developer = await Developer.findById(id).select('-password');

        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/admin/:id
 * @desc    Admin: Edit developer details
 */
export const editDeveloper = async (req, res) => {
    try {
        const { id } = req.params;

        const developerExists = await Developer.findById(id);
        if (!developerExists) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        const updatedDeveloper = await Developer.findByIdAndUpdate(
            id, 
            { ...req.body }, 
            { new: true, runValidators: true }
        ).select('-password');

        return res.status(200).json({
            success: true,
            message: "Developer updated successfully",
            data: updatedDeveloper
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   DELETE /api/developer/admin/:id
 * @desc    Admin: Delete developer and all associated properties
 */
export const deleteDeveloper = async (req, res) => {
    try {
        const { id } = req.params;

        // Delete all properties of this developer
        const properties = await Property.deleteMany({ developer: id });
        
        // Delete developer
        const developer = await Developer.findByIdAndDelete(id);

        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Developer deleted successfully",
            data: { 
                developer, 
                deletedProperties: properties.deletedCount 
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/admin/suspend/:id
 * @desc    Admin: Suspend/Activate developer account
 */
export const toggleAccountStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'suspend' or 'activate'

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        developer.accountStatus = action === 'suspend' ? 'suspended' : 'active';
        await developer.save();

        return res.status(200).json({
            success: true,
            message: `Developer account ${action}d successfully`,
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};