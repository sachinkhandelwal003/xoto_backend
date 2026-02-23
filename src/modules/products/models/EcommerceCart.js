const mongoose = require("mongoose");

const EcommerceCartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false,
    },
    productColorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductColour",
      required: false
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false
    },
    price: {
      type: Number,
      default: 0,
      required: false,
    },
    quantity: {
      type: Number,
      default: 0,
      required: false,
    },
    pincode: {
      type: String,
      default: "",
      required: false,
    },
    converted_to_deal: {
      type: Boolean,
      default: false,
      required: false,
    }
  },
  { timestamps: true }
);

const EcommerceCartItem = mongoose.model("EcommerceCartItem", EcommerceCartItemSchema, "EcommerceCartItem");
module.exports = EcommerceCartItem;  