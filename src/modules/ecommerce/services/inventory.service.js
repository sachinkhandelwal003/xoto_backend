const mongoose = require('mongoose');
const Inventory = require("../B2C/models/productInventory.model"); // ✅ fixed import

/* 🔥 ADD STOCK */
exports.addStock = async (productId, qty, sku) => {
  return await Inventory.findOneAndUpdate(
    { product: productId, sku },
    {
      $inc: { quantity: qty },
      $push: {
        movements: {
          type: "in",
          quantity: qty,
          note: "Stock added"
        }
      }
    },
    { new: true, upsert: true }
  );
};

/* 🔥 RESERVE STOCK */
exports.reserveStock = async (productId, qty, session) => {
  const inventory = await Inventory.findOneAndUpdate(
    {
      product: productId,
      $expr: {
        $gte: [{ $subtract: ["$quantity", "$reserved"] }, qty]
      }
    },
    {
      $inc: { reserved: qty },
      $push: {
        movements: {
          type: "out",
          quantity: qty,
          note: "Reserved for order"
        }
      }
    },
    { new: true, session }
  );

  if (!inventory) throw new Error("Out of stock");
  return inventory;
};

/* 🔥 CONFIRM ORDER */
exports.confirmStock = async (productId, qty, session) => {
  const inventory = await Inventory.findOneAndUpdate(
    { product: productId, reserved: { $gte: qty } },
    {
      $inc: { quantity: -qty, reserved: -qty },
      $push: {
        movements: {
          type: "out",
          quantity: qty,
          note: "Order confirmed"
        }
      }
    },
    { new: true, session }
  );

  if (!inventory) throw new Error("Stock confirmation failed");
  return inventory;
};

/* 🔥 RELEASE/CANCEL ORDER */
exports.releaseStock = async (productId, qty, session) => {
  const inventory = await Inventory.findOneAndUpdate(
    { product: productId, reserved: { $gte: qty } },
    {
      $inc: { reserved: -qty },
      $push: {
        movements: {
          type: "adjustment",
          quantity: qty,
          note: "Order cancelled"
        }
      }
    },
    { new: true, session }
  );

  if (!inventory) throw new Error("Release failed");
  return inventory;
};

/* 🔥 MANUAL ADJUST */
exports.adjustStock = async (productId, qty) => {
  return await Inventory.findOneAndUpdate(
    { product: productId },
    {
      $set: { quantity: qty },
      $push: {
        movements: {
          type: "adjustment",
          quantity: qty,
          note: "Manual adjustment"
        }
      }
    },
    { new: true }
  );
};