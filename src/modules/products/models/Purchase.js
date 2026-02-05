const mongoose = require("mongoose");

const PurchaseSchema = new mongoose.Schema(
  {
    EcommerceCartitems: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "EcommerceCartItem",
      required: false,
    }],
    total_price: {
      type: Number,
      default: 0,
      required: false
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false
    },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "paid", "failed", "cancelled"],
      required: false
    },
    payment_id: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      default: null
    }
  },
  { timestamps: true }
);

const Purchase = mongoose.model("Purchase", PurchaseSchema, "Purchase");
module.exports = Purchase;


// Purchase schema

// EcommerceCartitems:[]
// total_price:
// customer_id:
// status:[]
// payment_id: Transaction_id