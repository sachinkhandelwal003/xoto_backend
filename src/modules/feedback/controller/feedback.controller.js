const Feedback = require("../model/feedback.model");

// ── Submit Feedback ───────────────────────────────────────────────────────────
const submitFeedback = async (req, res) => {
  try {
    const {
      full_name,
      email,
      feedback_type,
      overall_experience,
      feedback_text,
      page_or_feature,
      agreed_to_terms,
    } = req.body;

    // ── Manual Validations ────────────────────────────────────────────────────
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, message: "Full name is required" });
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    const allowedTypes = [
      "general_feedback",
      "bug_report",
      "feature_request",
      "complaint",
      "compliment",
    ];
    if (!feedback_type || !allowedTypes.includes(feedback_type)) {
      return res.status(400).json({ success: false, message: "Valid feedback type is required" });
    }

    const rating = Number(overall_experience);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Overall experience must be between 1 and 5" });
    }

    if (!feedback_text || feedback_text.trim().length < 20) {
      return res.status(400).json({ success: false, message: "Feedback must be at least 20 characters" });
    }

    if (!agreed_to_terms) {
      return res.status(400).json({ success: false, message: "You must agree to the privacy policy" });
    }

    // ── Save to DB ────────────────────────────────────────────────────────────
    const feedback = await Feedback.create({
      full_name: full_name.trim(),
      email: email.toLowerCase().trim(),
      feedback_type,
      overall_experience: rating,
      feedback_text: feedback_text.trim(),
      page_or_feature: page_or_feature?.trim() || null,
      agreed_to_terms,
    });

    return res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      data: feedback,
    });

  } catch (err) {
    // Mongoose validation errors
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }

    console.error("Feedback submit error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── Get All Feedbacks (Admin) ─────────────────────────────────────────────────
const getAllFeedbacks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      feedback_type,
      overall_experience,
      sort = "newest",
    } = req.query;

    const filter = {};
    if (feedback_type) filter.feedback_type = feedback_type;
    if (overall_experience) filter.overall_experience = Number(overall_experience);

    const sortOption = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const skip = (Number(page) - 1) * Number(limit);

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter).sort(sortOption).skip(skip).limit(Number(limit)),
      Feedback.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      data: feedbacks,
    });

  } catch (err) {
    console.error("Get feedbacks error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── Get Single Feedback ───────────────────────────────────────────────────────
const getFeedbackById = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found" });
    }
    return res.status(200).json({ success: true, data: feedback });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── Delete Feedback (Admin) ───────────────────────────────────────────────────
const deleteFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found" });
    }
    return res.status(200).json({ success: true, message: "Feedback deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  submitFeedback,
  getAllFeedbacks,
  getFeedbackById,
  deleteFeedback,
};