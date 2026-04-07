// controllers/BlogController.js
import Blog from "../models/Blog.js";
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ breaks: true, gfm: true, mangle: false });

// ─── Sanitize options ───
const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'iframe',
    'figure', 'figcaption', 'blockquote', 'pre', 'code', 'mark',
    'del', 'ins', 'sup', 'sub', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['class', 'style', 'id'],
    'img': ['src', 'alt', 'title', 'width', 'height', 'loading'],
    'a': ['href', 'target', 'rel', 'title'],
    'iframe': ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder'],
    'td': ['colspan', 'rowspan', 'align'],
    'th': ['colspan', 'rowspan', 'align'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
};

// ─── Helper: strip HTML → plain text ───
const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Helper: calculate reading time ───
const calcReadingTime = (html) => {
  const words = stripHtml(html).split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
};

// ─── Helper: auto-extract tags from content ───
const KEYWORD_MAP = {
  'AI': ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'chatgpt', 'llm', 'nlp', 'generative ai', 'automation'],
  'Real Estate': ['property', 'real estate', 'housing', 'apartment', 'villa', 'rent', 'lease', 'mortgage', 'broker', 'realty', 'plot'],
  'PropTech': ['proptech', 'property technology', 'smart home', 'iot', 'digital property', 'virtual tour', 'property app'],
  'Technology': ['software', 'programming', 'javascript', 'react', 'node', 'cloud', 'saas', 'developer', 'api', 'database', 'tech'],
  'Business': ['business', 'startup', 'entrepreneur', 'investment', 'revenue', 'marketing', 'sales', 'strategy', 'growth'],
  'Sustainability': ['sustainability', 'green', 'eco', 'environment', 'solar', 'renewable', 'climate', 'carbon'],
  'UAE': ['uae', 'dubai', 'abu dhabi', 'emirates', 'gulf', 'middle east'],
  'Innovation': ['innovation', 'innovative', 'disrupt', 'breakthrough', 'cutting-edge'],
  'Digital': ['digital', 'online', 'internet', 'web', 'mobile app', 'e-commerce'],
};

const autoExtractTags = (html, existingTags = []) => {
  const text = stripHtml(html).toLowerCase();
  const detected = [];
  for (const [tag, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => text.includes(kw))) detected.push(tag);
  }
  // Merge with existing tags, deduplicate
  return [...new Set([...existingTags, ...detected])].slice(0, 10);
};

// ─── Helper: detect category ───
const autoDetectCategory = (html, existingCategory = 'Other') => {
  if (existingCategory && existingCategory !== 'Other') return existingCategory;
  const text = stripHtml(html).toLowerCase();
  let best = 'Other'; let maxHits = 0;
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    const hits = keywords.filter(kw => text.includes(kw)).length;
    if (hits > maxHits) { maxHits = hits; best = cat; }
  }
  return best;
};

// ─── Helper: extract headings ───
const extractHeadings = (html) => {
  const headings = [];
  const rx = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    headings.push({ level: parseInt(m[1]), text: stripHtml(m[2]) });
  }
  return headings;
};

// ─────────────────────────────────────────────
//  CREATE BLOG
// ─────────────────────────────────────────────
export const createBlog = async (req, res) => {
  try {
    const body = req.body;

    // Convert markdown → HTML if plain text
    let processedContent = body.content || '';
    if (processedContent && !processedContent.includes('<')) {
      processedContent = await marked(processedContent);
    }

    // Sanitize
    const sanitizedContent = sanitizeHtml(processedContent, sanitizeOptions);

    // Auto-enrich metadata
    const tags = autoExtractTags(sanitizedContent, body.tags || []);
    const category = autoDetectCategory(sanitizedContent, body.category);
    const readingTime = calcReadingTime(sanitizedContent);
    const headings = extractHeadings(sanitizedContent);

    // Excerpt from content if not provided
    let excerpt = body.excerpt || body.subHeading || '';
    if (!excerpt) {
      excerpt = stripHtml(sanitizedContent).substring(0, 160);
    }

    // Slug from title if not provided
    let slug = body.slug;
    if (!slug && body.title) {
      slug = body.title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '-').substring(0, 100);
    }

    const newBlog = await Blog.create({
      ...body,
      slug,
      content: sanitizedContent,
      contentHtml: sanitizedContent,
      excerpt,
      tags,
      category,
      readingTime,
      headings,
      publishedAt: body.isPublished ? new Date() : undefined,
    });

    return res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: newBlog,
    });
  } catch (error) {
    console.error('Create blog error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create blog' });
  }
};

