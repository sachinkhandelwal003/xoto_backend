import mongoose from "mongoose";
import Property from "../models/PropertyModel.js";
import Developer from "../models/DeveloperModel.js";
import Inventory from "../models/Inventory.js";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import Lead from "../../Agent/models/AgentLeaad.js";
import bcrypt from "bcryptjs";


// import Agent from "../models/Agent.js";
// import jwt from "jsonwebtoken";

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
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    const { developer, units, ...body } = req.body;
    
    console.log("Developer ID:", developer);
    console.log("Units array:", units ? units.length : "No units");
    console.log("Body fields:", Object.keys(body));

    // 1. Check if developer exists
    const developerExists = await Developer.findById(developer);
    if (!developerExists) {
      return res.status(404).json({
        success: false,
        message: "Developer not found"
      });
    }
    console.log("Developer found:", developerExists.name);

    // 2. Create the property first
    console.log("Creating property with data:", {
      ...body,
      developer: new mongoose.Types.ObjectId(developer),
      approvalStatus: "pending"
    });
    
    const property = await Property.create({
      ...body,
      developer: new mongoose.Types.ObjectId(developer),
      approvalStatus: "pending",
      rejectionReason: ""
    });
    
    console.log("Property created with ID:", property._id);

    // 3. Create inventory units if provided
    let createdUnits = [];
    if (units && Array.isArray(units) && units.length > 0) {
      console.log(`Processing ${units.length} inventory units...`);
      
      // Prepare inventory documents
      const inventoryUnits = units.map((unit, index) => {
        console.log(`Unit ${index + 1}:`, unit);
        
        return {
          developerId: developer,
          projectId: property._id,
          unitId: unit.unitId,
          tower: unit.tower || "",
          floor: unit.floor || 0,
          unitType: unit.unitType || body.propertyType || "",
          bedrooms: unit.bedrooms || body.bedrooms || 0,
          bathrooms: unit.bathrooms || body.bathrooms || 0,
          area: unit.area || body.builtUpArea_min || 0,
          price: unit.price || body.price || 0,
          facing: unit.facing || "",
          view: unit.view || "",
          status: "Available",
          agentId: null,
          leadId: null
        };
      });
      
      console.log("Prepared inventory data:", JSON.stringify(inventoryUnits, null, 2));

      // ✅ NOW USING Inventory (matches import)
      createdUnits = await Inventory.insertMany(inventoryUnits);
      console.log(`✅ Created ${createdUnits.length} inventory units`);
    } else {
      console.log("No units to create");
    }

    // 4. Return success with property and inventory
    return res.status(201).json({
      success: true,
      message: createdUnits.length > 0 
        ? `Property created successfully with ${createdUnits.length} inventory units and sent for admin approval`
        : "Property created successfully and sent for admin approval (no units added)",
      data: {
        property,
        inventory: createdUnits,
        totalUnits: createdUnits.length
      }
    });

  } catch (error) {
    console.error("❌ ERROR in createProperty:", error);
    
    // Handle duplicate unitId error
    if (error.code === 11000) {
      console.error("Duplicate key error:", error.keyValue);
      return res.status(400).json({
        success: false,
        message: `Duplicate unit ID - ${JSON.stringify(error.keyValue)} already exists`
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// export const getAllProperties = async (req, res) => {
//     try {
//         let page = Number(req.query.page) || 1;
//         let limit = Number(req.query.limit) || 10;
//         let skip = (page - 1) * limit;
//         let isFeatured = req.query.isFeatured;

//         // ✅ 1. Developer ID filter pakadne ke liye query param add karein
//         const { developerId } = req.query; 

//         let query = {};

//         if (isFeatured && isFeatured == "true") {
//             query.isFeatured = true;
//         }

//         // ✅ 2. Agar frontend se developerId bheji gayi hai, toh query mein add karein
//         if (developerId) {
//             query.developer = developerId; 
//         }

//         const property = await Property.find(query)
//             .populate("developer")
//             .sort({ createdAt: -1 })
//             .limit(limit)
//             .skip(skip);

//         let total = await Property.countDocuments(query);

//         return res.status(200).json({
//             success: true,
//             message: "Properties fetched successfully",
//             data: property,
//             pagination: {
//                 totalPages: Math.ceil(total / limit),
//                 limit,
//                 page,
//                 total: total
//             }
//         });

//     } catch (error) {
//         return res.status(500).json({
//             success: false,
//             message: error.message
//         });
//     }
// };
// export const getAllProperties = async (req, res) => {
//     try {
//         let page = Number(req.query.page) || 1;
//         let limit = Number(req.query.limit) || 10;
//         let skip = (page - 1) * limit;

//         // ✅ 1. Frontend se aane wale saare naye aur purane query params nikaal liye
//         const { 
//             developerId, 
//             isFeatured,
//             keyword,        // Open search (Name, Title, Desc, Location)
//             propertyType,   // Apartment, Villa, etc.
//             purpose,        // Buy, Rent
//             location,       // Dubai Marina, Downtown, etc.
//             bedrooms,       // 1, 2, 3, 4+
//             minPrice,       // Minimum budget
//             maxPrice        // Maximum budget
//         } = req.query; 

//         let query = {};

//         // --- PURANA LOGIC (Bilkul safe hai) ---
//         if (isFeatured && isFeatured == "true") {
//             query.isFeatured = true;
//         }

//         if (developerId) {
//             query.developer = developerId; 
//         }

//         // --- 🔥 NAYA ADVANCED FILTER LOGIC 🔥 ---

//         // A. Open-ended Keyword Search (Name, Title, Description, ya Location)
//         if (keyword) {
//             query.$or = [
//                 { title: { $regex: keyword, $options: "i" } },
//                 { name: { $regex: keyword, $options: "i" } }, // Name se bhi search hoga
//                 { description: { $regex: keyword, $options: "i" } },
//                 { location: { $regex: keyword, $options: "i" } }
//             ];
//         }

//         // B. Exact Matches (Dropdowns)
//         if (propertyType) query.propertyType = propertyType;
//         if (purpose) query.purpose = purpose;
        
//         // Location ke liye Regex lagaya taaki partial name bhi match ho jaye
//         if (location) query.location = { $regex: location, $options: "i" };

//         // C. Bedrooms Filter (Agar "4+" select kiya toh $gte lag jayega)
//         if (bedrooms) {
//             if (String(bedrooms).includes('+')) {
//                 query.bedrooms = { $gte: Number(bedrooms.replace('+', '')) };
//             } else {
//                 query.bedrooms = Number(bedrooms);
//             }
//         }

//         // D. Price Range Slider Filter
//         if (minPrice || maxPrice) {
//             query.price = {};
//             if (minPrice) query.price.$gte = Number(minPrice);
//             if (maxPrice) query.price.$lte = Number(maxPrice);
//         }

//         // --- DATABASE QUERY EXECUTED ---
//         const property = await Property.find(query)
//             .populate("developer")
//             .sort({ createdAt: -1 })
//             .limit(limit)
//             .skip(skip);

//         let total = await Property.countDocuments(query);

//         return res.status(200).json({
//             success: true,
//             message: "Properties fetched successfully",
//             data: property,
//             pagination: {
//                 totalPages: Math.ceil(total / limit),
//                 limit,
//                 page,
//                 total: total
//             }
//         });

//     } catch (error) {
//         return res.status(500).json({
//             success: false,
//             message: error.message
//         });
//     }
// };
export const getAllProperties = async (req, res) => {
  try {

    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const search = req.query.search || "";
    const developer = req.query.developer || "";

    const skip = (page - 1) * limit;

    let query = {};

    // 🔎 Search by property name or developer
    if (search) {
      query.$or = [
        { propertyName: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { area: { $regex: search, $options: "i" } }
      ];
    }

     if (developer) {
      query.developer = developer;
    }
    const properties = await Property.find(query)
      .populate("developer", "name logo")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "Properties fetched successfully",
      count: total,
      data: properties,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
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

      // 🔴 Only approved properties
      Property.find({ approvalStatus: "approved" })
        .populate("developer")
        .sort({ createdAt: -1 })
        .limit(3),

      Property.find({
        isFeatured: true,
        approvalStatus: "approved"
      })
        .populate("developer")
        .sort({ createdAt: -1 })
        .limit(3)

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

        const property = await Property.findById(id)
  .populate("developer");

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


        const property = await Property.findById(id)
  .populate("developer");


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
// Inventory Controller
// Inventory Controller
export const createInventory = async (req, res) => {
  try {
    const { 
      developerId, 
      projectId, 
      unitId, 
      tower,
      floor,
      unitType,
      bedrooms,
      bathrooms,
      area, 
      price,
      facing,
      view,
      status = "Available"  // Default to Available if not provided
    } = req.body;

    // 🔹 Basic validation
    if (!developerId || !projectId || !unitId) {
      return res.status(400).json({
        success: false,
        message: "developerId, projectId and unitId are required"
      });
    }

    // 🔹 Check developer exists
    const developerExists = await Developer.findById(developerId);
    if (!developerExists) {
      return res.status(404).json({
        success: false,
        message: "Developer not found"
      });
    }

    // 🔹 Check property exists
    const propertyExists = await Property.findById(projectId);
    if (!propertyExists) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    // 🔹 Check for duplicate unitId in same project
    const existingUnit = await Inventory.findOne({
      projectId,
      unitId
    });

    if (existingUnit) {
      return res.status(400).json({
        success: false,
        message: `Unit ID ${unitId} already exists in this project`
      });
    }

    // 🔹 Create inventory with ALL schema fields
    const inventory = await Inventory.create({
      developerId,
      projectId,
      unitId,
      tower: tower || "",
      floor: floor || 0,
      unitType: unitType || "",
      bedrooms: bedrooms || 0,
      bathrooms: bathrooms || 0,
      area: area || 0,
      price: price || 0,
      facing: facing || "",
      view: view || "",
      status,  // "Available" by default
      agentId: null,
      leadId: null,
      reservedAt: null,
      bookedAt: null,
      soldAt: null
    });

    return res.status(201).json({
      success: true,
      message: "Inventory created successfully",
      data: inventory
    });

  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Unit ID ${error.keyValue.unitId} already exists`
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getInventoryByProperty = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Get pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get filter parameters
    const { unitType, status, minPrice, maxPrice, bedrooms } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project ID is required"
      });
    }

    // Build filter query
    let filterQuery = { projectId };

    // Filter by Unit Type (BHK format)
    if (unitType) {
      const bhkPattern = unitType.replace(/\s+/g, '').toUpperCase();
      filterQuery.unitType = { $regex: new RegExp(bhkPattern, 'i') };
    }

    // Filter by Status
    if (status) {
      filterQuery.status = status;
    }

    // Filter by Bedrooms
    if (bedrooms) {
      if (bedrooms === '5+') {
        filterQuery.bedrooms = { $gte: 5 };
      } else {
        filterQuery.bedrooms = parseInt(bedrooms);
      }
    }

    // Filter by Price Range
    if (minPrice || maxPrice) {
      filterQuery.price = {};
      if (minPrice) filterQuery.price.$gte = parseInt(minPrice);
      if (maxPrice) filterQuery.price.$lte = parseInt(maxPrice);
    }

    // ✅ GET COMPLETE STATISTICS
    const [
      total,
      units,
      unitTypeStats,
      statusStats,
      bedroomStats
    ] = await Promise.all([
      // Total count with filters
      Inventory.countDocuments(filterQuery),
      
      // Paginated units
      Inventory.find(filterQuery)
        .populate("projectId", "propertyName")
        .populate("agentId", "first_name last_name email")
        .populate("leadId", "first_name last_name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      
      // ✅ UNIT TYPE WISE STATS (1BHK, 2BHK, etc.)
      Inventory.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        { 
          $group: {
            _id: { 
              $toUpper: { 
                $trim: { 
                  input: { $ifNull: ["$unitType", "Unknown"] } 
                } 
              }
            },
            total: { $sum: 1 },
            available: {
              $sum: { $cond: [{ $eq: ["$status", "Available"] }, 1, 0] }
            },
            reserved: {
              $sum: { $cond: [{ $eq: ["$status", "Reserved"] }, 1, 0] }
            },
            booked: {
              $sum: { $cond: [{ $eq: ["$status", "Booked"] }, 1, 0] }
            },
            sold: {
              $sum: { $cond: [{ $eq: ["$status", "Sold"] }, 1, 0] }
            },
            minPrice: { $min: "$price" },
            maxPrice: { $max: "$price" },
            avgPrice: { $avg: "$price" }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // ✅ STATUS WISE STATS (Overall)
      Inventory.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalValue: { $sum: "$price" }
          }
        }
      ]),
      
      // ✅ BEDROOM WISE STATS
      Inventory.aggregate([
        { $match: { projectId: new mongoose.Types.ObjectId(projectId) } },
        {
          $group: {
            _id: "$bedrooms",
            count: { $sum: 1 },
            totalValue: { $sum: "$price" }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Format unit type stats for easier consumption
    const formattedUnitTypeStats = {};
    unitTypeStats.forEach(stat => {
      const type = stat._id || "Unknown";
      formattedUnitTypeStats[type] = {
        total: stat.total,
        available: stat.available,
        reserved: stat.reserved,
        booked: stat.booked,
        sold: stat.sold,
        pricing: {
          min: stat.minPrice,
          max: stat.maxPrice,
          avg: Math.round(stat.avgPrice)
        }
      };
    });

    // Format status stats
    const formattedStatusStats = {
      Available: 0,
      Reserved: 0,
      Booked: 0,
      Sold: 0,
      totalValue: 0
    };
    
    statusStats.forEach(stat => {
      formattedStatusStats[stat._id] = stat.count;
      formattedStatusStats.totalValue += stat.totalValue || 0;
    });

    return res.status(200).json({
      success: true,
      message: "Inventory fetched successfully",
      data: {
        units,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
        filters: {
          unitType: unitType || null,
          status: status || null,
          minPrice: minPrice || null,
          maxPrice: maxPrice || null,
          bedrooms: bedrooms || null
        },
        // ✅ COMPREHENSIVE STATISTICS
        stats: {
          // Overall counts
          overall: {
            totalUnits: total,
            totalValue: formattedStatusStats.totalValue,
            byStatus: formattedStatusStats
          },
          // Unit type wise breakdown (1BHK, 2BHK, etc.)
          byUnitType: formattedUnitTypeStats,
          // Bedroom wise breakdown
          byBedroom: bedroomStats.reduce((acc, curr) => {
            acc[curr._id || 0] = {
              count: curr.count,
              totalValue: curr.totalValue
            };
            return acc;
          }, {}),
          // Quick stats array for charts
          // charts: {
          //   unitTypeDistribution: unitTypeStats.map(stat => ({
          //     name: stat._id,
          //     value: stat.total,
          //     available: stat.available,
          //     reserved: stat.reserved,
          //     booked: stat.booked,
          //     sold: stat.sold
          //   })),
          //   statusDistribution: statusStats.map(stat => ({
          //     name: stat._id,
          //     value: stat.count
          //   }))
          // }
        }
      }
    });

  } catch (error) {
    console.error("Error in getInventoryByProperty:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
export const updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const unit = await Inventory.findById(id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Inventory not found"
      });
    }

    // Prevent updating Sold unit
    if (unit.status === "Sold") {
      return res.status(400).json({
        success: false,
        message: "Sold unit cannot be modified"
      });
    }

    // Prevent changing unitId if it already exists in same project
    if (updateData.unitId && updateData.unitId !== unit.unitId) {
      const existingUnit = await Inventory.findOne({
        projectId: unit.projectId,
        unitId: updateData.unitId,
        _id: { $ne: id } // Exclude current unit
      });

      if (existingUnit) {
        return res.status(400).json({
          success: false,
          message: `Unit ID ${updateData.unitId} already exists in this project`
        });
      }
    }

    // Update fields
    Object.assign(unit, updateData);
    await unit.save();

    // Populate references for response
    const updatedUnit = await Inventory.findById(id)
      .populate("projectId", "propertyName")
      .populate("agentId", "first_name last_name email")
      .populate("leadId", "first_name last_name email");

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully",
      data: updatedUnit
    });

  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Unit ID ${error.keyValue.unitId} already exists`
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
export const deleteInventory = async (req, res) => {
  try {
    const id = req.params.id;

    const deleted = await Inventory.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Inventory deleted successfully",
      data: deleted
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


//Newly added
export const reserveUnit = async (req, res) => {

  try {

    const { id } = req.params;
    const { leadId, agentId } = req.body;

    const unit = await Inventory.findById(id);

    if (!unit) {
      return res.status(404).json({
        success:false,
        message:"Unit not found"
      });
    }

    if (unit.status !== "Available") {
      return res.status(400).json({
        success:false,
        message:"Unit not available"
      });
    }

    const lead = await Lead.findById(leadId);

    if (!lead) {
      return res.status(404).json({
        success:false,
        message:"Lead not found"
      });
    }

    unit.status = "Reserved";
    unit.leadId = leadId;
    unit.agentId = agentId;
    unit.reservedAt = new Date();

    await unit.save();

    return res.json({
      success:true,
      message:"Unit reserved successfully",
      data:unit
    });

  } catch (error) {

    res.status(500).json({
      success:false,
      message:error.message
    });

  }

};
export const bookUnit = async (req,res)=>{

 try{

  const { id } = req.params;

  const unit = await Inventory.findById(id);

  if(unit.status !== "Reserved"){
    return res.status(400).json({
      success:false,
      message:"Unit must be reserved first"
    });
  }

  unit.status = "Booked";
  unit.bookedAt = new Date();

  await unit.save();

  res.json({
    success:true,
    message:"Unit booked"
  });

 }catch(err){

  res.status(500).json({
    success:false,
    message:err.message
  });

 }

}
export const releaseUnit = async (req,res)=>{

 try{

  const { id } = req.params;

  const unit = await Inventory.findById(id);

  unit.status = "Available";
  unit.agentId = null;
  unit.leadId = null;
  unit.reservedAt = null;

  await unit.save();

  res.json({
    success:true,
    message:"Unit released"
  });

 }catch(err){

  res.status(500).json({
    success:false,
    message:err.message
  });

 }

}
export const getPropertiesByDeveloper = async (req, res) => {

  try {

    const { developerId } = req.params;

    const properties = await Property.find({
      developer: developerId
    })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: properties
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


export const bulkImportInventory = async (req, res) => {
  try {
    const { developerId, projectId, units } = req.body;

    if (!developerId || !projectId || !units?.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid data"
      });
    }

    const formattedUnits = units.map(unit => ({
      developerId,
      projectId,
      unitId: unit.unitId,
      area: unit.area,
      price: unit.price,
      view: unit.view || "",
      status: unit.status || "Available"
    }));

    await Inventory.insertMany(formattedUnits);

    return res.status(201).json({
      success: true,
      message: "CSV Imported Successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getDeveloperLeads = async (req, res) => {
  try {

    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const developer = req.query.developer;

    const skip = (page - 1) * limit;

    let query = {};

    if (developer) {
      query.developer = developer;
    }

    // Total count
    const total = await Lead.countDocuments(query);

    // Paginated data
    const leads = await Lead.find(query)
      .populate("agent", "first_name last_name email")
      .populate("project", "propertyName")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Leads fetched successfully",
      count: leads.length,
      data: leads,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};







export const approveProperty = async (req, res) => {
  try {

    const { id } = req.params;

    const property = await Property.findById(id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    property.approvalStatus = "approved";

    await property.save();

    return res.status(200).json({
      success: true,
      message: "Property approved successfully",
      data: property
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
export const getApprovedProperties = async (req, res) => {
  try {

    const properties = await Property.find({
      approvalStatus: "approved"
    }).populate("developer");

    return res.status(200).json({
      success: true,
      message: "Approved properties fetched successfully",
      data: properties
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

export const getDeveloperLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    // Lead ko find karein aur agent & project ki details populate karein
    const lead = await Lead.findById(id)
      .populate("agent", "first_name last_name email phone_number")
      .populate("project", "propertyName title");

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lead details fetched successfully",
      data: lead
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
export const updatePropertyStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { status, reason } = req.body;

    const property = await Property.findById(id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    property.approvalStatus = status;

    if (status === "rejected") {
      property.rejectionReason = reason;
    }

    await property.save();

    return res.status(200).json({
      success: true,
      message: "Status updated successfully",
      data: property
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};
export const getDeveloperDashboard = async (req, res) => {
  try {

    const { developerId } = req.params;

    // 1️⃣ Get developer properties
    const properties = await Property.find({
      developer: developerId
    });

    const propertyIds = properties.map(p => p._id);

    // 2️⃣ Inventory stats
    const availableUnits = await Inventory.countDocuments({
      projectId: { $in: propertyIds },
      status: "Available"
    });

    const bookedUnits = await Inventory.countDocuments({
      projectId: { $in: propertyIds },
      status: "Booked"
    });

    const soldUnits = await Inventory.countDocuments({
      projectId: { $in: propertyIds },
      status: "Sold"
    });

    // 3️⃣ Leads from those properties
    const leads = await Lead.find({
      project: { $in: propertyIds }
    });

    const stats = [
      {
        label: "Total Projects",
        value: properties.length
      },
      {
        label: "Available Units",
        value: availableUnits
      },
      {
        label: "Units Sold",
        value: soldUnits
      }
    ];

    const inventoryStatus = [
      { name: "Available", value: availableUnits },
      { name: "Booked", value: bookedUnits },
      { name: "Sold", value: soldUnits }
    ];

    const dealFunnel = [
      { stage: "Leads", count: leads.length },
      { stage: "Visits", count: leads.filter(l => l.status === "visit").length },
      { stage: "Bookings", count: leads.filter(l => l.status === "booking").length }
    ];

    res.json({
      success: true,
      stats,
      inventoryStatus,
      dealFunnel
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


export const getCommissionScheme = async (req,res)=>{

try{

const property = await Property.findById(req.params.propertyId)
.select("commission commissionType bonusCommission propertyName");

if(!property){
return res.status(404).json({
success:false,
message:"Property not found"
});
}

res.json({
success:true,
data:property
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};
export const setCommissionScheme = async (req,res)=>{

try{

const { propertyId, type, value, bonus } = req.body;

const property = await Property.findById(propertyId);

if(!property){
return res.status(404).json({
success:false,
message:"Property not found"
});
}

property.commissionType = type;
property.commission = value;
property.bonusCommission = bonus;

await property.save();

res.json({
success:true,
message:"Commission scheme updated",
data:property
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};

export const getDeveloperCommissions = async (req,res)=>{

try{

const developerId = req.params.developerId;

const commissions = await Lead.find({
developer: developerId,
status: { $in:["deal","booking","closed"] }
})
.populate("agent","first_name last_name email")
.populate("project","propertyName")
.select("agent project dealValue commission createdAt");

res.json({
success:true,
data:commissions
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};
export const updateLeadStatus = async (req, res) => {

  try {

    const { status, dealValue } = req.body;

    const lead = await Lead.findById(req.params.id).populate("project");

    if (!lead) {
      return res.status(404).json({
        success:false,
        message:"Lead not found"
      });
    }

    let commissionAmount = 0;

    if(status === "deal" || status === "booking" || status === "closed"){

      const property = await Property.findById(lead.project);

      if(property){

        if(property.commissionType === "percentage"){

          commissionAmount = (dealValue * property.commission) / 100;

        }else{

          commissionAmount = property.commission;

        }

      }

    }

    lead.status = status;
    lead.dealValue = dealValue;
    lead.commission = commissionAmount;

    await lead.save();

    res.json({
      success:true,
      message:"Status updated",
      data:lead
    });

  } catch (error) {

    res.status(500).json({
      success:false,
      message:error.message
    });

  }

};

//revenue
export const getDeveloperRevenue = async (req,res)=>{

try{

const developerId = req.params.developerId;

const deals = await Lead.find({
developer: developerId,
status: { $in:["deal","booking","closed"] }
})
.populate("project","propertyName");

let totalRevenue = 0;
let thisMonthRevenue = 0;
let pendingPayments = 0;

const currentMonth = new Date().getMonth();

deals.forEach(deal => {

totalRevenue += deal.dealValue || 0;

const dealMonth = new Date(deal.createdAt).getMonth();

if(dealMonth === currentMonth){
thisMonthRevenue += deal.dealValue || 0;
}

if(deal.status !== "closed"){
pendingPayments += deal.dealValue || 0;
}

});

res.json({
success:true,
stats:{
totalRevenue,
thisMonthRevenue,
pendingPayments,
totalDeals: deals.length
},
transactions: deals
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};