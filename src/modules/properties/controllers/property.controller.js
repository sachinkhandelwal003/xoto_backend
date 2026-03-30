// controllers/propertyController.js

const Property = require("../models/property.model");
const Inventory = require("../models/property.inventory.model");
const Developer = require("../models/DeveloperModel");
const Agent = require("../../Agent/models/agent");

// =========================
// OFF-PLAN PROPERTY (Developer)
// =========================

/**
 * @route   POST /api/developer/property/create-offplan
 * @desc    Developer creates off-plan property
 */
exports.createOffPlanProperty = async (req, res) => {
    try {
        const developerId = req.user._id;

        // Check if developer is active
        const developer = await Developer.findById(developerId);
        if (!developer) {
            return res.status(404).json({
                success: false,
                message: "Developer not found"
            });
        }

        if (developer.accountStatus !== 'active') {
            return res.status(403).json({
                success: false,
                message: "Your account is not active. Please complete onboarding."
            });
        }

        const {
            propertyName,
            description,
            propertyType,
            transactionType,
            location,
            completionDate,
            projectStatus,
            buildings,
            unitTypes,
            price_min,
            price_max,
            currency,
            commission,
            amenities,
            facilities,
            paymentPlan,
            eoiAmount,
            resaleConditions,
            mainLogo,
            photos,
            videoUrl,
            brochure
        } = req.body;

        // Validation
        if (!propertyName || !location || !description) {
            return res.status(400).json({
                success: false,
                message: "Property name, location and description are required"
            });
        }

        // Create property
      const property = await Property.create({
  developer: developerId,
  propertySubType: "off_plan",
  transactionType: transactionType || "sell",
  propertyType: propertyType || "residential",

  propertyName,
  description,
  developerName: developer.name,

  // ✅ FIXED LOCATION
  area: location?.area || "",
  city: location?.city || "Dubai",
  country: location?.country || "UAE",
  coordinates: location?.coordinates || {},
  proximity: location?.proximity || {},

  // ✅ FIXED REQUIRED FIELDS
  unitType: unitTypes?.[0]?.type || "apartment",

  // ✅ DATE FIX
  completionDate: {
    quarter: completionDate?.quarter,
    year: completionDate?.year,
    fullDate: completionDate?.fullDate
      ? new Date(completionDate.fullDate)
      : null
  },

  projectStatus: projectStatus || "presale",

  buildings: buildings || [],
  unitTypes: unitTypes || [],

  price_min: price_min || 0,
  price_max: price_max || 0,
  currency: currency || "AED",

  commission: commission || 0,
  amenities: amenities || [],
  facilities: facilities || {},

  paymentPlan: paymentPlan || [],
  eoiAmount: eoiAmount || 0,
  resaleConditions: resaleConditions || "Not specified",

  mainLogo: mainLogo || "",

  // ✅ SAFE PHOTOS
  photos: {
    architecture: photos?.architecture || [],
    interior: photos?.interior || [],
    lobby: photos?.lobby || [],
    other: photos?.other || []
  },

  videoUrl: videoUrl || "",
  brochure: brochure || "",

  approvalStatus: "pending",
  listingStatus: "pending"
});

        return res.status(201).json({
            success: true,
            message: "Off-plan property created successfully. Waiting for admin approval.",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/property/offplan
 * @desc    Developer gets all their off-plan properties
 */
/**
 * @route   GET /api/developer/properties
 * @desc    Developer gets all their off-plan properties with filters
 */
exports.getDeveloperProperties = async (req, res) => {
    try {
        const developerId = req.user._id;
        
        // ========== PAGINATION ==========
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // ========== FILTERS ==========
        const {
            // Status Filters
            approvalStatus,      // pending, approved, rejected
            listingStatus,       // pending, active, rejected, inactive
            projectStatus,       // presale, under_construction, ready, sold_out
            
            // Property Details
            propertyName,        // Search by property name
            unitType,            // apartment, villa, townhouse, duplex, penthouse
            bedroomType,         // studio, 1bed, 2bed, 3bed, 4bed, 5bed, 6bed, 7bed, 8plus
            bedrooms,            // Number of bedrooms
            bathrooms,           // Number of bathrooms
            
            // Price Filters
            minPrice,            // Minimum price
            maxPrice,            // Maximum price
            
            // Area Filters
            minArea,             // Minimum built-up area
            maxArea,             // Maximum built-up area
            
            // Location
            area,                // Area name (e.g., Downtown Dubai)
            city,               // City name
            
            // Features
            hasView,             // true, false
            furnishing,          // furnished, semi_furnished, unfurnished
            parkingSpaces,       // Number of parking spaces
            
            // Completion
            completionYear,      // Year of completion
            completionQuarter,   // Q1, Q2, Q3, Q4
            
            // Commission
            minCommission,       // Minimum commission percentage
            maxCommission,       // Maximum commission percentage
            
            // Search
            search,              // Search in propertyName, description, area
            
            // Sort
            sortBy,              // price, createdAt, updatedAt, commission
            sortOrder           // asc, desc
        } = req.query;
        
        // ========== BUILD QUERY ==========
        let query = { 
            developer: developerId, 
            propertySubType: "off_plan" 
        };
        
        // Status Filters
        if (approvalStatus) {
            query.approvalStatus = approvalStatus;
        }
        
        if (listingStatus) {
            query.listingStatus = listingStatus;
        }
        
        if (projectStatus) {
            query.projectStatus = projectStatus;
        }
        
        // Property Details Filters
        if (propertyName) {
            query.propertyName = { $regex: propertyName, $options: "i" };
        }
        
        if (unitType) {
            query.unitType = unitType;
        }
        
        if (bedroomType) {
            query.bedroomType = bedroomType;
        }
        
        if (bedrooms) {
            query.bedrooms = Number(bedrooms);
        }
        
        if (bathrooms) {
            query.bathrooms = Number(bathrooms);
        }
        
        // Price Filters (using price_min and price_max range)
        if (minPrice || maxPrice) {
            query.$or = [
                { price_min: {} },
                { price_max: {} }
            ];
            
            if (minPrice) {
                query.$or[0].price_min.$gte = Number(minPrice);
                query.$or[1].price_max.$gte = Number(minPrice);
            }
            if (maxPrice) {
                query.$or[0].price_min.$lte = Number(maxPrice);
                query.$or[1].price_max.$lte = Number(maxPrice);
            }
        }
        
        // Area Filters
        if (minArea || maxArea) {
            query.builtUpArea_min = {};
            if (minArea) query.builtUpArea_min.$gte = Number(minArea);
            if (maxArea) query.builtUpArea_min.$lte = Number(maxArea);
        }
        
        // Location Filters
        if (area) {
            query.area = { $regex: area, $options: "i" };
        }
        
        if (city) {
            query.city = { $regex: city, $options: "i" };
        }
        
        // Features Filters
        if (hasView !== undefined) {
            query.hasView = hasView === 'true';
        }
        
        if (furnishing) {
            query.furnishing = furnishing;
        }
        
        if (parkingSpaces) {
            query.parkingSpaces = Number(parkingSpaces);
        }
        
        // Completion Filters
        if (completionYear) {
            query["completionDate.year"] = Number(completionYear);
        }
        
        if (completionQuarter) {
            query["completionDate.quarter"] = completionQuarter;
        }
        
        // Commission Filters
        if (minCommission || maxCommission) {
            query.commission = {};
            if (minCommission) query.commission.$gte = Number(minCommission);
            if (maxCommission) query.commission.$lte = Number(maxCommission);
        }
        
        // Search (text search in multiple fields)
        if (search) {
            query.$and = [
                { ...query },
                {
                    $or: [
                        { propertyName: { $regex: search, $options: "i" } },
                        { description: { $regex: search, $options: "i" } },
                        { area: { $regex: search, $options: "i" } },
                        { developerName: { $regex: search, $options: "i" } }
                    ]
                }
            ];
            delete query.$and[0].$and;
        }
        
        // ========== GET TOTAL COUNT ==========
        const total = await Property.countDocuments(query);
        
        // ========== BUILD SORT ==========
        let sort = { createdAt: -1 };
        
        if (sortBy) {
            const order = sortOrder === 'asc' ? 1 : -1;
            if (sortBy === 'price') {
                sort = { price_min: order };
            } else if (sortBy === 'commission') {
                sort = { commission: order };
            } else if (sortBy === 'createdAt') {
                sort = { createdAt: order };
            } else if (sortBy === 'updatedAt') {
                sort = { updatedAt: order };
            } else if (sortBy === 'propertyName') {
                sort = { propertyName: order };
            }
        }
        
        // ========== GET PROPERTIES ==========
        const properties = await Property.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit);
        
        // ========== GET STATISTICS FOR DEVELOPER ==========
        const stats = {
            total: await Property.countDocuments({ developer: developerId, propertySubType: "off_plan" }),
            
            // Approval Status Stats
            pending: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                approvalStatus: "pending" 
            }),
            approved: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                approvalStatus: "approved" 
            }),
            rejected: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                approvalStatus: "rejected" 
            }),
            
            // Listing Status Stats
            active: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                listingStatus: "active" 
            }),
            inactive: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                listingStatus: "inactive" 
            }),
            
            // Project Status Stats
            presale: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                projectStatus: "presale" 
            }),
            underConstruction: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                projectStatus: "under_construction" 
            }),
            ready: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                projectStatus: "ready" 
            }),
            soldOut: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                projectStatus: "sold_out" 
            }),
            
            // Featured
            featured: await Property.countDocuments({ 
                developer: developerId, 
                propertySubType: "off_plan",
                isFeatured: true 
            }),
            
            // Total Units Stats
            totalUnits: await Property.aggregate([
                { $match: { developer: developerId, propertySubType: "off_plan" } },
                { $group: { _id: null, total: { $sum: "$totalUnits" } } }
            ]),
            
            // Sold Units Stats
            soldUnits: await Property.aggregate([
                { $match: { developer: developerId, propertySubType: "off_plan" } },
                { $group: { _id: null, total: { $sum: "$soldUnits" } } }
            ])
        };
        
        return res.status(200).json({
            success: true,
            data: properties,
            count: properties.length,
            pagination: {
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                totalItems: total,
                limit: limit,
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            stats: stats,
            filters: {
                approvalStatus: approvalStatus || "all",
                listingStatus: listingStatus || "all",
                projectStatus: projectStatus || "all",
                search: search || "",
                sortBy: sortBy || "createdAt",
                sortOrder: sortOrder || "desc"
            }
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/property/:id
 * @desc    Developer gets single property by ID
 */
exports.getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;

   

    const property = await Property.findById(id)
      .populate({
        path: "developer",
        select: "name email logo phone_number websiteUrl accountStatus"
      })
      .populate({
        path: "agent",
        select: "name email phone_number profileImage isVerified"
      })
      .populate({
        path: "agency",
        select: "agency_name email mobile_number logo"  // ✅ Correct field names
      })
      .populate({
        path: "existingProjectId",
        select: "propertyName developerName location"
      });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: property
    });

  } catch (error) {
    // ✅ Handle CastError specifically
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: "Invalid property ID format"
      });
    }
    
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @route   PUT /api/developer/property/:id
 * @desc    Developer updates property
 */
