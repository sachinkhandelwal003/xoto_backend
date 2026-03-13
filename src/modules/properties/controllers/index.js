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

    const { developer, ...body } = req.body;

    const developerExists = await Developer.findById(developer);

    if (!developerExists) {
      return res.status(404).json({
        success: false,
        message: "Developer not found"
      });
    }

    const property = await Property.create({
      ...body,
      developer: new mongoose.Types.ObjectId(developer),

      // 🔴 IMPORTANT
      approvalStatus: "pending",
  rejectionReason: ""
    });

    return res.status(201).json({
      success: true,
      message: "Property created successfully and sent for admin approval",
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
export const createInventory = async (req, res) => {
  try {
    const { developerId, projectId, unitId, area, price, view } = req.body;

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

    // 🔹 Create inventory
    const inventory = await Inventory.create({
      developerId,
      projectId,
      unitId,
      area,
      price,
      view
    });

    return res.status(201).json({
      success: true,
      message: "Inventory created successfully",
      data: inventory
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export const getInventoryByProperty = async (req, res) => {
  try {

    const { projectId } = req.query;

    const units = await Inventory.find({ projectId })
      .populate("projectId", "projectName");

    return res.status(200).json({
      success: true,
      data: units
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};
export const updateInventory = async (req, res) => {
  try {
    const { id } = req.params;

    const unit = await Inventory.findById(id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Inventory not found"
      });
    }

    // Optional: Prevent updating Sold unit
    if (unit.status === "Sold") {
      return res.status(400).json({
        success: false,
        message: "Sold unit cannot be modified"
      });
    }

    Object.assign(unit, req.body);
    await unit.save();

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully",
      data: unit
    });

  } catch (error) {
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

const developerId = req.user.id;

const leads = await Lead.find()
.populate({
path:"project",
match:{ developer: developerId }
})
.populate("agent","first_name last_name email");

const filteredLeads = leads.filter(l => l.project !== null);

res.json({
success:true,
data:filteredLeads
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
// export const getDeveloperDashboard = async (req, res) => {
//   try {

//     const { developerId } = req.query;

//     if (!developerId) {
//       return res.status(400).json({
//         success: false,
//         message: "developerId is required"
//       });
//     }

//     const totalProjects = await Property.countDocuments({
//       developer: developerId
//     });

//     const availableUnits = await Inventory.countDocuments({
//       developerId,
//       status: "Available"
//     });

//     const soldUnits = await Inventory.countDocuments({
//       developerId,
//       status: "Sold"
//     });

//     const bookedUnits = await Inventory.countDocuments({
//       developerId,
//       status: "Booked"
//     });

//     const inventoryStatus = [
//       { name: "Available", value: availableUnits },
//       { name: "Booked", value: bookedUnits },
//       { name: "Sold", value: soldUnits }
//     ];

//     const stats = [
//       {
//         label: "Total Projects",
//         value: totalProjects,
//         change: 5
//       },
//       {
//         label: "Available Units",
//         value: availableUnits,
//         change: 3
//       },
//       {
//         label: "Units Sold",
//         value: soldUnits,
//         change: 8
//       },
//       {
//         label: "Commission Pending",
//         value: 0,
//         change: -2
//       }
//     ];

//     const leadsTrend = [
//       { name: "Mon", leads: 4 },
//       { name: "Tue", leads: 7 },
//       { name: "Wed", leads: 6 },
//       { name: "Thu", leads: 10 },
//       { name: "Fri", leads: 8 }
//     ];

//     const unitsSoldMonthly = [
//       { month: "Jan", units: 2 },
//       { month: "Feb", units: 4 },
//       { month: "Mar", units: 3 },
//       { month: "Apr", units: 5 }
//     ];

//     const dealFunnel = [
//       { stage: "Leads", count: 20 },
//       { stage: "Site Visits", count: 12 },
//       { stage: "Bookings", count: 6 },
//       { stage: "Deals Closed", count: 3 }
//     ];

//     const recentDeals = [];

//     const upcomingVisits = [];

//     const topProjects = [];

//     return res.status(200).json({
//       success: true,
//       stats,
//       leadsTrend,
//       unitsSoldMonthly,
//       inventoryStatus,
//       dealFunnel,
//       recentDeals,
//       upcomingVisits,
//       topProjects
//     });

//   } catch (error) {

//     return res.status(500).json({
//       success: false,
//       message: error.message
//     });

//   }
// };