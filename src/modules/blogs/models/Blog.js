import mongoose from "mongoose"

let BlogSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true,
        required: false,
    },
    subHeading: {
        type: String,
        default: "",
        required: false,
    },
    slug: {
        type: String,
        trim: true,
        required: false,
        index: true
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
    coverImage: {
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
    },
    authorName: {
        type: String,
        required: false,
        default: ""
    },
    authorImage: {
        type: String,
        required: false,
        default: ""
    }
}, {
    timestamps: true
})

const Blog = mongoose.model("Blog", BlogSchema, "Blogs");
export default Blog;