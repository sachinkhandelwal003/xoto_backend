const Message = require("../models/Message.model");
const Lead    = require("../../Agent/models/AgentLeaad"); // tumhara Lead model path



const getRoomId = (agentId, developerId, leadId) => {
  if (!agentId || !developerId || !leadId) return null;
  return [agentId.toString(), developerId.toString(), leadId.toString()]
    .sort()
    .join("_");
};

// GET — Chat history fetch karo
exports.getChatHistory = async (req, res) => {
  try {
    const { leadId, otherUserId } = req.params;
    const myId = req.user._id;

    const room = getRoomId(myId, otherUserId, leadId);

    const messages = await Message.find({ room })
      .sort({ createdAt: 1 })
      .limit(100);

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET — Mere saare active chats (inbox)
exports.getMyChatList = async (req, res) => {
  try {
    const myId = req.user._id.toString();

    // Wo rooms jisme mera ID hai
    const rooms = await Message.aggregate([
      {
        $match: {
          room: { $regex: myId }
        }
      },
      {
        $group: {
          _id: "$room",
          lastMessage: { $last: "$message" },
          lastTime:    { $last: "$createdAt" },
          lead:        { $last: "$lead" },
          unread: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ["$isRead", false] },
                  { $ne: ["$sender", req.user._id] }
                ]},
                1, 0
              ]
            }
          }
        }
      },
      { $sort: { lastTime: -1 } }
    ]);

    res.json({ success: true, data: rooms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT — Messages read mark karo
exports.markAsRead = async (req, res) => {
  try {
    const { room } = req.params;
    await Message.updateMany(
      { room, sender: { $ne: req.user._id }, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports.getRoomId = getRoomId;