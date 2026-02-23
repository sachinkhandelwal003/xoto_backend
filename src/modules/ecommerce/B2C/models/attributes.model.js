const { Schema, model } = require('mongoose');

const attributeSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  values: [{ type: String, trim: true }],
  created_at: { type: Date, default: Date.now }
});


module.exports = model('Attribute', attributeSchema);