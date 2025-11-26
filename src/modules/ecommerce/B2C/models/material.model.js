
const { Schema, model } = require('mongoose');

const materialSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  properties: [{ type: String, trim: true }],
  status: { type: Number, default: 1 }, // 1: Active, 0: Deleted
  deletedAt: { type: Date }, // Store deletion timestamp
  created_at: { type: Date, default: Date.now }
});

module.exports = model('Material', materialSchema);
