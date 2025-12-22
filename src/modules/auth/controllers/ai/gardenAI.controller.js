// // FINAL WORKING VERSION: Using xAI Grok API for vision + image generation (December 2025)
// // controllers/ai/gardenAI.controller.js

// const OpenAI = require("openai");

// // const openai = new OpenAI({
// //   apiKey: "xai-wFOu4nWTKNx7RWJq6wom3lQZ5ap0NNZaJaIuMtXaShuuYvPN64w282nNbqKtZoPjtTVn7UPE9fzYFhRn", // Your provided xAI key
// //   baseURL: "https://api.x.ai/v1",
// // });

// console.log("processssssssssssssssssssssssssssssssssssssssssssssssssssssssss", process.env.OPENAI_API_KEY)
// // const openai = new OpenAI({
// //   apiKey: process.env.OPENAI_API_KEY, // Your provided xAI key
// //   baseURL: "https://api.x.ai/v1",
// // });

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// exports.generateGardenDesigns = async (req, res) => {
//   try {
//     const { styleName = "modern", description = "", elements = "" } = req.body;

//     // Accept uploaded garden image
//     const imageFile = req.files?.gardenImage?.[0] || req.files?.[0];
//     console.log("imagessssssssssssssssssssss", imageFile)
//     if (!imageFile) {
//       return res.status(400).json({ error: "An image of your garden is required" });
//     }

//     const gardenImageBuffer = imageFile.buffer;
//     const base64Image = gardenImageBuffer.toString("base64");
//     const mimeType = imageFile.mimetype || "image/jpeg";
//     const dataUrl = `data:${mimeType};base64,${base64Image}`;

//     // 1. Describe the original garden using Grok vision model (grok-4 or latest vision model)
//     // const visionResponse = await openai.chat.completions.create({
//     //   model: "grok-4-latest", // Works with your curl test; supports vision
//     //   messages: [
//     //     {
//     //       role: "user",
//     //       content: [
//     //         { type: "text", text: "In 15-20 words: describe the garden layout, paths, structures, plants, camera angle, and overall style." },
//     //         { type: "image_url", image_url: { url: dataUrl } }
//     //       ]
//     //     }
//     //   ],
//     //   max_tokens: 60,
//     //   temperature: 0.2
//     // });

//     const visionResponse = await openai.responses.create({
//       model: "gpt-5",
//       input: [
//         {
//           role: "user",
//           content: [
//             {
//               type: "input_text",
//               text: "In 15–20 words: describe the garden layout, paths, structures, plants, camera angle, and overall style."
//             },
//             {
//               type: "input_image",
//               image_url: dataUrl
//             }
//           ]
//         }
//       ],
//       max_output_tokens: 300
//     });

//     // console.log(visionResponse.output_text);

//     const originalGardenDesc = visionResponse.choices[0].message.content.trim();

//     const elementList = elements
//       ? elements.split(",").map(e => e.trim()).filter(Boolean)
//       : [];

//     // 2. Build photorealistic prompt
//     const basePrompt = `Photorealistic ${styleName} garden redesign.
// Original layout: ${originalGardenDesc}
// Add: ${elementList.length > 0 ? elementList.join(", ") : "lush plants, flowers, elegant lighting"}
// Keep exact same camera angle, structures, and proportions.
// Ultra realistic, golden hour sunlight, professional landscaping, high detail, no people, no text.`;

//     // 3. Generate 3 images in parallel using the dedicated image endpoint
//     const generatePromises = [1, 2, 3].map(async (i) => {
//       const result = await openai.images.generate({
//         model: "grok-2-image-1212", // Current official image generation model (Aurora-based)
//         prompt: basePrompt + ` Variation ${i}/3`,
//         n: 1,
//         response_format: "url" // or "b64_json"
//       });
//       return { url: result.data[0].url };
//     });

//     const designs = await Promise.all(generatePromises);

//     return res.json({
//       success: true,
//       message: "Generated 3 photorealistic garden designs using Grok (Aurora-powered)!",
//       original_description: originalGardenDesc,
//       designs,
//       usedElements: elementList
//     });

