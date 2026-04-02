const { toFile } = require("openai");
const OpenAIModule = require("openai");
const OpenAI = OpenAIModule.default;
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../../../config/s3Client");

const AiGeneratedImage = require('../../models/user/AIGeneratedImages');
const CustomerAiLibrary = require('../../models/user/MyLiabrary');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// =======================================================
// 🔥 HELPER: Parse Elements
// =======================================================
const parseElements = (elements) => {
  if (!elements) return [];
  if (Array.isArray(elements)) return elements;
  if (typeof elements === "string") {
    return elements.split(",").map(e => e.trim());
  }
  return [];
};


// =======================================================
// 1. 🌿 GARDEN GENERATION
// =======================================================
exports.generateGardenDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const user = req.user;
    const { styleName, elements, description } = req.body;

    const parsedElements = parseElements(elements);

    const prompt = `
${styleName || ''} garden design.
Use these elements: ${parsedElements.join(", ") || "none"}.
${description || ""}

STRICTLY photorealistic, natural lighting, real-world textures.
No cartoon, no CGI.
`.trim();

    const images = await Promise.all(
      req.files.map(file =>
        toFile(file.buffer, null, { type: file.mimetype })
      )
    );

    const response = await client.images.edit({
      model: "gpt-image-1",
      image: images,
      prompt,
      input_fidelity: "high"
    });

    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const fileName = `garden/${Date.now()}.png`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png"
    }));

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    const savedImage = await AiGeneratedImage.create({
      imageUrl,
      inputImageUrl: null,
      userId: user._id,
      userType: "customer",
      designType: "landscaping",

      styleName: styleName || null,
      elements: parsedElements,
      description: description || null,

      aiMessage: "Garden generated successfully"
    });

    res.status(200).json({
      message: "Garden generated successfully",
      imageUrl,
      data: savedImage
    });

  } catch (err) {
    console.error("GARDEN ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
};


// =======================================================
// 2. 🏡 INTERIOR GENERATION
// =======================================================
exports.generateInteriorDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const user = req.user;
    const { styleName, elements, description, roomType } = req.body;

    const parsedElements = parseElements(elements);

    const prompt = `
${styleName ? `${styleName} interior design` : "Interior design"}
${roomType ? `for a ${roomType}` : ""}.
Use these elements: ${parsedElements.join(", ") || "none"}.
${description || ""}

STRICTLY photorealistic, DSLR-quality, real-world lighting.
No cartoon, no CGI.
`.trim();

    const images = await Promise.all(
      req.files.map(file =>
        toFile(file.buffer, null, { type: file.mimetype })
      )
    );

    const response = await client.images.edit({
      model: "gpt-image-1",
      image: images,
      prompt,
      input_fidelity: "high"
    });

    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const fileName = `interior/${Date.now()}.png`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png"
    }));

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    const savedImage = await AiGeneratedImage.create({
      imageUrl,
      inputImageUrl: null,
      userId: user._id,
      userType: "customer",
      designType: "interior",

      roomType: roomType || null,
      styleName: styleName || null,
      elements: parsedElements,
      description: description || null,

      aiMessage: "Interior generated successfully"
    });

    res.status(200).json({
      message: "Interior design generated successfully",
      imageUrl,
      data: savedImage
    });

  } catch (err) {
    console.error("INTERIOR ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
};


// =======================================================
// 3. 📂 GET INTERIOR DESIGNS
// =======================================================
exports.getInteriorDesigns = async (req, res) => {
  try {
    const user = req.user;

    const data = await AiGeneratedImage.find({
      userId: user._id,
      designType: "interior"
    }).sort({ createdAt: -1 });

    res.status(200).json({ data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// =======================================================
// 4. 🌿 GET GARDEN DESIGNS
// =======================================================
exports.getgardenDesigns = async (req, res) => {
  try {
    const user = req.user;

    const data = await AiGeneratedImage.find({
      userId: user._id,
      designType: "landscaping"
    }).sort({ createdAt: -1 });

    res.status(200).json({ data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// =======================================================
// 5. ❤️ SAVE TO LIBRARY
// =======================================================
exports.addCustomerDesign = async (req, res) => {
  try {
    const { designType, imageUrl } = req.body;
    const customerId = req.user._id;

    if (!designType || !imageUrl) {
      return res.status(400).json({ error: "designType and imageUrl required" });
    }

    const data = await CustomerAiLibrary.findOneAndUpdate(
      { customerId, designType },
      { $addToSet: { images: imageUrl } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Saved successfully",
      data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// =======================================================
// 6. 📚 GET LIBRARY
// =======================================================
exports.getCustomerDesigns = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { designType } = req.query;

    let query = { customerId };
    if (designType) query.designType = designType;

    const data = await CustomerAiLibrary.find(query);

    res.status(200).json({ data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};