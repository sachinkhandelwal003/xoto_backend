const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema({
  first_name: {
    type: String,
    trim: true
  },
  last_name: {
    type: String,
    trim: true
  },
  
   role: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Role',
          required: false,
          default:null
        },

  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Phone
  country_code: {
    type: String,
    default: "+971"
  },
  phone_number: {
    type: String,
    required: true,
    unique: true
  },

  // 👇 YEH RAHA WO FIELD JO MISSING THA
  operating_city: {
    type: String,
    required: true,
    trim: true
  },

  // Agar aapko country bhi chahiye
  country: {
    type: String,
    default: ""
  },

  specialization: {
    type: String,
    required: true,
    trim: true
  },

  // Documents
  profile_photo: { type: String, default: "" },
  id_proof: { type: String, default: "" },
  rera_certificate: { type: String, default: "" },

  // Status & Verification
  onboarding_status: {
  type: String,
  enum: ["registered", "approved", "completed"],
  default: "registered"
},
  isVerified: {
    type: Boolean,
    default: false
  },
  is_email_verified: {
  type: Boolean,
  default: true   // abhi frontend handle kar raha
},

is_mobile_verified: {
  type: Boolean,
  default: true
},

subscriptionPlan: {
        type: String,
        enum: ["free", "paid"],
        default: "free",
        required: false
    },

    subscriptionExpiry: {
        type: Date,
        default: null,
        required: false
    },


    notificationSettings_email: {
        type: Boolean, default: true,
        required: false
    },
    notificationSettings_sms: {
        type: Boolean, default: false,
        required: false
    },
    notificationSettings_whatsapp: {
        type: Boolean, default: true,
        required: false
    },

    presentationsGenerated_count: {
        type: Number,
        default: 0,
        required: false
    },

    leadsCreated_count: {
        type: Number,
        default: 0,
        required: false
    },

    dealsClosed_count: {
        type: Number,
        default: 0,
        required: false
    },


}, { timestamps: true });



// Model Export
module.exports = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);