import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {

    receiver: {
      type: String,
      default: "",
      required: false
    },

    sender: {
      type: String,
      default: "",
      required: false
    },


    receiverType: {
      type: String,
      enum: ["user", "agent", "admin"],
      default: "user"
    },

    senderType: {
      type: String,
      enum: ["user", "agent", "admin", "system"],
      default: "system"
    },

    notificationType: {
      type: String,
      enum: [
        "NEW_INQUIRY",
        "INQUIRY_REPLY",
        "PRICE_DROP",
        "PROPERTY_APPROVED",
        "PROPERTY_REJECTED"
      ],
      default: "NEW_INQUIRY",
      required: true
    },

    title: {
      type: String,
      default: ""
    },

   
    message: {
      type: String,
      default: ""
    },

    
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

let Notification =  mongoose.model("Notification", notificationSchema);
export default Notification;
