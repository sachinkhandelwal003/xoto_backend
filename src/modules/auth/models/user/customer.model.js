const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: {
      first_name: { type: String, required: true, trim: true, maxlength: 50 },
      last_name: { type: String, required: true, trim: true, maxlength: 50 }
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
      match: [
        /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/,
        "Please enter a valid email address"
      ]
    },

    mobile: {
      country_code: { type: String, default: '+91', trim: true },
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

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true
    },

    isActive: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date }
  },
  { timestamps: true }
);

// INDEXES
customerSchema.index({ email: 1 }, { unique: true });
customerSchema.index({ "mobile.number": 1, role: 1 });
customerSchema.index({ role: 1 });

// UNIQUE EMAIL (IGNORE SOFT-DELETED)
customerSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("email")) {
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

module.exports = mongoose.model("Customer", customerSchema);
