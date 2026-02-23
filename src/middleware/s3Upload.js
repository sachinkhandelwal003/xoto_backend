import multer from "multer";
import multerS3 from "multer-s3";
import { s3 } from "../utils/s3.js";

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const fileName = `properties/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    }
  })
});

// AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_REGION,AWS_S3_BUCKET

export default upload;
