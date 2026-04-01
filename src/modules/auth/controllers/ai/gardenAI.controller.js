const { toFile } = require("openai");
const OpenAIModule = require("openai");
const OpenAI = OpenAIModule.default;
const fs = require("fs");
const path = require("path");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../../../config/s3Client");
const AIGeneratedImages = require('../../models/user/AIGeneratedImages');
const CustomerAiLibrary = require('../../models/user/MyLiabrary');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==========================================
// 1. GARDEN GENERATION
// ==========================================
exports.generateGardenDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }
    let user = req.user;
    let { styleName, elements, description, userId } = req.body;
    let aiGeneratedImagesCOunt = await AIGeneratedImages.find({ userId: user._id, designType: "landscaping" });

    // 🔥 LIMIT CHANGED TO 3 🔥
    // if (aiGeneratedImagesCOunt.length >= 3) {
    //   return res.status(400).json({
    //     status: false,
    //     message: "You have reached your free limit of 3 designs. Upgrade to premium for more.",
    //     aiImageGeneration: false
    //   })
    // }

    const prompt = `
${styleName && styleName.length > 0 ? `${styleName} create with these styles and use them.` : ''}
Use these elements as well: ${elements}.
${description && description.length > 0 ? `Edit according to this description: ${description}` : ''}

**STRICTLY FOLLOW THESE RULES **
The image must look 100% real and authentic, like a professional photograph clicked using a DSLR camera.
Photorealistic lighting, natural shadows, realistic textures, real-world proportions.
No animation, no illustration, no cartoon style, no CGI, no artificial or stylized look.
.Images should look real , no animated images should come`.trim();

    // Convert uploaded files to OpenAI format
    const images = await Promise.all(
      req.files.map(async (file) =>
        await toFile(file.buffer, null, { type: file.mimetype })
      )
    );

    // Call OpenAI image edit API
    const response = await client.images.edit({
      model: "gpt-image-1",
      image: images,
      prompt,
      input_fidelity: "high", // can be "medium" or "high",
    });

    // Convert Base64 output to buffer
    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const fileName = `garden/${Date.now()}_garden.png`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: imageBuffer,
        ContentType: "image/png"
      })
    )

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;


    let AiGeneratedImages = await AIGeneratedImages.create({
      imageUrl,
      userType: "customer",
      userId: user._id,
      designType: "landscaping"
    })

    res.json({
      message: "Garden generated successfully",
      imageUrl,
      AiGeneratedImages
    });
  } catch (err) {
console.error("FULL ERROR:", err.response?.data || err.message || err);    res.status(500).json({ error: "Failed to generate garden" });
  }
};

exports.getgardenDesigns = async (req, res) => {
  try {
    let user = req.user;
    let aiGeneratedImagesCOunt = await AIGeneratedImages.find({ userId: user._id, designType: "landscaping" });

    return res.status(200).json({
      data: aiGeneratedImagesCOunt
    })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get garden designs" });
  }
};

exports.addCustomerDesign = async (req, res) => {
  try {
    const { designType, imageUrl } = req.body;
    const customerId = req.user._id;

    if (!designType || !imageUrl) {
      return res.status(400).json({ error: "designType and imageUrl are required" });
    }

    const customerLibrary = await CustomerAiLibrary.findOneAndUpdate(
      { customerId, designType },
      { $addToSet: { images: imageUrl } },
      { new: true, upsert: true } 
    );

    res.status(200).json({
      message: "Design saved successfully",
      data: customerLibrary
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save design" });
  }
};


exports.getCustomerDesigns = async (req, res) => {
  try {
    const customerId = req.user._id; 
    const designType = req.query.designType; 

    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }

    let query = { customerId };
    if (designType) {
      query.designType = designType;
    }

    const customerLibrary = await CustomerAiLibrary.find(query);

    return res.status(200).json({
      data: customerLibrary
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get customer designs" });
  }
};


exports.getInteriorDesigns = async (req, res) => {
  try {
    let user = req.user;
    let aiGeneratedImagesCOunt = await AIGeneratedImages.find({ userId: user._id, designType: "interior" });

    return res.status(200).json({
      data: aiGeneratedImagesCOunt
    })
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get interior designs" });
  }
};


// ==========================================
// 2. INTERIOR GENERATION
// ==========================================
exports.generateInteriorDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const user = req.user;
    const { styleName, elements, description, roomType } = req.body;

    const aiGeneratedImagesCount = await AIGeneratedImages.find({
      userId: user._id,
      designType: "interior"
    });

    // 🔥 LIMIT CHANGED TO 3 🔥
    // if (aiGeneratedImagesCount.length >= 3) {
    //   return res.status(400).json({
    //     status: false,
    //     message: "You have reached your free limit of 3 designs. Upgrade to premium for more.",
    //     aiImageGeneration: false
    //   });
    // }

    const prompt = `
${styleName ? `${styleName} interior design` : 'Interior design'}${roomType ? ` for a ${roomType}` : ''}.
Use these elements as well: ${elements || 'none'}.
${description ? `Edit according to this description: ${description}` : ''}

**STRICTLY FOLLOW THESE RULES**
The image must look 100% real and authentic, like a professional photograph clicked using a DSLR camera.
Photorealistic lighting, natural shadows, realistic textures, real-world proportions.
No animation, no illustration, no cartoon style, no CGI, no artificial or stylized look.
Images should look real; no animated images should come.
`.trim();

    const images = await Promise.all(
      req.files.map(file => toFile(file.buffer, null, { type: file.mimetype }))
    );

    const response = await client.images.edit({
      model: "gpt-image-1",
      image: images,
      prompt,
      input_fidelity: "high"
    });

    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const fileName = `interior/${Date.now()}_interior.png`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: imageBuffer,
        ContentType: "image/png"
      })
    );

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    const AiGeneratedImages = await AIGeneratedImages.create({
      imageUrl,
      userType: "customer",
      userId: user._id,
      designType: "interior"
    });

    res.json({
      message: "Interior design generated successfully",
      imageUrl,
      AiGeneratedImages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate interior design" });
  }
};