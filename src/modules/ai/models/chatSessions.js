import mongoose from "mongoose";

const chatSessionSchema = new mongoose.Schema(
  {
    session_id: { type: String, required: true, unique: true },

    isPotentialCustomer: { type: Boolean, default: false },
    waitingForLead: { type: Boolean, default: false },

    assistanceAsked: { type: Boolean, default: false },
    assistanceAccepted: { type: Boolean, default: false },

    contactAsked: { type: Boolean, default: false },
    contactProvided: { type: Boolean, default: false },

    name: String,
    phone: String,
    city: String,

    leadCreated: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model("ChatSession", chatSessionSchema);
