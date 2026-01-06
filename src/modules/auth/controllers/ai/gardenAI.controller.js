const { toFile } = require("openai");
const OpenAIModule = require("openai");
const OpenAI = OpenAIModule.default;
const fs = require("fs");
const path = require("path");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../../../config/s3Client");
const AIGeneratedImages = require('../../models/user/AIGeneratedImages');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.generateGardenDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }
    let user = req.user;
    // console.log("usertrrrrrrrrrrrrrrrrrrr",user)
    let { styleName, elements, description ,userId} = req.body;
    let aiGeneratedImagesCOunt = await AIGeneratedImages.find({userId:user._id,designType: "landscaping"});

    if(aiGeneratedImagesCOunt.length>0){
      return res.status(400).json({
        status:false,
        message:"If you want to generate more images . Then purchase premium.",
        aiImageGeneration:false
      })
    }

    //     const prompt = `
    // ${styleName && styleName.length > 0 ? `${styleName} create with these styles and use them.` : ''}
    // Use these elements as well: ${elements}.
    // ${description && description.length > 0 ? `Edit according to this description: ${description}` : ''}
    // `.trim();


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
      userType:"customer",
      userId:user._id ,
      designType: "landscaping"
    })

    res.json({
      message: "Garden generated successfully",
      // file: outputPath,
      // base64: imageBase64, // optional
      imageUrl,
      AiGeneratedImages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate garden" });
  }
};

exports.generateInteriorDesigns = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    await AIGeneratedImages.updateMany({},{designType: "landscaping"});

    const user = req.user;
    const { styleName, elements, description, roomType } = req.body;

    // Check if user already has generated interior images
    const aiGeneratedImagesCount = await AIGeneratedImages.find({
      userId: user._id,
      designType: "interior"
    });

    if (aiGeneratedImagesCount.length > 0) {
      return res.status(400).json({
        status: false,
        message: "If you want to generate more images, please purchase premium.",
        aiImageGeneration: false
      });
    }

    // Build the AI prompt
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

    // Convert uploaded files to OpenAI format
    const images = await Promise.all(
      req.files.map(file => toFile(file.buffer, null, { type: file.mimetype }))
    );

    // Call OpenAI image edit API
    const response = await client.images.edit({
      model: "gpt-image-1",
      image: images,
      prompt,
      input_fidelity: "high"
    });

    // Convert Base64 output to buffer
    const imageBase64 = response.data[0].b64_json;
    const imageBuffer = Buffer.from(imageBase64, "base64");

    const fileName = `interior/${Date.now()}_interior.png`;

    // Upload to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: imageBuffer,
        ContentType: "image/png"
      })
    );

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    // Save record in DB
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


// exports.getAllAIImages = async (req, res) => {
//   try {
//     let user = req.user;
//     console.log("userrrrrrrrrrrrrrrr",user);

//     // let allAIImages = 

//     res.json({
//       message: "Garden generated successfully",
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to generate garden" });
//   }
// };