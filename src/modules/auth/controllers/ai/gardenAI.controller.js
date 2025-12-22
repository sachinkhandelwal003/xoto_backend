const { toFile } = require("openai");
const OpenAIModule = require("openai");
const OpenAI = OpenAIModule.default;
const fs = require("fs");
const path = require("path");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../../../config/s3Client");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.generateGardenDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    let { styleName, elements, description } = req.body;

    const prompt = `
${styleName && styleName.length > 0 ? `${styleName} create with these styles and use them.` : ''}
Use these elements as well: ${elements}.
${description && description.length > 0 ? `Edit according to this description: ${description}` : ''}
`.trim();

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
      input_fidelity: "low", // can be "medium" or "high"
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


    // // Save the edited image
    // const outputDir = path.join(__dirname, "../../output");
    // if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // const outputPath = path.join(outputDir, `${Date.now()}_garden.png`);
    // fs.writeFileSync(outputPath, imageBuffer);

    // Return the edited image path or base64
    res.json({
      message: "Garden generated successfully",
      // file: outputPath,
      // base64: imageBase64, // optional
      imageUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate garden" });
  }
};
