const Property  = require("../models/property.model");
const Inventory = require("../models/property.inventory.model");
const Developer = require("../../Grid/Developer/models/developer.model");
const Customer = require("../../auth/models/user/customer.model");
const GridLead = require("../../Grid/Lead/model/gridLead.model");
const { inventoryCategories, determineInventoryCategory } = require("../config/inventory.categories.config");
const GridNotification = require('../../Grid/Notification/gridnotificationmodal').default;
// ─── Role helpers ─────────────────────────────────────────────────────────────
const isAdmin = (role) => {
  if (!role) return false;
  if (typeof role === "object") {
    return role?.isSuperAdmin === true ||
           Number(role?.code) === 0    ||
           Number(role?.code) === 1;
  }
 return role === "xoto_super_admin" || role === "xoto_staff_admin"; 
};

const isSuperAdmin = (role) => {
  if (!role) return false;
  if (typeof role === "object") {
    return role?.isSuperAdmin === true ||
           Number(role?.code) === 0    ||
           Number(role?.code) === 1;
  }
  return role === "xoto_super_admin" || role === "xoto_staff_admin";
};

const isStaffAdmin = (role) => {
  if (!role) return false;
  if (typeof role === "object") return Number(role?.code) === 1;
  return role === "xoto_staff_admin";
};

const isDevRole = (role) => {
  if (!role) return false;
  if (typeof role === "object") return Number(role?.code) === 17;
  return role === "developer";
};

