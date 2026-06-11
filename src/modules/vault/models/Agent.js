const mongoose = require('mongoose');

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const emiratesIdSchema = new mongoose.Schema(
  {
    number:        { type: String, default: null },
    issuanceDate:  { type: Date,   default: null },
    expiryDate:    { type: Date,   default: null },
    frontImageUrl: { type: String, default: null },
    backImageUrl:  { type: String, default: null },
    verified:      { type: Boolean, default: false },
    verifiedAt:    { type: Date,    default: null },
    verifiedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { _id: false }
);

const passportSchema = new mongoose.Schema(
  {
    number:         { type: String, default: null },
    countryOfIssue: { type: String, default: null },
    issueDate:      { type: Date,   default: null },
    expiryDate:     { type: Date,   default: null },
    imageUrl:       { type: String, default: null },
    verified:       { type: Boolean, default: false },
    verifiedAt:     { type: Date,    default: null },
  },
  { _id: false }
);

// PRD Section 4.6 — Banking fields: bank name, account number, IBAN, account holder name only
const bankDetailsSchema = new mongoose.Schema(
  {
    beneficiaryName: { type: String, default: null }, // "account holder name" in PRD
    bankName:        { type: String, default: null },
    accountNumber:   { type: String, default: null },
    iban:            { type: String, default: null },
    verified:        { type: Boolean, default: false },
    verifiedAt:      { type: Date,    default: null },
  },
  { _id: false }
);

// PRD Section 1.2 — Referral Partner commission tiers only
const freelanceCommissionSchema = new mongoose.Schema(
  {
    below5M: { type: Number, default: 40 }, // ≤5M AED
    above5M: { type: Number, default: 50 }, // >5M AED
  },
  { _id: false }
);

// PRD Section 4.4 / My Stats — referral partner earnings tracking
const commissionEarningsSchema = new mongoose.Schema(
  {
    totalCommissionEarned:  { type: Number, default: 0 },
    pendingCommission:      { type: Number, default: 0 },
    totalLeadsSubmitted:    { type: Number, default: 0 },
    successfulDisbursals:   { type: Number, default: 0 },
    conversionRate:         { type: Number, default: 0 },
    leaderboardRank:        { type: Number, default: null },
  },
  { _id: false }
);

const nameSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name:  { type: String, required: true, trim: true },
  },
  { _id: false }
);

const phoneSchema = new mongoose.Schema(
  {
    country_code: { type: String, default: '+971' },
    number:       { type: String, required: true, trim: true },
  },
  { _id: false }
);

// ─── Main Agent Schema ───────────────────────────────────────────────────────

const agentSchema = new mongoose.Schema(
  {
    // ── PRD Section 4.6 Profile fields ──────────────────────────────────────
    name:        { type: nameSchema,  required: true },
    phone:       { type: phoneSchema, required: true },
    email:       { type: String, trim: true, lowercase: true, default: null },
    profilePic:  { type: String, default: null }, // PRD: "Profile photo (optional) — does not appear to others"
    dateOfBirth: { type: Date,   default: null },
    nationality: { type: String, default: null },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', null],
      default: null,
    },

    // ── PRD Section 3.1 — Agent type & partner affiliation ──────────────────
    agentType: {
      type: String,
      enum: ['ReferralPartner', 'PartnerAffiliatedAgent'],
      default: 'ReferralPartner',
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      default: null,
    },

    // PRD Section 3.1 & 5.5 — affiliation approval flow
    // Partner has 2 weeks to respond (notify agent), 1 month = account terminated
    affiliationStatus: {
      type: String,
      enum: ['none', 'pending', 'verified', 'rejected'],
      default: 'none',
    },
    affiliationRequestedAt:  { type: Date,   default: null }, // when agent selected partner on signup
    affiliationVerifiedAt:   { type: Date,   default: null },
    affiliationVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      default: null,
    },
    affiliationRejectedAt:   { type: Date,   default: null },
    affiliationRejectionReason: { type: String, default: null },
    // PRD: if no response after 1 month → account terminated
    affiliationTerminatedAt: { type: Date,   default: null },

    // ── PRD Section 4.6 — Identity documents ────────────────────────────────
    // PRD: Emirates ID number + front/back upload OR passport details + upload
    emiratesId:  { type: emiratesIdSchema, default: () => ({}) },
    passport:    { type: passportSchema,   default: () => ({}) },

    // ── PRD Section 4.6 — Banking (for commission eligibility) ──────────────
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },

    // ── Commission ──────────────────────────────────────────────────────────
    // PRD Section 1.2 — only for ReferralPartner; PartnerAffiliatedAgent gets 0 from platform
    freelanceCommission: { type: freelanceCommissionSchema, default: () => ({}) },

    // PRD: PartnerAffiliatedAgent commission is decided by partner company entirely
    // outside the platform — NOT tracked here at all
    // (removed partnerInternalCommission — PRD explicitly excludes this from platform scope)

    earnings: { type: commissionEarningsSchema, default: () => ({}) },

    // ── Account & auth ──────────────────────────────────────────────────────
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    password:    { type: String,  required: true },
    lastLoginAt: { type: Date,    default: null  },

    // PRD Section 4.1 — OTP phone verification on registration
    isPhoneVerified:  { type: Boolean, default: false },
    phoneVerifiedAt:  { type: Date,    default: null  },
    isEmailVerified:  { type: Boolean, default: false },
    emailVerifiedAt:  { type: Date,    default: null  },

    // PRD: profile completion — Emirates ID + bank details required for commission eligibility
    isProfileComplete:            { type: Boolean, default: false },
    profileCompletionPercentage:  { type: Number,  default: 0    },

    // PRD: commission eligibility requires Emirates ID + bank details verified
    commissionEligible:       { type: Boolean, default: false },
    commissionEligibilityReason: { type: String, default: null },

    // ── Admin verification ──────────────────────────────────────────────────
    isVerified:      { type: Boolean, default: false },
    verifiedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    verifiedAt:      { type: Date,    default: null },
    rejectionReason: { type: String,  default: null },

    // ── Account status ──────────────────────────────────────────────────────
    isActive:         { type: Boolean, default: true  },
    isDeleted:        { type: Boolean, default: false },
    suspendedAt:      { type: Date,    default: null  },
    suspendedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    suspensionReason: { type: String,  default: null  },

    // ── Password reset ──────────────────────────────────────────────────────
    resetPasswordToken:   { type: String, default: null },
    resetPasswordExpires: { type: Date,   default: null },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

