// models/estimateCategory/index.js
const mongoose = require("mongoose");

/* ------------------------- CATEGORY SCHEMA ------------------------- */

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: ["Interior", "Landscaping"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Auto-generate slug
CategorySchema.pre("save", function (next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, "-");
  }
  next();
});

// Virtual for subcategories
CategorySchema.virtual("subcategories", {
  ref: "Subcategory",
  localField: "_id",
  foreignField: "category",
  justOne: false,
});


/* ------------------------- SUBCATEGORY SCHEMA ------------------------- */

const SubcategorySchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes
SubcategorySchema.index({ label: 1, category: 1 }, { unique: true });
SubcategorySchema.index({ isActive: 1 });
SubcategorySchema.index({ order: 1 });

// Virtual for types
SubcategorySchema.virtual("types", {
  ref: "Type",
  localField: "_id",
  foreignField: "subcategory",
  justOne: false,
});


/* ------------------------- TYPE SCHEMA ------------------------- */

const TypeSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,      lowercase: true   // 🔥 IMPORTANT

    },
    description: { type: String, trim: true },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      required: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    baseEstimationValueUnit:{type:Number,default:0,required:false}
  },
  { timestamps: true }
);




/* ------------------------- EXPORT MODELS ------------------------- */

const Category = mongoose.models.Category || mongoose.model("EstimateMasterCategory", CategorySchema);
const Subcategory = mongoose.models.Subcategory || mongoose.model("EstimateMasterSubcategory", SubcategorySchema);
const Type = mongoose.models.Type || mongoose.model("EstimateMasterType", TypeSchema);

module.exports = {
  Category,
  Subcategory,
  Type,
};
