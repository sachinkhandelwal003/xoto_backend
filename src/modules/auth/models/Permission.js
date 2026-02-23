const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  role: { type: String, required: true, unique: true },
  permissions: [{ type: String }],
});

module.exports = mongoose.model('Permission', permissionSchema);