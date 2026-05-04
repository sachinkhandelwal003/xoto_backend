const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Invalid email address"],
    },

    feedback_type: {
      type: String,
      required: [true, "Feedback type is required"],
      enum: [
        "general_feedback",
        "bug_report",
        "feature_request",
        "complaint",
        "compliment",
      ],
    },

    overall_experience: {
      type: Number,
      required: [true, "Overall experience rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },

    feedback_text: {
      type: String,
      required: [true, "Feedback text is required"],
      minlength: [20, "Feedback must be at least 20 characters"],
      trim: true,
    },

    page_or_feature: {
      type: String,
      trim: true,
      default: null,
    },

    agreed_to_terms: {
      type: Boolean,
      required: [true, "You must agree to the terms"],
      validate: {
        validator: (v) => v === true,
        message: "You must agree to the privacy policy",
      },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt auto add hoga
  }
);

module.exports = mongoose.model("Feedback", feedbackSchema);