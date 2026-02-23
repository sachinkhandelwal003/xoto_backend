import Blog from "../models/Blog.js"

export const createBlog = async (req, res) => {
    try {
        const body = req.body;

        let newBlog = await Blog.create({ ...req.body });

        return res.status(200).json({ success: true, message: "Blog created successfully", data: newBlog })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}


export const getBlogs = async (req, res) => {
    try {

        let page = Number(req.query.page) || 1;
        let limit = Number(req.query.limit) || 10;
        let search = req.query.search || "";
        let skip = (page - 1) * limit;

        let query = {};

        if (search != "") {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { content: { $regex: search, $options: "i" } }
            ]
        }

        let allBlogs = await Blog.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);
        let total = await Blog.countDocuments(query);

        return res.status(200).json({ success: true, message: "Blogs fetched successfully", data: allBlogs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export const getBlogsById = async (req, res) => {
    try {

        let { id } = req.query;

        let blog = await Blog.findById(id);

        if (!blog) {
            return res.json({
                success: false,
                message: "No blog found."
            })
        }

        return res.status(200).json({ success: true, message: "Blog fetched successfully", data: blog })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}


export const editBlogsById = async (req, res) => {
    try {
        let { id } = req.query;

        let newBlog = await Blog.findByIdAndUpdate(id, { ...req.body }, { new: true });

        if (!newBlog) {
            return res.status(400).json({ success: false, message: "No Blog Found" })
        }

        return res.status(200).json({ success: true, message: "Blog edited successfully", data: newBlog })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

export const deleteBlogsBYId = async (req, res) => {
    try {
        let { id } = req.query;

        let newBlog = await Blog.findByIdAndDelete(id, { ...req.body }, { new: true });

        if (!newBlog) {
            return res.status(400).json({ success: false, message: "No Blog Found" })
        }

        return res.status(200).json({ success: true, message: "Blog deleted successfully", data: newBlog })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}
