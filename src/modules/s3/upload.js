export const uploadFileToS3 = async (req, res) => {
  try {
    console.log("FILE DEBUG:", req.file); // 👈 ADD THIS

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required"
      });
    }

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      file: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: req.file.location
      }
    });

  } catch (error) {
    console.error("UPLOAD ERROR:", error); // 👈 ADD THIS

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};