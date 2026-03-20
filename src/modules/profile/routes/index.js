import { Router } from "express";
import { protectMulti } from "../../../middleware/auth.js";
import { getProfileData, updateProfileData, updateProfilePicture } from "../controllers/index.js"; 
import upload from "../../../middleware/s3Upload.js"; // Path confirm karein

const router = Router();

// 1. Profile Data Get Karne ke liye
router.get("/get-profile-data", protectMulti, getProfileData);

// 2. Text Data (Name, Email, Address) Update karne ke liye
router.put("/update-profile", protectMulti, updateProfileData);

// 3. Profile Photo S3 par upload karne ke liye
router.post(
    "/update-profile-picture", 
    protectMulti, 
    // "profilePicture" field name frontend ke FormData se match hona chahiye
    upload.single("profilePicture"), 
    updateProfilePicture
);

export default router;