const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  firstName: { 
    type: String, 
    required: true 
  },
  lastName: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    required: true, 
    unique: true 
  },
  email: { 
    type: String 
  },
  nationality: {
    type: String,
    default: ""
  },
  dateOfBirth: { 
    type: Date 
  },
  profilePhotoUrl: { type: String, default: "" },
  password: { 
    type: String, 
    required: true, 
    select: false // Normal queries me password hide rahega
  },
  role: { 
    type: String, 
    default: "referralPartner" 
  },
  status: { 
    type: String, 
    enum: ["active", "inactive", "suspended"], 
    default: "active" // PRD ke hisaab se direct access
  },
  
  // Profile Completion Fields (Payout ke liye)
  idDocumentUrl: { type: String }, 
  bankDetails: {
    bankName: { type: String },
    accountNumber: { type: String },
    iban: { type: String },
    accountHolderName: { type: String }
  },
  // Add these fields to userSchema:
idDocumentType: {
  type: String,
  enum: ["passport", "emirates_id"],
  default: null,
},
idDocumentUrl: { type: String, default: null },

bankDetails: {
  bankName:          { type: String, default: "" },
  accountNumber:     { type: String, default: "" },
  iban:              { type: String, default: "" },
  accountHolderName: { type: String, default: "" },
},

isPayoutEligible:   { type: Boolean, default: false },
isProfileComplete:  { type: Boolean, default: false },

// Profile completion percentage helper fields
profileCompletionSteps: {
  basicInfo:   { type: Boolean, default: true  }, // filled at registration
  idVerified:  { type: Boolean, default: false },
  bankAdded:   { type: Boolean, default: false },
},
  isProfileComplete: { type: Boolean, default: false }
}, { timestamps: true });

// Password hash karne ka hook
// Replace current pre-save with this:
userSchema.pre("save", async function(next) {
  // Hash password only if modified
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // Auto-calculate profile completion
  const idDone   = !!this.idDocumentUrl;
  const bankDone = !!(
    this.bankDetails?.iban &&
    this.bankDetails?.accountNumber &&
    this.bankDetails?.accountHolderName
  );

  this.profileCompletionSteps = {
    basicInfo:  true,
    idVerified: idDone,
    bankAdded:  bankDone,
  };

  this.isPayoutEligible  = idDone && bankDone;
  this.isProfileComplete = idDone && bankDone;

  next();
});

// Password compare karne ka method
userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// "User" ki jagah "ReferralPartner" likh do
module.exports = mongoose.models.GridReferralPartner || mongoose.model("GridReferralPartner", userSchema);
