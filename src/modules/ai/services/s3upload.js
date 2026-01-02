import AWS from "aws-sdk";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config()

console.log("process.env.AWS_REGIONprocess.env.AWS_REGIONprocess.env.AWS_REGION",process.env.AWS_REGION)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ,
  region: process.env.AWS_REGION
});

export const uploadToS3 = async (filePath, folder, contentType) => {
  const fileStream = fs.createReadStream(filePath);
  const fileName = `${folder}/${Date.now()}-${path.basename(filePath)}`;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET || "xotostaging",
    Key: fileName,
    Body: fileStream,
    ContentType: contentType
    // ACL: "public-read" // OR remove if using signed URLs
  };

  const result = await s3.upload(params).promise();

  // optional cleanup
  fs.unlinkSync(filePath);

  return result.Location; // 🔥 direct S3 URL
};