const isCatalogue = (role) => {
  if (!role) return false;
  if (typeof role === "object") {
    return Number(role?.code) === 16 ||
           Number(role?.code) === 18;
  }
  const normalized = String(role).toLowerCase();
  return ["gridadvisor", "grid_advisor", "grid advisor", "agent"].includes(normalized);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const paginate = (q) => {
  const page  = Math.max(1, Number(q.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (total, page, limit) => ({
  totalItems:  total,
  totalPages:  Math.ceil(total / limit),
  currentPage: page,
  limit,
  hasNextPage: page < Math.ceil(total / limit),
  hasPrevPage: page > 1,
});

// ════════════════════════════════════════════════════════════════════════════
// CREATE PROPERTY
// POST /properties
// ════════════════════════════════════════════════════════════════════════════
exports.createProperty = async (req, res) => {
  try {
    console.log("=== 💾 CREATE PROPERTY - RECEIVED PAYLOAD ===");
    console.log("req.body FULL:", JSON.stringify(req.body, null, 2));
    console.log("req.user:", req.user);
    
    // Log individual important fields
    console.log("🔍 req.body.projectName:", req.body.projectName);
    console.log("🔍 req.body.propertyName:", req.body.propertyName);
    console.log("🔍 req.body.locality:", req.body.locality);
    console.log("🔍 req.body.overview:", req.body.overview);
    console.log("🔍 req.body.priceRangeFrom:", req.body.priceRangeFrom);
    console.log("🔍 req.body.priceRangeTo:", req.body.priceRangeTo);
    const { role } = req.user;
    const userId = req.user._id;
    const { propertySubType } = req.body;

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({
        status:  "fail",
        message: "Only Admin or Developer can create listings",
      });
    }

    if (isDevRole(role) && propertySubType !== "off_plan") {
      return res.status(403).json({
        status:  "fail",
        message: "Developers can only create off-plan listings",
      });
    }

    if (isAdmin(role) && propertySubType === "off_plan" && !req.body.developerId) {
      return res.status(400).json({
        status:  "fail",
        message: "developerId is required when admin creates an off-plan listing on behalf of a developer",
      });
    }

    const {
      propertyName, description, area,
      price, price_min,
      rentalFrequency, reraPermitNumber,
      developerId,
      // New PRD fields
      projectName, overview, locality,
    } = req.body;

    if (!propertySubType) {
      return res.status(400).json({ status: "fail", message: "propertySubType is required" });
    }

    const validTypes = ["off_plan", "secondary", "rental", "commercial"];
    if (!validTypes.includes(propertySubType)) {
      return res.status(400).json({
        status:  "fail",
        message: `propertySubType must be one of: ${validTypes.join(", ")}`,
      });
    }

    const isDraft = (req.body.status === "draft" || req.body.approvalStatus === "draft");
    const permitAvailable = req.body.permitAvailable === true || req.body.permitAvailable === "true";

    console.log("projectName:", projectName);
    console.log("propertyName:", propertyName);
    console.log("overview:", overview);
    console.log("description:", description);
    console.log("locality:", locality);
    console.log("area:", area);
    console.log("isDraft:", isDraft);
    
    const finalPropertyName = projectName || propertyName;
    const finalDescription = overview || description;
    const finalArea = locality || area;

    console.log("finalPropertyName:", finalPropertyName);
    console.log("finalDescription:", finalDescription);
    console.log("finalArea:", finalArea);

    if (!isDraft && (!finalPropertyName || !finalDescription || !finalArea)) {
      return res.status(400).json({
        status:  "fail",
        message: "Project name, description and location are required",
      });
    }

    if (!isDraft && !price && !price_min) {
      return res.status(400).json({ status: "fail", message: "price is required" });
    }

    // ── Unit type rules per listing type ──────────────────────────────────
    const RESIDENTIAL_UNIT_TYPES = ["apartment", "villa", "townhouse", "duplex", "penthouse", "plot", "hotel_apartment"];
    const COMMERCIAL_UNIT_TYPES  = ["office", "retail", "warehouse"];
    const incomingUnitType  = req.body.unitType;
    const incomingUnitTypes = req.body.unitTypes || [];

    if (!isDraft && propertySubType === "rental") {
      const badTypes = [incomingUnitType, ...incomingUnitTypes].filter(
        t => t && COMMERCIAL_UNIT_TYPES.includes(t)
      );
      if (badTypes.length > 0) {
        return res.status(400).json({
          status: "fail",
          message: `Rental listings only allow residential unit types. Remove: ${[...new Set(badTypes)].join(", ")}`,
        });
      }
    }

    if (!isDraft && propertySubType === "commercial") {
      const allTypes = [incomingUnitType, ...incomingUnitTypes].filter(Boolean);
      const badTypes = allTypes.filter(t => !COMMERCIAL_UNIT_TYPES.includes(t));
      if (badTypes.length > 0) {
        return res.status(400).json({
          status: "fail",
          message: `Commercial listings only allow: ${COMMERCIAL_UNIT_TYPES.join(", ")}. Remove: ${[...new Set(badTypes)].join(", ")}`,
        });
      }
      if (!req.body.transactionType) {
        return res.status(400).json({
          status: "fail",
          message: "transactionType is required for commercial listings (sell = sale, rent = lease)",
        });
      }
    }

    if (propertySubType === "rental" && !permitAvailable) {
      if (!rentalFrequency) {
        return res.status(400).json({ status: "fail", message: "rentalFrequency is required for rental listings" });
      }
      if (!reraPermitNumber) {
        return res.status(400).json({ status: "fail", message: "reraPermitNumber is required for rental listings (PRD §14.4)" });
      }
    }

    // Photo count validation (only for non-draft submissions)
    if (!isDraft) {
      const arch  = req.body.photos?.architecture || req.body.media?.architectureImages || [];
      const inter = req.body.photos?.interior     || req.body.media?.interiorImages     || [];
      const lobby = req.body.photos?.lobby        || req.body.media?.lobbyImages        || [];

      if (arch.length < 3)  return res.status(400).json({ status: "fail", message: "Architecture photos: minimum 3 required" });
      if (arch.length > 20) return res.status(400).json({ status: "fail", message: "Architecture photos: maximum 20 allowed" });
      if (inter.length < 3) return res.status(400).json({ status: "fail", message: "Interior photos: minimum 3 required" });
      if (inter.length > 20)return res.status(400).json({ status: "fail", message: "Interior photos: maximum 20 allowed" });
      if (lobby.length < 1) return res.status(400).json({ status: "fail", message: "Lobby photos: minimum 1 required" });
      if (lobby.length > 10)return res.status(400).json({ status: "fail", message: "Lobby photos: maximum 10 allowed" });
    }

    const devId = isDevRole(role) ? userId : developerId;

    if (propertySubType === "off_plan") {
     console.log("devId:", devId);

const developer = await Developer.findOne({
  $or: [
    { _id: devId },
    { userId: devId },
  ],
});

console.log("developer found:", developer);

if (!developer) {
  return res.status(404).json({
    status: "fail",
    message: "Developer not found",
  });
}
      if (developer.accountStatus !== "active") {
        return res.status(403).json({ status: "fail", message: "Developer account is not active" });
      }
    }

    let approvalStatus = req.body.approvalStatus || "pending";
    let listingStatus  = req.body.listingStatus || "pending";
    let approvedBy     = null;
    let approvedAt     = null;

if (isSuperAdmin(role)) {
  approvalStatus = "approved";
  listingStatus  = "active";
  approvedBy     = userId;
  approvedAt     = new Date();
}

// Preserve draft status if requested
if (req.body.status === "draft" || req.body.approvalStatus === "draft") {
  approvalStatus = "draft";
  listingStatus = "pending";
}

console.log("=== 📋 Status handling ===");
console.log("req.body.status:", req.body.status);
console.log("req.body.approvalStatus:", req.body.approvalStatus);
console.log("Final approvalStatus:", approvalStatus);
console.log("Final listingStatus:", listingStatus);

    const {
      transactionType, projectOption, existingProjectId, developerName,
      unitNumber, floorNumber, unitType, bedroomType, bedrooms, bathrooms,
      builtUpArea, builtUpArea_min, builtUpArea_max, builtUpAreaUnit,
      price_max, currency, parkingSpaces,
      city, country, coordinates, proximity,
      mainLogo, photos, videoUrl, brochure,
      amenities, facilities,
      hasView, viewType, furnishing, ownershipType, availableFrom,
      isFeatured, showContactOnlyVerified,
      totalUnits, completionDate, projectStatus, floors,
      serviceChargeInfo, readinessProgress, paymentPlan,
      eoiAmount, resaleConditions,
      commission, shareCommission, shareCommissionPercentage,
      minimumContract, isImmediate, cheques, isShortTerm,
      dldRegistrationNumber,
 trakheesi_permit_id,   
  qr_code,
      // New PRD fields (already destructured earlier: projectName, overview, locality, price, price_min, description, rentalFrequency, reraPermitNumber)
      priceRange,
      location,
      media,
      youtubeVideos,
      projectPlan,
      buildings,
      floorPlans,
      inventory,
      parkingAllocation,
      furnishingStatus,
      numberOfFloors,
      serviceCharge,
      constructionProgress,
      developmentStatus,
      saleStatus,
      developerDetails,
      status,
      propertyType,
      unitTypes,
      inventoryCategory,
      buildingNames,
      floorConfigurations,
    } = req.body;
console.log("=== STATUS DEBUG ===");
console.log("req.body.status:", req.body.status);
console.log("req.body.approvalStatus:", req.body.approvalStatus);
console.log("isDraft:", isDraft);
    const property = await Property.create({
      developer:      propertySubType === "off_plan" ? devId : (developerId || null),
      createdByAdmin: isAdmin(role) ? userId : null,

      propertySubType,
      transactionType: transactionType || (propertySubType === "rental" ? "rent" : "sell"),
      projectOption:    projectOption    || "new",
      existingProjectId: existingProjectId || null,
      propertyName: projectName || propertyName,
      projectName: projectName || propertyName,
      developerName:    developerName    || "",
      locality: locality || "",
      propertyType: propertyType || "Residential",
      overview: overview || description,

      unitNumber:  unitNumber  || "",
      floorNumber: floorNumber || 0,
      unitType:    unitType    || "apartment",
      bedroomType: bedroomType || "1bed",
      bedrooms:    bedrooms    || 0,
      bathrooms:   bathrooms   || 0,

      builtUpArea:     builtUpArea     || 0,
      builtUpArea_min: builtUpArea_min || builtUpArea || 0,
      builtUpArea_max: builtUpArea_max || builtUpArea || 0,
      builtUpAreaUnit: builtUpAreaUnit || "sqft",

      price:     price     || price_min || priceRange?.from || 0,
      price_min: price_min || price     || priceRange?.from || 0,
      price_max: price_max || price     || priceRange?.to || 0,
      priceRange: priceRange || { from: price_min || 0, to: price_max || 0 },
      currency:  currency  || "AED",

      area: area || locality || "",
      city:    city    || "Dubai",
      country: country || "UAE",
      coordinates: coordinates || { lat: null, lng: null },
      location: location || { address: "", latitude: null, longitude: null },
      proximity:   proximity   || {},

      mainLogo: mainLogo || media?.mainLogo || "",
      photos: {
        architecture: photos?.architecture || media?.architectureImages || [],
        interior:     photos?.interior     || media?.interiorImages || [],
        lobby:        photos?.lobby        || media?.lobbyImages || [],
        other:        photos?.other        || media?.otherImages || [],
      },
      media: {
        mainLogo: media?.mainLogo || mainLogo || "",
        architectureImages: media?.architectureImages || photos?.architecture || [],
        interiorImages: media?.interiorImages || photos?.interior || [],
        lobbyImages: media?.lobbyImages || photos?.lobby || [],
        otherImages: media?.otherImages || photos?.other || [],
        youtubeVideos: media?.youtubeVideos || youtubeVideos || [],
      },
      videoUrl: videoUrl || "",
      brochure: brochure || "",
      projectPlan: projectPlan || "",
      youtubeVideos: youtubeVideos || media?.youtubeVideos || [],

      description: description || overview || "",
      amenities:  amenities  || [],
      facilities: facilities || {},

      buildings: buildings || [],
      floorPlans: floorPlans || [],
      inventory: inventory || [],
      parkingAllocation: parkingAllocation || "",

      hasView:       hasView       || false,
      viewType:      viewType      || [],
      parkingSpaces: parkingSpaces || 0,
      furnishing:    furnishing    || "unfurnished",
      furnishingStatus: furnishingStatus || "Unfurnished",
      ownershipType: ownershipType || "freehold",
      availableFrom: availableFrom || null,

      totalUnits: totalUnits || 0,
      completionDate: {
        quarter:  completionDate?.quarter  || null,
        year:     completionDate?.year     || null,
        fullDate: completionDate?.fullDate ? new Date(completionDate.fullDate) : null,
      },
      projectStatus:     projectStatus     || "presale",
      developmentStatus: developmentStatus || "Planned",
      floors:            floors            || numberOfFloors || 0,
      numberOfFloors:    numberOfFloors    || floors || 0,
      serviceChargeInfo: serviceChargeInfo || serviceCharge || "",
      serviceCharge:     serviceCharge     || serviceChargeInfo || "",
      readinessProgress: readinessProgress || `${constructionProgress || 0}%`,
      constructionProgress: constructionProgress || 0,
      paymentPlan:       paymentPlan       || [],
      eoiAmount:         eoiAmount         || 0,
      resaleConditions:  resaleConditions  || "",
      commission:                commission                || 0,
      shareCommission:           shareCommission           || false,
      shareCommissionPercentage: shareCommissionPercentage || 0,

      rentalFrequency: rentalFrequency || null,
      minimumContract: minimumContract || null,
      isImmediate:     isImmediate     || false,
      cheques:         cheques         || null,
      isShortTerm:     isShortTerm     || false,

      reraPermitNumber:      permitAvailable ? null : (reraPermitNumber || null),
      dldRegistrationNumber: dldRegistrationNumber || null,
      trakheesiPermitId:     permitAvailable ? null : (req.body.trakheesiPermitId || null),
      qrCode:                permitAvailable ? null : (req.body.qrCode || null),
      permitAvailable,

      saleStatus: saleStatus || "Available",
      developerDetails: developerDetails || {},
      status: status || "draft",

      isFeatured:              isFeatured              || false,
      isHot:                   false,
      showContactOnlyVerified: showContactOnlyVerified !== undefined ? showContactOnlyVerified : true,
      approvalStatus:
        req.body.approvalStatus ||
        (status === "draft" ? "draft" : approvalStatus || "pending"),
      listingStatus,
      approvedBy,
      approvedAt,
      isAvailable: true,
      
      unitTypes: unitTypes || [],
      
      // Inventory config
      inventoryCategory: inventoryCategory || determineInventoryCategory(unitType, propertyType, unitTypes),
      buildingNames: buildingNames || [],
      floorConfigurations: 
        (inventoryCategory || determineInventoryCategory(unitType, propertyType, unitTypes)) === "residential_tower" && 
        (!floorConfigurations || floorConfigurations.length === 0)
          ? [
              {
                buildingName: "Tower A",
                floorNumber: 1,
                units: [
                  { unitType: "apartment", bedroomType: "1bed", bedrooms: 1, bathrooms: 1, area: 800, price: 800000, count: 2 },
                  { unitType: "apartment", bedroomType: "2bed", bedrooms: 2, bathrooms: 2, area: 1200, price: 1200000, count: 2 }
                ]
              },
              {
                buildingName: "Tower A",
                floorNumber: 2,
                units: [
                  { unitType: "apartment", bedroomType: "1bed", bedrooms: 1, bathrooms: 1, area: 800, price: 850000, count: 2 },
                  { unitType: "apartment", bedroomType: "2bed", bedrooms: 2, bathrooms: 2, area: 1200, price: 1300000, count: 2 },
                  { unitType: "apartment", bedroomType: "3bed", bedrooms: 3, bathrooms: 3, area: 1600, price: 1800000, count: 1 }
                ]
              }
            ]
          : floorConfigurations || [],
    });

    console.log("=== 💾 Property data to be saved ===");
    console.log("developer:", property.developer);
    console.log("projectName:", property.projectName);
    console.log("propertyName:", property.propertyName);
    console.log("locality:", property.locality);
    console.log("propertyType:", property.propertyType);
    console.log("priceRange:", property.priceRange);
    console.log("developmentStatus:", property.developmentStatus);
    console.log("saleStatus:", property.saleStatus);
    console.log("isFeatured:", property.isFeatured);
    console.log("media.mainLogo:", property.media?.mainLogo);
    console.log("Full property to save:", JSON.stringify(property, null, 2));

    const msg = approvalStatus === "approved"
      ? "Listing created and published successfully"
      : "Listing submitted. Pending admin approval.";
   await GridNotification.create({
  eventType:     'PROPERTY_CREATED',
  title:         'New Property Listing Created',
  message:       `New ${propertySubType} listing added: ${finalPropertyName} in ${finalArea}`,
  entityId:      property._id,
  entityModel:   'Properties',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.user?.firstName || req.user?.name || 'System',
  createdByRole: isDevRole(role) ? 'developer' : 'admin',
});
    return res.status(201).json({ status: "success", message: msg, data: property });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET ALL PROPERTIES
// GET /properties
// ════════════════════════════════════════════════════════════════════════════
exports.getProperties = async (req, res) => {
  try {
    console.log("req.user in getProperties:", req.user);
    const role = req.user?.role;
    const userId = req.user?._id;
    const { page, limit, skip } = paginate(req.query);

    const {
      propertySubType, approvalStatus, listingStatus, developerId,
      area, city, country,
      unitType, bedroomType, bedrooms, bathrooms,
      minPrice, maxPrice, minArea, maxArea,
      furnishing, hasView, furnishingStatus, parkingSpaces,
      projectStatus, completionYear, completionQuarter,
      rentalFrequency, isImmediate, isShortTerm,
      isFeatured, isHot, isAvailable,
      fromDate, toDate,
      search, sortBy, sortOrder,
      status, developmentStatus, saleStatus, locality,
    } = req.query;

    let query = {};

    if (isDevRole(role)) {
      query.developer = userId;
      query.propertySubType = "off_plan";
    } else if (!isAdmin(role)) {
      query.approvalStatus = "approved";
      query.listingStatus = "active";
      if (!isCatalogue(role)) query.permitAvailable = { $ne: true };
    }
    console.log("Final query in getProperties:", query);
    console.log("isDevRole:", isDevRole(role));
    console.log("userId:", userId);

    if (propertySubType) query.propertySubType = propertySubType;
    if (status) query.status = status;
    if (developmentStatus) query.developmentStatus = developmentStatus;
    if (saleStatus) query.saleStatus = saleStatus;
    if (locality) query.locality = locality;

    if (area) query.area = { $regex: area, $options: "i" };
    if (city) query.city = { $regex: city, $options: "i" };
    if (country) query.country = { $regex: country, $options: "i" };

    if (unitType) query.unitType = unitType;
    if (bedroomType) query.bedroomType = bedroomType;
    if (bedrooms) query.bedrooms = Number(bedrooms);
    if (bathrooms) query.bathrooms = Number(bathrooms);
    if (furnishing) query.furnishing = furnishing;
    if (parkingSpaces) query.parkingSpaces = Number(parkingSpaces);

    if (hasView !== undefined) query.hasView = hasView === "true";
    if (isFeatured !== undefined) query.isFeatured = isFeatured === "true";
    if (isHot !== undefined) query.isHot = isHot === "true";

    if (projectStatus) query.projectStatus = projectStatus;
    if (completionYear) query["completionDate.year"] = Number(completionYear);
    if (completionQuarter) query["completionDate.quarter"] = completionQuarter;

    if (rentalFrequency) query.rentalFrequency = rentalFrequency;
    if (isImmediate !== undefined) query.isImmediate = isImmediate === "true";
    if (isShortTerm !== undefined) query.isShortTerm = isShortTerm === "true";

    if (minPrice || maxPrice) {
      const r = {};
      if (minPrice) r.$gte = Number(minPrice);
      if (maxPrice) r.$lte = Number(maxPrice);
      query.$or = [{ price: r }, { price_min: r }];
    }

    if (minArea || maxArea) {
      const r = {};
      if (minArea) r.$gte = Number(minArea);
      if (maxArea) r.$lte = Number(maxArea);
      query.$and = [...(query.$and || []), { $or: [{ builtUpArea: r }, { builtUpArea_min: r }] }];
    }

    if (isAdmin(role)) {
  // Only apply status filter if not already specified via query param
  if (!approvalStatus) {
    query.approvalStatus = { $ne: "draft" };
  } else {
    query.approvalStatus = approvalStatus;
  }
  if (listingStatus) query.listingStatus = listingStatus;
  if (developerId) query.developer = developerId;
  if (isAvailable !== undefined) query.isAvailable = isAvailable === "true";
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }
}

    if (search) {
      const re = { $regex: search, $options: "i" };
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { propertyName: re },
            { projectName: re },
            { description: re },
            { area: re },
            { locality: re },
            { developerName: re }
          ]
        },
      ];
    }

    const order = sortOrder === "asc" ? 1 : -1;
    let sort = { createdAt: -1 };
    if (sortBy === "price") sort = { price: order, price_min: order };
    if (sortBy === "createdAt") sort = { createdAt: order };
    if (sortBy === "updatedAt") sort = { updatedAt: order };

    const [total, properties] = await Promise.all([
      Property.countDocuments(query),
      Property.find(query)
        .sort(sort).skip(skip).limit(limit)
        .populate("developer", "name email logo phone_number accountStatus")
        .populate("createdByAdmin", "firstName lastName email")
        .populate("approvedBy", "firstName lastName email"),
    ]);
    
    console.log("=== 📋 getProperties - Properties found ===");
    console.log("Total properties in DB:", total);
    console.log("Number of properties found:", properties.length);
    
    properties.forEach((p, i) => {
      console.log(`=== 📋 Property ${i + 1} from DB:`, {
        _id: p._id,
        developer: p.developer,
        projectName: p.projectName,
        propertyName: p.propertyName,
        locality: p.locality,
        area: p.area,
        priceRange: p.priceRange,
        price_min: p.price_min,
        price_max: p.price_max,
        approvalStatus: p.approvalStatus,
        status: p.status
      });
    });
    
    console.log("=== 📋 Full properties array:", JSON.stringify(properties, null, 2));

    let stats = null;
    if (isAdmin(role)) {
      const [offPlan, secondary, rental, commercial,
        pendingCount, approvedCount, rejectedCount, activeCount,
        hotCount] = await Promise.all([
          Property.countDocuments({ propertySubType: "off_plan" }),
          Property.countDocuments({ propertySubType: "secondary" }),
          Property.countDocuments({ propertySubType: "rental" }),
          Property.countDocuments({ propertySubType: "commercial" }),
          Property.countDocuments({ approvalStatus: "pending" }),
          Property.countDocuments({ approvalStatus: "approved" }),
          Property.countDocuments({ approvalStatus: "rejected" }),
          Property.countDocuments({ listingStatus: "active" }),
          Property.countDocuments({ isHot: true }),
        ]);
      stats = {
        byType: { offPlan, secondary, rental, commercial },
        byStatus: { pendingCount, approvedCount, rejectedCount, activeCount },
        hotCount,
      };
    }

    // ✅ ADD CACHE CONTROL HEADERS TO PREVENT 304 RESPONSES
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    return res.status(200).json({
      status: "success",
      count: properties.length,
      pagination: paginationMeta(total, page, limit),
      ...(stats && { stats }),
      data: properties,
    });
  } catch (err) {
    console.error("Error in getProperties:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET SINGLE PROPERTY
// GET /properties/:id
// ════════════════════════════════════════════════════════════════════════════
exports.getPropertyById = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    let query = { _id: req.params.id };

    if (!isAdmin(role) && !isDevRole(role)) {
      query.approvalStatus = "approved";
      query.listingStatus = "active";
      if (!isCatalogue(role)) query.permitAvailable = { $ne: true };
    }
    if (isDevRole(role)) query.developer = userId;

    const property = await Property.findOne(query)
      .populate("developer", "name email logo phone_number websiteUrl accountStatus")
      .populate("createdByAdmin", "firstName lastName email")
      .populate("approvedBy", "firstName lastName email")
      .populate("existingProjectId", "propertyName developerName area");

    if (!property) {
      return res.status(404).json({ status: "fail", message: "Property not found" });
    }

    // Get inventory data for this property
    const inventory = await Inventory.find({ propertyId: property._id });

    // Calculate inventory stats
    const totalUnits = inventory.length;
    const availableUnits = inventory.filter(u => u.status === "available").length;
    const reservedUnits = inventory.filter(u => u.status === "reserved").length;
    const bookedUnits = inventory.filter(u => u.status === "booked").length;
    const spaSignedUnits = inventory.filter(u => u.status === "spa_signed").length;
    const soldUnits = inventory.filter(u => u.status === "sold").length;
    const holdUnits = inventory.filter(u => u.status === "hold").length;
    const handoverUnits = inventory.filter(u => u.status === "handover").length;
    const cancelledUnits = inventory.filter(u => u.status === "cancelled").length;

    // Combine data
    const combinedData = {
      ...property.toObject(),
      inventoryConfig: property.inventory || [],
      inventory,
      inventoryStats: {
        total: totalUnits,
        available: availableUnits,
        hold: holdUnits,
        reserved: reservedUnits,
        booked: bookedUnits,
        spa_signed: spaSignedUnits,
        sold: soldUnits,
        handover: handoverUnits,
        cancelled: cancelledUnits
      }
    };

    if (isCatalogue(role)) {
      Property.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();
    }

    // ✅ ADD CACHE CONTROL HEADERS
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    return res.status(200).json({ status: "success", data: combinedData });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ status: "fail", message: "Invalid property ID" });
    }
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// UPDATE PROPERTY
// PATCH /properties/:id
// ════════════════════════════════════════════════════════════════════════════
exports.updateProperty = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    
    console.log("=== 📥 UPDATE PROPERTY ===");
    console.log("Property ID:", req.params.id);
    console.log("Received approvalStatus:", req.body.approvalStatus);
    
    // Map developer field
    if (req.body.developer && !req.body.developerId) {
      req.body.developerId = req.body.developer;
    }

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({ status: "fail", message: "Not authorised to edit listings" });
    }

    let query = { _id: req.params.id };
    if (isDevRole(role)) {
      query.developer = userId;
      query.propertySubType = "off_plan";
    }

    const property = await Property.findOne(query);
    if (!property) {
      return res.status(404).json({ status: "fail", message: "Property not found or no permission" });
    }

    // ✅ CRITICAL: Create update object with only fields that are sent
    let updateData = {};
    
    // Only add fields that are present in req.body
    if (req.body.approvalStatus !== undefined) {
      updateData.approvalStatus = req.body.approvalStatus;
    }
    if (req.body.status !== undefined) {
      updateData.status = req.body.status;
    }
    if (req.body.projectName !== undefined) {
      updateData.projectName = req.body.projectName;
      updateData.propertyName = req.body.projectName;
    }
    if (req.body.propertyName !== undefined) {
      updateData.propertyName = req.body.propertyName;
      updateData.projectName = req.body.propertyName;
    }
    if (req.body.locality !== undefined) {
      updateData.locality = req.body.locality;
      updateData.area = req.body.locality;
    }
    if (req.body.overview !== undefined) {
      updateData.overview = req.body.overview;
      updateData.description = req.body.overview;
    }
    if (req.body.priceRange !== undefined) {
      updateData.priceRange = req.body.priceRange;
    }
    if (req.body.price_min !== undefined) {
      updateData.price_min = req.body.price_min;
      updateData.price = req.body.price_min;
    }
    if (req.body.price_max !== undefined) {
      updateData.price_max = req.body.price_max;
    }
    if (req.body.media !== undefined) {
      updateData.media = req.body.media;
      if (req.body.media.mainLogo) {
        updateData.mainLogo = req.body.media.mainLogo;
      }
    }
    if (req.body.location !== undefined) {
      updateData.location = req.body.location;
    }
    if (req.body.brochure !== undefined) {
      updateData.brochure = req.body.brochure;
    }
    if (req.body.projectPlan !== undefined) {
      updateData.projectPlan = req.body.projectPlan;
    }
    if (req.body.trakheesiPermitId !== undefined) {
      updateData.trakheesiPermitId = req.body.trakheesiPermitId;
    }
    if (req.body.qrCode !== undefined) {
      updateData.qrCode = req.body.qrCode;
    }
    if (req.body.reraPermitNumber !== undefined) {
      updateData.reraPermitNumber = req.body.reraPermitNumber;
    }
    if (req.body.permitAvailable !== undefined) {
      updateData.permitAvailable = req.body.permitAvailable === true || req.body.permitAvailable === "true";
      if (updateData.permitAvailable) {
        updateData.trakheesiPermitId = null;
        updateData.qrCode = null;
        updateData.reraPermitNumber = null;
      }
    }
    if (req.body.buildings !== undefined) {
      updateData.buildings = req.body.buildings;
    }
    if (req.body.amenities !== undefined) {
      updateData.amenities = req.body.amenities;
    }
    if (req.body.floorPlans !== undefined) {
      updateData.floorPlans = req.body.floorPlans;
    }
    if (req.body.inventory !== undefined) {
      updateData.inventory = req.body.inventory;
    }
    if (req.body.parkingAllocation !== undefined) {
      updateData.parkingAllocation = req.body.parkingAllocation;
    }
    if (req.body.parkingSpaces !== undefined) {
      updateData.parkingSpaces = req.body.parkingSpaces;
    }
    if (req.body.numberOfFloors !== undefined) {
      updateData.numberOfFloors = req.body.numberOfFloors;
      updateData.floors = req.body.numberOfFloors;
    }
    if (req.body.furnishingStatus !== undefined) {
      updateData.furnishingStatus = req.body.furnishingStatus;
    }
    if (req.body.serviceCharge !== undefined) {
      updateData.serviceCharge = req.body.serviceCharge;
    }
    if (req.body.constructionProgress !== undefined) {
      updateData.constructionProgress = req.body.constructionProgress;
      updateData.readinessProgress = `${req.body.constructionProgress}%`;
    }
    if (req.body.paymentPlan !== undefined) {
      updateData.paymentPlan = req.body.paymentPlan;
    }
    if (req.body.projectStatus !== undefined) {
      updateData.projectStatus = req.body.projectStatus;
    }
    if (req.body.developmentStatus !== undefined) {
      updateData.developmentStatus = req.body.developmentStatus;
    }
    if (req.body.saleStatus !== undefined) {
      updateData.saleStatus = req.body.saleStatus;
    }
    if (req.body.isFeatured !== undefined) {
      updateData.isFeatured = req.body.isFeatured;
    }
    if (req.body.developerDetails !== undefined) {
      updateData.developerDetails = req.body.developerDetails;
    }
    if (req.body.completionDate !== undefined) {
      updateData.completionDate = req.body.completionDate;
    }
    if (req.body.youtubeVideos !== undefined) {
      updateData.youtubeVideos = req.body.youtubeVideos;
      if (!updateData.media) updateData.media = {};
      updateData.media.youtubeVideos = req.body.youtubeVideos;
    }
    if (req.body.propertyType !== undefined) {
      updateData.propertyType = req.body.propertyType;
    }
    if (req.body.unitTypes !== undefined) {
      updateData.unitTypes = req.body.unitTypes;
    }
    if (req.body.trakheesi_permit_id !== undefined) {
  updateData.trakheesi_permit_id = req.body.trakheesi_permit_id;
}
if (req.body.qr_code !== undefined) {
  updateData.qr_code = req.body.qr_code;
}
    if (req.body.inventoryCategory !== undefined) {
      updateData.inventoryCategory = req.body.inventoryCategory;
    } else if (req.body.unitType || req.body.unitTypes) {
      updateData.inventoryCategory = determineInventoryCategory(
        req.body.unitType, 
        req.body.propertyType || property.propertyType, 
        req.body.unitTypes || property.unitTypes
      );
    }
    if (req.body.buildingNames !== undefined) {
      updateData.buildingNames = req.body.buildingNames;
    }
    if (req.body.floorConfigurations !== undefined) {
      updateData.floorConfigurations = req.body.floorConfigurations;
    } else if (
      (req.body.inventoryCategory === "residential_tower" || 
       (req.body.unitType && determineInventoryCategory(req.body.unitType, req.body.propertyType, req.body.unitTypes) === "residential_tower") ||
       (req.body.unitTypes && determineInventoryCategory(null, req.body.propertyType, req.body.unitTypes) === "residential_tower") ||
       (property.inventoryCategory === "residential_tower" && !req.body.inventoryCategory && !req.body.unitType && !req.body.unitTypes)) && 
      (!property.floorConfigurations || property.floorConfigurations.length === 0)
    ) {
      // Add default floor configs if updating to residential_tower
      updateData.floorConfigurations = [
        {
          buildingName: "Tower A",
          floorNumber: 1,
          units: [
            { unitType: "apartment", bedroomType: "1bed", bedrooms: 1, bathrooms: 1, area: 800, price: 800000, count: 2 },
            { unitType: "apartment", bedroomType: "2bed", bedrooms: 2, bathrooms: 2, area: 1200, price: 1200000, count: 2 }
          ]
        },
        {
          buildingName: "Tower A",
          floorNumber: 2,
          units: [
            { unitType: "apartment", bedroomType: "1bed", bedrooms: 1, bathrooms: 1, area: 800, price: 850000, count: 2 },
            { unitType: "apartment", bedroomType: "2bed", bedrooms: 2, bathrooms: 2, area: 1200, price: 1300000, count: 2 },
            { unitType: "apartment", bedroomType: "3bed", bedrooms: 3, bathrooms: 3, area: 1600, price: 1800000, count: 1 }
          ]
        }
      ];
    }

    // Unit type validation on update (when unit types or subType are being changed)
    const updatingUnitTypes = req.body.unitType !== undefined || req.body.unitTypes !== undefined;
    if (updatingUnitTypes) {
      const RESIDENTIAL_UNIT_TYPES = ["apartment", "villa", "townhouse", "duplex", "penthouse", "plot", "hotel_apartment"];
      const COMMERCIAL_UNIT_TYPES  = ["office", "retail", "warehouse"];
      const effectiveSubType   = property.propertySubType;
      const newUnitType        = req.body.unitType;
      const newUnitTypes       = req.body.unitTypes || [];
      const allTypes           = [newUnitType, ...newUnitTypes].filter(Boolean);

      if (effectiveSubType === "rental") {
        const bad = allTypes.filter(t => COMMERCIAL_UNIT_TYPES.includes(t));
        if (bad.length) {
          return res.status(400).json({
            status: "fail",
            message: `Rental listings only allow residential unit types. Remove: ${[...new Set(bad)].join(", ")}`,
          });
        }
      }

      if (effectiveSubType === "commercial") {
        const bad = allTypes.filter(t => !COMMERCIAL_UNIT_TYPES.includes(t));
        if (bad.length) {
          return res.status(400).json({
            status: "fail",
            message: `Commercial listings only allow: ${COMMERCIAL_UNIT_TYPES.join(", ")}. Remove: ${[...new Set(bad)].join(", ")}`,
          });
        }
      }
    }

    // Photo count validation when submitting for approval
    if (updateData.approvalStatus === "pending" || req.body.status === "pending") {
      const arch  = req.body.media?.architectureImages || property.media?.architectureImages || property.photos?.architecture || [];
      const inter = req.body.media?.interiorImages     || property.media?.interiorImages     || property.photos?.interior     || [];
      const lobby = req.body.media?.lobbyImages        || property.media?.lobbyImages        || property.photos?.lobby        || [];

      if (arch.length < 3)  return res.status(400).json({ status: "fail", message: "Architecture photos: minimum 3 required" });
      if (arch.length > 20) return res.status(400).json({ status: "fail", message: "Architecture photos: maximum 20 allowed" });
      if (inter.length < 3) return res.status(400).json({ status: "fail", message: "Interior photos: minimum 3 required" });
      if (inter.length > 20)return res.status(400).json({ status: "fail", message: "Interior photos: maximum 20 allowed" });
      if (lobby.length < 1) return res.status(400).json({ status: "fail", message: "Lobby photos: minimum 1 required" });
      if (lobby.length > 10)return res.status(400).json({ status: "fail", message: "Lobby photos: maximum 10 allowed" });
    }

    // Handle listingStatus based on approvalStatus
    let incData = {};
    if (updateData.approvalStatus === "draft") {
      updateData.listingStatus = "pending";
    } else if (updateData.approvalStatus === "pending") {
      updateData.listingStatus = "pending";
      updateData.approvedBy = null;
      updateData.approvedAt = null;
      // Track resubmission: only increment if previous status was changes_requested
      if (property.approvalStatus === "changes_requested") {
        incData.resubmissionCount = 1;
      }
    } else if (updateData.approvalStatus === "approved") {
      updateData.listingStatus = "active";
    }

    console.log("📝 Final updateData:", JSON.stringify(updateData, null, 2));

    const mongoUpdate = { $set: updateData };
    if (Object.keys(incData).length > 0) mongoUpdate.$inc = incData;

    // ✅ Use findByIdAndUpdate with runValidators: false to bypass validation
    const updated = await Property.findByIdAndUpdate(
      req.params.id,
      mongoUpdate,
      {
        new: true,
        runValidators: false,  // ← CRITICAL: Skip validation for updates
        context: 'query'
      }
    );

    if (!updated) {
      return res.status(404).json({ status: "fail", message: "Property not found" });
    }

    console.log("✅ Update successful!");
    console.log("Updated approvalStatus:", updated.approvalStatus);
    console.log("Updated listingStatus:", updated.listingStatus);

    // Add cache-control headers
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
   await GridNotification.create({
  eventType:     'PROPERTY_UPDATED',
  title:         'Property Listing Updated',
  message:       `Property updated: ${updated.propertyName || updated.projectName}`,
  entityId:      updated._id,
  entityModel:   'Properties',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.user?.firstName || 'System',
  createdByRole: isDevRole(role) ? 'developer' : 'admin',
});
    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
    console.error("❌ Update error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
// ════════════════════════════════════════════════════════════════════════════
// DELETE PROPERTY
// DELETE /properties/:id
// ════════════════════════════════════════════════════════════════════════════
exports.deleteProperty = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({ status: "fail", message: "Not authorised" });
    }

    let query = { _id: req.params.id };
    if (isDevRole(role)) {
      query.developer       = userId;
      query.propertySubType = "off_plan";
    }

    const property = await Property.findOne(query);
    if (!property) {
      return res.status(404).json({ status: "fail", message: "Property not found or no permission" });
    }

  if (property.approvalStatus === "approved" && !isSuperAdmin(role)) {
  return res.status(403).json({
    status:  "fail",
    message: "Only Super Admin can delete approved listings",
  });
}

    await Inventory.deleteMany({ propertyId: property._id });
    await Property.findByIdAndDelete(req.params.id);
  await GridNotification.create({
  eventType:     'PROPERTY_DELETED',
  title:         'Property Listing Deleted',
  message:       `Property deleted: ${property.propertyName || property.projectName} (${property.propertySubType})`,
  entityId:      property._id,
  entityModel:   'Properties',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.user?.firstName || 'System',
  createdByRole: isDevRole(role) ? 'developer' : 'admin',
});
    return res.status(200).json({ status: "success", message: "Property deleted successfully" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// APPROVE — Admin only
// PATCH /properties/:id/approve
// ════════════════════════════════════════════════════════════════════════════
exports.approveProperty = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    if (!isAdmin(role)) return res.status(403).json({ status: "fail", message: "Admin only" });

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ status: "fail", message: "Property not found" });
    if (property.approvalStatus === "approved") {
      return res.status(400).json({ status: "fail", message: "Already approved" });
    }

    if (!property.permitAvailable && !property.trakheesiPermitId) {
      return res.status(400).json({ status: "fail", message: "Trakheesi Permit ID is required before approving." });
    }
    if (!property.permitAvailable && !property.qrCode) {
      return res.status(400).json({ status: "fail", message: "QR code is required before approving." });
    }

    property.approvalStatus  = "approved";
    property.listingStatus   = "active";
    property.approvedBy      = userId;
    property.approvedAt      = new Date();
    property.rejectionReason = "";
    if (property.permitAvailable) {
      property.trakheesiPermitId = null;
      property.qrCode = null;
      property.reraPermitNumber = null;
    }
    await property.save();
