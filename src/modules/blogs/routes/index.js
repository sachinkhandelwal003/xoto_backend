import {Router} from "express"
import {createBlog,getBlogs,getBlogsById,editBlogsById, deleteBlogsBYId} from "../controllers/index.js"

const router = Router();

router.post("/create-blog",createBlog)
router.get("/get-all-blogs",getBlogs)
router.get("/get-blog-by-id",getBlogsById)
router.post("/edit-blog-by-id",editBlogsById)
router.post("/delete-blog-by-id",deleteBlogsBYId)

export default router;