import mongoose from "mongoose";
import Property from "../models/PropertyModel.js";
import Developer from "../models/DeveloperModel.js";
import Inventory from "../models/Inventory.js";
import { Role } from '../../../modules/auth/models/role/role.model.js';
import { createToken } from '../../../middleware/auth.js';
import Lead from "../../Grid/Agent/models/AgentLeaad.js";
import bcrypt from "bcryptjs";


// * @desc    Developer registration (first step)
//  */
export const createDeveloper = async (req, res) => {
    try {
        const { name, email, password, phone_number, country_code } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        // Check if developer already exists
        let existingDeveloper = await Developer.findOne({ email });
        if (existingDeveloper) {
            return res.status(400).json({
                success: false,
                message: "Developer with this email already exists"
            });
        }

        // Get role for developer (code 17)
        const roleDoc = await Role.findOne({ code: 17 });
        if (!roleDoc) {
            return res.status(404).json({
                success: false,
                message: "Role configuration not found"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create developer
        const developer = await Developer.create({
            name,
            email,
            password: hashedPassword,
            phone_number: phone_number || "",
            country_code: country_code || "+971",
            role: roleDoc._id,
            accountStatus: "pending",
            onboardingStatus: "new",
            kycStatus: "not_submitted"
        });

        return res.status(201).json({
            success: true,
            message: "Developer registered successfully. Please complete KYC.",
            data: developer
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

    const data = req.body;

    // ✅ 0. LISTING TYPE VALIDATION
    if (!data.listingType || !["secondary", "developer"].includes(data.listingType)) {
      return res.status(400).json({
        success: false,
        message: "listingType must be 'secondary' or 'developer'"
      });
    }

    // =====================================================
    // 🔵 SECONDARY (AGENT FLOW - PDF)
    // =====================================================
    if (data.listingType === "secondary") {

      // ✅ PROJECT VALIDATION
      if (data.projectType === "new") {
        if (!data.projectName || !data.developerName) {
          return res.status(400).json({
            success: false,
            message: "Project name & developer name required"
          });
        }
      }

      // ✅ COMMISSION VALIDATION
      if (data.shareCommission && !data.commission) {
        return res.status(400).json({
          success: false,
          message: "Commission % required"
        });
      }

      // ✅ STATUS (GOES TO ADMIN)
      data.approvalStatus = "pending";

      // ✅ CREATED BY AGENT
      data.createdBy = req.user._id;
data.developer = req.user._id;

      // ❌ REMOVE DEV FIELDS
      
      delete data.units;
    }

    if (data.listingType === "developer") {

      // ✅ REQUIRE DEVELOPER ID
     data.developer = req.user._id;   
  data.createdBy = req.user._id;

      // ✅ AUTO APPROVED
      data.approvalStatus = "approved";

      // ✅ OPTIONAL: SET CREATED BY
      data.createdBy = req.user?._id;
    }

    // =====================================================
    // ✅ CREATE PROPERTY
    // =====================================================
    const property = await Property.create(data);

    return res.status(201).json({
      success: true,
      message:
        data.listingType === "secondary"
          ? "Property submitted for admin approval"
          : "Property created successfully",
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
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search || "";

    const skip = (page - 1) * limit;

    // ✅ NO FILTER → fetch everything
    let query = {};

    // 🔎 OPTIONAL SEARCH (only if provided)
    if (search) {
      query = {
        $or: [
          { propertyName: { $regex: search, $options: "i" } },
          { city: { $regex: search, $options: "i" } },
          { area: { $regex: search, $options: "i" } }
        ]
      };
    }

    const properties = await Property.find(query)
      .populate({
        path: "developer",
        select: "name logo",
        strictPopulate: false
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "Properties fetched successfully",
      count: properties.length,
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
export const getPropertiesByStatus = async (req, res) => {
  try {

    const { status } = req.query;

    let query = {};

    if (status) {
      query.approvalStatus = status;
    }

    const properties = await Property.find(query)
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: properties
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const getMyProperties = async (req, res) => {
  try {

    console.log("USER ID:", req.user._id);

    const properties = await Property.find({
  createdBy: req.user._id.toString()   // 🔥 FIX
});

    return res.json({
      success: true,
      data: properties || []
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
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
export const getDeveloperLeads = async (req,res)=>{

try{

const developerId = req.user?.id || req.user?._id;

const leads = await Lead.find({
developer: developerId,
isDeleted:false
})
.populate("agent","first_name last_name email")
.populate("project","propertyName");

res.json({
success:true,
data:leads
});

}catch(err){

res.status(500).json({
success:false,
message:err.message
});

}

}
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
    const { approvalStatus, reason } = req.body;

    if (!["approved", "rejected", "pending"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    const property = await Property.findById(id);

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    property.approvalStatus = approvalStatus;

    if (approvalStatus === "rejected") {
      property.rejectionReason = reason || "Rejected by admin";
    } else {
      property.rejectionReason = "";
    }

    await property.save();

    return res.status(200).json({
      success: true,
      message: `Property ${approvalStatus} successfully`,
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