exports.updateProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const developerId = req.user._id;

        const property = await Property.findOne({ _id: id, developer: developerId });
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        const updatedProperty = await Property.findByIdAndUpdate(
            id,
            { ...req.body },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Property updated successfully",
            data: updatedProperty
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   DELETE /api/developer/property/:id
 * @desc    Developer deletes property
 */
exports.deleteProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const developerId = req.user._id;

        const property = await Property.findOne({ _id: id, developer: developerId });
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        // Delete all inventory for this property
        await Inventory.deleteMany({ propertyId: id });

        // Delete property
        await Property.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Property and all associated inventory deleted successfully"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// =========================
// SECONDARY PROPERTY (Agent)
// =========================

/**
 * @route   POST /api/agent/property/create-secondary
 * @desc    Agent creates secondary property listing
 */
exports.createSecondaryProperty = async (req, res) => {
    try {
        const agentId = req.user._id;

        const agent = await Agent.findById(agentId);
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        if (!agent.isVerified) {
            return res.status(403).json({
                success: false,
                message: "Please get verified first to list properties"
            });
        }

        const {
            projectOption,
            existingProjectId,
            propertyName,
            developerName,
            unitNumber,
            floorNumber,
            unitType,
            bedroomType,
            bedrooms,
            bathrooms,
            builtUpArea,
            builtUpAreaUnit,
            price,
            currency,
            area,
            city,
            coordinates,
            description,
            mainLogo,
            photos,
            hasView,
            viewType,
            parkingSpaces,
            furnishing,
            ownershipType,
            availableFrom,
            shareCommission,
            shareCommissionPercentage
        } = req.body;

        // ✅ FIXED VALIDATION - For existing project, area will be auto-filled
        if (!price || !description) {
            return res.status(400).json({
                success: false,
                message: "Price and description are required"
            });
        }

        // ✅ For new project, area is required
        if (projectOption !== "existing" && !area) {
            return res.status(400).json({
                success: false,
                message: "Location is required for new project"
            });
        }

        let finalPropertyName = propertyName;
        let finalDeveloperName = developerName;
        let finalLocation = { area, city: city || "Dubai", country: "UAE", coordinates: coordinates || {} };

        // Handle existing project selection
        if (projectOption === "existing" && existingProjectId) {
            const existingProject = await Property.findById(existingProjectId);
            if (existingProject) {
                finalPropertyName = existingProject.propertyName;
                finalDeveloperName = existingProject.developerName;
                finalLocation = {
                    area: existingProject.area,
                    city: existingProject.city || "Dubai",
                    country: existingProject.country || "UAE",
                    coordinates: existingProject.coordinates || {}
                };
            }
        }

        // Create secondary property
        const property = await Property.create({
            developer: null,
            agent: agentId,
            agency: agent.agency || null,
            propertySubType: "secondary",
            transactionType: "sell",
            projectOption: projectOption || "new",
            existingProjectId: existingProjectId || null,
            propertyName: finalPropertyName,
            developerName: finalDeveloperName,
            unitNumber: unitNumber || "",
            floorNumber: floorNumber || 0,
            unitType: unitType || "apartment",
            bedroomType: bedroomType || "1bed",
            bedrooms: bedrooms || 0,
            bathrooms: bathrooms || 0,
            builtUpArea: builtUpArea || 0,
            builtUpArea_min: builtUpArea || 0,
            builtUpArea_max: builtUpArea || 0,
            builtUpAreaUnit: builtUpAreaUnit || "sqft",
            price: price,
            price_min: price,
            price_max: price,
            currency: currency || "AED",
            area: finalLocation.area,
            city: finalLocation.city,
            country: finalLocation.country,
            coordinates: finalLocation.coordinates,
            description: description,
            mainLogo: mainLogo || "",
            photos: photos || { architecture: [], interior: [], lobby: [], other: [] },
            hasView: hasView || false,
            viewType: viewType || [],
            parkingSpaces: parkingSpaces || 0,
            furnishing: furnishing || "unfurnished",
            ownershipType: ownershipType || "freehold",
            availableFrom: availableFrom || null,
            shareCommission: shareCommission || false,
            shareCommissionPercentage: shareCommissionPercentage || 0,
            totalUnits: 1,
            approvalStatus: "pending",
            listingStatus: "pending",
            showContactOnlyVerified: true
        });

        return res.status(201).json({
            success: true,
            message: "Secondary property listing created successfully. Waiting for admin approval.",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/agent/property/secondary
 * @desc    Agent gets all their secondary properties
 */
/**
 * @route   GET /api/agent/properties
 * @desc    Agent gets all properties (own secondary + approved off-plan)
 */
exports.getAgentProperties = async (req, res) => {
    try {
        const agentId = req.user._id;
        
        // ========== PAGINATION ==========
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // ========== FILTERS ==========
        const {
            // Property Type Filter
            propertyType,        // 'secondary', 'off_plan', 'all'
            
            // Status Filters
            approvalStatus,      // pending, approved, rejected (for secondary only)
            listingStatus,       // pending, active, rejected, inactive
            
            // Property Details
            propertyName,        // Search by property name
            unitType,            // apartment, villa, townhouse, duplex, penthouse
            bedroomType,         // studio, 1bed, 2bed, 3bed, 4bed, 5bed, 6bed, 7bed, 8plus
            bedrooms,            // Number of bedrooms
            
            // Price Filters
            minPrice,            // Minimum price
            maxPrice,            // Maximum price
            
            // Area Filters
            minArea,             // Minimum built-up area
            maxArea,             // Maximum built-up area
            
            // Location
            area,                // Area name (e.g., Downtown Dubai)
            city,               // City name
            
            // Features
            hasView,             // true, false
            furnishing,          // furnished, semi_furnished, unfurnished
            parkingSpaces,       // Number of parking spaces
            
            // Commission
            shareCommission,     // true, false (for secondary only)
            
            // Search
            search,              // Search in propertyName, description, area
            
            // Sort
            sortBy,              // price, createdAt, updatedAt
            sortOrder           // asc, desc
        } = req.query;
        
        // ========== BUILD QUERIES ==========
        
        // Query 1: Agent's own secondary properties
        let secondaryQuery = { 
            agent: agentId, 
            propertySubType: "secondary" 
        };
        
        // Query 2: Approved off-plan properties (from developers)
        let offplanQuery = { 
            propertySubType: "off_plan",
            approvalStatus: "approved",
            listingStatus: "active"
        };
        
        // ========== APPLY FILTERS TO BOTH QUERIES ==========
        
        // Status Filters (only for secondary)
        if (approvalStatus && propertyType !== 'off_plan') {
            secondaryQuery.approvalStatus = approvalStatus;
        }
        
        if (listingStatus && propertyType !== 'off_plan') {
            secondaryQuery.listingStatus = listingStatus;
        }
        
        // Common Filters for both
        const commonFilters = {};
        
        if (propertyName) {
            commonFilters.propertyName = { $regex: propertyName, $options: "i" };
        }
        
        if (unitType) {
            commonFilters.unitType = unitType;
        }
        
        if (bedroomType) {
            commonFilters.bedroomType = bedroomType;
        }
        
        if (bedrooms) {
            commonFilters.bedrooms = Number(bedrooms);
        }
        
        // Price Filters
        if (minPrice || maxPrice) {
            commonFilters.price = {};
            if (minPrice) commonFilters.price.$gte = Number(minPrice);
            if (maxPrice) commonFilters.price.$lte = Number(maxPrice);
        }
        
        // Area Filters (for secondary, builtUpArea; for off-plan, use builtUpArea_min/max)
        if (minArea || maxArea) {
            // For secondary: use builtUpArea
            secondaryQuery.builtUpArea = {};
            if (minArea) secondaryQuery.builtUpArea.$gte = Number(minArea);
            if (maxArea) secondaryQuery.builtUpArea.$lte = Number(maxArea);
            
            // For off-plan: use builtUpArea_min
            offplanQuery.builtUpArea_min = {};
            if (minArea) offplanQuery.builtUpArea_min.$gte = Number(minArea);
            if (maxArea) offplanQuery.builtUpArea_min.$lte = Number(maxArea);
        }
        
        // Location Filters
        if (area) {
            commonFilters.area = { $regex: area, $options: "i" };
        }
        
        if (city) {
            commonFilters.city = { $regex: city, $options: "i" };
        }
        
        // Features Filters
        if (hasView !== undefined) {
            commonFilters.hasView = hasView === 'true';
        }
        
        if (furnishing) {
            commonFilters.furnishing = furnishing;
        }
        
        if (parkingSpaces) {
            commonFilters.parkingSpaces = Number(parkingSpaces);
        }
        
        // Commission Filter (only for secondary)
        if (shareCommission !== undefined && propertyType !== 'off_plan') {
            secondaryQuery.shareCommission = shareCommission === 'true';
        }
        
        // Search Filter
        if (search) {
            const searchRegex = { $regex: search, $options: "i" };
            commonFilters.$or = [
                { propertyName: searchRegex },
                { description: searchRegex },
                { area: searchRegex },
                { developerName: searchRegex }
            ];
        }
        
        // Apply common filters to both queries
        Object.assign(secondaryQuery, commonFilters);
        Object.assign(offplanQuery, commonFilters);
        
        // ========== DETERMINE WHICH PROPERTIES TO FETCH ==========
        let properties = [];
        let total = 0;
        
        const type = propertyType || 'all';
        
        if (type === 'secondary' || type === 'all') {
            const secondaryTotal = await Property.countDocuments(secondaryQuery);
            const secondaryProperties = await Property.find(secondaryQuery)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
            
            properties.push(...secondaryProperties);
            total += secondaryTotal;
        }
        
        if (type === 'off_plan' || type === 'all') {
            const offplanTotal = await Property.countDocuments(offplanQuery);
            const offplanProperties = await Property.find(offplanQuery)
                .populate('developer', 'name logo email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
            
            properties.push(...offplanProperties);
            total += offplanTotal;
        }
        
        // Sort combined results
        if (sortBy) {
            const order = sortOrder === 'asc' ? 1 : -1;
            properties.sort((a, b) => {
                if (sortBy === 'price') {
                    const priceA = a.price || a.price_min || 0;
                    const priceB = b.price || b.price_min || 0;
                    return (priceA - priceB) * order;
                }
                return (new Date(a.createdAt) - new Date(b.createdAt)) * order;
            });
        }
        
        // Apply pagination to combined results
        const paginatedProperties = properties.slice(skip, skip + limit);
        
        // ========== GET STATISTICS ==========
        const stats = {
            // Secondary stats
            secondaryTotal: await Property.countDocuments({ agent: agentId, propertySubType: "secondary" }),
            secondaryPending: await Property.countDocuments({ 
                agent: agentId, 
                propertySubType: "secondary",
                approvalStatus: "pending" 
            }),
            secondaryApproved: await Property.countDocuments({ 
                agent: agentId, 
                propertySubType: "secondary",
                approvalStatus: "approved" 
            }),
            secondaryRejected: await Property.countDocuments({ 
                agent: agentId, 
                propertySubType: "secondary",
                approvalStatus: "rejected" 
            }),
            secondaryActive: await Property.countDocuments({ 
                agent: agentId, 
                propertySubType: "secondary",
                listingStatus: "active" 
            }),
            
            // Off-plan stats
            offplanTotal: await Property.countDocuments({ 
                propertySubType: "off_plan",
                approvalStatus: "approved",
                listingStatus: "active"
            }),
            
            // Featured
            featuredSecondary: await Property.countDocuments({ 
                agent: agentId, 
                propertySubType: "secondary",
                isFeatured: true 
            }),
            featuredOffplan: await Property.countDocuments({ 
                propertySubType: "off_plan",
                approvalStatus: "approved",
                listingStatus: "active",
                isFeatured: true 
            })
        };
        
        return res.status(200).json({
            success: true,
            data: paginatedProperties,
            count: paginatedProperties.length,
            totalItems: total,
            pagination: {
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                totalItems: total,
                limit: limit,
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            stats: stats,
            filters: {
                propertyType: type,
                approvalStatus: approvalStatus || "all",
                listingStatus: listingStatus || "all",
                search: search || ""
            }
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getAgentPropertyById = async (req, res) => {
    try {
        const agentId = req.user._id;
        const { id } = req.params;

        const property = await Property.findOne({ 
            _id: id, 
            agent: agentId, 
            propertySubType: "secondary" 
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        return res.status(200).json({
            success: true,
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



exports.updateAgentProperty = async (req, res) => {
    try {
        const agentId = req.user._id;
        const { id } = req.params;

        const property = await Property.findOne({ 
            _id: id, 
            agent: agentId, 
            propertySubType: "secondary" 
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        // Only allow updating if property is not approved yet
        if (property.approvalStatus === 'approved') {
            return res.status(403).json({
                success: false,
                message: "Approved properties cannot be modified. Please contact admin."
            });
        }

        const updatedProperty = await Property.findByIdAndUpdate(
            id,
            { ...req.body },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Property updated successfully",
            data: updatedProperty
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   DELETE /api/agent/property/:id
 * @desc    Agent deletes their secondary property
 */
exports.deleteAgentProperty = async (req, res) => {
    try {
        const agentId = req.user._id;
        const { id } = req.params;

        const property = await Property.findOne({ 
            _id: id, 
            agent: agentId, 
            propertySubType: "secondary" 
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        // Only allow deletion if property is not approved yet
        if (property.approvalStatus === 'approved') {
            return res.status(403).json({
                success: false,
                message: "Approved properties cannot be deleted. Please contact admin."
            });
        }

        await Property.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Property deleted successfully"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =========================
// ADMIN PROPERTY APPROVAL
// =========================

/**
 * @route   GET /api/admin/property/all
 * @desc    Admin gets all properties (pending approval)
 */


/**
 * @route   PUT /api/admin/property/approve/:id
 * @desc    Admin approves property
 */
exports.approveProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;

        const property = await Property.findById(id);
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found"
            });
        }

        property.approvalStatus = "approved";
        property.listingStatus = "active";
        property.approvedBy = req.user._id;
        property.approvedAt = new Date();
        property.rejectionReason = "";

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

/**
 * @route   PUT /api/admin/property/reject/:id
 * @desc    Admin rejects property
 */
exports.rejectProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        const property = await Property.findById(id);
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found"
            });
        }

        property.approvalStatus = "rejected";
        property.listingStatus = "rejected";
        property.rejectionReason = rejectionReason || "Property rejected by admin";

        await property.save();

        return res.status(200).json({
            success: true,
            message: "Property rejected",
            data: property
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};



// controllers/propertyController.js (Add this function)

/**
 * @route   GET /api/admin/property/all
 * @desc    Admin gets all properties with filters (Off-Plan & Secondary)
 */
exports.getAllProperties = async (req, res) => {
    try {
        // ========== PAGINATION ==========
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // ========== FILTERS ==========
        const {
            // Property Type Filters
            propertySubType,     // 'off_plan', 'secondary'
            approvalStatus,      // 'pending', 'approved', 'rejected'
            listingStatus,       // 'pending', 'active', 'rejected', 'inactive'
            
            // Developer/Agent Filters
            developerId,         // Specific developer ID
            agentId,             // Specific agent ID
            agencyId,            // Specific agency ID
            
            // Location Filters
            area,                // Area name (e.g., Downtown Dubai)
            city,                // City name
            country,             // Country name
            
            // Property Details Filters
            propertyName,        // Search by property name
            unitType,            // 'apartment', 'villa', 'townhouse', 'duplex', 'penthouse'
            bedroomType,         // 'studio', '1bed', '2bed', '3bed', '4bed', '5bed', '6bed', '7bed', '8plus'
            bedrooms,            // Number of bedrooms
            bathrooms,           // Number of bathrooms
            
            // Price Filters
            minPrice,            // Minimum price
            maxPrice,            // Maximum price
            
            // Area Filters
            minArea,             // Minimum built-up area
            maxArea,             // Maximum built-up area
            
            // Status Filters
            isAvailable,         // true/false
            isFeatured,          // true/false
            isVerified,          // true/false (for secondary)
            
            // Date Filters
            fromDate,            // Created from date
            toDate,              // Created to date
            
            // Search
            search               // Search in propertyName, description, area
        } = req.query;

        // ========== BUILD QUERY ==========
        let query = {};

        // Property Type Filters
        if (propertySubType) {
            query.propertySubType = propertySubType;
        }
        
        if (approvalStatus) {
            query.approvalStatus = approvalStatus;
        }
        
        if (listingStatus) {
            query.listingStatus = listingStatus;
        }

        // Developer/Agent Filters
        if (developerId) {
            query.developer = developerId;
        }
        
        if (agentId) {
            query.agent = agentId;
        }
        
        if (agencyId) {
            query.agency = agencyId;
        }

        // Location Filters
        if (area) {
            query.area = { $regex: area, $options: "i" };
        }
        
        if (city) {
            query.city = { $regex: city, $options: "i" };
        }
        
        if (country) {
            query.country = { $regex: country, $options: "i" };
        }

        // Property Details Filters
        if (propertyName) {
            query.propertyName = { $regex: propertyName, $options: "i" };
        }
        
        if (unitType) {
            query.unitType = unitType;
        }
        
        if (bedroomType) {
            query.bedroomType = bedroomType;
        }
        
        if (bedrooms) {
            query.bedrooms = Number(bedrooms);
        }
        
        if (bathrooms) {
            query.bathrooms = Number(bathrooms);
        }

        // Price Filters
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        // Area Filters
        if (minArea || maxArea) {
            query.builtUpArea = {};
            if (minArea) query.builtUpArea.$gte = Number(minArea);
            if (maxArea) query.builtUpArea.$lte = Number(maxArea);
        }

        // Status Filters
        if (isAvailable !== undefined) {
            query.isAvailable = isAvailable === 'true';
        }
        
        if (isFeatured !== undefined) {
            query.isFeatured = isFeatured === 'true';
        }
        
        if (isVerified !== undefined) {
            query.isVerified = isVerified === 'true';
        }

        // Date Filters
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) query.createdAt.$gte = new Date(fromDate);
            if (toDate) query.createdAt.$lte = new Date(toDate);
        }

        // Search (text search in multiple fields)
        if (search) {
            query.$or = [
                { propertyName: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { area: { $regex: search, $options: "i" } },
                { developerName: { $regex: search, $options: "i" } }
            ];
        }

        // ========== GET TOTAL COUNT ==========
        const total = await Property.countDocuments(query);

        // ========== GET PROPERTIES WITH POPULATE ==========
        const properties = await Property.find(query)
            .populate({
                path: "developer",
                select: "name email logo phone_number websiteUrl accountStatus"
            })
            .populate({
                path: "agent",
                select: "name email phone_number profileImage isVerified"
            })
            .populate({
                path: "agency",
                select: "name email phone_number logo"
            })
            .populate({
                path: "approvedBy",
                select: "name email"
            })
            .populate({
                path: "existingProjectId",
                select: "propertyName developerName location"
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // ========== GET STATISTICS ==========
        const stats = {
            // Total counts
            totalOffPlan: await Property.countDocuments({ propertySubType: "off_plan" }),
            totalSecondary: await Property.countDocuments({ propertySubType: "secondary" }),
            
            // Approval status counts
            pendingApproval: await Property.countDocuments({ approvalStatus: "pending" }),
            approved: await Property.countDocuments({ approvalStatus: "approved" }),
            rejected: await Property.countDocuments({ approvalStatus: "rejected" }),
            
            // Listing status counts
            activeListings: await Property.countDocuments({ listingStatus: "active" }),
            inactiveListings: await Property.countDocuments({ listingStatus: "inactive" }),
            
            // By creator
            byDeveloper: await Property.countDocuments({ developer: { $ne: null } }),
            byAgent: await Property.countDocuments({ agent: { $ne: null } }),
            
            // By location (top areas)
            topAreas: await Property.aggregate([
                { $group: { _id: "$area", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ])
        };

        // ========== ADD PRICE INFO FOR OFF-PLAN PROPERTIES ==========
        const propertiesWithInfo = properties.map(property => {
            const propObj = property.toObject();
            
            // Add price display info
            if (propObj.price_min && propObj.price_max) {
                propObj.priceDisplay = `${propObj.currency} ${propObj.price_min.toLocaleString()} - ${propObj.price_max.toLocaleString()}`;
            } else if (propObj.price) {
                propObj.priceDisplay = `${propObj.currency} ${propObj.price.toLocaleString()}`;
            }
            
            // Add creator type
            if (propObj.developer) {
                propObj.createdBy = {
                    type: "developer",
                    name: propObj.developer.name,
                    id: propObj.developer._id
                };
            } else if (propObj.agent) {
                propObj.createdBy = {
                    type: "agent",
                    name: propObj.agent.name,
                    id: propObj.agent._id,
                    isVerified: propObj.agent.isVerified
                };
            }
            
            // Add status badge
            let statusBadge = {};
            if (propObj.approvalStatus === "pending") {
                statusBadge = { color: "yellow", text: "Pending Approval" };
            } else if (propObj.approvalStatus === "approved" && propObj.listingStatus === "active") {
                statusBadge = { color: "green", text: "Active" };
            } else if (propObj.approvalStatus === "approved" && propObj.listingStatus === "inactive") {
                statusBadge = { color: "gray", text: "Inactive" };
            } else if (propObj.approvalStatus === "rejected") {
                statusBadge = { color: "red", text: "Rejected" };
            }
            propObj.statusBadge = statusBadge;
            
            return propObj;
        });

        // ========== RESPONSE ==========
        return res.status(200).json({
            success: true,
            message: "Properties fetched successfully",
            data: propertiesWithInfo,
            count: propertiesWithInfo.length,
            pagination: {
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                totalItems: total,
                limit: limit,
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            filters: {
                propertySubType: propertySubType || "all",
                approvalStatus: approvalStatus || "all",
                listingStatus: listingStatus || "all",
                search: search || ""
            },
            stats: stats
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};