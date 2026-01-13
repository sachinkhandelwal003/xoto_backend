import {Router} from "express"
import {createBlog} from "../controllers/index.js"

const router = Router();

router.post("/create-blog",createBlog)

export default router;