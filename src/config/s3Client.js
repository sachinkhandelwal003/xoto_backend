const {S3Client,PutObjectCommand} = require("@aws-sdk/client-s3");

const s3 = new S3Client({
    region:process.env.AWS_REGION,
});

module.exports = s3;