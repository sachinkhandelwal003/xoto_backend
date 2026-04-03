const mongoose = require('mongoose');

const dependentSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    age: { type: Number, required: true },
    relationship: { type: String, enum: ['Son', 'Daughter', 'Spouse', 'Other'], default: 'Other' },
    location: {
      type: String,
      enum: ['In UAE', 'Outside UAE'],
      required: true,
    }
  },
  { _id: false }
);

const emiratesIdSchema = new mongoose.Schema(
  {
    number: { type: String, default: null },
    issuanceDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    frontImageUrl: { type: String, default: null },
    backImageUrl: { type: String, default: null },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { _id: false }
);

const passportSchema = new mongoose.Schema(
  {
    number: { type: String, default: null },
    countryOfIssue: { type: String, default: null },
    issueDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    imageUrl: { type: String, default: null },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const visaSchema = new mongoose.Schema(
  {
    number: { type: String, default: null },
    residencyStatus: { type: String, default: null },
    sponsor: { type: String, default: null },
    expiryDate: { type: Date, default: null },
    imageUrl: { type: String, default: null },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const bankDetailsSchema = new mongoose.Schema(
  {
    beneficiaryName: { type: String, default: null },
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    iban: { type: String, default: null },
    swiftCode: { type: String, default: null },
    accountType: { type: String, enum: ['Savings', 'Current', null], default: null },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    building: { type: String, default: null },
    apartment: { type: String, default: null },
    area: { type: String, default: null },
    city: { type: String, default: null },
    poBox: { type: String, default: null },
    country: { type: String, default: 'UAE' },
  },
  { _id: false }
);

const nameSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const phoneSchema = new mongoose.Schema(
  {
    country_code: { type: String, default: '+971' },
    number: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const commissionEarningsSchema = new mongoose.Schema(
  {
    totalCommissionEarned: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    totalLeadsSubmitted: { type: Number, default: 0 },
    successfulDisbursals: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    leaderboardRank: { type: Number, default: null },
  },
  { _id: false }
);

const freelanceCommissionSchema = new mongoose.Schema(
  {
    referralOnly: {
      below5M: { type: Number, default: 40 },
      above5M: { type: Number, default: 50 },
    },
    referralPlusDocs: {
      below5M: { type: Number, default: 45 },
      above5M: { type: Number, default: 55 },
    },
  },
  { _id: false }
);

const agentSchema = new mongoose.Schema(
  {
    name: { type: nameSchema, required: true },
    phone: { type: phoneSchema, required: true, unique: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    profilePic: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    nationality: { type: String, default: null },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', null],
      default: null,
    },
    maritalStatus: {
      type: String,
      enum: ['Single', 'Married', 'Divorced', 'Widowed', null],
      default: null,
    },
    numberOfDependents: { type: Number, default: 0 },
    dependents: [dependentSchema],
    address: { type: addressSchema, default: null },
    emergencyContact: {
      name: { type: String, default: null },
      relationship: { type: String, default: null },
      phone: { type: String, default: null },
    },
    languagePreference: { type: String, enum: ['English', 'Arabic', 'Both'], default: 'English' },
    communicationPreference: { type: String, enum: ['WhatsApp', 'SMS', 'Email', 'Phone'], default: 'WhatsApp' },

    agentType: {
      type: String,
      enum: ['FreelanceAgent', 'PartnerAffiliatedAgent'],
      default: 'FreelanceAgent',
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      default: null,
    },
    affiliationStatus: {
      type: String,
      enum: ['none', 'pending', 'verified', 'rejected'],
      default: 'none',
    },
    affiliationVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    affiliationVerifiedAt: { type: Date, default: null },
    affiliationRejectionReason: { type: String, default: null },

    emiratesId: { type: emiratesIdSchema, default: () => ({}) },
    passport: { type: passportSchema, default: () => ({}) },
    visa: { type: visaSchema, default: () => ({}) },
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },

    freelanceCommission: { type: freelanceCommissionSchema, default: () => ({}) },

    earnings: { type: commissionEarningsSchema, default: () => ({}) },

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    password: { type: String, required: true },

    commissionEligible: { type: Boolean, default: false },
    commissionEligibilityReason: { type: String, default: null },

    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
   
    
  
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    suspensionReason: { type: String, default: null },

    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

agentSchema.index({ 'phone.number': 1 }, { unique: true });
agentSchema.index({ email: 1 });
agentSchema.index({ partnerId: 1 });
agentSchema.index({ agentType: 1 });
agentSchema.index({ affiliationStatus: 1 });
agentSchema.index({ isActive: 1 });
agentSchema.index({ isDeleted: 1 });
agentSchema.index({ commissionEligible: 1 });
agentSchema.index({ 'earnings.leaderboardRank': -1 });

agentSchema.virtual('fullName').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`;
});

agentSchema.virtual('fullPhoneNumber').get(function () {
  return `${this.phone.country_code}${this.phone.number}`;
});

agentSchema.methods.isActiveAgent = function () {
  return this.isActive && !this.isDeleted && !this.suspendedAt;
};

agentSchema.methods.canEarnCommission = function () {
  if (this.agentType === 'FreelanceAgent') {
    return this.commissionEligible && this.isActiveAgent() && this.isPhoneVerified;
  }
  return this.isActiveAgent() && this.affiliationStatus === 'verified' && this.isPhoneVerified;
};

agentSchema.methods.getCommissionPercentage = function (loanAmount, referralType) {
  if (this.agentType !== 'FreelanceAgent') return null;
  
  const isAbove5M = loanAmount > 5000000;
  const tier = isAbove5M ? 'above5M' : 'below5M';
  
  if (referralType === 'Referral Only') {
    return this.freelanceCommission.referralOnly[tier];
  }
  return this.freelanceCommission.referralPlusDocs[tier];
};

agentSchema.methods.markPhoneVerified = function () {
  this.isPhoneVerified = true;
  this.phoneVerifiedAt = new Date();
  return this.save();
};

agentSchema.methods.markEmailVerified = function () {
  this.isEmailVerified = true;
  this.emailVerifiedAt = new Date();
  return this.save();
};

agentSchema.pre('save', function (next) {
  let completedFields = 0;
  let totalFields = 0;
  
  if (this.name.first_name && this.name.last_name) completedFields++;
  totalFields++;
  
  if (this.phone.number) completedFields++;
  totalFields++;
  
  if (this.email) completedFields++;
  totalFields++;
  
  if (this.emiratesId.number && this.emiratesId.frontImageUrl) completedFields++;
  totalFields++;
  
  if (this.bankDetails.iban) completedFields++;
  totalFields++;
  
  this.profileCompletionPercentage = Math.round((completedFields / totalFields) * 100);
  this.isProfileComplete = this.profileCompletionPercentage === 100;
  
  next();
});

const VaultAgent = mongoose.models.VaultAgent || mongoose.model('VaultAgent', agentSchema);
module.exports = VaultAgent;