import express from "express";
import { chatHandler, getAllMessages } from "../controllers/ai.controller.js";
import { upload } from "../middlewares/upload.js"

const router = express.Router();

// router.post("/", chatHandler);
router.post(
    "/",
    upload.single("audio"), // optional
    (req, res, next) => {
    console.log("req.file 👉", req.file);
    console.log("req.body 👉", req.body);
    next();
  },
    chatHandler
);


router.get(
    "/get-all-messages",
    getAllMessages
);

export default router;
