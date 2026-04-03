// ─────────────────────────────────────────────────────────────
// src/modules/history/controllers/customerHistory.controller.js
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");
const CustomerActivityHistory = require("../models/CustomerActivityHistory.js");

// ─────────────────────────────────────────────────────────────
// GET /customer-history/my
// ─────────────────────────────────────────────────────────────
const getCustomerMyHistory = async (req, res) => {
  try {
    const customerId = req.user?._id || req.user?.id;
    const { page = 1, limit = 20, category, action, status, startDate, endDate } = req.query;

    const query = { customerId };
    if (category)  query.category = category;
    if (action)    query.action   = action;
    if (status)    query.status   = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate)   query.createdAt.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [history, total] = await Promise.all([
      CustomerActivityHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      CustomerActivityHistory.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "History fetched successfully",
      data: history,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /customer-history/my/summary
// ─────────────────────────────────────────────────────────────
const getCustomerSummary = async (req, res) => {
  try {
    const customerId = req.user?._id || req.user?.id;
    const cid = new mongoose.Types.ObjectId(customerId);

    const [categorySummary, recentActivity, aiSummary, orderStats, loginStats] =
      await Promise.all([

        CustomerActivityHistory.aggregate([
          { $match: { customerId: cid } },
          { $group: { _id: "$category", count: { $sum: 1 }, lastSeen: { $max: "$createdAt" } } },
          { $sort: { count: -1 } },
        ]),

        CustomerActivityHistory.find({ customerId })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),

        CustomerActivityHistory.aggregate([
          { $match: { customerId: cid, category: { $in: ["ai_image", "ai_chat", "ai_estimation"] } } },
          {
            $group: {
              _id:           "$category",
              totalRequests: { $sum: 1 },
              successCount:  { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
              failedCount:   { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
              creditsUsed:   { $sum: "$aiData.creditsUsed" },
              lastUsed:      { $max: "$createdAt" },
            },
          },
        ]),

        CustomerActivityHistory.aggregate([
          { $match: { customerId: cid, category: "order" } },
          { $group: { _id: "$action", count: { $sum: 1 }, totalSpent: { $sum: "$metadata.total" } } },
        ]),

        CustomerActivityHistory.aggregate([
          { $match: { customerId: cid, action: "LOGIN" } },
          { $group: { _id: null, totalLogins: { $sum: 1 }, lastLogin: { $max: "$createdAt" } } },
        ]),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        categorySummary,
        recentActivity,
        aiSummary,
        orderStats,
        loginStats: loginStats[0] || { totalLogins: 0, lastLogin: null },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /customer-history/my/orders
// ─────────────────────────────────────────────────────────────
const getCustomerOrderHistory = async (req, res) => {
  try {
    const customerId = req.user?._id || req.user?.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      CustomerActivityHistory.find({ customerId, category: "order" })
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      CustomerActivityHistory.countDocuments({ customerId, category: "order" }),
    ]);

    return res.status(200).json({
      success: true,
      data: orders,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /customer-history/my/ai
// ─────────────────────────────────────────────────────────────
const getCustomerAIHistory = async (req, res) => {
  try {
    const customerId = req.user?._id || req.user?.id;
    const { page = 1, limit = 10, type } = req.query;

    const query = { customerId, category: { $in: ["ai_image", "ai_chat", "ai_estimation"] } };
    if (type) query.category = type;

    const skip = (Number(page) - 1) * Number(limit);

    const [aiHistory, total] = await Promise.all([
      CustomerActivityHistory.find(query)
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      CustomerActivityHistory.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: aiHistory,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /customer-history/my/logins
// ─────────────────────────────────────────────────────────────
const getCustomerLoginHistory = async (req, res) => {
  try {
    const customerId = req.user?._id || req.user?.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [logins, total] = await Promise.all([
      CustomerActivityHistory.find({ customerId, category: "auth", action: { $in: ["LOGIN", "LOGOUT"] } })
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      CustomerActivityHistory.countDocuments({ customerId, category: "auth", action: { $in: ["LOGIN", "LOGOUT"] } }),
    ]);

    return res.status(200).json({
      success: true,
      data: logins,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /customer-history/admin/:customerId  — Admin only
// ─────────────────────────────────────────────────────────────
const getCustomerHistoryByAdmin = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 20, category, action, status } = req.query;

    const query = { customerId };
    if (category) query.category = category;
    if (action)   query.action   = action;
    if (status)   query.status   = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [history, total] = await Promise.all([
      CustomerActivityHistory.find(query)
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      CustomerActivityHistory.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: history,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getCustomerMyHistory,
  getCustomerSummary,
  getCustomerOrderHistory,
  getCustomerAIHistory,
  getCustomerLoginHistory,
  getCustomerHistoryByAdmin,
};