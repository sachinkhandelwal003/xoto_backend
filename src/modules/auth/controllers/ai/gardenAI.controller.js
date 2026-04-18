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
// :fire: HELPER: Parse Elements
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
// 1. :herb: GARDEN GENERATION
// =======================================================
// =======================================================
// 1. GARDEN GENERATION - FIXED & IMPROVED
// =======================================================
exports.generateGardenDesigns = async (req, res) => {
  const isOpenAICreditError = (error) => {
    if (!error) return false;

    const msg = (error.message || '').toLowerCase();
    const status = error.status || error?.response?.status;
    const errCode = error.code || error?.error?.code || '';

    return (
      status === 400 ||
      status === 429 ||
      errCode === 'billing_hard_limit_reached' ||
      msg.includes('quota') ||
      msg.includes('billing') ||
      msg.includes('credit')
    );
  };

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const user = req.user;
    const { styleName, elements, description } = req.body;
    const parsedElements = parseElements(elements);

    // ✅ Send immediate response
    res.status(200).json({ message: "Generation started", status: true });

    // ✅ Background process
    (async () => {
      try {
        const prompt = `
${styleName ? `${styleName} garden design` : "Beautiful garden design"}.
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

        // ✅ DIRECT CALL (no test call → saves cost)
        const response = await client.images.edit({
          model: "gpt-image-1",
          image: images,
          prompt,
          input_fidelity: "high"
        });

        const imageBuffer = Buffer.from(response.data[0].b64_json, "base64");

        const fileName = `garden/${Date.now()}.png`;

        await s3.send(new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: fileName,
          Body: imageBuffer,
          ContentType: "image/png"
        }));

        const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        await AiGeneratedImage.create({
          imageUrl,
          userId: user._id,
          userType: "customer",
          designType: "landscaping",
          styleName: styleName || null,
          elements: parsedElements,
          description: description || null,
          aiMessage: "Garden generated successfully",
          status: "completed"
        });

      } catch (err) {
        let message = "Image generation failed";

        if (isOpenAICreditError(err)) {
          message = "Insufficient credits";
        }

        await AiGeneratedImage.create({
          imageUrl: "failed",
          userId: user._id,
          designType: "landscaping",
          status: "failed",
          aiMessage: message
        }).catch(() => {});
      }
    })();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
};






// =======================================================
// 2. :house_with_garden: INTERIOR GENERATION
// =======================================================
// =======================================================
// 2. INTERIOR GENERATION - FIXED & IMPROVED
// =======================================================
exports.generateInteriorDesigns = async (req, res) => {
  const isOpenAICreditError = (error) => {
    if (!error) return false;

    const msg = (error.message || '').toLowerCase();
    const status = error.status || error?.response?.status;
    const errCode = error.code || error?.error?.code || '';

    return (
      status === 400 ||
      status === 429 ||
      errCode === 'billing_hard_limit_reached' ||
      msg.includes('quota') ||
      msg.includes('billing') ||
      msg.includes('credit')
    );
  };

  try {
    if ((!req.files || req.files.length === 0) && !req.body.imageUrl) {
      return res.status(400).json({ error: "No image provided" });
    }

    const user = req.user;
    const { styleName, elements, description, roomType, imageUrl } = req.body;
    const parsedElements = parseElements(elements);

    res.status(200).json({ message: "Generation started", status: true });

    (async () => {
      try {
        const prompt = `
${styleName ? `${styleName} interior design` : "Interior design"}
${roomType ? `for a ${roomType}` : ""}.
Use these elements: ${parsedElements.join(", ") || "none"}.
${description || ""}
STRICTLY photorealistic, DSLR-quality lighting.
No cartoon, no CGI.
`.trim();

        let images;

        if (req.files && req.files.length > 0) {
          images = await Promise.all(
            req.files.map(file =>
              toFile(file.buffer, null, { type: file.mimetype })
            )
          );
        } else {
          const axios = require("axios");
          const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
          const buffer = Buffer.from(imgRes.data);

          images = [
            await toFile(buffer, "input.jpg", { type: "image/jpeg" })
          ];
        }

        // ✅ DIRECT CALL (no extra billing call)
        const response = await client.images.edit({
          model: "gpt-image-1",
          image: images,
          prompt,
          input_fidelity: "high"
        });

        const imageBuffer = Buffer.from(response.data[0].b64_json, "base64");

        const fileName = `interior/${Date.now()}.png`;

        await s3.send(new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: fileName,
          Body: imageBuffer,
          ContentType: "image/png"
        }));

        const finalUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        await AiGeneratedImage.create({
          imageUrl: finalUrl,
          userId: user._id,
          userType: "customer",
          designType: "interior",
          roomType: roomType || null,
          styleName: styleName || null,
          elements: parsedElements,
          description: description || null,
          aiMessage: "Interior generated successfully",
          status: "completed"
        });

      } catch (err) {
        let message = "Image generation failed";

        if (isOpenAICreditError(err)) {
          message = "Insufficient credits";
        }

        await AiGeneratedImage.create({
          imageUrl: "failed",
          userId: user._id,
          designType: "interior",
          status: "failed",
          aiMessage: message
        }).catch(() => {});
      }
    })();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
};




// =======================================================
// 3. :open_file_folder: GET INTERIOR DESIGNS
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
// 4. :herb: GET GARDEN DESIGNS
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
// 5. :heart: SAVE TO LIBRARY
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
// 6. :books: GET LIBRARY
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