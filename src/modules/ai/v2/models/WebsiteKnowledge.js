const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  url:         { type: String, required: true, unique: true },
  path:        { type: String, default: '' },
  title:       { type: String, default: '' },
  description: { type: String, default: '' },
  content:     { type: String, default: '' },
  sections:    [{ heading: String, text: String }],
  keywords:    [String],
  lastCrawled: { type: Date, default: Date.now }
}, { timestamps: true });

schema.index({ title: 'text', content: 'text', keywords: 'text' });

module.exports = mongoose.model('WebsiteKnowledge', schema);
