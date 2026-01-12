// import Property from "../models/ProductModel.js";
// import Developer from "../models/DeveloperModel.js";
import Brand from "../models/BrandSchema.js";
import Category from "../models/CategoryModel.js";
import Product from "../models/ProductModel.js"
import ProductColour from "../models/ProductColorSchema.js"

export const createBrand = async (req, res) => {
    try {

        let newbrand = await Brand.create({ ...req.body });

        return res.status(201).json({
            success: true,
            message: "Brand created successfully",
            Brand: newbrand
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getAllBrands = async (req, res) => {
    try {

        let page = Number(req.query.page) || 1;
        let limit = Number(req.query.limit) || 10;
        let skip = (page - 1) * limit;
        let search = req.query.search || "";

        let query = {};
        if (search != "") {
            query.brandName = {
                $regex: new RegExp(search, "i")
            }
        }


        const brands = await Brand.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);

        let total = await Brand.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: "Brands fetched successfully",
            data: brands,
            pagination: {
                totalPages: Math.ceil(total / limit),
                limit,
                page,
                total: total
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getAllCategory = async (req, res) => {
    try {

        let page = Number(req.query.page) || 1;
        let limit = Number(req.query.limit) || 10;
        let skip = (page - 1) * limit;
        let search = req.query.search || "";

        let query = {};
        if (search != "") {
            query.name = {
                $regex: new RegExp(search, "i")
            }
        }


        const categories = await Category.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);

        let total = await Category.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: "categories fetched successfully",
            data: categories,
            pagination: {
                totalPages: Math.ceil(total / limit),
                limit,
                page,
                total: total
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getCategoryById = async (req, res) => {
    try {

        const { id } = req.query;

        const existingCategory = await Category.findOne({ _id: id });

        if (!existingCategory) {
            return res.status(400).json({
                success: true,
                message: "No category Found",
                data: existingCategory
            });
        }

        return res.status(200).json({
            success: true,
            message: "Category fetched successfully",
            data: existingCategory
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const createCategory = async (req, res) => {
    try {


        const newCategory = await Category.create({ ...req.body });


        return res.status(200).json({
            success: true,
            message: "Category added successfully",
            data: newCategory
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const createProducts = async (req, res) => {
    try {

        let newproduct = await Product.create({ ...req.body.product });

        let colors = req.body.colours

        let newColors = colors.map(c => {
            return { ...c, product: newproduct._id }
        })

        let coloursData = await ProductColour.insertMany(newColors);

        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            Brand: {newproduct,coloursData}
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getBrandByID = async (req, res) => {
    try {

        const { id } = req.query;

        const existingBrand = await Brand.findOne({ _id: id });

        if (!existingBrand) {
            return res.status(400).json({
                success: true,
                message: "No brand Found",
                data: existingBrand
            });
        }

        return res.status(200).json({
            success: true,
            message: "Brand fetched successfully",
            data: existingBrand
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



export const editBrandByID = async (req, res) => {
    try {
        const { id } = req.query;
        const brand = await Brand.findByIdAndUpdate(id, { ...req.body }, { new: true });
        return res.status(200).json({
            success: true,
            message: "Brand updated successfully",
            data: brand
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const deleteBrandBYID = async (req, res) => {
    try {
        const { id } = req.query;
        const brand = await Brand.findByIdAndDelete(id);
        return res.status(200).json({
            success: true,
            message: "Brand deleted successfully",
            data: brand
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const deleteCategoryByID = async (req, res) => {
    try {
        const { id } = req.query;
        const category = await Category.findByIdAndDelete(id);
        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
            data: category
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



export const createProduct = async (req, res) => {
    try {

        let newproduct = await Product.create({ ...req.body.product });



        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            Brand: newbrand
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const editCategory = async (req, res) => {
    try {

        let id = req.query.id;

        let newCategory = await Category.findByIdAndUpdate(id, { ...req.body }, { new: true });

        return res.status(201).json({
            success: true,
            message: "Category updated successfully",
            Brand: newCategory
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const getAllCategories = async (req, res) => {
    try {

        let page = Number(req.query.page) || 1;
        let limit = Number(req.query.limit) || 10;
        let skip = (page - 1) * limit;
        let search = req.query.search || "";

        let query = {};
        if (search != "") {
            query.brandName = {
                $regex: new RegExp(search, "i")
            }
        }


        const brands = await Category.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);

        let total = await Brand.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: "Brands fetched successfully",
            data: brands,
            pagination: {
                totalPages: Math.ceil(total / limit),
                limit,
                page,
                total: total
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const createProperty = async (req, res) => {
    try {
        const {
            developer, ...body
        } = req.body;


        const developerExists = await Developer.findById(developer);
        if (!developerExists) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }


        const property = await Brand.create({ ...req.body });

        return res.status(201).json({
            success: true,
            message: "Property created successfully",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const editProperty = async (req, res) => {
    try {

        let id = req.query.id;

        const {
            developer, ...body
        } = req.body;


        const developerExists = await Developer.findById(developer);
        if (!developerExists) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }


        const property = await Property.findByIdAndUpdate(id, { ...req.body }, { new: true });

        return res.status(201).json({
            success: true,
            message: "Property edited successfully",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};





export const getAllDevelopers = async (req, res) => {
    try {

        let search = req.query.search || "";

        let query = {};

        if (search != "") {
            query = {
                $or: [
                    {
                        name: { $regex: search, $options: "i" },
                    }, {
                        email: { $regex: search, $options: "i" }
                    }
                ]
            }
        }

        let alldevelopers = await Developer.find(query).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Developers fetched successfully",
            data: alldevelopers
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const MarketPlaceAPI = async (req, res) => {
    try {

        const [properties, featuredPropeties] = await Promise.all([
            Property.find({}).populate("developer").sort({ createdAt: -1 }).limit(3),
            Property.find({ isFeatured: true }).populate("developer").sort({ createdAt: -1 }).limit(3)
        ]);

        return res.status(200).json({
            success: true,
            message: "Properties fetched successfully",
            data: { properties, featuredPropeties },
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getPropertiesById = async (req, res) => {
    try {

        let id = req.query.id;

        const property = await Property.findById({ _id: id });

        return res.status(200).json({
            success: true,
            message: "Property fetched successfully",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteProperty = async (req, res) => {
    try {
        let id = req.query.id;

        const property = await Property.findByIdAndDelete(id)

        return res.status(200).json({
            success: true,
            message: "Property Deleted successfully",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const editDeveloper = async (req, res) => {
    try {

        let id = req.query.id;
        console.log("id", id)

        const developerExists = await Developer.findById(id);
        if (!developerExists) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }


        let updatedDeveloper = await Developer.findByIdAndUpdate(id, { ...req.body }, { new: true });

        return res.status(201).json({
            success: true,
            message: "Developer edited successfully",
            data: updatedDeveloper
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const deleteDeveloper = async (req, res) => {
    try {
        let id = req.query.id;

        let projects = await Property.deleteMany({ developer: id });
        const developer = await Developer.findByIdAndDelete(id)


        return res.status(200).json({
            success: true,
            message: "Developer Deleted successfully",
            data: { developer, projects }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getDeveloperrById = async (req, res) => {
    try {
        let id = req.query.id;


        const developer = await Developer.findOne({ _id: id })


        return res.status(200).json({
            success: true,
            message: "Developer fetched",
            data: developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


export const getPropertyById = async (req, res) => {
    try {
        let id = req.query.id;


        const property = await Property.findOne({ _id: id })


        return res.status(200).json({
            success: true,
            message: "Property fetched",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
