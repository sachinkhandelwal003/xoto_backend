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
  dateOfBirth: { 
    type: Date 
  },
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
  isProfileComplete: { type: Boolean, default: false }
}, { timestamps: true });

// Password hash karne ka hook
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  
  // Check if profile is complete
  if (this.idDocumentUrl && this.bankDetails?.iban) {
    this.isProfileComplete = true;
  }
  next();
});

// Password compare karne ka method
userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// "User" ki jagah "ReferralPartner" likh do
module.exports = mongoose.models.gridReferralPartner || mongoose.model("gridReferralPartner", userSchema);