const mongoose = require("mongoose");

const AgencySchema = new mongoose.Schema(
  {
    // =========================
    // BASIC INFO
    // =========================
    agency_name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    // =========================
    // CONTACT
    // =========================
    country_code: {
      type: String,
      default: "+971"
    },

    mobile_number: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    address: {
      type: String,
      default: ""
    },

    city: {
      type: String,
      default: ""
    },

    // =========================
    // MEDIA
    // =========================
    profile_photo: {
      type: String,
      default: ""
    },

    logo: {
      type: String,
      default: ""
    },

    // =========================
    // DOCUMENTS
    // =========================
    trade_license: {
      type: String,
      default: ""
    },

    letter_of_authority: {
      type: String,
      default: ""
    },

    rera_license: {
      type: String,
      default: ""
    },

    // =========================
    // AGENTS UNDER THIS AGENCY
    // =========================
    agents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent"
      }
    ],

    totalAgents: {
      type: Number,
      default: 0
    },

    // =========================
    // COMMISSION STRUCTURE
    // =========================
    commissionStructure: {
      agentPercentage: {
        type: Number,
        default: 70,
        description: "Agent gets this % of commission"
      },
      agencyPercentage: {
        type: Number,
        default: 30,
        description: "Agency keeps this % of commission"
      }
    },

    // =========================
    // STATUS
    // =========================
    onboarding_status: {
      type: String,
      enum: ["registered", "pending", "approved", "rejected"],
      default: "registered"
    },

    is_email_verified: {
      type: Boolean,
      default: false
    },

    is_mobile_verified: {
      type: Boolean,
      default: false
    },

    is_active: {
      type: Boolean,
      default: true
    },

    rejection_reason: {
      type: String,
      default: ""
    },

    subscription_status: {
      type: String,
      enum: ["free", "basic", "premium"],
      default: "free"
    },

    subscription_expiry: {
      type: Date,
      default: null
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

    // =========================
    // STATS
    // =========================
    totalDeals: {
      type: Number,
      default: 0
    },

    totalCommission_earned: {
      type: Number,
      default: 0
    }

  },
  { timestamps: true }
);

// =========================
// INDEXES
// =========================
AgencySchema.index({ email: 1 });
AgencySchema.index({ mobile_number: 1 });
AgencySchema.index({ onboarding_status: 1 });
AgencySchema.index({ subscription_status: 1 });
AgencySchema.index({ is_active: 1 });

// =========================
// VIRTUAL: Agency Name with City
// =========================
AgencySchema.virtual("agency_details").get(function () {
  return `${this.agency_name} (${this.city})`;
});

// =========================
// REMOVE PASSWORD FROM RESPONSE
// =========================
AgencySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Agency", AgencySchema);