import {Router} from "express";
import { protectMulti } from "../../../middleware/auth.js";
import {getProfileData} from "../controllers/index.js"
const router = Router();

router.get("/get-profile-data",protectMulti,getProfileData);

export default router ;