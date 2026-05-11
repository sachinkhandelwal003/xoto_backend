const mongoose = require("mongoose");

const DeveloperSchema = new mongoose.Schema(
    {
        // =========================
        // BASIC ACCOUNT INFO
        // =========================
        name: { 
            type: String, 
            trim: true, 
            default: "", 
            required: false 
        },
        companyName: {
            type: String,
            trim: true,
            default: "",
            required: false
        },
        phone_number: { 
            type: String, 
            trim: true, 
            default: "", 
            required: false 
        },
        country_code: { 
            type: String, 
            trim: true, 
            default: "+971", 
            required: false 
        },
        password: {
            type: String, 
            trim: true, 
            default: "", 
            required: false 
        },
        email: { 
            type: String, 
            trim: true, 
            default: "", 
            required: false,
            unique: true,
            lowercase: true
        },
        logo: { 
            type: String, 
            default: "", 
            trim: true, 
            required: false 
        },
        description: { 
            type: String, 
            default: "", 
            trim: true, 
            required: false 
        },
        role: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Role',
            required: false,
            default: null
        },
        websiteUrl: {
            type: String,
            default: "",
            trim: true,
            required: false
        },
        
        // =========================
        // LOCATION
        // =========================
        country: {
            type: String,
            required: false,
            default: ""
        },
        city: {
            type: String,
            required: false,
            default: ""
        },
        address: {
            type: String,
            required: false,
            default: "",
        },
        
        // =========================
        // LEGAL & KYC
        // =========================
        reraNumber: {
            type: String,
            required: false,
            default: ""
        },
        developerLicenseNumber: {
            type: String,
            trim: true,
            default: ""
        },
        dldNumber: {
          type: String,
          trim: true,
          default: ""
        },
        dldRegistrationNumber: {
            type: String,
            trim: true,
            default: ""
        },
        operatingYears: {
            type: Number,
            default: 0
        },
        primaryContactName: {
            type: String,
            trim: true,
            default: ""
        },
        authorizedPersonName: {
            type: String,
            default: ""
        },
        officialEmailId: {
            type: String,
            default: ""
        },
        
        // KYC Documents (Passport, Emirates ID, Trade License)
        kycDocuments: [
            {
                type: {
                    type: String,
                    enum: ['passport', 'emirates_id', 'trade_license'],
                    required: true
                },
                name: { type: String, default: "" },
                url: { type: String, default: "" },
                uploadedAt: { type: Date, default: Date.now }
            }
        ],
        tradeLicenseDocument: {
            name: { type: String, default: "" },
            url: { type: String, default: "" },
            uploadedAt: { type: Date, default: null }
        },
        
        // =========================
        // AGREEMENT DOCUMENTS
        // =========================
        agreementDocuments: [
            {
                type: {
                    type: String,
                    enum: ['main_agreement', 'commission_schedule', 'addendum', 'other'],
                    default: 'main_agreement'
                },
                name: { type: String, default: "" },
                url: { type: String, default: "" },
                uploadedAt: { type: Date, default: Date.now },
                uploadedBy: { 
                    type: String, 
                    enum: ['developer', 'admin'], 
                    default: 'developer' 
                }
            }
        ],
        
        // Agreement status tracking
agreementStatus: {
    type: String,
    enum: ['not_uploaded', 'pending_review', 'verified', 'changes_requested'],
    default: 'not_uploaded'
},

agreementVerified: {
    type: Boolean,
    default: false
},
agreementVerifiedAt: {
    type: Date,
    default: null
},
agreementVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
},
agreementRemarks: {
    type: String,
    default: ""
},
agreementLastReviewedAt: {
    type: Date,
    default: null
},
agreementLastReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
},
agreementFeedback: {
    message: { type: String, default: "" },
    remarks: { type: String, default: "" },
    requestedAt: { type: Date, default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
},
        agreementSigned: { 
            type: Boolean, 
            default: false 
        },
        agreementSignedAt: { 
            type: Date, 
            default: null 
        },
        commercialAgreementStatus: {
            type: String,
            enum: ['not_started', 'pending', 'completed'],
            default: 'not_started'
        },
        commercialAgreementCompletedAt: {
            type: Date,
            default: null
        },
        commercialAgreementCompletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        
        // =========================
        // VERIFICATION STATUS
        // =========================
        isVerifiedByAdmin: {
            type: Boolean,
            default: false,
        },
        
        kycStatus: {
            type: String,
            enum: ['not_submitted', 'pending', 'approved', 'rejected'],
            default: 'not_submitted'
        },
        
        kycRejectionReason: {
            type: String,
            default: ""
        },
        
        kycReviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        
        kycReviewedAt: {
            type: Date,
            default: null
        },
        
        // =========================
        // ONBOARDING STATUS
        // =========================
        onboardingStatus: {
            type: String,
            enum: [
                'new',
                'application_submitted',
                'commercial_agreement_pending',
                'kyc_submitted',
                'agreement_pending',
                'completed',
                'rejected'
            ],
            default: 'new'
        },
        onboardingSource: {
            type: String,
            enum: ['self_service', 'admin_created'],
            default: 'self_service'
        },
        applicationStatus: {
            type: String,
            enum: ['draft', 'pending_review', 'approved', 'rejected'],
            default: 'draft'
        },
        applicationSubmittedAt: {
            type: Date,
            default: null
        },
        applicationReviewedAt: {
            type: Date,
            default: null
        },
        applicationReviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        applicationRejectionReason: {
            type: String,
            default: ""
        },
        accessGranted: {
            type: Boolean,
            default: false
        },
        accessGrantedAt: {
            type: Date,
            default: null
        },
        accessGrantedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        
        onboardingStartedAt: {
            type: Date,
            default: Date.now
        },
        
        onboardingCompletedAt: {
            type: Date,
            default: null
        },
        
        // TAT = Time between onboardingStartedAt and agreementSignedAt
        tatDays: {
            type: Number,
            default: 0
        },
        
        // =========================
        // ENGAGEMENT PLAN
        // =========================
        engagementPlan: {
            type: {
                type: String,
                enum: ['free', 'basic', 'premium'],
                default: null
            },
            price: { type: Number, default: 0 },
            startDate: { type: Date, default: null },
            endDate: { type: Date, default: null },
            paymentStatus: {
                type: String,
                enum: ['unpaid', 'paid', 'partial'],
                default: 'unpaid'
            },
            paymentDate: { type: Date, default: null },
            invoiceUrl: { type: String, default: "" }
        },
        
        // =========================
        // ACCOUNT STATUS
        // =========================
        accountStatus: {
            type: String,
            enum: ['pending', 'active', 'suspended', 'rejected'],
            default: 'pending'
        },
        
        remarks: {
            type: String,
            default: ""
        },
        
        // =========================
        // STATISTICS
        // =========================
        presentationsGenerated_stats: { 
            type: Number, 
            default: 0 
        },
        leadsGenerated_stats: { 
            type: Number, 
            default: 0 
        },
        unitsSold_stats: { 
            type: Number, 
            default: 0 
        },
        conversionRate_stats: { 
            type: Number, 
            default: 0 
        },
        
        // =========================
        // PASSWORD RESET
        // =========================
        resetPasswordToken: { 
            type: String, 
            default: null 
        },
        resetPasswordExpires: { 
            type: Date, 
            default: null 
        },
        
    }, 
    { 
        timestamps: true 
    }
);

// =========================
// INDEXES FOR BETTER PERFORMANCE
// =========================
DeveloperSchema.index({ phone_number: 1 });
DeveloperSchema.index({ accountStatus: 1 });
DeveloperSchema.index({ onboardingStatus: 1 });
DeveloperSchema.index({ kycStatus: 1 });

// =========================
// CALCULATE TAT BEFORE SAVING
// =========================
DeveloperSchema.pre('save', function(next) {
    if (this.agreementSignedAt && this.onboardingStartedAt) {
        const diffTime = Math.abs(this.agreementSignedAt - this.onboardingStartedAt);
        this.tatDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    next();
});

// =========================
// REMOVE PASSWORD FROM API RESPONSE
// =========================
DeveloperSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

const Developer = mongoose.model("Developer", DeveloperSchema, "Developers");
module.exports = Developer;
