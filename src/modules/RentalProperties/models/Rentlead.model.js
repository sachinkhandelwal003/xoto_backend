const mongoose = require("mongoose");

const RentalLeadSchema = new mongoose.Schema(
  {
    // 🏠 PROPERTY INFO (denormalized for fast admin view)
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalProperty",
      required: true,
    },
    propertyTitle: {
      type: String,
      default: "",
    },
    propertyArea: {
      type: String,
      default: "",
    },
    propertyEmirate: {
      type: String,
      default: "",
    },
    propertyPrice: {
      type: Number,
      default: 0,
    },

    // 👤 CUSTOMER INFO (denormalized)
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerName: {
      type: String,
      default: "",
    },
    customerEmail: {
      type: String,
      default: "",
    },
    customerPhone: {
      type: String,
      default: "",
    },

    // 🤝 ASSIGNED AGENT
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAgentName: {
      type: String,
      default: "",
    },
    assignedAt: {
      type: Date,
      default: null,
    },

    // 📊 STATUS FLOW
    // new → assigned → contacted → closed / lost
    status: {
      type: String,
      enum: ["new", "assigned", "contacted", "closed", "lost"],
      default: "new",
    },

    // 📝 NOTES
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast admin queries
RentalLeadSchema.index({ status: 1 });
RentalLeadSchema.index({ property: 1 });
RentalLeadSchema.index({ customer: 1 });
RentalLeadSchema.index({ assignedAgent: 1 });
RentalLeadSchema.index({ createdAt: -1 });

// Prevent duplicate leads: same customer + same property
RentalLeadSchema.index({ property: 1, customer: 1 }, { unique: true });

module.exports = mongoose.model("RentalLead", RentalLeadSchema);