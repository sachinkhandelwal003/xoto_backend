// routes/blogRoutes.js
import { Router } from "express";
import {
  createBlog,
  getBlogs,
  getBlogsById,
  getBlogBySlug,
  editBlogsById,
  deleteBlogsBYId,
  bulkDelete,
  bulkPublish,
} from "../controllers/index.js";

const router = Router();

// ── Public (no auth) ──────────────────────────────────────
router.get("/get-all-blogs", getBlogs);
router.get("/get-blog-by-slug/:slug", getBlogBySlug);   // /blogs/get-blog-by-slug/my-post-title

// ── Admin (add your auth middleware here) ─────────────────
router.get("/get-blog-by-id", getBlogsById);            // ?id=xxx

router.post("/create-blog", createBlog);

router.put("/edit-blog-by-id", editBlogsById);          // ?id=xxx
router.put("/edit-blog/:id", (req, res) => {            // REST alternative
  req.query.id = req.params.id;
  return editBlogsById(req, res);
});

router.delete("/delete-blog-by-id", deleteBlogsBYId);   // ?id=xxx
router.delete("/delete-blog/:id", (req, res) => {       // REST alternative
  req.query.id = req.params.id;
  return deleteBlogsBYId(req, res);
});

// ── Bulk operations ───────────────────────────────────────
router.post("/bulk-delete", bulkDelete);
router.put("/bulk-publish", bulkPublish);

export default router;