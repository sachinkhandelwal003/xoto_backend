const OpenAI = require("openai");
const { PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = require("../../../config/s3Client");
const VirtualStaging = require("../Model/Virtual");
const sharp = require("sharp");


const client = new OpenAI({

    apiKey: process.env.OPENAI_API_KEY

});


// =======================================
// VIRTUAL STAGING
// =======================================

exports.processVirtualStaging = async (req, res) => {

    console.log("🚀 XOTO Virtual Staging Started");

    try {

        const imageFile = req.files?.[0];

        let {

roomType = "Living Room",

style = "Modern"

} = req.body;


// =======================
// ROOM NORMALIZER
// =======================

const roomMap = {

living_room:"Living Room",

bedroom:"Bedroom",

kitchen:"Kitchen",

home_office:"Home Office"

};

roomType = roomMap[roomType] || roomType;


// =======================
// STYLE NORMALIZER
// =======================

const styleMap = {

modern:"Modern",

contemporary:"Contemporary",

scandinavian:"Scandinavian",

luxury:"Luxury"

};

style = styleMap[style?.toLowerCase()] || style;


console.log(

"ROOM :",roomType,

"STYLE :",style

);

        if (!imageFile) {

            return res.status(400).json({

                status: false,

                error: "Image upload nahi hui"

            });

        }


        // OPENAI FILE


        // JPG / iPhone / WEBP → PNG convert

        const pngBuffer = await sharp(imageFile.buffer)

            .rotate() // iphone orientation fix

            .png()

            .toBuffer();


        const imageForAI = await OpenAI.toFile(

            pngBuffer,

            "converted.png",

            {

                type: "image/png"

            }

        );
        console.log(

            `🤖 Using GPT IMAGE MODEL ${roomType} ${style}`

        );


        // GPT IMAGE EDIT

//         const response = await client.images.edit({

//             // model: "dall-e-2",
// model: "gpt-image-1",
//             image: imageForAI,

//             prompt: `

// Professional luxury real estate staging.

// Only add furniture inside empty ${roomType}.

// Interior design style :

// ${style}.

// Do not modify floors,
// walls,
// windows or architecture.

// Maintain original lighting
// and shadows.

// Dubai luxury property photography.

// Ultra realistic furniture placement.

// `,

//             size: "1024x1024",

//             response_format: "b64_json"

//         });

// GPT IMAGE EDIT (GPT IMAGE 1)

const response = await client.images.edit({

    model: "gpt-image-1",

    image: imageForAI,

//     prompt: `

// Professional luxury real estate staging.

// Only add furniture inside empty ${roomType}.

// Interior design style :

// ${style}.

// Do not modify floors,
// walls,
// windows or architecture.

// Maintain original lighting
// and shadows.

// Dubai luxury property photography.

// Ultra realistic furniture placement.

// `,
prompt:`

Luxury real estate virtual staging.

This image shows an empty ${roomType}.

Add ${style} furniture suitable ONLY for a ${roomType}.

Bedroom must contain bed furniture.

Living room must contain sofa seating.

Kitchen must contain cabinets and dining setup.

Preserve floors, walls and architecture.

Ultra photorealistic Dubai luxury property photography.

`,
    size: "1024x1024"

});
        // BUFFER

        const stagedBuffer = Buffer.from(

            response.data[0].b64_json,

            "base64"

        );


        // S3 SAVE

        const fileName =

            `virtual-staging/${Date.now()}_xoto.png`;


        await s3.send(

            new PutObjectCommand({

                Bucket: process.env.AWS_S3_BUCKET,

                Key: fileName,

                Body: stagedBuffer,

                ContentType: "image/png"

            })

        );


        const finalImageUrl =

            `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;



        // SAVE DB

     if (req.user) {

 await VirtualStaging.create({

  user: req.user._id, // ✅ correct field

  originalImage: {

   public_id: imageFile.originalname || Date.now().toString(),

   url: "uploaded-local-image" // ya S3 original image URL agar upload kar rahe ho

  },

  stagedImage: {

   public_id: fileName,

   url: finalImageUrl

  },

  roomType,

  style,

  status: "completed",

  projectName: "Xoto Property"

 });

}


        // RESPONSE

        res.json({

            status: true,

            imageUrl: finalImageUrl,

            message: `${roomType} staged successfully`

        });

    } catch (err) {

        console.error("❌ Staging Error:", err);

        res.status(500).json({

            status: false,

            error:

                err.response?.data?.error?.message ||

                err.message

        });

    }

};



// =======================================
// LIBRARY
// =======================================

exports.getStagingLibrary = async (req, res) => {

    try {

        const images = await VirtualStaging

            .find({ userId: req.user._id })

            .sort({ createdAt: -1 });

        res.json({

            status: true,

            data: images

        });

    } catch (err) {

        res.status(500).json({

            status: false,

            error: err.message

        });

    }

};