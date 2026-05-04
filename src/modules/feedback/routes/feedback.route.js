const express = require("express");
const router = express.Router();
const {
  submitFeedback,
  getAllFeedbacks,
  getFeedbackById,
  deleteFeedback,
} = require("../controller/feedback.controller");

// Public
router.post("/submit", submitFeedback);

// Admin (apna auth middleware laga dena)
router.get("/all", getAllFeedbacks);
router.get("/:id", getFeedbackById);
router.delete("/:id", deleteFeedback);

module.exports = router;