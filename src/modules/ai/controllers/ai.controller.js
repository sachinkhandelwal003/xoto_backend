import { speechToText } from "../services/speechToText.js";
import { chatWithAI } from "../services/chatService.js";
import { textToSpeech } from "../services/textToSpeech.js";
import ChatMessage from "../models/chatMessages.js";
import { uploadToS3 } from "../services/s3upload.js";

// export const chatHandler = async (req, res) => {
//   try {
//     let userText = "";
//     let inputAudioUrl = null;

//     // 🎤 Voice input
//     if (req.file) {
//       userText = await speechToText(req.file.path);
//       uploadToS3
//       inputAudioUrl = `/uploads/${req.file.filename}`;
//     }

//     // ⌨️ Text input
//     else if (req.body?.message) {
//       userText = req.body.message;
//     }

//     else {
//       return res.status(400).json({ error: "No input provided" });
//     }

//     // 🤖 AI response
//     const aiText = await chatWithAI(userText);

//     // 🔊 AI voice
//     const outputAudioUrl = await textToSpeech(aiText); 
//     // should return `/responses/xyz.mp3`

//     res.json({
//       inputType: req.file ? "voice" : "text",
//       user: {
//         text: userText,
//         ...(inputAudioUrl && { audioUrl: inputAudioUrl })
//       },
//       ai: {
//         text: aiText,
//         audioUrl: outputAudioUrl
//       }
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Chat processing failed" });
//   }
// };


export const chatHandler = async (req, res) => {
  try {
    let userText = "";
    let inputAudioUrl = null;
    let inputType = "text";
    console.log("CWD:", process.cwd());
    console.log("req.file:", req.file);


    // 🎤 USER VOICE INPUT
    if (req.file) {
      userText = await speechToText(req.file.path);

      // ⬆️ Upload user voice to S3
      inputAudioUrl = await uploadToS3(
        req.file.path,
        "user-audio",
        req.file.mimetype
      );

      inputType = "audio";
    }

    // ⌨️ USER TEXT INPUT
    else if (req.body?.message) {
      userText = req.body.message;
    }

    else {
      return res.status(400).json({ error: "No input provided" });
    }

    // 💾 SAVE USER MESSAGE
    const userMessage = await ChatMessage.create({
      session_id: req.body.session_id,
      sender: "user",
      receiver: "ai",
      type: inputType,
      text: userText,
      audioUrl: inputAudioUrl
    });


    const history = await ChatMessage.find({ session_id: req.body.session_id })
      .sort({ createdAt: 1 })
      .limit(15)
      .select("sender text");

    const chatHistory = history.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text
    }));

    // 🤖 AI RESPONSE
    const aiText = await chatWithAI(userText,chatHistory);

    let outputAudioUrl = null;
    let outputType = "text";

    // 🔊 If voice in → voice out
    if (inputType === "audio") {
      const localAudioPath = await textToSpeech(aiText);

      // ⬆️ Upload AI voice to S3
      outputAudioUrl = await uploadToS3(
        localAudioPath,
        "ai-audio",
        "audio/mpeg"
      );

      outputType = "audio";
    }

    // 💾 SAVE AI MESSAGE
    const aiMessage = await ChatMessage.create({
      session_id: req.body.session_id,
      sender: "ai",
      receiver: "user",
      type: outputType,
      text: aiText,
      audioUrl: outputAudioUrl
    });


    return res.json({
      user: userMessage,
      ai: aiMessage
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chat processing failed" });
  }
};

export const getAllMessages = async (req, res) => {
  try {
    let allMessages = await ChatMessage.find()

    return res.json(allMessages);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chat processing failed" });
  }
};