//   } catch (error) {
//     console.error("xAI Grok API Error:", error);
//     return res.status(500).json({
//       error: "Failed to generate designs",
//       details: error.message || error.toString()
//     });
//   }
// };

// controllers/ai/gardenAI.controller.js
// OpenAI-only version (GPT-5 + OpenAI Images)

// const OpenAI = require("openai");

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// exports.generateGardenDesigns = async (req, res) => {
//   try {
//     // 0. Read frontend inputs
//     const { styleName = "modern", elements = "", description = "" } = req.body;

//     // 1. Validate image
//     const imageFile = req.files?.gardenImage?.[0] || req.files?.[0];
//     if (!imageFile) {
//       return res.status(400).json({
//         error: "An image of your garden is required"
//       });
//     }

//     // 2. Prepare image for GPT-5 vision
//     const base64Image = imageFile.buffer.toString("base64");
//     const mimeType = imageFile.mimetype || "image/jpeg";
//     const dataUrl = `data:${mimeType};base64,${base64Image}`;

//     // 3. GPT-5 Vision → describe existing garden
//     const visionResponse = await openai.responses.create({
//       model: "gpt-5",
//       input: [
//         {
//           role: "user",
//           content: [
//             {
//               type: "input_text",
//               text:
//                 "In 15–20 words: describe the garden layout, paths, structures, plants, camera angle, and overall style."
//             },
//             {
//               type: "input_image",
//               image_url: dataUrl
//             }
//           ]
//         }
//       ],
//       max_output_tokens: 300
//     });

//     // ✅ Correct output handling
//     const originalGardenDesc = visionResponse.output_text?.trim();
//     if (!originalGardenDesc) {
//       throw new Error("GPT-5 did not return a garden description");
//     }

//     // 4. Parse elements
//     const elementList = elements
//       ? elements.split(",").map(e => e.trim()).filter(Boolean)
//       : [];

//     // 5. Sanitize extra description
//     const extraDescription = description?.trim();

//     // 6. Build final image prompt
//     const basePrompt = `
// Photorealistic ${styleName} garden redesign.

// Original layout:
// ${originalGardenDesc}

// Design requirements:
// ${extraDescription || "Maintain a clean, balanced, and realistic garden design."}

// Add elements:
// ${elementList.length ? elementList.join(", ") : "lush plants, flowers, elegant lighting"}

// Rules:
// - Keep exact same camera angle, structures, and proportions
// - Ultra realistic
// - Golden hour sunlight
// - Professional landscaping
// - High detail
// - No people
// - No text
// `.trim();

//     // 7. Generate 3 images using OpenAI image model
//     const designs = await Promise.all(
//       [1, 2, 3].map(async (i) => {
//         const img = await openai.images.generate({
//           model: "gpt-image-1",
//           prompt: `${basePrompt} Variation ${i}/3`,
//           size: "1024x1024"
//         });

//         return { url: img.data[0].url };
//       })
//     );

//     // 8. Send response
//     return res.json({
//       success: true,
//       message: "Generated 3 photorealistic garden designs using GPT-5 + OpenAI Images",
//       original_description: originalGardenDesc,
//       designs,
//       usedElements: elementList
//     });

//   } catch (error) {
//     console.error("OpenAI Error:", error);
//     return res.status(500).json({
//       error: "Failed to generate designs",
//       details: error.message
//     });
//   }
// };

const OpenAI = require("openai");
const Replicate = require("replicate");

// const replicate = new Replicate({
//   auth: process.env.REPLICATE_API_TOKEN,
//});

// exports.generateGardenDesigns = async (req, res) => {
//   try {
//     const { styleName = "modern", elements = "", description = "" } = req.body;

//     // 1. Validate image
//     const imageFile = req.files?.gardenImage?.[0] || req.files?.[0];
//     if (!imageFile) {
//       return res.status(400).json({ error: "An image of your garden is required" });
//     }

//     const base64Image = imageFile.buffer.toString("base64");
//     const mimeType = imageFile.mimetype || "image/jpeg";
//     const dataUrl = `data:${mimeType};base64,${base64Image}`;

