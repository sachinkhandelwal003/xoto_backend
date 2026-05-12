const Property  = require("../models/property.model");
const Inventory = require("../models/property.inventory.model");
const Developer = require("../../Grid/Developer/models/developer.model");
const Customer = require("../../auth/models/user/customer.model");

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
    return role?.isSuperAdmin === true || Number(role?.code) === 0;
  }
  return role === "xoto_super_admin";
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
  return role === "GridAdvisor" || role === "agent";
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

    if (propertySubType === "rental") {
      if (!rentalFrequency) {
        return res.status(400).json({ status: "fail", message: "rentalFrequency is required for rental listings" });
      }
      if (!reraPermitNumber) {
        return res.status(400).json({ status: "fail", message: "reraPermitNumber is required for rental listings (PRD §14.4)" });
      }
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

      // New PRD fields (already destructured earlier: projectName, overview, locality, price, price_min, description, rentalFrequency, reraPermitNumber)
      priceRange,
      location,
      media,
      youtubeVideos,
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

      reraPermitNumber:      reraPermitNumber      || null,
      dldRegistrationNumber: dldRegistrationNumber || null,

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
      query.developer       = userId;
      query.propertySubType = "off_plan";
    } else if (!isAdmin(role)) {
      query.approvalStatus = "approved";
      query.listingStatus  = "active";
    }
    console.log("Final query in getProperties:", query);
    console.log("isDevRole:", isDevRole(role));
    console.log("userId:", userId);

    if (propertySubType) query.propertySubType = propertySubType;
    if (status) query.status = status;
    if (developmentStatus) query.developmentStatus = developmentStatus;
    if (saleStatus) query.saleStatus = saleStatus;
    if (locality) query.locality = locality;

    if (area)    query.area    = { $regex: area,    $options: "i" };
    if (city)    query.city    = { $regex: city,    $options: "i" };
    if (country) query.country = { $regex: country, $options: "i" };

    if (unitType)      query.unitType      = unitType;
    if (bedroomType)   query.bedroomType   = bedroomType;
    if (bedrooms)      query.bedrooms      = Number(bedrooms);
    if (bathrooms)     query.bathrooms     = Number(bathrooms);
    if (furnishing)    query.furnishing    = furnishing;
    if (parkingSpaces) query.parkingSpaces = Number(parkingSpaces);

    if (hasView    !== undefined) query.hasView    = hasView    === "true";
    if (isFeatured !== undefined) query.isFeatured = isFeatured === "true";
    if (isHot      !== undefined) query.isHot      = isHot      === "true"; // ← isHot filter

    if (projectStatus)     query.projectStatus             = projectStatus;
    if (completionYear)    query["completionDate.year"]    = Number(completionYear);
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
      if (approvalStatus) query.approvalStatus = approvalStatus;
      if (listingStatus)  query.listingStatus  = listingStatus;
      if (developerId)    query.developer      = developerId;
      if (isAvailable !== undefined) query.isAvailable = isAvailable === "true";
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate)   query.createdAt.$lte = new Date(toDate);
      }
    }

    if (search) {
      const re = { $regex: search, $options: "i" };
      query.$and = [
        ...(query.$and || []),
        { $or: [
          { propertyName: re },
          { projectName: re },
          { description: re },
          { area: re },
          { locality: re },
          { developerName: re }
        ] },
      ];
    }

    const order = sortOrder === "asc" ? 1 : -1;
    let sort = { createdAt: -1 };
    if (sortBy === "price")     sort = { price: order, price_min: order };
    if (sortBy === "createdAt") sort = { createdAt: order };
    if (sortBy === "updatedAt") sort = { updatedAt: order };

    const [total, properties] = await Promise.all([
      Property.countDocuments(query),
      Property.find(query)
        .sort(sort).skip(skip).limit(limit)
        .populate("developer",      "name email logo phone_number accountStatus")
        .populate("createdByAdmin", "firstName lastName email")
        .populate("approvedBy",     "firstName lastName email"),
    ]);
    console.log("=== 📋 getProperties - Properties found ===");
    console.log("Total properties in DB:", total);
    console.log("Number of properties found:", properties.length);
    
    properties.forEach((p, i) => {
      console.log(`=== 📋 Property ${i+1} from DB:`, {
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
             hotCount] = await Promise.all([                          // ← hotCount added
        Property.countDocuments({ propertySubType: "off_plan" }),
        Property.countDocuments({ propertySubType: "secondary" }),
        Property.countDocuments({ propertySubType: "rental" }),
        Property.countDocuments({ propertySubType: "commercial" }),
        Property.countDocuments({ approvalStatus: "pending" }),
        Property.countDocuments({ approvalStatus: "approved" }),
        Property.countDocuments({ approvalStatus: "rejected" }),
        Property.countDocuments({ listingStatus:  "active" }),
        Property.countDocuments({ isHot: true }),                     // ← hotCount
      ]);
      stats = {
        byType:   { offPlan, secondary, rental, commercial },
        byStatus: { pendingCount, approvedCount, rejectedCount, activeCount },
        hotCount,                                                      // ← in stats
      };
    }

    return res.status(200).json({
      status: "success",
      count: properties.length,
      pagination: paginationMeta(total, page, limit),
      ...(stats && { stats }),
      data: properties,
    });
  } catch (err) {
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
      query.listingStatus  = "active";
    }
    if (isDevRole(role)) query.developer = userId;

    const property = await Property.findOne(query)
      .populate("developer",         "name email logo phone_number websiteUrl accountStatus")
      .populate("createdByAdmin",    "firstName lastName email")
      .populate("approvedBy",        "firstName lastName email")
      .populate("existingProjectId", "propertyName developerName area");

    if (!property) {
      return res.status(404).json({ status: "fail", message: "Property not found" });
    }

    if (isCatalogue(role)) {
      Property.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();
    }

    return res.status(200).json({ status: "success", data: property });
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

    if (!isAdmin(role) && !isDevRole(role)) {
      return res.status(403).json({ status: "fail", message: "Not authorised to edit listings" });
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

 let extraUpdates = {};

console.log("=== ✏️ Update Property - Status handling ===");
console.log("req.body.status:", req.body.status);
console.log("req.body.approvalStatus:", req.body.approvalStatus);
console.log("Current approvalStatus:", property.approvalStatus);

// Preserve draft status if requested
if (req.body.status === "draft" || req.body.approvalStatus === "draft") {
  extraUpdates = {
    approvalStatus: "draft",
    listingStatus: "pending",
    approvedBy: null,
    approvedAt: null,
  };
  console.log("→ Keeping as draft");
}
else if (
  isDevRole(role) &&
  (
    property.approvalStatus === "approved" ||
    property.approvalStatus === "changes_requested"
  )
) {
  extraUpdates = {
    approvalStatus: "pending",
    listingStatus: "pending",
    approvedBy: null,
    approvedAt: null,
    adminComments: "", // clear old admin comment
    rejectionReason: "", // optional cleanup
  };
  console.log("→ Setting to pending");
}

console.log("Final extraUpdates:", extraUpdates);

    const {
      propertyName, description, area,
      price, price_min,
      projectName, overview, locality,
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
      priceRange,
      location,
      media,
      youtubeVideos,
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
    } = req.body;

    const finalPropertyName = projectName || propertyName;
    const finalDescription = overview || description;
    const finalArea = locality || area;

    const fieldUpdates = {
      propertyName: finalPropertyName,
      projectName: finalPropertyName,
      overview: finalDescription,
      description: finalDescription,
      locality: finalArea,
      area: finalArea,
      price: price || price_min || priceRange?.from || property.price,
      price_min: price_min || price || priceRange?.from || property.price_min,
      price_max: price_max || price || priceRange?.to || property.price_max,
      priceRange: priceRange || { from: price_min || price || property.price_min, to: price_max || price || property.price_max },
      mainLogo: mainLogo || media?.mainLogo || property.mainLogo,
      photos: {
        architecture: photos?.architecture || media?.architectureImages || property.photos?.architecture,
        interior: photos?.interior || media?.interiorImages || property.photos?.interior,
        lobby: photos?.lobby || media?.lobbyImages || property.photos?.lobby,
        other: photos?.other || media?.otherImages || property.photos?.other,
      },
      media: {
        mainLogo: media?.mainLogo || mainLogo || property.media?.mainLogo,
        architectureImages: media?.architectureImages || photos?.architecture || property.media?.architectureImages,
        interiorImages: media?.interiorImages || photos?.interior || property.media?.interiorImages,
        lobbyImages: media?.lobbyImages || photos?.lobby || property.media?.lobbyImages,
        otherImages: media?.otherImages || photos?.other || property.media?.otherImages,
        youtubeVideos: media?.youtubeVideos || youtubeVideos || property.media?.youtubeVideos,
      },
      youtubeVideos: youtubeVideos || media?.youtubeVideos || property.youtubeVideos,
      floors: floors || numberOfFloors || property.floors,
      numberOfFloors: numberOfFloors || floors || property.numberOfFloors,
      serviceChargeInfo: serviceChargeInfo || serviceCharge || property.serviceChargeInfo,
      serviceCharge: serviceCharge || serviceChargeInfo || property.serviceCharge,
      readinessProgress: readinessProgress || `${constructionProgress || property.constructionProgress}%`,
      constructionProgress: constructionProgress || property.constructionProgress,
    };

    const {
      approvalStatus: _a, listingStatus: _l,
      developer: _d, createdByAdmin: _c,
      approvedBy: _ab, approvedAt: _at,
      isHot: _h,  
      ...safeBody                       
    } = req.body;

    const updated = await Property.findByIdAndUpdate(
      req.params.id,
      { ...safeBody, ...fieldUpdates, ...extraUpdates },
      { new: true, runValidators: true }
    );

    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
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

    property.approvalStatus  = "approved";
    property.listingStatus   = "active";
    property.approvedBy      = userId;
    property.approvedAt      = new Date();
    property.rejectionReason = "";
    await property.save();

    return res.status(200).json({ status: "success", message: "Property approved and now live", data: property });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
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

    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ status: "fail", message: "Property not found" });

    property.approvalStatus  = "rejected";
    property.listingStatus   = "inactive";
    property.rejectionReason = rejectionReason;
    await property.save();

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
      // Unlike — remove karo
      customer.favourites = customer.favourites.filter(
        (id) => id.toString() !== property_id.toString()
      );
    } else {
      // Like — add karo
      customer.favourites.push(property_id);
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