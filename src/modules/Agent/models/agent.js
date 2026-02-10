const mongoose = require("mongoose");
const AgentSchema = new mongoose.Schema({
      // Personal Info
  first_name: {
    type: String,
    required: true,
    trim: true
  },

  last_name: {
    type: String,
    required: true,
    trim: true
  },

  name: {
    type: String, // Auto combine first + last
    trim: true
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    trim: true
  },

  password: {
    type: String,
    required: true,
    minlength: 6
  },

  // Phone
  country_code: {
    type: String,
    default: "+971"
  },

  phone_number: {
    type: String,
    required: true,
    unique: true
  },

  // Work Info
  operating_city: {
    type: String,
    required: true,
    trim: true
  },

  specialization: {
    type: String,
    required: true,
    trim: true
  },

  // Documents (Images / PDFs)
  profile_photo: {
    type: String, // URL
    default: ""
  },

  id_proof: {
    type: String, // URL
    default: ""
  },

  rera_certificate: {
    type: String, // URL
    default: ""
  },

  // Status
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  isVerified: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });


// Auto generate full name
AgentSchema.pre("save", function (next) {
  this.name = `${this.first_name} ${this.last_name}`;
  next();
});

// Pehle check karega agar model exist karta hai, warna naya banayega
module.exports = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);
// module.exports = mongoose.model("Agent", AgentSchema);