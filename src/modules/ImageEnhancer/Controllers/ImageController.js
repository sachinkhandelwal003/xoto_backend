import axios from "axios";
import FormData from "form-data";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import s3 from "../../../config/s3Client.js";

import EnhancementImage from
"../../ImageEnhancer/Model/Image.js";

import OpenAI from "openai";



// =======================================
// OPENAI CLIENT SETUP
// =======================================

const client = new OpenAI({

apiKey:process.env.OPENAI_API_KEY

});



// =======================================
// ENHANCE IMAGE
// =======================================

export const enhanceImage = async (req,res)=>{

console.log("🚀 XOTO Enhancement Started");

try{

const imageFile=req.files?.[0];

if(!imageFile){

return res.status(400).json({

status:false,

error:"Image upload nahi hui"

});

}


// ==========================
// 10MB LIMIT
// ==========================

if(imageFile.size >

10*1024*1024){

return res.status(400).json({

status:false,

error:"Max 10MB image allowed"

});

}


const user=req.user;


// DEFAULT OPENAI

const {provider="openai"}=

req.body;

let enhancedBuffer;



// =======================================
// OPENAI ENHANCEMENT
// =======================================

if(provider==="openai"){

console.log("🤖 Using OpenAI");


// Convert to AI file

const imageForAI =

await OpenAI.toFile(

imageFile.buffer,

imageFile.originalname,

{

type:imageFile.mimetype

}

);


// AI EDIT IMAGE

const response=

await client.images.edit({

model:"gpt-image-1",

image:imageForAI,

prompt:

"Enhance professionally. Improve lighting, sharpness, clarity and realism.",

size:"1024x1024"

});


// BUFFER

enhancedBuffer=

Buffer.from(

response.data[0].b64_json,

"base64"

);

}



// =======================================
// PHOTOROOM OPTIONAL
// =======================================

else if(provider==="photoroom"){

console.log("📡 Using Photoroom");

const formData=new FormData();

formData.append(

"image_file",

imageFile.buffer,

{

filename:imageFile.originalname,

contentType:imageFile.mimetype

}

);

const response=

await axios.post(

"https://sdk.photoroom.com/v1/segment",

formData,

{

headers:{

...formData.getHeaders(),

"x-api-key":

process.env.PHOTOROOM_API_KEY

},

responseType:"arraybuffer"

}

);

enhancedBuffer=

Buffer.from(response.data);

}



// =======================================
// SAVE TO AWS S3
// =======================================

const ext=

imageFile.mimetype.split("/")[1] || "png";

const fileName=

`enhancement/${Date.now()}_xoto.${ext}`;


await s3.send(

new PutObjectCommand({

Bucket:

process.env.AWS_S3_BUCKET,

Key:fileName,

Body:enhancedBuffer,

ContentType:imageFile.mimetype

})

);


const finalImageUrl=

`https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;



// =======================================
// SAVE DATABASE
// =======================================

if(user){

await EnhancementImage.create({

imageUrl:finalImageUrl,

originalImage:imageFile.originalname,

userType:"customer",

userId:user._id,

designType:"enhancement",

enhancementDetails:{

provider

}

});

}



// RESPONSE

res.json({

status:true,

imageUrl:finalImageUrl,

message:

`Image Enhanced using ${provider}`

});

}

catch(err){

console.error("❌ Xoto Error:",err);

res.status(500).json({

status:false,

error:err.message

});

}

};



// =======================================
// SAVE TO LIBRARY
// =======================================

export const saveToLibrary=async(req,res)=>{

try{

const saved=

await EnhancementImage.create({

imageUrl:req.body.imageUrl,

userType:"customer",

userId:req.user._id,

designType:req.body.designType

});

res.json({

status:true,

data:saved

});

}

catch(err){

res.status(500).json({

error:err.message

});

}

};



// =======================================
// GET LIBRARY
// =======================================

export const getLibraryImages=

async(req,res)=>{

try{

const images=

await EnhancementImage.find({

userId:req.user._id

})

.sort({

createdAt:-1

});

res.json({

status:true,

data:[{

_id:req.user._id,

images:

images.map(i=>i.imageUrl),

createdAt:new Date()

}]

});

}

catch(err){

res.status(500).json({

error:err.message

});

}

};



// =======================================
// COUNT
// =======================================

export const getEnhancementCount=

async(req,res)=>{

try{

const count=

await EnhancementImage

.countDocuments({

userId:req.user._id

});

res.json({

status:true,

count,

remaining:

Math.max(0,3-count),

limit:3

});

}

catch(err){

res.status(500).json({

error:err.message

});

}

};
