// models/Freelancer/invoice.model.js
const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project_freelancer', required: true },
  milestone: { type: mongoose.Schema.Types.ObjectId, required: true },
  invoice_number: { type: String, unique: true, required: true },
  amount: { type: Number, required: true, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  due_date: { type: Date, required: true },
  paid_at: { type: Date },

  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date }
}, { timestamps: true });

invoiceSchema.index({ project: 1, milestone: 1, invoice_number: 1, status: 1, is_deleted: 1 });

const softDelete = function () { this.where({ is_deleted: false }); };
invoiceSchema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], softDelete);

module.exports = mongoose.model('Invoice_freelancer', invoiceSchema);