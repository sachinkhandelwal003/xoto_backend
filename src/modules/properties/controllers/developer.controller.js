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
            'operatingYears', 'authorizedPersonName', 'officialEmailId','selectedPlan'
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
 * @route   PUT /api/developer/admin/approve-plan/:id
 * @desc    Admin approves developer's selected plan (after payment)
 */
export const approvePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentStatus, invoiceUrl } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        if (!developer.requestedPlan) {
            return res.status(400).json({
                success: false,
                message: "No plan requested by developer"
            });
        }

        // Set price based on plan
        let price = 0;
        if (developer.requestedPlan === 'basic') price = 500;
        if (developer.requestedPlan === 'premium') price = 1500;

        // Activate the plan
        developer.engagementPlan = {
            type: developer.requestedPlan,
            price: price,
            startDate: new Date(),
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            paymentStatus: paymentStatus || 'unpaid',
            paymentDate: paymentStatus === 'paid' ? new Date() : null,
            invoiceUrl: invoiceUrl || "",
            activatedBy: req.user._id,
            activatedAt: new Date()
        };
        
        developer.planRequestStatus = 'approved';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: `Plan ${developer.requestedPlan} activated successfully`,
            data: {
                engagementPlan: developer.engagementPlan,
                planRequestStatus: developer.planRequestStatus
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
        developer.agreementStatus = 'pending_review';  // Set to pending review
        developer.onboardingStatus = 'agreement_pending';  // Wait for admin verification
        developer.accountStatus = 'pending';  // Still pending until admin verifies

        await developer.save();

        // TODO: Send notification to admin

        return res.status(200).json({
            success: true,
            message: "Agreement uploaded successfully. Waiting for admin verification.",
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementStatus: developer.agreementStatus,
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
 * @route   PUT /api/developer/admin/verify-agreement/:id
 * @desc    Admin verifies and approves agreement
 */
export const verifyAgreement = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        // Check if agreement is uploaded
        if (!developer.agreementSigned) {
            return res.status(400).json({
                success: false,
                message: "No agreement uploaded yet"
            });
        }

        // Update agreement verification status
        developer.agreementStatus = 'verified';
        developer.agreementVerified = true;
        developer.agreementVerifiedAt = new Date();
        developer.agreementVerifiedBy = req.user._id;
        developer.agreementRemarks = remarks || "Agreement verified successfully";
        developer.agreementLastReviewedAt = new Date();
        developer.agreementLastReviewedBy = req.user._id;
        
        // Complete onboarding and activate account
        developer.onboardingStatus = 'completed';
        developer.onboardingCompletedAt = new Date();
        developer.accountStatus = 'active';
        developer.isVerifiedByAdmin = true;

        await developer.save();

        // TODO: Send notification to developer

        return res.status(200).json({
            success: true,
            message: "Agreement verified successfully. Account activated!",
            data: {
                agreementStatus: developer.agreementStatus,
                agreementVerified: developer.agreementVerified,
                agreementVerifiedAt: developer.agreementVerifiedAt,
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
 * @route   POST /api/developer/admin/request-changes/:id
 * @desc    Admin requests changes to agreement (developer needs to re-upload)
 */
export const requestAgreementChanges = async (req, res) => {
    try {
        const { id } = req.params;
        const { message, remarks } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Please provide feedback message for developer"
            });
        }

        const developer = await Developer.findById(id);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        // Check if agreement is uploaded
        if (!developer.agreementSigned) {
            return res.status(400).json({
                success: false,
                message: "No agreement uploaded yet"
            });
        }

        // Store admin feedback
        developer.agreementFeedback = {
            message: message,
            remarks: remarks || "",
            requestedAt: new Date(),
            requestedBy: req.user._id
        };
        
        // Reset agreement status
        developer.agreementStatus = 'changes_requested';
        developer.agreementVerified = false;
        developer.agreementSigned = false;  // Require new upload
        developer.agreementDocuments = [];  // Clear old documents
        
        // Keep onboarding status as agreement_pending
        developer.onboardingStatus = 'agreement_pending';
        developer.accountStatus = 'pending';

        await developer.save();

        // TODO: Send notification to developer with feedback

        return res.status(200).json({
            success: true,
            message: "Changes requested. Developer notified to re-upload agreement.",
            data: {
                feedback: developer.agreementFeedback,
                agreementStatus: developer.agreementStatus,
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
 * @route   GET /api/developer/agreement
 * @desc    Get developer agreement documents
 */
/**
 * @route   GET /api/developer/agreement
 * @desc    Developer gets their agreement documents
 */
export const getAgreement = async (req, res) => {
    try {
        const developer = await Developer.findById(req.user._id).select(
            'agreementDocuments agreementSigned agreementSignedAt agreementStatus onboardingStatus accountStatus'
        );

        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementSigned: developer.agreementSigned,
                agreementSignedAt: developer.agreementSignedAt,
                agreementStatus: developer.agreementStatus,
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

// =========================
// ADMIN ROUTES
// =========================

/**
 * @route   GET /api/developer/admin/all
 * @desc    Admin: Get all developers
 */
/**
 * @route   GET /api/developer/get-all-developers
 * @desc    Get all developers with pagination and simple status summary
 */
export const getAllDevelopers = async (req, res) => {
    try {
        // ========== PAGINATION ==========
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // ========== SEARCH & FILTERS ==========
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

        // ========== GET TOTAL COUNT ==========
        const total = await Developer.countDocuments(query);
        
        // ========== GET DEVELOPERS WITH PAGINATION ==========
        const developers = await Developer.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-password');
        
        // ========== SIMPLE STATUS SUMMARY (Total, Active, Pending, Suspended) ==========
        const statusSummary = {
            total: await Developer.countDocuments(),
            active: await Developer.countDocuments({ accountStatus: 'active' }),
            pending: await Developer.countDocuments({ accountStatus: 'pending' }),
            suspended: await Developer.countDocuments({ accountStatus: 'suspended' })
        };
        
        // ========== RESPONSE ==========
        return res.status(200).json({
            success: true,
            message: "Developers fetched successfully",
            data: developers,
            count: developers.length,
            pagination: {
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                totalItems: total,
                limit: limit
            },
            summary: statusSummary
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


export const getDeveloperrById = async (req, res) => {
    try {
        let id = req.query.id;


        const developer = await Developer.findOne({ _id: id })


        return res.status(200).json({
            success: true,
            message: "Developer fetched",
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
/**
 * @route   PUT /api/developer/admin/upload-agreement/:id
 * @desc    Admin uploads agreement on behalf of developer
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
        developer.agreementStatus = 'pending_review';
        developer.onboardingStatus = 'agreement_pending';
        developer.accountStatus = 'pending';

        await developer.save();

        return res.status(200).json({
            success: true,
            message: "Agreement uploaded. Waiting for admin verification.",
            data: {
                agreementDocuments: developer.agreementDocuments,
                agreementStatus: developer.agreementStatus,
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