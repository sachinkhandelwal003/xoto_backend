const ChatRequest = require("../models/ChatRequest.model");

exports.createRequest = async (req, res) => {
  try {
    const { reason, topic, leadId } = req.body;
    const agent = req.user;

    // ✅ Lead se developer ID nikalo
    const Lead = require("../../Agent/models/AgentLeaad"); // tumhara path
    const lead = await Lead.findById(leadId);
    const developerId = lead?.developer || null;

    const existing = await ChatRequest.findOne({
      agent: agent._id, lead: leadId, status: "pending",
    });

    if (existing) {
      return res.json({ success: false, message: "Request already exists." });
    }

    const request = await ChatRequest.create({
      agent:     agent._id,
      agentName: `${agent.first_name || ""} ${agent.last_name || ""}`.trim(),
      reason,
      topic:     topic || "general",
      lead:      leadId || null,
      developer: developerId, // 
    });

    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Agent ke liye — kya is lead pe approved request hai?
exports.checkApproval = async (req, res) => {
  try {
    const { leadId } = req.query;
    const agentId    = req.user._id;

    const approved = await ChatRequest.findOne({
      agent:  agentId,
      lead:   leadId,
      status: "approved",
    });

    res.json({ success: true, approved: !!approved, request: approved || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Developer ke liye — uski leads ki approved requests
exports.getDeveloperApproved = async (req, res) => {
  try {
    // ✅ Ab directly developer field se filter karo
    const requests = await ChatRequest.find({
      developer: req.user._id,
      status:    "approved",
    })
    .populate({
      path: "lead",
      populate: { path: "agent", select: "first_name last_name email" },
    })
    .sort({ updatedAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin → Saari requests
exports.getAllRequests = async (req, res) => {
  try {
    const requests = await ChatRequest.find()
      .populate("agent", "first_name last_name email")
      .populate("lead",  "name status developer")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin → Approve karo
exports.approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ChatRequest.findByIdAndUpdate(
      id,
      { status: "approved", reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true }
    )
    .populate("agent", "first_name last_name email")
    .populate({
      path: "lead",
      populate: { path: "developer", select: "_id first_name last_name" },
    });

    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin → Reject karo
exports.rejectRequest = async (req, res) => {
  try {
    const { id }              = req.params;
    const { rejectionReason } = req.body;

    const request = await ChatRequest.findByIdAndUpdate(
      id,
      {
        status:          "rejected",
        rejectionReason: rejectionReason || "Request rejected by admin",
        reviewedBy:      req.user._id,
        reviewedAt:      new Date(),
      },
      { new: true }
    ).populate("agent", "first_name last_name email");

    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Agent → Apni requests
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ChatRequest.find({ agent: req.user._id })
      .populate({
        path: "lead",
        populate: { path: "developer", select: "_id first_name last_name company_name" },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};