import Property from "../models/PropertyModel.js";
import Developer from "../models/DeveloperModel.js";


export const createDeveloper = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Developer name is required"
            });
        }

        // // check if developer already exists
        // let developer = await Developer.findOne({ name });

        // if (developer) {
        //   return res.status(200).json({
        //     success: true,
        //     message: "Developer already exists",
        //     developer
        //   });
        // }

        let developer = await Developer.create({ ...req.body });

        return res.status(201).json({
            success: true,
            message: "Developer created successfully",
            developer
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


        const property = await Property.create({ ...req.body });

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

export const getAllProperties = async (req, res) => {
    try {

        const property = await Property.find({}).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Properties fetched successfully",
            data: property
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

        const property = await Property.findById({_id:id});

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
