// const mongoose = require("mongoose");

// const AgentSchema = new mongoose.Schema(
//   {
//     // =========================
//     // PERSONAL INFO
//     // =========================
//     first_name: {
//       type: String,
//       required: true,
//       trim: true
//     },
//     last_name: {
//       type: String,
//       required: true,
//       trim: true
//     },

//     // =========================
//     // AUTH & ROLE
//     // =========================
//     role: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Role",
//       default: null
//     },

//     email: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//       trim: true
//     },

//     password: {
//       type: String,
//       required: true,
//       minlength: 6,
//       select: false
//     },

//     // =========================
//     // AGENCY RELATIONSHIP
//     // =========================
//     agency: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Agency",
//       default: null
//     },
    

//     agentType: {
//       type: String,
//       enum: ["independent", "agency_agent"],
//       default: "independent"
//     },

//     // =========================
//     // CONTACT
//     // =========================
//     country_code: {
//       type: String,
//       default: "+971"
//     },

//     phone_number: {
//       type: String,
//       required: true,
//       unique: true,
//       trim: true
//     },

//     operating_city: {
//       type: String,
//       required: true,
//       trim: true
//     },

//     country: {
//       type: String,
//       default: "UAE"
//     },

//     // =========================
//     // PROFESSIONAL
//     // =========================
//     specialization: {
//       type: String,
//       required: true,
//       trim: true
//     },

//     experience_years: {
//       type: Number,
//       default: 0
//     },

//     rera_number: {
//       type: String,
//       default: ""
//     },

//     // =========================
//     // DOCUMENTS
//     // =========================
//     profile_photo: {
//       type: String,
//       default: ""
//     },

//     id_proof: {
//       type: String,
//       default: ""
//     },

//     rera_certificate: {
//       type: String,
//       default: ""
//     },

//     // =========================
//     // STATUS & VERIFICATION
//     // =========================
//     onboarding_status: {
//       type: String,
//       enum: ["registered", "pending", "approved", "rejected"],
//       default: "registered"
//     },

//     isVerified: {
//       type: Boolean,
//       default: false
//     },

//     is_email_verified: {
//       type: Boolean,
//       default: false
//     },

//     is_mobile_verified: {
//       type: Boolean,
//       default: false
//     },

//     is_active: {
//       type: Boolean,
//       default: true
//     },

//     rejection_reason: {
//       type: String,
//       default: ""
//     },

//     status: {
//       type: Boolean,
//       default: true
//     },

//     // =========================
//     // PASSWORD RESET
//     // =========================
//     resetPasswordToken: {
//       type: String,
//       default: null
//     },

//     resetPasswordExpires: {
//       type: Date,
//       default: null
//     },

//     // =========================
//     // COMMISSION (for agency agents)
//     // =========================
//     commission_percentage: {
//       type: Number,
//       default: 0,
//       description: "Agent's share from agency commission"
//     },

//     // =========================
//     // STATS FIELDS
//     // =========================
//     presentationsGenerated_count: {
//       type: Number,
//       default: 0
//     },

//     leadsCreated_count: {
//       type: Number,
//       default: 0
//     },

//     dealsClosed_count: {
//       type: Number,
//       default: 0
//     },

//     totalCommission_earned: {
//       type: Number,
//       default: 0
//     },

//     pendingCommission: {
//       type: Number,
//       default: 0
//     }

//   },
//   { timestamps: true }
// );

// // =========================
// // INDEXES
// // =========================
// AgentSchema.index({ email: 1 });
// AgentSchema.index({ phone_number: 1 });
// AgentSchema.index({ agency: 1 });
// AgentSchema.index({ agentType: 1 });
// AgentSchema.index({ onboarding_status: 1 });
// AgentSchema.index({ isVerified: 1 });

// // =========================
// // VIRTUAL: Full Name
// // =========================
// AgentSchema.virtual("full_name").get(function () {
//   return `${this.first_name} ${this.last_name}`;
// });

// // =========================
// // REMOVE PASSWORD FROM RESPONSE
// // =========================
// AgentSchema.methods.toJSON = function () {
//   const obj = this.toObject();
//   delete obj.password;
//   delete obj.__v;
//   return obj;
// };

// module.exports = mongoose.model("AgentLegacy", AgentSchema);


const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: {
      type: String,
      default: "",
    },
    bankName: {
      type: String,
      default: "",
    },
    iban: {
      type: String,
      default: "",
    },
    accountNumber: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    // ─────────────────────────────────
    // Basic Identity
    // ─────────────────────────────────

    first_name: {
      type: String,
      required: true,
      trim: true,
    },

    last_name: {
      type: String,
      required: true,
      trim: true,
    },

    fullName: {
      type: String,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    country_code: {
      type: String,
      required: true,
      default: "+971",
    },

    phone_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    country: {
      type: String,
      default: "UAE",
    },

    operating_city: {
      type: String,
      required: true,
    },

    specialization: {
      type: String,
      default: "",
    },
role: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Role',
  default: null,
},
    // ─────────────────────────────────
    // Agency Affiliation
    // ─────────────────────────────────

    agency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
    },

    agencyApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "declined"],
      default: "pending",
    },

    agencyApprovedAt: {
      type: Date,
    },

    agencyDeclinedAt: {
      type: Date,
    },

    agencyDeclineNote: {
      type: String,
      default: "",
    },

    // ─────────────────────────────────
    // Admin Final Verification
    // ─────────────────────────────────

    adminApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "declined"],
      default: "pending",
    },

    adminApprovedAt: {
      type: Date,
    },

    adminDeclinedAt: {
      type: Date,
    },

    adminDeclineNote: {
      type: String,
      default: "",
    },

    // ─────────────────────────────────
    // Profile Completion Docs
    // ─────────────────────────────────

    profile_photo: {
      type: String,
      default: "",
    },

    emiratesIdUrl: {
      type: String,
      default: "",
    },

    reraCardNumber: {
      type: String,
      default: "",
    },

    reraCardUrl: {
      type: String,
      default: "",
    },

    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({}),
    },

    profileComplete: {
      type: Boolean,
      default: false,
    },

    // ─────────────────────────────────
    // Status
    // ─────────────────────────────────

    isActive: {
      type: Boolean,
      default: true,
    },

    isFlagged: {
      type: Boolean,
      default: false,
    },

    onboarding_status: {
      type: String,
      enum: ["pending", "approved", "declined"],
      default: "pending",
    },

    // ─────────────────────────────────
    // Performance Stats
    // ─────────────────────────────────

    totalLeads: {
      type: Number,
      default: 0,
    },

    activeLeads: {
      type: Number,
      default: 0,
    },

    presentationsGenerated: {
      type: Number,
      default: 0,
    },

    dealsClosedCount: {
      type: Number,
      default: 0,
    },

    commissionEarned: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Auto fullName
agentSchema.pre("save", function (next) {
  this.fullName = `${this.first_name} ${this.last_name}`;
  next();
});

// Password Hash
agentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare Password
agentSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Platform Access Rule
agentSchema.virtual("canAccessPlatform").get(function () {
  return (
    this.agencyApprovalStatus === "approved" &&
    this.adminApprovalStatus === "approved" &&
    this.isActive
  );
});

agentSchema.set("toJSON", { virtuals: true });

const Agent =
  mongoose.models.GridAgent ||
  mongoose.model("GridAgent", agentSchema);

module.exports = Agent;

