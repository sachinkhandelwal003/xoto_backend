const router = require("express").Router();
const { protectMulti } = require("../../../middleware/auth");
const {
  getChatHistory,
  getMyChatList,
  markAsRead
} = require("../controllers/chat.controller");

// Chat history fetch karo
router.get("/history/:leadId/:otherUserId", protectMulti, getChatHistory);

// Meri saari chats (inbox)
router.get("/my-chats", protectMulti, getMyChatList);

// Read mark karo
router.put("/mark-read/:room", protectMulti, markAsRead);

module.exports = router;