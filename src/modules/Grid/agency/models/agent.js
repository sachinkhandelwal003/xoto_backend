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

