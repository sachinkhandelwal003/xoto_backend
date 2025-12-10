// controllers/ai/gardenAI.controller.js
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.generateGardenDesigns = async (req, res) => {
  try {
    const { styleName = "modern", description = "", elements = "" } = req.body;

    const imageFile = req.files?.gardenImage?.[0] || req.files?.[0];
    if (!imageFile) {
      return res.status(400).json({ error: "gardenImage is required" });
    }

    const gardenImageBuffer = imageFile.buffer;
    const base64Image = gardenImageBuffer.toString("base64");

    // 1. Describe image (FAST: gpt-4o-mini + short prompt)
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "In 15 words: describe garden layout, paths, structures, camera angle." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }
      ],
      max_tokens: 40,
      temperature: 0.3
    });

    const originalGardenDesc = visionResponse.choices[0].message.content.trim();

    const elementList = elements
      ? elements.split(",").map(e => e.trim()).filter(Boolean)
      : [];

    // 2. ULTRA SHORT & EFFECTIVE PROMPT (DALL·E 3 loves this)
    const basePrompt = `Photorealistic ${styleName} garden redesign.
Original layout: ${originalGardenDesc}
Add: ${elementList.length > 0 ? elementList.join(", ") : "beautiful plants"}
Keep exact same camera angle and structure.
Ultra realistic, golden hour light, professional landscaping, no people, no text.`;

    // 3. Generate ALL 3 images IN PARALLEL (HUGE speedup!)
    const generatePromises = [1, 2, 3].map(async (i) => {
      const result = await openai.images.generate({
        model: "dall-e-3",
        prompt: basePrompt + ` Variation ${i}/3`,
        n: 1,
        size: "1792x1024",
        quality: "hd",
        style: "natural",
        response_format: "url"
      });
      return { url: result.data[0].url };
    });

    // This runs 3 requests at the same time → 3× faster!
    const designs = await Promise.all(generatePromises);

    return res.json({
      success: true,
      message: "Generated in ~15 seconds!",
      designs,
      usedElements: elementList
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Failed",
      details: error.message
    });
  }
};
