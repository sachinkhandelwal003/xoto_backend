const History = require('../models/VaultHistory');
const HistoryService = require('../services/history.service');

// ==================== GET ENTITY HISTORY ====================
const getEntityHistory = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { limit = 50, skip = 0, action = null, fromDate = null, toDate = null } = req.query;
    
    const result = await History.getEntityHistory(entityType, entityId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      action,
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
    });
    
    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        skip: result.skip,
        limit: result.limit,
        hasMore: result.skip + result.limit < result.total,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET USER TIMELINE ====================
const getUserTimeline = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0, fromDate = null, toDate = null } = req.query;
    
    const result = await History.getUserTimeline(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
    });
    
    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        skip: result.skip,
        limit: result.limit,
        hasMore: result.skip + result.limit < result.total,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET DASHBOARD SUMMARY ====================
const getDashboardSummary = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const recentActivities = await History.getDashboardSummary(parseInt(limit));
    
    return res.status(200).json({
      success: true,
      data: recentActivities,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET STATISTICS ====================
const getStatistics = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = toDate ? new Date(toDate) : new Date();
    
    const [actionStats, entityStats, roleStats] = await Promise.all([
      History.getActionStats(from, to),
      History.getEntityStats(from, to),
      History.getActivityByRole(from, to),
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        actions: actionStats,
        entities: entityStats,
        byRole: roleStats,
        period: { from, to },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SEARCH HISTORY ====================
const searchHistory = async (req, res) => {
  try {
    const { q, limit = 50, skip = 0 } = req.query;
    
    if (!q) {
      return res.status(400).json({ success: false, message: "Search term required" });
    }
    
    const results = await History.searchHistory(q, {
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
    
    const total = results.length;
    
    return res.status(200).json({
      success: true,
      data: results,
      pagination: {
        total,
        skip: parseInt(skip),
        limit: parseInt(limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DELETE HISTORY (Admin only) ====================
const deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await History.findOne({ historyId: id });
    
    if (!history) {
      return res.status(404).json({ success: false, message: "History record not found" });
    }
    
    await history.softDelete();
    
    return res.status(200).json({ success: true, message: "History record deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== CLEANUP OLD HISTORY (Admin only) ====================
const cleanupOldHistory = async (req, res) => {
  try {
    const { days = 730 } = req.query; // Default 2 years
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    const result = await History.updateMany(
      { createdAt: { $lt: cutoffDate }, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() }
    );
    
    return res.status(200).json({
      success: true,
      message: `Cleaned up ${result.modifiedCount} old history records`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getEntityHistory,
  getUserTimeline,
  getDashboardSummary,
  getStatistics,
  searchHistory,
  deleteHistory,
  cleanupOldHistory,
};