import mongoose from "mongoose";

const commissionSchema = new mongoose.Schema(
  {
    // Unique Identifier
    commissionId: { type: String, unique: true, required: true },
    
    // Associated Entities
    caseId: { type: String, required: true },
    leadId: { type: String, default: null },
    proposalId: { type: String, default: null },
    
    // Recipient Information
    recipientRole: {
      type: String,
      enum: ['freelance_agent', 'partner'],
      required: true,
    },
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'recipientModel' },
    recipientModel: {
      type: String,
      enum: ['VaultAgent', 'Partner'],
      required: true,
    },
    recipientName: { type: String, required: true },
    
    // Commission Calculation
    loanAmount: { type: Number, required: true },
    loanTier: { type: String, enum: ['≤5M AED', '>5M AED'], required: true },
    bankCommissionToXoto: { type: Number, required: true },
    recipientPercentage: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    calculationFormula: { type: String, required: true },
    
    // Referral Type (only for Freelance Agent)
    referralType: {
      type: String,
      enum: ['Referral Only', 'Referral + Docs', null],
      default: null,
    },
    
    // Status
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Processing', 'Paid', 'Failed'],
      default: 'Pending',
    },
    
    // Trigger Information
    triggerStatus: { type: String, default: 'Disbursed' },
    disbursedAt: { type: Date, required: true },
    
    // Confirmation
    confirmedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    confirmedAt: { type: Date, default: null },
    
    // Payment Information
    paymentMethod: { type: String, enum: ['Bank Transfer', 'Wallet', 'Cheque'], default: 'Bank Transfer' },
    paymentReference: { type: String, default: null },
    paymentSentAt: { type: Date, default: null },
    paymentCompletedAt: { type: Date, default: null },
    paymentFailedReason: { type: String, default: null },
    
    // Bank Details at time of payment (snapshot)
    payoutBankDetails: {
      beneficiaryName: { type: String, default: null },
      bankName: { type: String, default: null },
      iban: { type: String, default: null },
      swiftCode: { type: String, default: null },
    },
    
    // Invoice
    invoiceNumber: { type: String, default: null },
    invoiceUrl: { type: String, default: null },
    
    // Notes
    notes: { type: String, default: null },
    
    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
commissionSchema.index({ commissionId: 1 }, { unique: true });
commissionSchema.index({ caseId: 1 });
commissionSchema.index({ leadId: 1 });
commissionSchema.index({ recipientRole: 1, recipientId: 1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ createdAt: -1 });
commissionSchema.index({ paymentCompletedAt: 1 });

// Virtual for formatted amount
commissionSchema.virtual('formattedCommissionAmount').get(function () {
  return `${this.commissionAmount.toLocaleString()} AED`;
});

// Virtual for formatted loan amount
commissionSchema.virtual('formattedLoanAmount').get(function () {
  return `${this.loanAmount.toLocaleString()} AED`;
});

// Method to confirm commission
commissionSchema.methods.confirm = function (adminId) {
  this.status = 'Confirmed';
  this.confirmedByAdminId = adminId;
  this.confirmedAt = new Date();
  return this.save();
};

// Method to mark as paid
commissionSchema.methods.markAsPaid = function (paymentReference, paymentMethod) {
  this.status = 'Paid';
  this.paymentReference = paymentReference;
  this.paymentMethod = paymentMethod || this.paymentMethod;
  this.paymentSentAt = new Date();
  this.paymentCompletedAt = new Date();
  return this.save();
};

// Method to mark as failed
commissionSchema.methods.markAsFailed = function (reason) {
  this.status = 'Failed';
  this.paymentFailedReason = reason;
  return this.save();
};

// Static method to calculate commission
commissionSchema.statics.calculateCommission = function (bankCommissionToXoto, recipientPercentage) {
  const commissionAmount = (bankCommissionToXoto * recipientPercentage) / 100;
  const formula = `${bankCommissionToXoto} × ${recipientPercentage}% = ${commissionAmount}`;
  return { commissionAmount, formula };
};

// Static method to get loan tier
commissionSchema.statics.getLoanTier = function (loanAmount) {
  return loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
};

const Commission = mongoose.models.Commission || mongoose.model('Commission', commissionSchema);
export default Commission;