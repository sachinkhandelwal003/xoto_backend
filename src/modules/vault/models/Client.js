const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    name: {
      first_name: { type: String, required: true },
      last_name: { type: String, required: true },
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
    },
    phone: {
      country_code: { type: String, default: '+971' },
      number: { type: String, required: true },
    },
    dateOfBirth: { type: Date, default: null },
    nationality: { type: String, default: null },
    residencyStatus: {
      type: String,
      enum: ['UAE Resident', 'Non-Resident'],
      default: null,
    },
    employmentStatus: {
      type: String,
      enum: ['Salaried', 'Self-Employed', null],
      default: null,
    },
    monthlySalary: { type: Number, default: null },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    password: { type: String, default: null },
    createdByType: {
      type: String,
      enum: ['Agent', 'Partner'],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'createdByType',
      required: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
    },
     agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VaultAgent',
    },
    portalAccess: {
      hasAccess: { type: Boolean, default: false },
      tempPassword: { type: String, default: null },
      isPasswordChanged: { type: Boolean, default: false },
      accessGeneratedAt: { type: Date, default: null },
      accessGeneratedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      generatedByType: { type: String, enum: ['Agent', 'Partner'], default: null },
      isRevoked: { type: Boolean, default: false },
      revokedAt: { type: Date, default: null },
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

clientSchema.index({ email: 1 });
clientSchema.index({ partnerId: 1 });

const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);
module.exports = Client;