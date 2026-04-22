const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ─── Sub Schemas ──────────────────────────────────────────────────────────────

// Bank details — required before commission payout
const bankDetailsSchema = new mongoose.Schema(
  {
    bankName:          { type: String, trim: true },
    accountNumber:     { type: String, trim: true },
    iban:              { type: String, trim: true },
    accountHolderName: { type: String, trim: true },
    isVerified:        { type: Boolean, default: false },
  },
  { _id: false }
);

// Identity documents — Emirates ID or Passport
const identitySchema = new mongoose.Schema(
  {
    type:         { type: String, enum: ["emirates_id", "passport"], default: null },
    idNumber:     { type: String, trim: true, default: null },
    frontUrl:     { type: String, default: null }, // Emirates ID front
    backUrl:      { type: String, default: null }, // Emirates ID back
    passportUrl:  { type: String, default: null }, // Passport all pages
    expiryDate:   { type: Date, default: null },
    isVerified:   { type: Boolean, default: false },
  },
  { _id: false }
);

// Leaderboard score — composite score used by Admin for lead assignment
const leaderboardSchema = new mongoose.Schema(
  {
    dealsClosedCount:   { type: Number, default: 0 },
    conversionRate:     { type: Number, default: 0 }, // percentage 0-100
    avgResponseTimeHrs: { type: Number, default: null }, // avg hours to first contact
    compositeScore:     { type: Number, default: 0 }, // calculated composite
    weeklyRank:         { type: Number, default: null },
    monthlyRank:        { type: Number, default: null },
    quarterlyRank:      { type: Number, default: null },
    annualRank:         { type: Number, default: null },
    lastCalculatedAt:   { type: Date, default: null },
  },
  { _id: false }
);

// Workload tracking — used by Admin for assignment decisions
const workloadSchema = new mongoose.Schema(
  {
    activeLeadsCount:        { type: Number, default: 0 },
    activeApplicationsCount: { type: Number, default: 0 },
    totalLeadsAssigned:      { type: Number, default: 0 },
    totalDealsCompleted:     { type: Number, default: 0 },
    totalPresentationsGenerated: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─── Main Advisor Schema ──────────────────────────────────────────────────────

const advisorSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true, // auto-generated on first save
    },

    // ── Auth ─────────────────────────────────────────────────────────────────
    password: {
      type: String,
      required: true,
      select: false,
    },
    mustResetPassword: {
      type: Boolean,
      default: true, // Admin created — must reset on first login
    },
    loginLink: {
      type: String,
      select: false,
    },
    loginLinkExpiresAt: {
      type: Date,
      select: false,
    },

    // ── Role & Status ─────────────────────────────────────────────────────────
    role: {
      type: String,
      default: "xoto_advisor",
    },
    department: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deactivated"],
      default: "active",
    },

    // ── Profile ───────────────────────────────────────────────────────────────
    profilePhotoUrl: {
      type: String,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    nationality: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null, // e.g. "Dubai Marina", "Downtown Dubai"
    },

    // ── Specialisation (PRD: lead assignment based on specialisation) ─────────
    specialisation: {
      propertyTypes: {
        type: [String],
        enum: ["Apartment", "Villa", "Townhouse", "Penthouse", "Commercial", "Plot", "Retail", "Office", "Warehouse"],
        default: [],
      },
      locations: {
        type: [String], // e.g. ["Dubai Marina", "JVC", "Downtown Dubai"]
        default: [],
      },
      listingTypes: {
        type: [String],
        enum: ["off-plan", "secondary", "rental", "commercial"],
        default: [],
      },
    },

    // ── Identity Documents ────────────────────────────────────────────────────
    identity: {
      type: identitySchema,
      default: () => ({}),
    },

    // ── Bank Details (required before commission payout) ──────────────────────
    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({}),
    },

    // ── Profile Completion ────────────────────────────────────────────────────
    // Tracks what is completed — used to show completion banner
    profileCompletion: {
      basicInfo:    { type: Boolean, default: false },
      identity:     { type: Boolean, default: false },
      bankDetails:  { type: Boolean, default: false },
      percentage:   { type: Number, default: 0 }, // 0-100
    },

    // ── Leaderboard & Performance (PRD §7.1 — used by Admin for assignment) ──
    leaderboard: {
      type: leaderboardSchema,
      default: () => ({}),
    },

    // ── Workload (shown in Admin assignment dropdown) ─────────────────────────
    workload: {
      type: workloadSchema,
      default: () => ({}),
    },

    // ── Audit & Deactivation ──────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    deactivatedAt:     { type: Date, default: null },
    deactivatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deactivationReason:{ type: String, default: null },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

advisorSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

advisorSchema.index({ status: 1 });
advisorSchema.index({ email: 1 }, { unique: true });
advisorSchema.index({ phone: 1 }, { unique: true });
advisorSchema.index({ employeeId: 1 }, { unique: true, sparse: true });
advisorSchema.index({ "leaderboard.compositeScore": -1 }); // for leaderboard queries
advisorSchema.index({ "workload.activeLeadsCount": 1 });   // for assignment workload

// ─── Pre Save ─────────────────────────────────────────────────────────────────

advisorSchema.pre("save", async function (next) {
  // Auto generate employeeId
  if (!this.employeeId) {
    const count = await mongoose.model("GridAdvisor").countDocuments();
    this.employeeId = `XA-${String(count + 1).padStart(4, "0")}`;
  }

  // Hash password only if modified
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // Auto calculate profile completion percentage
  let completed = 0;
  const total = 3;

  if (this.firstName && this.lastName && this.email && this.phone) {
    this.profileCompletion.basicInfo = true;
    completed++;
  }
  if (this.identity && this.identity.idNumber && this.identity.isVerified) {
    this.profileCompletion.identity = true;
    completed++;
  }
  if (this.bankDetails && this.bankDetails.iban && this.bankDetails.isVerified) {
    this.profileCompletion.bankDetails = true;
    completed++;
  }

  this.profileCompletion.percentage = Math.round((completed / total) * 100);

  next();
});

// ─── Methods ──────────────────────────────────────────────────────────────────

advisorSchema.methods.correctPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("GridAdvisor", advisorSchema);