// ─────────────────────────────────────────────
//  GET ALL BLOGS
// ─────────────────────────────────────────────
export const getBlogs = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search || '';
    const { isPublished, category, tag } = req.query;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;

    let query = {};

    if (isPublished === undefined) {
      // Admin panel: show all — don't filter by isPublished
    } else if (isPublished !== '') {
      query.isPublished = isPublished === 'true';
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subHeading: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
        { authorName: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) query.category = category;
    if (tag) query.tags = tag;

    const sort = { [sortBy]: sortOrder };

    const [data, total] = await Promise.all([
      Blog.find(query).sort(sort).limit(limit).skip(skip)
        .select('-content -contentHtml'), // Exclude heavy fields for list
      Blog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Blogs fetched successfully',
      data,
      pagination: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Get blogs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
//  GET BY SLUG  (public frontend)
// ─────────────────────────────────────────────
export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const blog = await Blog.findOne({ slug, isPublished: true });

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    await Blog.findByIdAndUpdate(blog._id, { $inc: { viewCount: 1 } });

    return res.status(200).json({ success: true, message: 'Blog fetched successfully', data: blog });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
//  GET BY ID  (admin)
// ─────────────────────────────────────────────
export const getBlogsById = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: 'Blog ID is required' });

    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    return res.status(200).json({ success: true, message: 'Blog fetched successfully', data: blog });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
//  EDIT BY ID
// ─────────────────────────────────────────────
export const editBlogsById = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: 'Blog ID is required' });

    let updateData = { ...req.body };

    if (updateData.content) {
      // Convert markdown → HTML if needed
      if (!updateData.content.includes('<')) {
        updateData.content = await marked(updateData.content);
      }
      updateData.content = sanitizeHtml(updateData.content, sanitizeOptions);
      updateData.contentHtml = updateData.content;

      // Re-enrich tags/category/readingTime on edit
      updateData.tags = autoExtractTags(updateData.content, updateData.tags || []);
      updateData.category = autoDetectCategory(updateData.content, updateData.category);
      updateData.readingTime = calcReadingTime(updateData.content);
      updateData.headings = extractHeadings(updateData.content);

      if (!updateData.excerpt && !updateData.subHeading) {
        updateData.excerpt = stripHtml(updateData.content).substring(0, 160);
      }
    }

    // Set publishedAt when publishing for the first time
    if (updateData.isPublished) {
      const existing = await Blog.findById(id).select('isPublished publishedAt');
      if (!existing?.publishedAt) updateData.publishedAt = new Date();
    }

    const updated = await Blog.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Blog not found' });

    return res.status(200).json({ success: true, message: 'Blog updated successfully', data: updated });
  } catch (error) {
    console.error('Edit blog error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
//  DELETE BY ID
// ─────────────────────────────────────────────
export const deleteBlogsBYId = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: 'Blog ID is required' });

    const deleted = await Blog.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Blog not found' });

    return res.status(200).json({ success: true, message: 'Blog deleted successfully', data: deleted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────
//  BULK OPERATIONS
// ─────────────────────────────────────────────
export const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'IDs array required' });
    }
    const result = await Blog.deleteMany({ _id: { $in: ids } });
    return res.status(200).json({ success: true, message: `${result.deletedCount} blogs deleted`, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const bulkPublish = async (req, res) => {
  try {
    const { ids, isPublished } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'IDs array required' });
    }
    const update = { isPublished };
    if (isPublished) update.publishedAt = new Date();
    const result = await Blog.updateMany({ _id: { $in: ids } }, update);
    return res.status(200).json({ success: true, message: `${result.modifiedCount} blogs updated`, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};