//     // 2. GPT-5 Vision (FORCED FINAL TEXT)
//     const visionResponse = await openai.responses.create({
//       model: "gpt-5",
//       reasoning: { effort: "low" },
//       input: [
//         {
//           role: "user",
//           content: [
//             {
//               type: "input_text",
//               text: `
// Describe the garden in 15–20 words.
// Respond with ONLY the description text.
// Do not explain.
// Do not reason.
// `
//             },
//             {
//               type: "input_image",
//               image_url: dataUrl
//             }
//           ]
//         }
//       ]
//       // max_output_tokens: 120
//     });
//     console.log("visioooooooooooooooooooooooooooooooo",visionResponse)

//     // ✅ SAFE extraction
//     const originalGardenDesc =
//       visionResponse.output_text ||
//       visionResponse.output?.find(o => o.type === "output_text")?.text;

//     if (!originalGardenDesc) {
//       throw new Error("GPT-5 returned no final text");
//     }

//     // 3. Parse elements
//     const elementList = elements
//       ? elements.split(",").map(e => e.trim()).filter(Boolean)
//       : [];

//     const extraDescription = description?.trim();

//     // 4. Build prompt
//     const basePrompt = `
// Photorealistic ${styleName} garden redesign.

// Original layout:
// ${originalGardenDesc}

// Design requirements:
// ${extraDescription || "Maintain a clean, balanced, and realistic garden design."}

// Add elements:
// ${elementList.length ? elementList.join(", ") : "lush plants, flowers, elegant lighting"}

// Rules:
// - Same camera angle and proportions
// - Ultra realistic
// - Golden hour sunlight
// - Professional landscaping
// - High detail
// - No people
// - No text
// `.trim();

//     // 5. Generate images via Replicate
// const designs = await Promise.all(
//   [1, 2, 3].map(async (i) => {
//     const output = await replicate.run(
//       "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
//       {
//         input: {
//           prompt: `${basePrompt} Variation ${i}/3`,
//           width: 1024,
//           height: 1024,
//           num_outputs: 1
//         }
//       }
//     );

//     return { url: output[0] };
//   })
// );

//     return res.json({
//       success: true,
//       original_description: originalGardenDesc,
//       designs,
//       usedElements: elementList
//     });

//   } catch (error) {
//     console.error("AI Error:", error);
//     return res.status(500).json({
//       error: "Failed to generate designs",
//       details: error.message
//     });
//   }
// };

async function generatePropertyDesign({
  baseDescription,
  styleName = "modern luxury",
  elements = "",
  description = "",
}) {
  try {
    if (!baseDescription) {
      throw new Error("baseDescription is required");
    }

    const client = new OpenAI({
      baseURL: "https://api.tokenfactory.nebius.com/v1/",
      apiKey: "v1.CmMKHHN0YXRpY2tleS1lMDBrNmJkd3hnbTdhc2t6aGoSIXNlcnZpY2VhY2NvdW50LWUwMHltYWprZzZyangzM20zNzIMCO7pmMoGEOrZ9cYBOgsI6-ywlQcQgPK6XUACWgNlMDA.AAAAAAAAAAEDwyeh2utpPnuupCqY1M-7_t4VJVIpyXBKWjVTKJFHBRZAIbn9YTKQEPy0MGmTmymf4wOWtVIwHovpqBRN92kA"
    })

    // 🔥 GOD-LEVEL PHOTOREALISTIC PROMPT
    //     const finalPrompt = `
    // You are generating a REAL PHOTOGRAPH of a property.
    // This must look like a real camera photo, not a render.

    // BASE VISUAL FACTS (do not ignore):
    // ${baseDescription}

    // STYLE:
    // ${styleName}

    // ADDITIONAL ELEMENTS:
    // ${elements}

    // USER DESCRIPTION / INTENT:
    // ${description}

    // REALISM RULES (MANDATORY):
    // - 100% photorealistic
    // - Looks like a DSLR or mirrorless camera photo
    // - Natural lighting, realistic shadows
    // - Real-world materials and textures
    // - Correct scale and proportions
    // - No exaggerated colors
    // - No cinematic effects
    // - No artificial glow
    // - No symmetry perfection

    // STRICTLY FORBIDDEN:
    // - CGI
    // - 3D render
    // - Illustration
    // - Cartoon
    // - Animated style
    // - Unrealistic lighting
    // - Concept art
    // - Game graphics
    // - AI-looking visuals

    // CAMERA DETAILS:
    // - Wide-angle architectural photography
    // - Eye-level camera height
    // - Sharp focus
    // - High dynamic range
    // - Realistic depth of field
    // - Natural color grading

    // The final image must be indistinguishable from a real photograph.
    // `;

    const finalPrompt = `
Photorealistic real-world property photograph.
${styleName} property with realistic architecture and materials.

Recreate the same scene. 

${description}

Visible details:
${baseDescription}

Additional elements:
${elements}

Natural nightlight, realistic shadows, correct proportions.
Looks like a real DSLR photo.
Not CGI, not render, not illustration.
`;



    //     const response = await client.images.generate({
    //       model: "black-forest-labs/flux-dev",
    //       prompt: finalPrompt,
    //       response_format: "url",
    //       extra_body: {
    //         response_extension: "webp",
    //         width: 1024,
    //         height: 1024,
    //         num_inference_steps: 30,
    //         negative_prompt: `
    // cartoon, animation, anime, illustration, sketch,
    // 3d render, unreal engine, blender, cgi,
    // concept art, game graphics, fantasy,
    // oversaturated, unrealistic lighting, fake textures
    //         `,
    //         seed: -1,
    //       },
    //     });

    const response = await client.images.generate({
      model: "black-forest-labs/flux-dev",
      response_format: "url",
      extra_body: {
        response_extension: "webp",
        width: 1024,
        height: 1024,
        num_inference_steps: 28,
        negative_prompt: "",
        seed: -1
      },
      prompt: finalPrompt
    })
    console.log("tresponseeeeeeeeeeeeeeeeeeeeeee", response)
    return response;
  } catch (error) {
    console.error("Error generating property design:", error);
    throw error;
  }
}

