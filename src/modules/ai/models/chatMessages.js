// models/ChatMessage.js
import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ["user", "ai"],
    required: true
  },

  receiver: {
    type: String,
    enum: ["ai", "user"],
    required: true
  },

  type: {
    type: String,
    enum: ["text", "audio"],
    required: true
  },

  text: {
    type: String
  },

  audioUrl: {
    type: String
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("ChatMessage", ChatMessageSchema);