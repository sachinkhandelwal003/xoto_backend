// const mongoose = require("mongoose");

// const DeveloperSchema = new mongoose.Schema({
//     name: { type: String, trim: true, default: "", required: false }, //name is the companyName
//     phone_number: { type: String, trim: true, default: "", required: false },
//     country_code: { type: String, trim: true, default: "", required: false },
//     password:{type: String, trim: true, default: "", required: false},
//     email: { type: String, trim: true, default: "", required: false },
//     logo: { type: String, default: "", trim: true, required: false },
//     description: { type: String, default: "", trim: true, required: false },
//      role: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: 'Role',
//             required: false,
//             default:null
//           },
//     websiteUrl: {
//         type: String,
//         default: "",
//         trim: true,
//         required: false
//     },
//     country: {
//         type: String,
//         required: false,
//         default: ""
//     },
//     city: {
//         type: String,
//         required: false,
//         default: ""
//     },
//     address: {
//         type: String,
//         required: false,
//         default: "",
//     },
//     reraNumber: {
//         type: String,
//         required: false,
//         default: ""
//     },
//     documents: [
//         { type: String, default: "", trim: true, required: false }
//     ],
//       resetPasswordToken: { type: String, default: null },
//     resetPasswordExpires: { type: Date, default: null },

//     isVerifiedByAdmin: {
//         type: Boolean,
//         default: false,
//     },

//     presentationsGenerated_stats: { type: Number, default: 0, required: false },
//     leadsGenerated_stats: { type: Number, default: 0, required: false },
//     unitsSold_stats: { type: Number, default: 0, required: false },
//     conversionRate_stats: { type: Number, default: 0, required: false },
// }, { timestamps: true });

// const Developer = mongoose.model("Developer", DeveloperSchema, "Developers");
// module.exports = Developer;



















// // const mongoose = require("mongoose");

// // const DeveloperSchema = new mongoose.Schema(
// // {
// //   // =========================
// //   // BASIC ACCOUNT INFO
// //   // =========================
// //   name: {
// //     type: String,
// //     trim: true,
// //     required: true
// //   },

// //   email: {
// //     type: String,
// //     required: true,
// //     unique: true,
// //     lowercase: true,
// //     trim: true
// //   },

// //   password: {
// //     type: String,
// //     required: true
// //   },

// //   phone_number: {
// //     type: String,
// //     trim: true,
// //     unique: true,
// //     sparse: true
// //   },

// //   country_code: {
// //     type: String,
// //     trim: true,
// //     default: "+971"
// //   },

// //   role: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: "Role",
// //     default: null
// //   },

// //   // =========================
// //   // COMPANY INFORMATION
// //   // =========================
// //   logo: {
// //     type: String,
// //     default: ""
// //   },

// //   description: {
// //     type: String,
// //     trim: true,
// //     default: ""
// //   },

// //   websiteUrl: {
// //     type: String,
// //     trim: true,
// //     default: ""
// //   },

// //   // =========================
// //   // LOCATION
// //   // =========================
// //   country: {
// //     type: String,
// //     default: ""
// //   },

// //   city: {
// //     type: String,
// //     default: ""
// //   },

// //   address: {
// //     type: String,
// //     default: ""
// //   },

// //   // =========================
// //   // LEGAL DETAILS
// //   // =========================
// //   reraNumber: {
// //     type: String,
// //     trim: true,
// //     default: ""
// //   },

// //   documents: [
// //     {
// //       name: {
// //         type: String,
// //         default: ""
// //       },
// //       url: {
// //         type: String,
// //         default: ""
// //       }
// //     }
// //   ],

// //   // =========================
// //   // VERIFICATION
// //   // =========================
// //   isVerifiedByAdmin: {
// //     type: Boolean,
// //     default: false
// //   },

// //   status: {
// //     type: String,
// //     enum: ["pending", "active", "suspended"],
// //     default: "pending"
// //   },

// //   lastLogin: {
// //     type: Date
// //   }

// // },
// // {
// //   timestamps: true
// // }
// // );



// // // =========================
// // // INDEXES
// // // =========================
// // DeveloperSchema.index({ email: 1 });
// // DeveloperSchema.index({ phone_number: 1 });
// // DeveloperSchema.index({ reraNumber: 1 });



// // // =========================
// // // REMOVE PASSWORD FROM API RESPONSE
// // // =========================
// // DeveloperSchema.methods.toJSON = function () {
// //   const obj = this.toObject();
// //   delete obj.password;
// //   return obj;
// // };



// // // =========================
// // // MODEL EXPORT
// // // =========================
// // const Developer = mongoose.model("Developer", DeveloperSchema, "Developers");

// // module.exports = Developer;

















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
        operatingYears: {
            type: Number,
            default: 0
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
        
        agreementSigned: { 
            type: Boolean, 
            default: false 
        },
        agreementSignedAt: { 
            type: Date, 
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
            enum: ['new', 'kyc_submitted', 'agreement_pending', 'completed'],
            default: 'new'
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
            enum: ['pending', 'active', 'suspended'],
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
DeveloperSchema.index({ email: 1 });
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