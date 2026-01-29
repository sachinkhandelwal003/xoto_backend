import express from "express";
import {
  createNotification,
getNotificationsByReceiver,
  markAsRead,
  deleteNotification,
  getAllNotifications
} from "../Controllers/NotificationController.js";

const router = express.Router();

// CREATE
router.post("/create-notification", createNotification);
//GET
router.get("/receiver-notification", getNotificationsByReceiver);
// Mark as read
router.patch("/read-notification", markAsRead);

// DELETE
router.delete("/delete-notification", deleteNotification);

// GET ALL notifications
router.get("/get-all", getAllNotifications);
export default router;
