// models/ChatMessage.js
import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  session_id:{
    type: String,
    default:"",
    trim:true,
  },
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
},{
  timestamps:true
});

export default mongoose.model("ChatMessage", ChatMessageSchema);
