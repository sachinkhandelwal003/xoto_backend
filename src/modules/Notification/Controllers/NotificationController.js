import Notification from "../Models/NotificationModel.js";
import User from "../../auth/models/User.js";
export const createNotification = async (req, res) => {
  try {
    let {
      receiver,
      receiverType,
      sender,
      senderId,
      senderType,
      notificationType,
      title,
      message
    } = req.body;

    // AUTO FETCH RECEIVER BASED ON receiverType
    if (!receiver && receiverType === "admin") {
      // Find SUPER ADMIN ROLE
  
      // role is stored as STRING in User
      const adminUser = await User.findOne({
        isActive: true
      });

      if (!adminUser) {
        return res.status(404).json({
          success: false,
          message: "Active admin user not found"
        });
      }

      receiver = adminUser._id
    }

    // FINAL SAFETY CHECK
    if (!receiver) {
      return res.status(400).json({
        success: false,
        message: "Receiver is required"
      });
    }

    // CREATE NOTIFICATION
    const notification = await Notification.create({
      receiver,
      receiverType,
      sender,
      senderId,
      senderType,
      notificationType,
      title,
      message
    });

    return res.status(201).json({
      success: true,
      data: notification
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getNotificationsByReceiver = async (req, res) => {
  try {
    const { receiver } = req.params;

    const notifications = await Notification.find({ receiver })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Notification deleted"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Notification id is required"
      });
    }

    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    return res.json({
      success: true,
      data: notification
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};