agentSchema.index({ 'phone.number': 1 }, { unique: true });
agentSchema.index({ email: 1 });
agentSchema.index({ partnerId: 1 });
agentSchema.index({ agentType: 1 });
agentSchema.index({ affiliationStatus: 1 });
agentSchema.index({ isActive: 1 });
agentSchema.index({ isDeleted: 1 });
agentSchema.index({ commissionEligible: 1 });
agentSchema.index({ 'earnings.leaderboardRank': -1 });

// ─── Virtuals ────────────────────────────────────────────────────────────────

agentSchema.virtual('fullName').get(function () {
  return `${this.name.first_name} ${this.name.last_name}`;
});

agentSchema.virtual('fullPhoneNumber').get(function () {
  return `${this.phone.country_code}${this.phone.number}`;
});

// ─── Methods ─────────────────────────────────────────────────────────────────

agentSchema.methods.isActiveAgent = function () {
  return this.isActive && !this.isDeleted && !this.suspendedAt;
};

// PRD Section 4.6 — commission eligibility requires profile complete + Emirates ID + bank details
agentSchema.methods.canEarnCommission = function () {
  if (this.agentType === 'ReferralPartner') {
    return (
      this.isActiveAgent() &&
      this.isPhoneVerified &&
      this.emiratesId?.verified &&
      this.bankDetails?.verified
    );
  }
  // PRD: PartnerAffiliatedAgent earns nothing from platform
  return false;
};

// PRD Section 1.2 — commission % based on loan amount
agentSchema.methods.getCommissionPercentage = function (loanAmount) {
  if (this.agentType !== 'ReferralPartner') return null;
  return loanAmount > 5000000
    ? this.freelanceCommission.above5M
    : this.freelanceCommission.below5M;
};

agentSchema.methods.getCommissionEligibilityStatus = function () {
  if (this.agentType === 'ReferralPartner') {
    if (!this.isActiveAgent())
      return { eligible: false, reason: 'Account is not active' };
    if (!this.isPhoneVerified)
      return { eligible: false, reason: 'Phone not verified' };
    if (!this.emiratesId?.number || !this.emiratesId?.frontImageUrl)
      return { eligible: false, reason: 'Emirates ID not uploaded' };
    if (!this.emiratesId?.verified)
      return { eligible: false, reason: 'Emirates ID not verified by admin' };
    if (!this.bankDetails?.iban)
      return { eligible: false, reason: 'Bank details not provided' };
    if (!this.bankDetails?.verified)
      return { eligible: false, reason: 'Bank details not verified by admin' };
    return { eligible: true, reason: null };
  }
  if (this.agentType === 'PartnerAffiliatedAgent') {
    if (this.affiliationStatus !== 'verified')
      return { eligible: false, reason: `Affiliation status: ${this.affiliationStatus}` };
    return { eligible: false, reason: 'Commission paid to partner company — not tracked on platform' };
  }
  return { eligible: false, reason: 'Unknown agent type' };
};

agentSchema.methods.getPayoutBankDetails = function () {
  if (!this.bankDetails?.iban) return null;
  return {
    beneficiaryName: this.bankDetails.beneficiaryName || this.fullName,
    bankName:        this.bankDetails.bankName,
    accountNumber:   this.bankDetails.accountNumber,
    iban:            this.bankDetails.iban,
  };
};

agentSchema.methods.updateEarningsFromCommission = async function (commissionAmount, isConfirmed = false) {
  this.earnings.totalCommissionEarned += commissionAmount;
  if (!isConfirmed) {
    this.earnings.pendingCommission += commissionAmount;
  }
  if (this.earnings.totalLeadsSubmitted > 0) {
    this.earnings.conversionRate =
      (this.earnings.successfulDisbursals / this.earnings.totalLeadsSubmitted) * 100;
  }
  return this.save();
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

// ─── Pre-save: profile completion ────────────────────────────────────────────
// PRD Section 4.6 — name, phone, email, Emirates ID (number + front image), bank IBAN

agentSchema.pre('save', function (next) {
  const totalFields = 5;
  let completedFields = 0;

  if (this.name?.first_name && this.name?.last_name) completedFields++;
  if (this.phone?.number)                             completedFields++;
  if (this.email)                                     completedFields++;
  if (this.emiratesId?.number && this.emiratesId?.frontImageUrl) completedFields++;
  if (this.bankDetails?.iban)                         completedFields++;

  this.profileCompletionPercentage = Math.round((completedFields / totalFields) * 100);
  this.isProfileComplete           = this.profileCompletionPercentage === 100;

  next();
});

// ─── Model ───────────────────────────────────────────────────────────────────

const VaultAgent = mongoose.models.VaultAgent || mongoose.model('VaultAgent', agentSchema);
module.exports = VaultAgent;