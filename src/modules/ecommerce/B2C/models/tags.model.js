const { Schema, model } = require('mongoose');

const tagSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, trim: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Index for faster searching

const Tag = model('Tag', tagSchema);

module.exports = Tag;
