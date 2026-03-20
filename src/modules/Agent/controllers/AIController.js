const axios = require('axios');

// 🔥 1. Translate API Logic
exports.translateText = async (req, res) => {
  try {
    const { text, targetLang } = req.body;

    // Validation
    if (!text || !targetLang) {
      return res.status(400).json({ 
        success: false, 
        message: "Text aur targetLang dono zaroori hain." 
      });
    }

    // OpenAI API Call
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini", // Fast aur cost-effective model for translation
      messages: [
        {
          role: "system",
          content: `You are a professional real estate translator. Translate the following text to ${targetLang} language. Return ONLY the translated text, no explanations, no conversational text.`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.3,
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const translatedText = response.data.choices[0].message.content;
    
    return res.status(200).json({ 
      success: true, 
      translatedText: translatedText 
    });

  } catch (error) {
    console.error("Backend Translation Error:", error?.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: "Translation fail ho gayi backend par." 
    });
  }
};

// 🔥 2. Improve Description API Logic
exports.improveDescription = async (req, res) => {
  try {
    const { description } = req.body;

    // Validation
    if (!description) {
      return res.status(400).json({ 
        success: false, 
        message: "Description empty hai." 
      });
    }

    // OpenAI API Call
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-3.5-turbo", // Copywriting ke liye best
      messages: [
        {
          role: "system",
          content: "You are an expert luxury real estate copywriter. Improve the following property description to make it highly appealing, professional, and persuasive for high-net-worth buyers. Make it sound premium but keep it factual based on the provided text. Return ONLY the improved description paragraph, without any extra conversation, quotes, or formatting."
        },
        {
          role: "user",
          content: description
        }
      ],
      temperature: 0.7,
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    const improvedDescription = response.data.choices[0].message.content;

    return res.status(200).json({ 
      success: true, 
      improvedDescription: improvedDescription 
    });

  } catch (error) {
    console.error("Backend AI Improve Error:", error?.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: "AI description enhance nahi kar paya." 
    });
  }
};