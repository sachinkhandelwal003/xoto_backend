// modules/auth/models/action/action.model.js
const mongoose = require("mongoose");

const ActionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },  // e.g., "create", "approve"
  description: { type: String, trim: true },           // e.g., "Can approve vendor requests"
  moduleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Module", 
    required: true 
  } // each action belongs to a module
}, { timestamps: true });

const Action = mongoose.model("Action", ActionSchema);

module.exports = { Action };