const mongoose = require("mongoose");

const CommissionSchema = new mongoose.Schema({
  deal: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: "Developer" },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },

  propertyPrice: { type: Number },
  commissionType: { type: String, enum: ["fixed", "percentage"], default: "percentage" },
  commissionValue: { type: Number },
  totalCommission: { type: Number },

  milestonePayments: [{
    milestone: { type: String, enum: ["contract_signed", "handover_completed"] },
    percentage: Number,
    amount: Number,
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    paidAt: Date
  }],

  status: {
    type: String,
    enum: ["pending", "approved", "partial", "paid", "rejected"],
    default: "pending"
  },

  paymentDetails: {
    method: { type: String, enum: ["bank_transfer", "crypto", "cheque"] },
    transactionId: String,
    invoiceUrl: String,
    paidAt: Date
  },

  isDeleted: { type: Boolean, default: false },
  deletedAt: Date

}, { timestamps: true });

CommissionSchema.index({ deal: 1 });
CommissionSchema.index({ agent: 1 });
CommissionSchema.index({ developer: 1 });
CommissionSchema.index({ status: 1 });

module.exports = mongoose.models.Commission || mongoose.model("Commission", CommissionSchema);