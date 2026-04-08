const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema(
  {
    commissionId: { type: String, unique: true, required: true },
    
    caseId: { type: String, required: true },
    leadId: { type: String, default: null },
    proposalId: { type: String, default: null },
    
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
    
    loanAmount: { type: Number, required: true },
    loanTier: { type: String, enum: ['≤5M AED', '>5M AED'], required: true },
    bankCommissionToXoto: { type: Number, required: true },
    recipientPercentage: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    calculationFormula: { type: String, required: true },
    
    referralType: {
      type: String,
      enum: ['Referral Only', 'Referral + Docs', null],
      default: null,
    },
    
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Processing', 'Paid', 'Failed'],
      default: 'Pending',
    },
    
    triggerStatus: { type: String, default: 'Disbursed' },
    disbursedAt: { type: Date, required: true },
    
    confirmedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    confirmedAt: { type: Date, default: null },
    
    paymentMethod: { type: String, enum: ['Bank Transfer', 'Wallet', 'Cheque'], default: 'Bank Transfer' },
    paymentReference: { type: String, default: null },
    paymentSentAt: { type: Date, default: null },
    paymentCompletedAt: { type: Date, default: null },
    paymentFailedReason: { type: String, default: null },
    
    payoutBankDetails: {
      beneficiaryName: { type: String, default: null },
      bankName: { type: String, default: null },
      iban: { type: String, default: null },
      swiftCode: { type: String, default: null },
    },
    
    invoiceNumber: { type: String, default: null },
    invoiceUrl: { type: String, default: null },
    
    notes: { type: String, default: null },
    
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

// Virtuals
commissionSchema.virtual('formattedCommissionAmount').get(function () {
  return `${this.commissionAmount.toLocaleString()} AED`;
});

// Methods
commissionSchema.methods.confirm = function (adminId) {
  this.status = 'Confirmed';
  this.confirmedByAdminId = adminId;
  this.confirmedAt = new Date();
  return this.save();
};

commissionSchema.methods.markAsPaid = function (paymentReference, paymentMethod) {
  this.status = 'Paid';
  this.paymentReference = paymentReference;
  this.paymentMethod = paymentMethod || this.paymentMethod;
  this.paymentSentAt = new Date();
  this.paymentCompletedAt = new Date();
  return this.save();
};

commissionSchema.methods.markAsFailed = function (reason) {
  this.status = 'Failed';
  this.paymentFailedReason = reason;
  return this.save();
};

// Static methods
commissionSchema.statics.calculateCommission = function (bankCommissionToXoto, recipientPercentage) {
  const commissionAmount = (bankCommissionToXoto * recipientPercentage) / 100;
  const formula = `${bankCommissionToXoto} × ${recipientPercentage}% = ${commissionAmount}`;
  return { commissionAmount, formula };
};

commissionSchema.statics.getLoanTier = function (loanAmount) {
  return loanAmount <= 5000000 ? '≤5M AED' : '>5M AED';
};

const Commission = mongoose.models.Commission || mongoose.model('Commission', commissionSchema);
module.exports = Commission;