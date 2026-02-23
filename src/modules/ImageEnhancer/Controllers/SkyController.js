const OpenAI = require("openai");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../../config/s3Client");
const SkyReplacement = require("../../ImageEnhancer/Model/Sky"); 

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =======================================
// REPLACE SKY (UPDATED CONTROLLER)
// =======================================
exports.replaceSky = async (req, res) => {
  console.log("🚀 XOTO Sky Replacement Started");

  try {
    const imageFile = req.files?.[0];
    const { skyType = 'blue' } = req.body; 

    if (!imageFile) {
      return res.status(400).json({ status: false, error: "Image upload nahi hui" });
    }

    const user = req.user;

    // Convert to AI file (Exactly like your enhancer)
    const imageForAI = await OpenAI.toFile(
      imageFile.buffer,
      imageFile.originalname,
      { type: imageFile.mimetype }
    );

    // Dynamic Prompt based on selection
    const promptText = skyType === "dusk" 
      ? "Professional real estate photography. Replace the sky with a cinematic dusk sunset, golden hour lighting, warm orange clouds."
      : "Professional real estate photography. Replace the sky with a clear vibrant blue sunny sky, bright daylight, fluffy white clouds.";

    console.log(`🤖 Using OpenAI Model: gpt-image-1 for ${skyType}`);

    // AI EDIT IMAGE
    // const response = await client.images.generate({
    //   model: "dall-e-2", 
    //   image: imageForAI,
    //   prompt: promptText,
    //   size: "1024x1024",
    //   response_format: "b64_json"
    // });
const response = await client.images.edit({

 model:"gpt-image-1",

 prompt: `
Only replace the sky.

Do not modify buildings, trees, windows or structure.
Maintain natural lighting direction and shadows.

Professional real estate photography.

${
 skyType === "dark"
 ? `
 Deep dark blue twilight evening sky.
 Moody cinematic atmosphere.
 Navy blue sky after sunset.
 Soft dramatic clouds.
 Natural ambient lighting matching the house.
 Ultra realistic sky replacement.
 `
 : `
 Bright vibrant daytime blue sky.
 Soft fluffy white clouds.
 Natural daylight.
 Ultra realistic sky replacement.
 `
}
`,

 size:"1024x1024",

 image: imageForAI
});
    // Extracting Buffer
    const enhancedBuffer = Buffer.from(
      response.data[0].b64_json,
      "base64"
    );

    // SAVE TO AWS S3
    const ext = imageFile.mimetype.split("/")[1] || "png";
    const fileName = `sky-replacement/${Date.now()}_xoto.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: enhancedBuffer,
        ContentType: imageFile.mimetype
      })
    );

    const finalImageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    // SAVE DATABASE
    if (user) {
      await SkyReplacement.create({
        imageUrl: finalImageUrl,
        originalImage: imageFile.originalname,
        userType: "customer",
        userId: user._id,
        designType: "sky_replacement",
        skyDetails: { skyType }
      });
    }

    res.json({
      status: true,
      imageUrl: finalImageUrl,
      message: `Sky Replaced successfully`
    });

  } catch (err) {
    // ⚠️ YE SABSE ZAROORI HAI: Actual error ko network tab mein bhejna
    const openAiError = err.response?.data?.error?.message || err.message;
    console.error("❌ Xoto Sky Error:", openAiError);
    
    res.status(500).json({
      status: false,
      error: openAiError, // Frontend yahan se error pakdega
      rawError: err.response?.data || null
    });
  }
};

// =======================================
// GET LIBRARY
// =======================================
exports.getSkyLibrary = async (req, res) => {
  try {
    const images = await SkyReplacement.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ status: true, data: images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};