await GridNotification.create({
  eventType:     'PROPERTY_APPROVED',
  title:         'Property Approved ✅',
  message:       `Property approved and live: ${property.propertyName || property.projectName}`,
  entityId:      property._id,
  entityModel:   'Properties',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.user?.firstName || 'Admin',
  createdByRole: 'admin',
});
    return res.status(200).json({ status: "success", message: "Property approved and now live", data: property });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET DEVELOPER DASHBOARD
// GET /properties/developer/dashboard
// ════════════════════════════════════════════════════════════════════════════
exports.getDeveloperDashboard = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isDevRole(role)) {
      return res.status(403).json({
        status: "fail",
        message: "Only developers can access this endpoint"
      });
    }

    // Get developer's properties
    const properties = await Property.find({ developer: userId });
    const propertyIds = properties.map(p => p._id);

    // Get all inventory units for these properties
    const inventory = await Inventory.find({ propertyId: { $in: propertyIds } });

    // Calculate active projects and units
    const activeProjects = properties.filter(p => 
      p.approvalStatus === "approved" && p.listingStatus === "active"
    ).length;
    const totalUnits = inventory.length;

    // Calculate pending approval listings count
    const pendingApprovalCount = properties.filter(p => 
      p.approvalStatus === "pending" || 
      p.approvalStatus === "changes_requested" || 
      p.listingStatus === "pending"
    ).length;

    // Calculate overall inventory status counts
    const inventoryStats = {
      total: totalUnits,
      available: 0,
      hold: 0,
      reserved: 0,
      booked: 0,
      spa_signed: 0,
      sold: 0,
      handover: 0,
      cancelled: 0
    };

    // Calculate property-wise inventory status
    const propertyWiseInventory = properties.map(property => {
      const propertyInventory = inventory.filter(unit => 
        unit.propertyId.toString() === property._id.toString()
      );
      
      const propertyStats = {
        total: propertyInventory.length,
        available: 0,
        hold: 0,
        reserved: 0,
        booked: 0,
        spa_signed: 0,
        sold: 0,
        handover: 0,
        cancelled: 0
      };

      propertyInventory.forEach(unit => {
        if (propertyStats[unit.status] !== undefined) {
          propertyStats[unit.status]++;
        }
        if (inventoryStats[unit.status] !== undefined) {
          inventoryStats[unit.status]++;
        }
      });

      return {
        propertyId: property._id,
        propertyName: property.projectName || property.propertyName || "Unnamed Property",
        stats: propertyStats,
        inventory: propertyInventory
      };
    });

    // Query interest registrations (leads) for developer's properties
    const leads = await GridLead.find({
      "source.listing_id": { $in: propertyIds },
      is_active: true,
      is_deleted: false
    });

    // Calculate Month-over-Month (MoM) comparison stats for interest registrations
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const currentPeriodLeads = leads.filter(l => l.createdAt >= thirtyDaysAgo).length;
    const priorPeriodLeads = leads.filter(l => l.createdAt >= sixtyDaysAgo && l.createdAt < thirtyDaysAgo).length;

    let changePercent = 0;
    if (priorPeriodLeads > 0) {
      changePercent = Math.round(((currentPeriodLeads - priorPeriodLeads) / priorPeriodLeads) * 100);
    } else if (currentPeriodLeads > 0) {
      changePercent = 100;
    }

    // Dynamic deal funnel based on real leads
    const dealFunnel = [
      { stage: "Leads", count: leads.filter(l => ["new", "contacted", "qualified"].includes(l.status)).length },
      { stage: "Site Visits", count: leads.filter(l => l.status === "site_visit_scheduled").length },
      { stage: "Negotiation", count: leads.filter(l => ["in_discussion", "offer_made", "reserved"].includes(l.status)).length },
      { stage: "Closed", count: leads.filter(l => ["spa_signed", "completed"].includes(l.status)).length }
    ];

    // Dynamic closed deals based on real sold/reserved units
    const closedUnits = inventory.filter(unit => 
      ["sold", "spa_signed", "booked", "reserved"].includes(unit.status)
    );
    const dealsClosed = closedUnits.map(unit => {
      const property = properties.find(p => p._id.toString() === unit.propertyId.toString());
      return {
        key: unit._id,
        date: unit.soldAt || unit.bookedAt || unit.reservedAt || unit.updatedAt,
        unit: `${unit.unitNumber} - ${property ? (property.projectName || property.propertyName) : "Unknown Property"}`,
        status: unit.status === "spa_signed" ? "SPA Signed" : unit.status.charAt(0).toUpperCase() + unit.status.slice(1),
        price: unit.salePrice || unit.price
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Dynamic recent lead registrations list for the developer dashboard
    const propMap = {};
    properties.forEach(p => {
      propMap[p._id.toString()] = p.projectName || p.propertyName || "Unnamed Project";
    });

    const recentLeads = leads
      .map(l => {
        const nameObj = l.contact_info?.name || {};
        const fullName = l.contact_info?.name?.is_masked 
          ? "Masked Customer" 
          : `${nameObj.first_name || ""} ${nameObj.last_name || ""}`.trim() || "Interested Client";

        return {
          _id: l._id,
          customerName: fullName,
          email: l.contact_info?.email?.is_masked ? "Masked" : (l.contact_info?.email?.address || "N/A"),
          phone: l.contact_info?.mobile?.is_masked ? "Masked" : (l.contact_info?.mobile?.number || "N/A"),
          projectName: propMap[l.source?.listing_id?.toString()] || "General Enquiry",
          status: l.status,
          createdAt: l.createdAt
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    const unitsSold = inventoryStats.sold + inventoryStats.spa_signed;
    const unitsReserved = inventoryStats.reserved;

    const inventoryStatusPie = [
      { name: "Available", value: inventoryStats.available },
      { name: "Reserved", value: inventoryStats.reserved },
      { name: "Booked", value: inventoryStats.booked },
      { name: "Sold", value: unitsSold },
      { name: "Hold", value: inventoryStats.hold }
    ].filter(s => s.value > 0);

    const dashboardData = {
      stats: [
        {
          label: "Active Listings",
          value: `${activeProjects} / ${properties.length}`,
          change: 0,
          bg: "#f3e8ff",
          color: "#5c039b",
          subtext: `${totalUnits} total units in inventory`
        },
        {
          label: "Interest Registrations",
          value: leads.length.toString(),
          change: changePercent,
          bg: "#e0f2fe",
          color: "#0369a1",
          subtext: `${currentPeriodLeads} new leads (30d)`
        },
        {
          label: "Reserved / Sold Units",
          value: `${unitsReserved} / ${unitsSold}`,
          change: 0,
          bg: "#dcfce7",
          color: "#16a34a",
          subtext: `Available: ${inventoryStats.available} units`
        },
        {
          label: "Pending Approvals",
          value: pendingApprovalCount.toString(),
          change: 0,
          bg: "#fee2e2",
          color: "#b91c1c",
          subtext: "Requires admin action"
        }
      ],
      inventoryStatus: inventoryStatusPie,
      propertyWiseInventory: propertyWiseInventory,
      dealFunnel: dealFunnel,
      dealsClosed: dealsClosed,
      recentLeads: recentLeads,
      inventoryStats: inventoryStats,
      properties: properties,
      inventory: inventory
    };

    return res.status(200).json({
      status: "success",
      data: dashboardData
    });
  } catch (err) {
    console.error("❌ Developer dashboard error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// REJECT — Admin only
// PATCH /properties/:id/reject
// ════════════════════════════════════════════════════════════════════════════
exports.rejectProperty = async (req, res) => {
  try {
    const { role } = req.user;
    if (!isAdmin(role)) return res.status(403).json({ status: "fail", message: "Admin only" });

    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ status: "fail", message: "rejectionReason is required" });
    }

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: "rejected",
        listingStatus: "inactive",
        rejectionReason
      },
      { new: true }
    );

    if (!property) return res.status(404).json({ status: "fail", message: "Property not found" });
await GridNotification.create({
  eventType:     'PROPERTY_REJECTED',
  title:         'Property Rejected ❌',
  message:       `Property rejected: ${property.propertyName || property.projectName}. Reason: ${rejectionReason}`,
  entityId:      property._id,
  entityModel:   'Properties',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.user?.firstName || 'Admin',
  createdByRole: 'admin',
});
    return res.status(200).json({ status: "success", message: "Property rejected", data: property });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// PATCH /properties/:id/request-changes
exports.requestChanges = async (req, res) => {
  const { role } = req.user;
  if (!isAdmin(role)) return res.status(403).json({ status: "fail", message: "Admin only" });

  const { adminComments } = req.body;
  if (!adminComments) return res.status(400).json({ status: "fail", message: "adminComments required" });

  const property = await Property.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: "changes_requested", listingStatus: "pending", adminComments },
    { new: true }
  );
  await GridNotification.create({
  eventType:     'PROPERTY_CHANGES_REQUESTED',
  title:         'Changes Requested on Property',
  message:       `Admin requested changes: ${adminComments}`,
  entityId:      property._id,
  entityModel:   'Properties',
  recipientId:   null,
  recipientRole: 'admin',
  createdByName: req.user?.firstName || 'Admin',
  createdByRole: 'admin',
});
  return res.status(200).json({ status: "success", message: "Changes requested", data: property });
};

// ════════════════════════════════════════════════════════════════════════════
// TOGGLE ACTIVE/INACTIVE — Admin only
// PATCH /properties/:id/toggle-status
// ════════════════════════════════════════════════════════════════════════════
exports.toggleListingStatus = async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) {
      return res.status(403).json({ status: "fail", message: "Admin only" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ status: "fail", message: "Property not found" });

    if (property.approvalStatus !== "approved") {
      return res.status(400).json({ status: "fail", message: "Only approved listings can be toggled" });
    }

    property.listingStatus = property.listingStatus === "active" ? "inactive" : "active";
    await property.save();

    return res.status(200).json({
      status:        "success",
      message:       `Listing is now ${property.listingStatus}`,
      listingStatus: property.listingStatus,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// TOGGLE FEATURED — Super Admin only
// PATCH /properties/:id/feature
// ════════════════════════════════════════════════════════════════════════════
exports.toggleFeatured = async (req, res) => {
  try {
    if (!isSuperAdmin(req.user.role)) {
      return res.status(403).json({ status: "fail", message: "Super admin only" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ status: "fail", message: "Property not found" });

    if (property.approvalStatus !== "approved") {
      return res.status(400).json({ status: "fail", message: "Only approved listings can be featured" });
    }

    property.isFeatured = !property.isFeatured;
    await property.save();

    return res.status(200).json({
      status:     "success",
      message:    `Property ${property.isFeatured ? "added to" : "removed from"} featured`,
      isFeatured: property.isFeatured,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// GET HOT PROPERTIES — Public (no auth needed)
// GET /properties/hot
// ════════════════════════════════════════════════════════════════════════════
exports.getHotProperties = async (req, res) => {
  try {
    const properties = await Property.find({
      isHot:          true,
      approvalStatus: "approved",
      listingStatus:  "active",
    })
      .limit(3)
      .populate("developer", "name email logo")
      .sort({ updatedAt: -1 });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      status: "success",
      count:  properties.length,
      data:   properties,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// TOGGLE HOT — Super Admin only
// PATCH /properties/:id/hot
//
// Rules:
//   - Max 3 hot properties at a time
//   - Property must be approved + active
//   - To add 4th hot → remove one existing first
//   - Error response includes currentHotProperties list
// ════════════════════════════════════════════════════════════════════════════
exports.toggleHotProperty = async (req, res) => {
  try {
    const { role } = req.user;

    if (!isSuperAdmin(role)) {
      return res.status(403).json({ status: "fail", message: "Super admin only" });
    }

    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ status: "fail", message: "Property not found" });
    }

    if (property.approvalStatus !== "approved" || property.listingStatus !== "active") {
      return res.status(400).json({
        status:  "fail",
        message: "Only approved and active listings can be marked as hot",
      });
    }

    // Adding as hot → check 3 limit
    if (!property.isHot) {
      const hotCount = await Property.countDocuments({ isHot: true });

      if (hotCount >= 3) {
        const currentHotProperties = await Property.find({ isHot: true })
          .select("propertyName area city propertySubType price mainLogo listingStatus");

        return res.status(400).json({
          status:               "fail",
          message:              "Maximum 3 hot properties allowed. Remove one existing hot property first.",
          currentHotProperties,
        });
      }
    }

    property.isHot = !property.isHot;
    await property.save();

    return res.status(200).json({
      status:  "success",
      message: `Property ${property.isHot ? "marked as hot 🔥" : "removed from hot"}`,
      isHot:   property.isHot,
      data:    property,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};



// ════════════════════════════════════════════════════════════════════════════
// GET DEVELOPER ANALYTICS
// GET /properties/developer/analytics
// ════════════════════════════════════════════════════════════════════════════
exports.getDeveloperAnalytics = async (req, res) => {
  try {
    const developerId = req.user._id;

    // Get all properties for the developer
    const properties = await Property.find({ developer: developerId });
    const propertyIds = properties.map(p => p._id);

    // Get all inventory units for these properties
    const allInventory = await Inventory.find({ propertyId: { $in: propertyIds } });

    // Calculate basic stats from properties
    const liveProperties = properties.filter(p => p.approvalStatus === "approved").length;
    const pendingProperties = properties.filter(p => p.approvalStatus === "pending").length;
    const draftProperties = properties.filter(p => p.approvalStatus === "draft").length;
    const rejectedProperties = properties.filter(p => p.approvalStatus === "rejected").length;

    // Calculate inventory stats
    const totalUnits = allInventory.length;
    const availableUnits = allInventory.filter(u => u.status === "available").length;
    const reservedUnits = allInventory.filter(u => u.status === "reserved").length;
    const soldUnits = allInventory.filter(u => ["sold", "spa_signed", "booked"].includes(u.status)).length;

    // Query interest registrations (leads) for developer's properties
    const leads = await GridLead.find({
      "source.listing_id": { $in: propertyIds },
      is_active: true,
      is_deleted: false
    });

    // Calculate Month-over-Month (MoM) comparison stats for interest registrations
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const interestRegistrationsThisMonth = leads.filter(l => l.createdAt >= thirtyDaysAgo).length;
    const interestRegistrationsLastMonth = leads.filter(l => l.createdAt >= sixtyDaysAgo && l.createdAt < thirtyDaysAgo).length;

    const enquirySourceBreakdown = {
      platformCustomer: leads.filter(l => l.lead_type === "platform").length,
      agentLead: leads.filter(l => l.lead_type === "agent").length
    };

    // Calculate listing views and wishlists (from property fields)
    const totalViews = properties.reduce((sum, p) => sum + (p.viewCount || 0), 0);
    const totalWishlists = properties.reduce((sum, p) => sum + (p.wishlistCount || 0), 0);

    // Prepare project-wise performance data
    const projectPerformance = properties.map(p => {
      const projectInventory = allInventory.filter(u => u.propertyId.toString() === p._id.toString());
      const projectAvailable = projectInventory.filter(u => u.status === "available").length;
      const projectReserved = projectInventory.filter(u => u.status === "reserved").length;
      const projectSold = projectInventory.filter(u => ["sold", "spa_signed", "booked"].includes(u.status)).length;

      return {
        key: p._id.toString(),
        project: p.projectName || p.propertyName || "Untitled Project",
        views: p.viewCount || 0,
        wishlists: p.wishlistCount || 0,
        leads: leads.filter(l => l.source?.listing_id?.toString() === p._id.toString()).length,
        bookings: projectSold,
        unsold: projectAvailable + projectReserved,
        available: projectAvailable,
        reserved: projectReserved,
        sold: projectSold
      };
    }).sort((a, b) => b.views - a.views);

    // Prepare analytics data
    const analyticsData = {
      totalInterestRegistrations: leads.length,
      interestRegistrationsThisMonth,
      interestRegistrationsLastMonth,
      leadsAssignedToAgents: leads.filter(l => l.assigned_to).length,
      enquirySourceBreakdown,

      // Deals & Transaction Metrics
      totalDealsClosed: soldUnits,
      dealsClosedPerProject: projectPerformance.map(p => ({
        project: p.project,
        deals: p.sold
      })),
      unitsSoldVsReservedVsAvailable: [
        { name: "Available", value: availableUnits },
        { name: "Reserved", value: reservedUnits },
        { name: "Sold", value: soldUnits }
      ],
      averageTimeToDeal: 0,
      unitsSoldThisQuarter: soldUnits,
      unitsSoldLastQuarter: 0,

      // Listing Performance Metrics
      totalListingViews: totalViews,
      totalWishlists: totalWishlists,
      averageApprovalTime: 0,
      listingsByStatus: {
        live: liveProperties,
        pendingApproval: pendingProperties,
        draft: draftProperties,
        rejected: rejectedProperties
      },
      editSubmissionHistory: 0,

      // Agent Engagement Metrics
      agentsWhoShortlisted: 0,
      presentationsGenerated: 0,
      presentationsShared: 0,

      // Project Performance Data
      projectPerformance
    };

    return res.status(200).json({
      status: "success",
      data: analyticsData
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ── Toggle Favourite ──────────────────────────────────────────────────────
exports.toggleFavourite = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { property_id } = req.body;
    if (!property_id) {
      return res.status(400).json({ success: false, message: "property_id is required" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    const alreadyLiked = customer.favourites.some(
      (id) => id.toString() === property_id.toString()
    );

      if (alreadyLiked) {
      customer.favourites = customer.favourites.filter(
        (id) => id.toString() !== property_id.toString()
      );
      // ✅ FIX: wishlistCount kam karo (0 se neeche nahi jaayega)
      await Property.findByIdAndUpdate(property_id, {
        $inc: { wishlistCount: -1 },
      });
    } else {
      customer.favourites.push(property_id);
      // ✅ FIX: wishlistCount badhao
      await Property.findByIdAndUpdate(property_id, {
        $inc: { wishlistCount: 1 },
      });
    }

    await customer.save();

    return res.status(200).json({
      success: true,
      message: alreadyLiked ? "Removed from favourites" : "Added to favourites",
      isFavourited: !alreadyLiked,
      favourites: customer.favourites,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get All Favourites ────────────────────────────────────────────────────
// GET /customer/favourites
// exports.getFavourites = async (req, res) => {
//   try {
//     const customerId = req.user._id;

//     const customer = await Customer.findById(customerId).populate({
//       path: "favourites",
//       match: { approvalStatus: "approved", listingStatus: "active" },
//       select:
//         "propertyName price currency area city photos mainLogo bedrooms bathrooms builtUpArea builtUpAreaUnit bedroomType propertySubType transactionType",
//     });

//     if (!customer) {
//       return res.status(404).json({ success: false, message: "Customer not found" });
//     }

//     return res.status(200).json({
//       success: true,
//       count: customer.favourites.length,
//       data: customer.favourites,
//     });
//   } catch (err) {
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.getFavourites = async (req, res) => {
  try {
    const customerId = req.user._id;

    const customer = await Customer.findById(customerId).populate({
      path: "favourites",
      select:
        "propertyName price currency area city photos mainLogo bedrooms bathrooms builtUpArea builtUpAreaUnit bedroomType propertySubType transactionType",
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    const validFavourites = (customer.favourites || []).filter(Boolean);

    // ← YAHAN ADD KARO — 304 aur caching band karo
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    return res.status(200).json({
      success: true,
      count: validFavourites.length,
      data: validFavourites,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET REQUIRED CONFIG FOR PROPERTY ───────────────────────────────────────────────────────
exports.getRequiredConfigForProperty = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const propertyId = req.params.propertyId;

    let query = { _id: propertyId };
    if (isDevRole(role)) {
      query.$or = [
        { developer: userId },
        { developerId: userId },
        { createdBy: userId }
      ];
    }

    const property = await Property.findOne(query);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found or you don't have permission"
      });
    }

    console.log("=== FULL PROPERTY DATA ===");
    console.log(JSON.stringify(property, null, 2));
    console.log("=== Property data for config request ===");
    console.log({
      unitType: property.unitType,
      unitTypes: property.unitTypes,
      propertyType: property.propertyType
    });

    const category = determineInventoryCategory(property.unitType, property.propertyType, property.unitTypes);
    const categoryConfig = inventoryCategories[category];

    console.log("Determined category:", category);
    console.log("Category config found:", !!categoryConfig);

    if (!categoryConfig) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory category"
      });
    }

    const propertyUnitTypes = (property.unitTypes || []).map(t => t.toLowerCase());
    const categoryUnitTypes = (categoryConfig.unitTypes || []);
    const mismatchedTypes = propertyUnitTypes.filter(pt => !categoryUnitTypes.includes(pt));

    return res.status(200).json({
      success: true,
      data: {
        category,
        categoryConfig,
        propertyUnitTypes,
        categoryUnitTypes,
        mismatchedTypes: mismatchedTypes.length > 0 ? mismatchedTypes : null,
        message: mismatchedTypes.length > 0 
          ? "Some property unit types don't match the inventory category!" 
          : "All unit types match!"
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
