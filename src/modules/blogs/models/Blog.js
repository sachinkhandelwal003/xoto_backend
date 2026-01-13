import mongoose from "mongoose"

let BlogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        required: false,
    },
    slug: {
        type: String,
        trim: true,
        required: false,
        index:true
    },
    content: {
        type: String,
        required: false,
    },
    featuredImage: {
        type: String,
        default: "",
        required: false,
    },
    tags: {
        type: [String],
        default: [],
        required: false
    },
    isPublished: {
        type: Boolean,
        required: false,
        default: false
    },
    publishedAt: {
        type: Date,
        required: false
    }
}, {
    timestamps: true
})

const Blog = mongoose.model("Blog", BlogSchema, "Blogs");
export default Blog;