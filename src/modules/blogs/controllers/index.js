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