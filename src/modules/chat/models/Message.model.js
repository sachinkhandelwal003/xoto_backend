const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  room: {
    type:     String,
    required: true,
    index:    true
  },
  sender: {
    type:     mongoose.Schema.Types.ObjectId,
    required: false,
  },
  senderType: {
    type:     String,
    enum:     ["agent", "developer"],
    required: true
  },
  senderName: {
    type:     String,
    required: false,     // ← CHANGE
    default:  "Unknown"  // ← ADD
  },
  message: {
    type:     String,
    required: true
  },
  lead: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "Lead",
    required: true
  },
  isRead: {
    type:    Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.models.Message ||
  mongoose.model("Message", MessageSchema);