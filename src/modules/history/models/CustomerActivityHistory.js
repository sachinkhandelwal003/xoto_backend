// ─────────────────────────────────────────────────────────────
// src/modules/history/models/CustomerActivityHistory.js
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const CustomerActivityHistorySchema = new mongoose.Schema(
  {
    // ── WHO ────────────────────────────────────────────────
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Customer",
    },
    role: {
      type: String,
      default: "customer",
    },

    // ── CATEGORY ───────────────────────────────────────────
    category: {
      type: String,
      required: true,
      enum: [
        "auth",
        "cart",
        "order",
        "payment",
        "product",
        "ai_image",
        "ai_chat",
        "ai_estimation",
        "profile",
      ],
    },

    // ── ACTION ─────────────────────────────────────────────
    action: {
      type: String,
      required: true,
      enum: [
        // Auth
        "LOGIN", "LOGOUT", "REGISTER",
        "PASSWORD_CHANGED", "PASSWORD_RESET_REQUESTED",
        "OTP_SENT", "OTP_VERIFIED",

        // Product
        "PRODUCT_VIEWED", "PRODUCT_SEARCHED",

        // Cart
        "CART_ADD", "CART_REMOVE",
        "CART_QUANTITY_UPDATED", "CART_CLEARED",

        // Order
        "ORDER_PLACED", "ORDER_CANCELLED",
        "ORDER_DELIVERED", "ORDER_VIEWED",

        // Payment
        "PAYMENT_SUCCESS", "PAYMENT_FAILED",
        "PAYMENT_COD_PLACED",
        "PAYMENT_TABBY_INITIATED",
        "PAYMENT_TAMARA_INITIATED",

        // AI Image
        "AI_IMAGE_GENERATED", "AI_IMAGE_GENERATION_FAILED",
        "AI_IMAGE_DOWNLOADED", "AI_IMAGE_SAVED",

        // AI Chat
        "AI_CHAT_STARTED", "AI_CHAT_MESSAGE_SENT", "AI_CHAT_ENDED",

        // AI Estimation
        "AI_ESTIMATION_REQUESTED",
        "AI_ESTIMATION_COMPLETED",
        "AI_ESTIMATION_FAILED",

        // Profile
        "PROFILE_UPDATED", "PROFILE_PICTURE_CHANGED",
        "EMAIL_CHANGED", "PHONE_CHANGED",
      ],
    },

    // ── DESCRIPTION ────────────────────────────────────────
    description: {
      type: String,
      required: true,
    },

    // ── EXTRA DATA ─────────────────────────────────────────
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ── AI SPECIFIC ────────────────────────────────────────
    aiData: {
      prompt:         { type: String },
      model:          { type: String },
      creditsUsed:    { type: Number, default: 0 },
      responseTime:   { type: Number },
      imageUrl:       { type: String },
      chatSessionId:  { type: String },
      estimationType: { type: String },
      result:         { type: mongoose.Schema.Types.Mixed },
    },

    // ── CONTEXT ────────────────────────────────────────────
    ip:        { type: String, default: "" },
    userAgent: { type: String, default: "" },
    device: {
      type: String,
      enum: ["mobile", "tablet", "desktop", "unknown"],
      default: "unknown",
    },

    // ── STATUS ─────────────────────────────────────────────
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "success",
    },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────
CustomerActivityHistorySchema.index({ customerId: 1, createdAt: -1 });
CustomerActivityHistorySchema.index({ customerId: 1, category: 1, createdAt: -1 });
CustomerActivityHistorySchema.index({ customerId: 1, action: 1 });
CustomerActivityHistorySchema.index({ createdAt: -1 });

const CustomerActivityHistory = mongoose.model(
  "CustomerActivityHistory",
  CustomerActivityHistorySchema,
  "CustomerActivityHistory"
);

module.exports = CustomerActivityHistory;