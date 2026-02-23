// import multer from "multer";
// import path from "path";

// // Store files locally (you can switch to S3 later)
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `audio-${Date.now()}${ext}`);
//   }
// });

// export const upload = multer({
//   storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024 // 10MB
//   }
// });



import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "src", "uploads");

// ensure folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // const ext = path.extname(file.originalname) || ".webm";
    // cb(null, `audio-${Date.now()}${ext}`);
    cb(null, `audio-${Date.now()}.webm`);
  }
});

export const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});
