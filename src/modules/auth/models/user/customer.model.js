const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
      match: [
        /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/,
        "Please enter a valid email address"
      ],
    },

    mobile: {
      type: String,
      trim: true,
      required: true,
    },

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },

    isActive: { type: Boolean, default: true },

    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date }
  },
  { timestamps: true }
);

// -----------------------------------------------------
// INDEXES
// -----------------------------------------------------
customerSchema.index({ email: 1 }, { unique: true });
customerSchema.index({ mobile: 1, role: 1 });
customerSchema.index({ role: 1 });

// -----------------------------------------------------
// EMAIL UNIQUE CHECK (EXCEPT SOFT-DELETED USERS)
// -----------------------------------------------------
customerSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("email")) {
    const existing = await this.constructor.findOne({
      email: this.email,
      _id: { $ne: this._id },
      is_deleted: false,
    });

    if (existing) {
      return next(new Error("Email already in use"));
    }
  }
  next();
});

module.exports = mongoose.model("Customer", customerSchema);
