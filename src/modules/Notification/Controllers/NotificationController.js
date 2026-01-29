import Notification from "../Models/NotificationModel.js";

export const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create(req.body);

    res.status(201).json({
      success: true,
      data: notification
    });
  } catch (err) {
    res.status(400).json({
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

    res.json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (err) {
    res.status(500).json({
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
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    res.json({
      success: true,
      data: notification
    });
  } catch (err) {
    res.status(500).json({
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