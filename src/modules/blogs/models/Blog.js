// models/Blog.js
import mongoose from "mongoose";

const HeadingSchema = new mongoose.Schema({
  level: { type: Number, min: 1, max: 6 },
  text: { type: String, trim: true },
}, { _id: false });

const BlogSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────
  title: {
    type: String, trim: true,
    required: [true, "Title is required"],
    maxlength: [200, "Title cannot exceed 200 characters"],
  },
  subHeading: {
    type: String, default: "",
    maxlength: [300, "Subheading cannot exceed 300 characters"],
  },
  slug: {
    type: String, trim: true, required: true,
    index: true, unique: true, lowercase: true,
  },

  // ── Content ───────────────────────────────
  content: {
    type: String,
    required: [true, "Content is required"],
  },
  contentHtml: {
    type: String,      // Pre-processed HTML for fast rendering
    default: "",
  },
  excerpt: {
    type: String,
    maxlength: [500, "Excerpt cannot exceed 500 characters"],
    default: "",
  },

  // ── Structure ─────────────────────────────
  headings: {
    type: [HeadingSchema],
    default: [],
  },

  // ── Media ─────────────────────────────────
  featuredImage: { type: String, default: "" },
  coverImage: { type: String, default: "" },

  // ── Taxonomy ──────────────────────────────
  tags: {
    type: [String], default: [], index: true,
  },
  category: {
    type: String,
    enum: ['AI', 'Real Estate', 'PropTech', 'Technology', 'Business', 'Other'],
    default: 'Other',
  },

  // ── Publishing ────────────────────────────
  isPublished: { type: Boolean, default: false, index: true },
  publishedAt: { type: Date, default: null },

  // ── Author ────────────────────────────────
  authorName: { type: String, required: true, default: "Admin", trim: true },
  authorImage: { type: String, default: "" },
  authorDesignation: { type: String, default: "Content Writer", trim: true }, // :point_left: Added here

  // ── Analytics ─────────────────────────────
  readingTime: { type: Number, default: 1 },   // Minutes
  viewCount: { type: Number, default: 0 },

  // ── SEO ───────────────────────────────────
  seoTitle: { type: String, default: "" },
  seoDescription: { type: String, default: "", maxlength: 160 },
  metaKeywords: { type: [String], default: [] },

}, { timestamps: true });

// ── Pre-save middleware ──────────────────────────────────
BlogSchema.pre('save', function (next) {
  // Auto-generate slug
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);
  }

  // Auto-generate excerpt
  if (!this.excerpt && this.content) {
    const plain = this.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    this.excerpt = plain.substring(0, 160);
  }

  // Auto-generate subHeading from excerpt if missing
  if (!this.subHeading && this.excerpt) {
    this.subHeading = this.excerpt;
  }

  // Calculate reading time
  if (this.content) {
    const plain = this.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plain.split(/\s+/).length;
    this.readingTime = Math.max(1, Math.ceil(words / 200));
  }

  // Set publishedAt when publishing for the first time
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  // Default SEO fields
  if (!this.seoTitle) this.seoTitle = this.title;
  if (!this.seoDescription) this.seoDescription = this.excerpt;

  next();
});

// ── Indexes ──────────────────────────────────────────────
BlogSchema.index({ createdAt: -1 });
BlogSchema.index({ isPublished: 1, publishedAt: -1 });
BlogSchema.index({ tags: 1 });
BlogSchema.index({ category: 1 });
BlogSchema.index({ slug: 1 }, { unique: true });

// ── Virtual: url ─────────────────────────────────────────
BlogSchema.virtual('url').get(function () {
  return `/blog/${this.slug}`;
});

// ── Static: find published ────────────────────────────────
BlogSchema.statics.findPublished = function (query = {}) {
  return this.find({ ...query, isPublished: true }).sort({ publishedAt: -1 });
};

// ── Instance: toSummary ───────────────────────────────────
BlogSchema.methods.toSummary = function () {
  return {
    _id: this._id,
    title: this.title,
    subHeading: this.subHeading,
    slug: this.slug,
    excerpt: this.excerpt,
    featuredImage: this.featuredImage,
    tags: this.tags,
    category: this.category,
    authorName: this.authorName,
    authorDesignation: this.authorDesignation, // :point_left: Added here
    readingTime: this.readingTime,
    viewCount: this.viewCount,
    isPublished: this.isPublished,
    publishedAt: this.publishedAt,
    createdAt: this.createdAt,
  };
};

const Blog = mongoose.model("Blog", BlogSchema, "Blogs");
export default Blog;