import Property from "../models/PropertyModel.js";
import Developer from "../models/DeveloperModel.js";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import bcrypt from "bcryptjs";


// import Agent from "../models/Agent.js";
import jwt from "jsonwebtoken";

export const createDeveloper = async (req, res) => {
    try {
        const { name ,password } = req.body;

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

    const roleDoc = await Role.findOne({ code: 17 });
        if (!roleDoc) {
            return res.status(404).json({
                success: false,
                message: "Role with code 17 not found"
            });
        }        


            const hashedPassword = await bcrypt.hash(password, 10);
        
        let developer = await Developer.create({ ...req.body,role:roleDoc._id ,password:hashedPassword });

        return res.status(201).json({
            success: true,
            message: "Developer signup successfully",
            developer
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const loginDeveloper = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required",
      });
    }

    const developer = await Developer.findOne({ email })
      .select("+password")
      .populate({
        path: "role",
        model: Role,
      });

    if (!developer) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, developer.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // ✅ Use same token method as agent
    const token = createToken(developer);

    // Remove password before sending
    const developerResponse = developer.toObject();
    delete developerResponse.password;

    return res.status(200).json({
      success: true,
      message: "Developer login successful",
      token,
      developer: developerResponse,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
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
        let page = Number(req.query.page) || 1;
        let limit = Number(req.query.limit) || 10;
        let skip = (page - 1) * limit;
        let isFeatured = req.query.isFeatured;

        // ✅ 1. Developer ID filter pakadne ke liye query param add karein
        const { developerId } = req.query; 

        let query = {};

        if (isFeatured && isFeatured == "true") {
            query.isFeatured = true;
        }

        // ✅ 2. Agar frontend se developerId bheji gayi hai, toh query mein add karein
        if (developerId) {
            query.developer = developerId; 
        }

        const property = await Property.find(query)
            .populate("developer")
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        let total = await Property.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: "Properties fetched successfully",
            data: property,
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
