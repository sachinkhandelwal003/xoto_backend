import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {

    receiver: {
      type: String,
      default: "",
      required: false
    },

    senderId: {
      type: String,
      default: "",
      required: false
    },

     sender: {
    email: { type: String},
  full_name:  { type: String },
  mobile: {
    country_code: { type: String },
    number: {
      type: String,
    }
  }

  },


    receiverType: {
      type: String,
      enum: ["user", "agent", "admin","supervisor","freelancer","vendor","accountant"],
      default: "user"
    },

    senderType: {
      type: String,
      enum: ["user", "agent", "admin","supervisor","freelancer","vendor","accountant"],
      default: "system"
    },

    notificationType: {
      type: String,
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

const Notification =  mongoose.model("Notification", notificationSchema);
export default Notification;
