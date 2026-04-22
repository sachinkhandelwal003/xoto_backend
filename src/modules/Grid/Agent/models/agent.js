const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema(
  {
    // =========================
    // PERSONAL INFO
    // =========================
    first_name: {
      type: String,
      required: true,
      trim: true
    },
    last_name: {
      type: String,
      required: true,
      trim: true
    },

    // =========================
    // AUTH & ROLE
    // =========================
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false
    },

    // =========================
    // AGENCY RELATIONSHIP
    // =========================
    agency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      default: null
    },
    

    agentType: {
      type: String,
      enum: ["independent", "agency_agent"],
      default: "independent"
    },

    // =========================
    // CONTACT
    // =========================
    country_code: {
      type: String,
      default: "+971"
    },

    phone_number: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    operating_city: {
      type: String,
      required: true,
      trim: true
    },

    country: {
      type: String,
      default: "UAE"
    },

    // =========================
    // PROFESSIONAL
    // =========================
    specialization: {
      type: String,
      required: true,
      trim: true
    },

    experience_years: {
      type: Number,
      default: 0
    },

    rera_number: {
      type: String,
      default: ""
    },

    // =========================
    // DOCUMENTS
    // =========================
    profile_photo: {
      type: String,
      default: ""
    },

    id_proof: {
      type: String,
      default: ""
    },

    rera_certificate: {
      type: String,
      default: ""
    },

    // =========================
    // STATUS & VERIFICATION
    // =========================
    onboarding_status: {
      type: String,
      enum: ["registered", "pending", "approved", "rejected"],
      default: "registered"
    },

    isVerified: {
      type: Boolean,
      default: false
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

    status: {
      type: Boolean,
      default: true
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
    // COMMISSION (for agency agents)
    // =========================
    commission_percentage: {
      type: Number,
      default: 0,
      description: "Agent's share from agency commission"
    },

    // =========================
    // STATS FIELDS
    // =========================
    presentationsGenerated_count: {
      type: Number,
      default: 0
    },

    leadsCreated_count: {
      type: Number,
      default: 0
    },

    dealsClosed_count: {
      type: Number,
      default: 0
    },

    totalCommission_earned: {
      type: Number,
      default: 0
    },

    pendingCommission: {
      type: Number,
      default: 0
    }

  },
  { timestamps: true }
);

// =========================
// INDEXES
// =========================
AgentSchema.index({ email: 1 });
AgentSchema.index({ phone_number: 1 });
AgentSchema.index({ agency: 1 });
AgentSchema.index({ agentType: 1 });
AgentSchema.index({ onboarding_status: 1 });
AgentSchema.index({ isVerified: 1 });

// =========================
// VIRTUAL: Full Name
// =========================
AgentSchema.virtual("full_name").get(function () {
  return `${this.first_name} ${this.last_name}`;
});

// =========================
// REMOVE PASSWORD FROM RESPONSE
// =========================
AgentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Agent", AgentSchema);