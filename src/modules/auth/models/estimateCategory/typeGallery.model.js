const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema(
  {
    title: { type: String },
    url: { type: String },
    perSqValue:{type:Number,default:0,required:false}
  },
  { _id: false }
);

const TypeGallerySchema = new mongoose.Schema(
  {
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EstimateMasterType",
      required: true,
      unique: true,
      index: true,
    },

    previewImage: ImageSchema,

    moodboardImages: [ImageSchema],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const TypeGallery =
  mongoose.models.TypeGallery ||
  mongoose.model("EstimateMasterTypeGallery", TypeGallerySchema);

module.exports = { TypeGallery };
