const CustomerActivityHistory = require("../modules/history/models/CustomerActivityHistory.js");

// ── Device detection ─────────────────────────────────────────
const detectDevice = (ua = "") => {
  const s = ua.toLowerCase();
  if (/mobile|android|iphone/.test(s)) return "mobile";
  if (/tablet|ipad/.test(s))           return "tablet";
  if (/windows|mac|linux/.test(s))     return "desktop";
  return "unknown";
};

// ── Real IP ───────────────────────────────────────────────────
const getIP = (req) =>
  req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req?.headers?.["x-real-ip"] ||
  req?.ip || "";

// ── Action → Category map ─────────────────────────────────────
const CATEGORY_MAP = {
  LOGIN: "auth", LOGOUT: "auth", REGISTER: "auth",
  PASSWORD_CHANGED: "auth", PASSWORD_RESET_REQUESTED: "auth",
  OTP_SENT: "auth", OTP_VERIFIED: "auth",

  PRODUCT_VIEWED: "product", PRODUCT_SEARCHED: "product",

  CART_ADD: "cart", CART_REMOVE: "cart",
  CART_QUANTITY_UPDATED: "cart", CART_CLEARED: "cart",

  ORDER_PLACED: "order", ORDER_CANCELLED: "order",
  ORDER_DELIVERED: "order", ORDER_VIEWED: "order",

  PAYMENT_SUCCESS: "payment", PAYMENT_FAILED: "payment",
  PAYMENT_COD_PLACED: "payment",
  PAYMENT_TABBY_INITIATED: "payment",
  PAYMENT_TAMARA_INITIATED: "payment",

  AI_IMAGE_GENERATED: "ai_image",
  AI_IMAGE_GENERATION_FAILED: "ai_image",
  AI_IMAGE_DOWNLOADED: "ai_image",
  AI_IMAGE_SAVED: "ai_image",

  AI_CHAT_STARTED: "ai_chat",
  AI_CHAT_MESSAGE_SENT: "ai_chat",
  AI_CHAT_ENDED: "ai_chat",

  AI_ESTIMATION_REQUESTED: "ai_estimation",
  AI_ESTIMATION_COMPLETED: "ai_estimation",
  AI_ESTIMATION_FAILED: "ai_estimation",

  PROFILE_UPDATED: "profile",
  PROFILE_PICTURE_CHANGED: "profile",
  EMAIL_CHANGED: "profile",
  PHONE_CHANGED: "profile",
};

/**
 * Track customer activity
 * @param {Object} options
 * @param {string} options.customerId
 * @param {string} options.action
 * @param {string} options.description
 * @param {Object} [options.metadata]
 * @param {Object} [options.aiData]
 * @param {string} [options.status]
 * @param {Object} [options.req]
 */
const trackCustomerActivity = async ({
  customerId,
  action,
  description,
  metadata = {},
  aiData   = null,
  status   = "success",
  req      = null,
}) => {
  try {
    const ua       = req?.headers?.["user-agent"] || "";
    const category = CATEGORY_MAP[action] || "auth";

    const doc = {
      customerId,
      role:      "customer",
      category,
      action,
      description,
      metadata,
      status,
      ip:        getIP(req),
      userAgent: ua,
      device:    detectDevice(ua),
    };

    if (aiData) doc.aiData = aiData;

    await CustomerActivityHistory.create(doc);
  } catch (err) {
    // Never crash main flow
    console.error("[trackCustomerActivity] Error:", err.message);
  }
};

module.exports = { trackCustomerActivity };