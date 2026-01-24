// models/leads/quotation.model.js
const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  sno: { type: Number, required: true },
  item: { type: String, required: true, trim: true },
  description: { type: String },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.01 },
  unit_price: { type: Number, required: true, min: 0 },
  total: { type: Number } // will be auto-calculated
});

const quotationSchema = new mongoose.Schema({
  estimate: { type: mongoose.Schema.Types.ObjectId, ref: 'Estimate', required: true },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "created_by_model"
  },
  created_by_model: {
    type: String,
    required: true,
    enum: ["Freelancer", "Allusers"]
  },
  role: {
    type: String,
    enum: ["freelancer", "supervisor"],
    required: true
  },

  items: { type: [lineItemSchema], default: [] },
  estimate_type: {
    type: mongoose.Schema.Types.ObjectId, ref: "EstimateMasterType", required: false
  },
  estimate_subcategory: {
    type: mongoose.Schema.Types.ObjectId, ref: "EstimateMasterSubcategory", required: false
  },

  price: { type: Number, required: false, default: 0 },
  // type = EstimateMasterType , subcategory = EstimateMasterSubcategory
  scope_of_work: { type: String, required: true },
  // THESE ARE NOW OPTIONAL — WILL BE AUTO-CALCULATED
  subtotal: { type: Number, default: 0 },
  discount_percent: { type: Number, default: 0, min: 0, max: 100 },
  discount_amount: { type: Number, default: 0 },
  grand_total: { type: Number, default: 0, required: false },
  is_selected_by_supervisor:{type:Boolean,default:false,required:false},

  is_final: { type: Boolean, default: false },
  superadmin_approved: { type: Boolean, default: false },
  superadmin_approved_at: Date,

  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// AUTO CALCULATE TOTALS BEFORE SAVE
quotationSchema.pre('save', function (next) {
  // Recalculate each item total
  this.items = this.items.map(item => {
    const total = Number((item.quantity * item.unit_price).toFixed(2));
    return { ...item, total };
  });

  // Subtotal
  const subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  this.subtotal = Number(subtotal.toFixed(2));

  // Discount
  const discountAmount = Number((this.subtotal * (this.discount_percent / 100)).toFixed(2));
  this.discount_amount = discountAmount;

  // Grand Total
  this.grand_total = Number((this.subtotal - discountAmount).toFixed(2));

  next();
});

module.exports = mongoose.model('Quotation', quotationSchema);