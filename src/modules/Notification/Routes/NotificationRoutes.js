import express from "express";
import {
  createNotification,
getNotificationsByReceiver,
  markAsRead,
  deleteNotification,
  getAllNotifications,markAllAsRead
} from "../Controllers/NotificationController.js";

const router = express.Router();

// CREATE
router.post("/create-notification", createNotification);
//GET
router.get("/receiver-notification/:receiver", getNotificationsByReceiver);
// Mark as read
router.put("/read-notification/:id", markAsRead);
router.put("/read-all-notifications", markAllAsRead);

// DELETE
router.delete("/delete-notification", deleteNotification);

// GET ALL notifications
router.get("/get-all", getAllNotifications);
export default router;
