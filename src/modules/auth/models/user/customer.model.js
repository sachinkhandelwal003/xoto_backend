const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    // ================= NAME =================
    name: {
      first_name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
      },
      last_name: {
        type: String,
        required: false,
        trim: true,
        maxlength: 50
      }
    },

    // ================= EMAIL =================
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      match: [
        /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/,
        "Please enter a valid email address"
      ]
    },

    // ================= MOBILE =================
    mobile: {
      country_code: {
        type: String,
        default: '+91',
        trim: true
      },
      number: {
        type: String,
        required: true,
        trim: true,
        validate: {
          validator: v => /^\d{8,15}$/.test(v),
          message: 'Mobile number must be 8–15 digits only'
        }
      }
    },

    // ================= PROFILE =================
    profilePic: {
      type: String,
      default: ""
    },

    // ================= ROLE =================
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null
    },

    // ================= ASSIGNED AGENT ================= 🔥 NEW
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null
    },

    // ================= LOCATION =================
    location: {
      lat: Number,
      lng: Number,
      country: String,
      state: String,
      city: String,
      area: String,
      address: String
    },

    // ================= SOURCE =================
    source: {
      type: String,
      enum: ['agent', 'website', 'lead_generation', 'bulk_upload', 'manual', 'vault'],  // ✅ Added 'vault'
      default: 'manual'
    },

    // ================= STATUS =================
    isActive: {
      type: Boolean,
      default: true
    },

    is_deleted: {
      type: Boolean,
      default: false
    },

    deleted_at: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);


// ================= INDEXES =================

// ✅ Unique email ONLY for non-deleted users
customerSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { is_deleted: false }
  }
);

// ✅ Mobile + role index
customerSchema.index({ "mobile.number": 1 });

// ✅ Agent wise filtering
customerSchema.index({ assignedTo: 1 });


// ================= PRE-SAVE VALIDATION =================

// Prevent duplicate email (extra safety)
customerSchema.pre("save", async function (next) {
  if (this.isModified("email")) {
    const existing = await this.constructor.findOne({
      email: this.email,
      _id: { $ne: this._id },
      is_deleted: false
    });

    if (existing) {
      return next(new Error("Email already in use"));
    }
  }

  next();
});


// ================= METHODS =================

// Soft delete method
customerSchema.methods.softDelete = function () {
  this.is_deleted = true;
  this.deleted_at = new Date();
  return this.save();
};


// ================= EXPORT =================
module.exports = mongoose.model("Customer", customerSchema);