async function describeImageFromBase64(image_url, mimeType = "image/jpeg") {
  // if (!base64Image) {
  //   throw new Error("Base64 image data required");
  // }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.responses.create({
    model: "gpt-4o",
    temperature: 0,
    input: [
      {
        role: "system",
        content: `
You are a visual inspection system.

STRICT RULES:
- Describe EVERYTHING which is clearly visible.
- Do NOT guess.
- Do NOT infer intent or emotions.
- If unsure, say "unclear".
- Be exhaustive and literal.
- List objects individually.
- Include counts, colors, positions, and relative sizes.
- Do NOT summarize.
- Do NOT beautify language.

Output format (must follow exactly):

SCENE:
OBJECTS:
COLORS:
POSITIONS:
LIGHTING:
BACKGROUND:
TEXT (if any):
MISSING / NOT PRESENT:
`,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analyze this image with maximum visual precision.",
          },
          {
            type: "input_image",
            image_url: image_url,
          },
        ],
      },
    ],
  });

  return response.output_text;
}

exports.generateGardenDesigns = async (req, res) => {
  try {
    console.log("route got hittttttttttttttttttttttttttt", req.files);
    const { styleName = "modern", elements = "", description = "" } = req.body;

    // 1. Validate image
    const imageFile = req.files?.gardenImage?.[0] || req.files?.[0];
    if (!imageFile) {
      return res
        .status(400)
        .json({ error: "An image of your garden is required" });
    }

    const base64Image = imageFile.buffer.toString("base64");
    const mimeType = imageFile.mimetype || "image/jpeg";
    const image_url = `data:${mimeType};base64,${base64Image}`;

    let baseDescription = await describeImageFromBase64(image_url, mimeType);
    console.log(
      "basdesccccccccccccccccccccccccccccrrrrrrrrrrrrrrrrrrrrrptttttttttttion",
      baseDescription
    );
    let design = await generatePropertyDesign({
      baseDescription,
      styleName,
      elements,
      description,
    });

    return res.status(200).json({
      success: true,
      described: baseDescription,
      mimeType,
      design,
      size: imageFile.size,
      success: true,
      // base64: base64Image, // raw base64
      // dataUrl: image_url, // ready-to-use in <img src="">
    });
  } catch (error) {
    // console.log("errororororoorororor", error);
    // return error;



    console.error("❌ API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Garden generation failed",
      error: error.message || error.toString()
    });
  }
};