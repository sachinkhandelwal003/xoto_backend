// controllers/aiSuggestionController.js
const { getSuggestionsFromForm } = require("../controllers/aiSuggestionService");

const getPropertySuggestions = async (req, res) => {
  try {
    // ✅ Get data from request body
    const formData = req.body;
    
    console.log("📥 Received form data:", formData);

    // Check if at least one search criteria is provided
    if (!formData.budget && !formData.bedrooms && !formData.preferred_location && !formData.property_type) {
      return res.status(400).json({
        success: false,
        message: "At least one search criteria is required"
      });
    }

    // ✅ Call your service with formData
    const suggestions = await getSuggestionsFromForm(formData);

    return res.status(200).json({
      success: true,
      count: suggestions.length,
      data: suggestions
    });

  } catch (error) {
    console.error("❌ AI Suggestion Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getPropertySuggestions
};