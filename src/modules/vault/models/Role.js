const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      enum: [
        'SuperAdmin',
        'Admin',
        'Partner',
        'PartnerAffiliatedAgent',
        'FreelanceAgent',
        'Client',
      ],
      unique: true,
    },
    level: {
      type: Number,
      required: true,
      // 1 = SuperAdmin (highest), 6 = Client (lowest)
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    permissions: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema);