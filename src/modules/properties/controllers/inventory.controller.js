// controllers/inventoryController.js

const Inventory = require("../models/property.inventory.model");
const Property = require("../models/property.model");
const { inventoryCategories, determineInventoryCategory } = require("../config/inventory.categories.config");
const mongoose = require("mongoose");

// Helper to resolve inherited fields from parent property
const resolveInventoryUnit = (unitDoc) => {
  if (!unitDoc) return null;
  const unit = unitDoc.toObject ? unitDoc.toObject() : unitDoc;
  const property = unit.propertyId;

  const hasProp = property && typeof property === "object";
  const isUnset = (val) => val === undefined || val === null;

  return {
    ...unit,
    currency: !isUnset(unit.currency) ? unit.currency : (hasProp ? (property.currency || "AED") : "AED"),
    hasView: !isUnset(unit.hasView) ? unit.hasView : (hasProp ? (property.hasView || false) : false),
    viewType: (Array.isArray(unit.viewType) && unit.viewType.length > 0) ? unit.viewType : (hasProp ? (property.viewType || []) : []),
    parkingSpaces: !isUnset(unit.parkingSpaces) ? unit.parkingSpaces : (hasProp ? (property.parkingSpaces || 0) : 0),
    furnishing: !isUnset(unit.furnishing) ? unit.furnishing : (hasProp ? (property.furnishing || "unfurnished") : "unfurnished"),
    paymentPlan: !isUnset(unit.paymentPlan) && unit.paymentPlan !== "" ? unit.paymentPlan : (hasProp && property.paymentPlan && property.paymentPlan.length > 0 ? property.paymentPlan[0]?.title : ""),
    
    rawValues: {
      currency: unit.currency,
      hasView: unit.hasView,
      viewType: unit.viewType,
      parkingSpaces: unit.parkingSpaces,
      furnishing: unit.furnishing,
      paymentPlan: unit.paymentPlan
    }
  };
};

// ─── AUTO GENERATE INVENTORY ─────────────────────────────────────────────────
exports.autoGenerateInventory = async (req, res) => {
  try {
    const developerId = req.user._id;
    const { propertyId, config } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: "propertyId is required"
      });
    }

    // Get property
    const property = await Property.findOne({
      _id: propertyId,
      $or: [
        { developer: developerId },
        { developerId: developerId },
        { createdBy: developerId }
      ]
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found or you don't have permission"
      });
    }

    const generatedUnits = [];
    let unitCounter = 1;

    // If config is provided, use it to generate units
    if (config) {
      const category = determineInventoryCategory(property.unitType, property.propertyType, property.unitTypes);
      
      switch (category) {
        case "residential_tower":
          if (config.towers && config.towers.length > 0 && config.floorConfigs && config.floorConfigs.length > 0) {
            for (const floorConfig of config.floorConfigs) {
              const tower = config.towers.find(t => t.name === floorConfig.towerName);
              if (!tower) continue;
              
              const startFloor = floorConfig.startFloor || 1;
              const endFloor = floorConfig.endFloor || tower.totalFloors || 10;
              
              for (let floorNum = startFloor; floorNum <= endFloor; floorNum++) {
                const count = tower.unitsPerFloor || 2;
                for (let i = 0; i < count; i++) {
                  const unitNumber = `${tower.name.replace(/\s+/g, '')}-${floorNum}${String(unitCounter).padStart(2, '0')}`;
                  
                  const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                  if (existingUnit) continue;
                  
                  const extraFields = { tower: tower.name };
                  
                  const unitData = {
                    propertyId,
                    developerId: property.developer || developerId,
                    unitNumber,
                    buildingName: tower.name,
                    floorNumber: floorNum,
                    unitType: "apartment",
                    bedroomType: floorConfig.bedroomType,
                    bedrooms: parseInt(floorConfig.bedroomType.replace('bed', '')) || 1,
                    bathrooms: parseInt(floorConfig.bedroomType.replace('bed', '')) || 1,
                    area: floorConfig.area,
                    areaUnit: floorConfig.areaUnit || "sqft",
                    price: floorConfig.price,
                    currency: (floorConfig.currency && floorConfig.currency !== property.currency) ? floorConfig.currency : undefined,
                    hasView: (floorConfig.hasView !== undefined && floorConfig.hasView !== property.hasView) ? floorConfig.hasView : undefined,
                    viewType: (floorConfig.viewType && JSON.stringify(floorConfig.viewType) !== JSON.stringify(property.viewType)) ? floorConfig.viewType : undefined,
                    parkingSpaces: (floorConfig.parkingSpaces !== undefined && floorConfig.parkingSpaces !== property.parkingSpaces) ? floorConfig.parkingSpaces : undefined,
                    furnishing: (floorConfig.furnishing && floorConfig.furnishing !== property.furnishing) ? floorConfig.furnishing : undefined,
                    extraFields,
                    status: floorConfig.status || "available"
                  };
                  
                  const newUnit = await Inventory.create(unitData);
                  
                  generatedUnits.push(newUnit);
                  unitCounter++;
                }
              }
            }
          }
          break;
          
        case "villa_community":
          if (config.villaTypes && config.villaTypes.length > 0) {
            for (const villaType of config.villaTypes) {
              const count = villaType.count || 10;
              for (let i = 0; i < count; i++) {
                const unitNumber = `VILLA-${String(unitCounter).padStart(3, '0')}`;
                
                const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                if (existingUnit) continue;
                
                const unitData = {
                  propertyId,
                  developerId: property.developer || developerId,
                  unitNumber,
                  buildingName: null,
                  floorNumber: null,
                  unitType: "villa",
                  bedroomType: villaType.bedroomType,
                  bedrooms: parseInt(villaType.bedroomType.replace('bed', '')) || 3,
                  bathrooms: parseInt(villaType.bedroomType.replace('bed', '')) || 3,
                  area: villaType.area,
                  areaUnit: villaType.areaUnit || "sqft",
                  price: villaType.price,
                  currency: (villaType.currency && villaType.currency !== property.currency) ? villaType.currency : undefined,
                  hasView: (villaType.hasView !== undefined && villaType.hasView !== property.hasView) ? villaType.hasView : undefined,
                  viewType: (villaType.viewType && JSON.stringify(villaType.viewType) !== JSON.stringify(property.viewType)) ? villaType.viewType : undefined,
                  parkingSpaces: (villaType.parkingSpaces !== undefined && villaType.parkingSpaces !== property.parkingSpaces) ? villaType.parkingSpaces : undefined,
                  furnishing: (villaType.furnishing && villaType.furnishing !== property.furnishing) ? villaType.furnishing : undefined,
                  status: villaType.status || "available"
                };
                
                const newUnit = await Inventory.create(unitData);
                
                generatedUnits.push(newUnit);
                unitCounter++;
              }
            }
          }
          break;
          
        case "townhouse_cluster":
          if (config.townhouseTypes && config.townhouseTypes.length > 0) {
            for (const townhouseType of config.townhouseTypes) {
              const count = townhouseType.count || 15;
              for (let i = 0; i < count; i++) {
                const unitNumber = `TOWNHOUSE-${String(unitCounter).padStart(3, '0')}`;
                
                const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                if (existingUnit) continue;
                
                const unitData = {
                  propertyId,
                  developerId: property.developer || developerId,
                  unitNumber,
                  buildingName: null,
                  floorNumber: null,
                  unitType: "townhouse",
                  bedroomType: townhouseType.bedroomType,
                  bedrooms: parseInt(townhouseType.bedroomType.replace('bed', '')) || 3,
                  bathrooms: parseInt(townhouseType.bedroomType.replace('bed', '')) || 3,
                  area: townhouseType.area,
                  areaUnit: townhouseType.areaUnit || "sqft",
                  price: townhouseType.price,
                  currency: (townhouseType.currency && townhouseType.currency !== property.currency) ? townhouseType.currency : undefined,
                  hasView: (townhouseType.hasView !== undefined && townhouseType.hasView !== property.hasView) ? townhouseType.hasView : undefined,
                  viewType: (townhouseType.viewType && JSON.stringify(townhouseType.viewType) !== JSON.stringify(property.viewType)) ? townhouseType.viewType : undefined,
                  parkingSpaces: (townhouseType.parkingSpaces !== undefined && townhouseType.parkingSpaces !== property.parkingSpaces) ? townhouseType.parkingSpaces : undefined,
                  furnishing: (townhouseType.furnishing && townhouseType.furnishing !== property.furnishing) ? townhouseType.furnishing : undefined,
                  status: townhouseType.status || "available"
                };
                
                const newUnit = await Inventory.create(unitData);
                
                generatedUnits.push(newUnit);
                unitCounter++;
              }
            }
          }
          break;
          
        case "commercial_office":
          if (config.floors && config.floors.length > 0) {
            for (const floorConfig of config.floors) {
              for (let i = 0; i < floorConfig.unitsPerFloor; i++) {
                const unitNumber = `OFFICE-${floorConfig.floorNumber}-${String(unitCounter).padStart(2, '0')}`;
                
                const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                if (existingUnit) continue;
                
                const unitData = {
                  propertyId,
                  developerId: property.developer || developerId,
                  unitNumber,
                  buildingName: "Office Tower",
                  floorNumber: floorConfig.floorNumber,
                  unitType: "office",
                  bedroomType: null,
                  bedrooms: 0,
                  bathrooms: 1,
                  area: floorConfig.area,
                  areaUnit: floorConfig.areaUnit || "sqft",
                  price: floorConfig.price,
                  currency: (floorConfig.currency && floorConfig.currency !== property.currency) ? floorConfig.currency : undefined,
                  hasView: (floorConfig.hasView !== undefined && floorConfig.hasView !== property.hasView) ? floorConfig.hasView : undefined,
                  viewType: (floorConfig.viewType && JSON.stringify(floorConfig.viewType) !== JSON.stringify(property.viewType)) ? floorConfig.viewType : undefined,
                  parkingSpaces: (floorConfig.parkingSpaces !== undefined && floorConfig.parkingSpaces !== property.parkingSpaces) ? floorConfig.parkingSpaces : undefined,
                  furnishing: (floorConfig.furnishing && floorConfig.furnishing !== property.furnishing) ? floorConfig.furnishing : undefined,
                  status: floorConfig.status || "available"
                };
                
                const newUnit = await Inventory.create(unitData);
                
                generatedUnits.push(newUnit);
                unitCounter++;
              }
            }
          }
          break;
          
        case "commercial_retail":
          if (config.floors && config.floors.length > 0) {
            for (const floorConfig of config.floors) {
              for (let i = 0; i < floorConfig.unitsPerFloor; i++) {
                const unitNumber = `SHOP-${floorConfig.floorNumber}-${String(unitCounter).padStart(2, '0')}`;
                
                const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                if (existingUnit) continue;
                
                const unitData = {
                  propertyId,
                  developerId: property.developer || developerId,
                  unitNumber,
                  buildingName: "Retail Mall",
                  floorNumber: floorConfig.floorNumber,
                  unitType: "retail",
                  bedroomType: null,
                  bedrooms: 0,
                  bathrooms: 1,
                  area: floorConfig.area,
                  areaUnit: floorConfig.areaUnit || "sqft",
                  price: floorConfig.price,
                  currency: (floorConfig.currency && floorConfig.currency !== property.currency) ? floorConfig.currency : undefined,
                  hasView: (floorConfig.hasView !== undefined && floorConfig.hasView !== property.hasView) ? floorConfig.hasView : undefined,
                  viewType: (floorConfig.viewType && JSON.stringify(floorConfig.viewType) !== JSON.stringify(property.viewType)) ? floorConfig.viewType : undefined,
                  parkingSpaces: (floorConfig.parkingSpaces !== undefined && floorConfig.parkingSpaces !== property.parkingSpaces) ? floorConfig.parkingSpaces : undefined,
                  furnishing: (floorConfig.furnishing && floorConfig.furnishing !== property.furnishing) ? floorConfig.furnishing : undefined,
                  status: floorConfig.status || "available"
                };
                
                const newUnit = await Inventory.create(unitData);
                
                generatedUnits.push(newUnit);
                unitCounter++;
              }
            }
          }
          break;
          
        case "land_plot":
          if (config.plotTypes && config.plotTypes.length > 0) {
            for (const plotType of config.plotTypes) {
              for (let i = 0; i < plotType.count; i++) {
                const unitNumber = `PLOT-${String(unitCounter).padStart(3, '0')}`;
                
                const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                if (existingUnit) continue;
                
                const unitData = {
                  propertyId,
                  developerId: property.developer || developerId,
                  unitNumber,
                  buildingName: null,
                  floorNumber: null,
                  unitType: "plot",
                  bedroomType: null,
                  bedrooms: 0,
                  bathrooms: 0,
                  area: plotType.area,
                  areaUnit: plotType.areaUnit || "sqft",
                  price: plotType.price,
                  currency: (plotType.currency && plotType.currency !== property.currency) ? plotType.currency : undefined,
                  status: plotType.status || "available"
                };
                
                const newUnit = await Inventory.create(unitData);
                
                generatedUnits.push(newUnit);
                unitCounter++;
              }
            }
          }
          break;
          
        case "warehouse":
          if (config.warehouses && config.warehouses.length > 0) {
            for (const warehouse of config.warehouses) {
              for (let i = 0; i < warehouse.count; i++) {
                const unitNumber = `WH-${warehouse.name.replace(/\s+/g, '')}-${String(unitCounter).padStart(3, '0')}`;
                
                const existingUnit = await Inventory.findOne({ propertyId, unitNumber });
                if (existingUnit) continue;
                
                const unitData = {
                  propertyId,
                  developerId: property.developer || developerId,
                  unitNumber,
                  buildingName: warehouse.name,
                  floorNumber: null,
                  unitType: "warehouse",
                  bedroomType: null,
                  bedrooms: 0,
                  bathrooms: 0,
                  area: warehouse.area,
                  areaUnit: warehouse.areaUnit || "sqft",
                  price: warehouse.price,
                  currency: (warehouse.currency && warehouse.currency !== property.currency) ? warehouse.currency : undefined,
                  parkingSpaces: (warehouse.parkingSpaces !== undefined && warehouse.parkingSpaces !== property.parkingSpaces) ? warehouse.parkingSpaces : undefined,
                  status: warehouse.status || "available"
                };
                
                const newUnit = await Inventory.create(unitData);
                
                generatedUnits.push(newUnit);
                unitCounter++;
              }
            }
          }
          break;
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Config is required to generate inventory. Please fill the config form."
      });
    }

    // Update property statistics by aggregating from inventory.
    // Property schema only has totalInventory / soldUnits / reservedUnits / bookedUnits —
    // other statuses are tracked on the Inventory docs themselves.
    const totalInventory = await Inventory.countDocuments({ propertyId });
    const stats = await Inventory.aggregate([
      { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const statusToField = {
      sold: "soldUnits",
      reserved: "reservedUnits",
      booked: "bookedUnits"
    };

    const statsObj = {
      totalInventory,
      soldUnits: 0,
      reservedUnits: 0,
      bookedUnits: 0
    };
    stats.forEach(s => {
      const field = statusToField[s._id];
      if (field) statsObj[field] = s.count;
    });

    await Property.findByIdAndUpdate(propertyId, statsObj);

    return res.status(201).json({
      success: true,
      message: `${generatedUnits.length} units auto-generated successfully for ${property.inventoryCategory}`,
      data: generatedUnits
    });

  } catch (error) {
    console.error("Auto generate inventory error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

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

/**
 * @route   POST /api/properties/inventory
 * @desc    Developer creates inventory for off-plan property
 */
exports.createInventory = async (req, res) => {
    try {
        const developerId = req.user._id;
        const userRole = req.user.role; // ✅ FIX 1: Get user role
        const { propertyId, units } = req.body;

        console.log("=== CREATE INVENTORY ===");
        console.log("developerId:", developerId);
        console.log("userRole:", userRole); // ✅ FIX 1: Log role
        console.log("propertyId:", propertyId);
        console.log("units:", JSON.stringify(units, null, 2));

        if (!propertyId || !units || !Array.isArray(units) || units.length === 0) {
            return res.status(400).json({
                success: false,
                message: "propertyId and units array are required"
            });
        }

        // ✅ FIX 2: Admin bypasses ownership check
        let propertyQuery = { _id: propertyId };
        if (!isAdmin(userRole)) {
            propertyQuery.$or = [
                { developer: developerId },
                { developerId: developerId },
                { createdBy: developerId }
            ];
        }

        const property = await Property.findOne(propertyQuery);

        if (!property) {
            console.log("Property not found. propertyId:", propertyId, "developerId:", developerId, "role:", userRole);
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        // ✅ FIX 3: Guard off_plan check — don't block if propertySubType is not set
        if (property.propertySubType && property.propertySubType !== "off_plan") {
            return res.status(400).json({
                success: false,
                message: "Inventory can only be added for off-plan properties"
            });
        }

        const createdUnits = [];
        const skippedUnits = [];

        for (const unit of units) {
            if (!unit.unitNumber) {
                skippedUnits.push({ unit, reason: "Missing unitNumber" });
                continue;
            }

            const existingUnit = await Inventory.findOne({
                propertyId,
                unitNumber: unit.unitNumber
            });

            if (existingUnit) {
                skippedUnits.push({ unitNumber: unit.unitNumber, reason: "Unit number already exists" });
                continue;
            }

            const newUnit = await Inventory.create({
                propertyId,
                developerId,
                unitNumber: unit.unitNumber,
                buildingName: unit.buildingName || "",
                floorNumber: unit.floorNumber || 0,
                unitType: unit.unitType || "apartment",
                bedroomType: unit.bedroomType || "1bed",
                bedrooms: unit.bedrooms || 0,
                bathrooms: unit.bathrooms || 0,
                area: unit.area || 0,
                areaUnit: unit.areaUnit || "sqft",
                price: unit.price || 0,
                currency: (unit.currency && unit.currency !== "inherit" && unit.currency !== "") ? unit.currency : undefined,
                hasView: (unit.hasView !== undefined && unit.hasView !== "inherit") ? (unit.hasView === "true" || unit.hasView === true) : undefined,
                viewType: (unit.viewType && unit.viewType !== "inherit" && (!Array.isArray(unit.viewType) || unit.viewType.length > 0)) ? unit.viewType : undefined,
                parkingSpaces: (unit.parkingSpaces !== undefined && unit.parkingSpaces !== "inherit") ? Number(unit.parkingSpaces) : undefined,
                furnishing: (unit.furnishing && unit.furnishing !== "inherit" && unit.furnishing !== "") ? unit.furnishing : undefined,
                paymentPlan: (unit.paymentPlan && unit.paymentPlan !== "inherit" && unit.paymentPlan !== "") ? unit.paymentPlan : undefined,
                status: unit.status || "available"
            });

            createdUnits.push(newUnit);
        }

        if (createdUnits.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid units to create",
                skipped: skippedUnits
            });
        }

        const totalInventory = await Inventory.countDocuments({ propertyId });
        await Property.findByIdAndUpdate(propertyId, { totalInventory });

        return res.status(201).json({
            success: true,
            message: `${createdUnits.length} units added to inventory`,
            data: createdUnits,
            ...(skippedUnits.length > 0 && { skipped: skippedUnits })
        });

    } catch (error) {
        console.error("Create inventory error:", error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Duplicate unit number found in this property"
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/properties/inventory/bulk
 * @desc    Developer bulk imports inventory via Excel/CSV
 */
exports.bulkImportInventory = async (req, res) => {
    try {
        const developerId = req.user._id;
        const { propertyId, units } = req.body;

        if (!propertyId || !units || !Array.isArray(units)) {
            return res.status(400).json({
                success: false,
                message: "propertyId and units array are required"
            });
        }

        const property = await Property.findOne({ 
            _id: propertyId,
            $or: [
                { developer: developerId },
                { developerId: developerId },
                { createdBy: developerId }
            ]
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        const createdUnits = [];
        const errors = [];

        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            try {
                // Validate required fields
                if (!unit.unitNumber || !unit.area || !unit.price) {
                    errors.push({ 
                        row: i + 1, 
                        unitNumber: unit.unitNumber || "missing", 
                        error: "unitNumber, area, and price are required" 
                    });
                    continue;
                }

                const existingUnit = await Inventory.findOne({
                    propertyId,
                    unitNumber: unit.unitNumber
                });

                if (existingUnit) {
                    errors.push({ 
                        row: i + 1, 
                        unitNumber: unit.unitNumber, 
                        error: "Unit number already exists" 
                    });
                    continue;
                }

                 const newUnit = await Inventory.create({
                    propertyId,
                    developerId,
                    unitNumber: unit.unitNumber,
                    buildingName: unit.buildingName || "",
                    floorNumber: unit.floorNumber || 0,
                    unitType: unit.unitType || "apartment",
                    bedroomType: unit.bedroomType || "1bed",
                    bedrooms: unit.bedrooms || 0,
                    bathrooms: unit.bathrooms || 0,
                    area: unit.area,
                    areaUnit: unit.areaUnit || "sqft",
                    price: unit.price,
                    currency: (unit.currency && unit.currency !== "inherit" && unit.currency !== "") ? unit.currency : undefined,
                    hasView: (unit.hasView !== undefined && unit.hasView !== "inherit") ? (unit.hasView === "true" || unit.hasView === true) : undefined,
                    viewType: (unit.viewType && unit.viewType !== "inherit" && (!Array.isArray(unit.viewType) || unit.viewType.length > 0)) ? (typeof unit.viewType === "string" ? [unit.viewType] : unit.viewType) : undefined,
                    parkingSpaces: (unit.parkingSpaces !== undefined && unit.parkingSpaces !== "inherit") ? Number(unit.parkingSpaces) : undefined,
                    furnishing: (unit.furnishing && unit.furnishing !== "inherit" && unit.furnishing !== "") ? unit.furnishing : undefined,
                    paymentPlan: (unit.paymentPlan && unit.paymentPlan !== "inherit" && unit.paymentPlan !== "") ? unit.paymentPlan : undefined,
                    status: unit.status || "available"
                });

                createdUnits.push(newUnit);
            } catch (err) {
                errors.push({ 
                    row: i + 1, 
                    unitNumber: unit.unitNumber || "unknown", 
                    error: err.message 
                });
            }
        }

        // Update property total units
        const totalInventory = await Inventory.countDocuments({ propertyId });
        await Property.findByIdAndUpdate(propertyId, { totalInventory });

        return res.status(201).json({
            success: true,
            message: `${createdUnits.length} units imported, ${errors.length} errors`,
            data: { 
                created: createdUnits, 
                errors: errors 
            }
        });

    } catch (error) {
        console.error("Bulk import error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/properties/inventory
 * @desc    Get inventory by property with filtering and pagination
 */
exports.getInventoryByProperty = async (req, res) => {
    try {
        const { propertyId } = req.query;
        const userId = req.user._id;
        const role = req.user.role;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const unitType = req.query.unitType;
        const floorNumber = req.query.floorNumber;
        const buildingName = req.query.buildingName;

        if (!propertyId) {
            return res.status(400).json({
                success: false,
                message: "Property ID is required"
            });
        }

        // Build property query based on user role
        let propertyQuery = { _id: propertyId };
        
        if (isDevRole(role)) {
            propertyQuery.$or = [
                { developer: userId },
                { developerId: userId },
                { createdBy: userId }
            ];
        } else if (!isAdmin(role)) {
            propertyQuery.approvalStatus = "approved";
            propertyQuery.listingStatus = "active";
        }

        // Check if property exists
        const property = await Property.findOne(propertyQuery);

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        // Build inventory query
        let query = { propertyId };
        if (status) query.status = status;
        if (unitType) query.unitType = unitType;
        if (floorNumber) query.floorNumber = Number(floorNumber);
        if (buildingName) query.buildingName = buildingName;

        const total = await Inventory.countDocuments(query);
        const inventory = await Inventory.find(query)
            .populate("propertyId")
            .sort({ buildingName: 1, floorNumber: 1, unitNumber: 1 })
            .skip(skip)
            .limit(limit);

        const resolvedInventory = inventory.map(resolveInventoryUnit);

        // Get counts by status
        const counts = {
            totalUnits: await Inventory.countDocuments({ propertyId }),
            byStatus: {
                available: await Inventory.countDocuments({ propertyId, status: "available" }),
                reserved: await Inventory.countDocuments({ propertyId, status: "reserved" }),
                booked: await Inventory.countDocuments({ propertyId, status: "booked" }),
                sold: await Inventory.countDocuments({ propertyId, status: "sold" })
            },
            byUnitType: {},
            byFloor: {},
            byBuilding: {}
        };

        // Get breakdown by unit type
        const unitTypeBreakdown = await Inventory.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            {
                $group: {
                    _id: "$unitType",
                    total: { $sum: 1 },
                    available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
                    reserved: { $sum: { $cond: [{ $eq: ["$status", "reserved"] }, 1, 0] } },
                    booked: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
                    sold: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
                    minPrice: { $min: "$price" },
                    maxPrice: { $max: "$price" }
                }
            }
        ]);

        // Get breakdown by floor
        const floorBreakdown = await Inventory.aggregate([
            { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
            {
                $group: {
                    _id: { floor: "$floorNumber", building: "$buildingName" },
                    total: { $sum: 1 },
                    available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
                    reserved: { $sum: { $cond: [{ $eq: ["$status", "reserved"] }, 1, 0] } },
                    booked: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
                    sold: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
                    minPrice: { $min: "$price" },
                    maxPrice: { $max: "$price" }
                }
            },
            { $sort: { "_id.building": 1, "_id.floor": 1 } }
        ]);

        // Format unit type breakdown
        unitTypeBreakdown.forEach(item => {
            counts.byUnitType[item._id] = {
                total: item.total,
                available: item.available,
                reserved: item.reserved,
                booked: item.booked,
                sold: item.sold,
                pricing: {
                    min: item.minPrice,
                    max: item.maxPrice
                }
            };
        });

        // Format floor and building breakdown
        floorBreakdown.forEach(item => {
            const buildingKey = item._id.building || "Unnamed Building";
            const floorKey = item._id.floor;
            
            if (!counts.byBuilding[buildingKey]) {
                counts.byBuilding[buildingKey] = {
                    total: 0,
                    available: 0,
                    reserved: 0,
                    booked: 0,
                    sold: 0,
                    floors: {}
                };
            }
            
            counts.byBuilding[buildingKey].total += item.total;
            counts.byBuilding[buildingKey].available += item.available;
            counts.byBuilding[buildingKey].reserved += item.reserved;
            counts.byBuilding[buildingKey].booked += item.booked;
            counts.byBuilding[buildingKey].sold += item.sold;
            
            counts.byBuilding[buildingKey].floors[floorKey] = {
                total: item.total,
                available: item.available,
                reserved: item.reserved,
                booked: item.booked,
                sold: item.sold,
                pricing: {
                    min: item.minPrice,
                    max: item.maxPrice
                }
            };
            
            if (!counts.byFloor[floorKey]) {
                counts.byFloor[floorKey] = {
                    total: 0,
                    available: 0,
                    reserved: 0,
                    booked: 0,
                    sold: 0
                };
            }
            
            counts.byFloor[floorKey].total += item.total;
            counts.byFloor[floorKey].available += item.available;
            counts.byFloor[floorKey].reserved += item.reserved;
            counts.byFloor[floorKey].booked += item.booked;
            counts.byFloor[floorKey].sold += item.sold;
        });

        return res.status(200).json({
            success: true,
            data: resolvedInventory,
            counts: counts,
            floorConfigurations: property.floorConfigurations,
            pagination: {
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                totalItems: total,
                limit
            }
        });

    } catch (error) {
        console.error("getInventoryByProperty ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/properties/inventory/:unitId
 * @desc    Get single inventory unit
 */
exports.getSingleInventory = async (req, res) => {
  try {
    const { unitId } = req.params;

    const inventory = await Inventory.findById(unitId).populate("propertyId");

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Unit not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: resolveInventoryUnit(inventory)
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @route   PATCH /api/properties/inventory/:id
 * @desc    Developer updates inventory unit
 */
exports.updateInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const developerId = req.user._id;

        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory not found"
            });
        }

        // Check if property belongs to developer
        if (inventory.developerId.toString() !== developerId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to update this inventory"
            });
        }

        const updateData = { ...req.body };
        const sharedFields = ["currency", "hasView", "viewType", "parkingSpaces", "furnishing", "paymentPlan"];
        sharedFields.forEach(field => {
            if (updateData[field] === "inherit" || updateData[field] === "" || updateData[field] === null || updateData[field] === undefined) {
                updateData[field] = null;
            } else if (field === "hasView") {
                updateData[field] = updateData[field] === "true" || updateData[field] === true;
            } else if (field === "parkingSpaces") {
                updateData[field] = Number(updateData[field]);
            }
        });

        const updatedInventory = await Inventory.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate("propertyId");

        return res.status(200).json({
            success: true,
            message: "Inventory updated successfully",
            data: resolveInventoryUnit(updatedInventory)
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   DELETE /api/properties/inventory/:id
 * @desc    Developer deletes inventory unit
 */
exports.deleteInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const developerId = req.user._id;

        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory not found"
            });
        }

        if (inventory.developerId.toString() !== developerId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to delete this inventory"
            });
        }

        await Inventory.findByIdAndDelete(id);

        // Update property total units
        const totalInventory = await Inventory.countDocuments({ propertyId: inventory.propertyId });
        await Property.findByIdAndUpdate(inventory.propertyId, { totalInventory });

        return res.status(200).json({
            success: true,
            message: "Inventory deleted successfully"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// =========================
// INVENTORY ACTIONS (Reserve, Book, Release)
// =========================

/**
 * @route   POST /api/properties/inventory/:id/reserve
 * @desc    Reserve a unit
 */
exports.reserveUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { customerId, expiryDays } = req.body;

        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory not found"
            });
        }

        if (inventory.status !== "available") {
            return res.status(400).json({
                success: false,
                message: `Unit is already ${inventory.status}`
            });
        }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (expiryDays || 7));

        inventory.status = "reserved";
        inventory.reservedBy = userId;
        inventory.reservedAt = new Date();
        inventory.reservationExpiresAt = expiryDate;

        await inventory.save();

        return res.status(200).json({
            success: true,
            message: "Unit reserved successfully",
            data: {
                unitNumber: inventory.unitNumber,
                status: inventory.status,
                reservedUntil: expiryDate
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
 * @route   POST /api/properties/inventory/:id/book
 * @desc    Book a unit
 */
exports.bookUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { customerId, downPayment, paymentPlan } = req.body;

        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory not found"
            });
        }

        if (inventory.status !== "reserved" && inventory.status !== "available") {
            return res.status(400).json({
                success: false,
                message: `Unit cannot be booked. Current status: ${inventory.status}`
            });
        }

        inventory.status = "booked";
        inventory.bookedBy = userId;
        inventory.bookedByCustomer = customerId;
        inventory.bookedAt = new Date();
        inventory.downPayment = downPayment || 0;
        inventory.downPaymentPaid = true;
        inventory.downPaymentPaidAt = new Date();
        inventory.paymentPlan = paymentPlan || "";

        await inventory.save();

        return res.status(200).json({
            success: true,
            message: "Unit booked successfully",
            data: inventory
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/properties/inventory/:id/release
 * @desc    Release a reserved unit
 */
exports.releaseUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory not found"
            });
        }

        if (inventory.status !== "reserved") {
            return res.status(400).json({
                success: false,
                message: `Unit cannot be released. Current status: ${inventory.status}`
            });
        }

        inventory.status = "available";
        inventory.reservedBy = null;
        inventory.reservedAt = null;
        inventory.reservationExpiresAt = null;

        await inventory.save();

        return res.status(200).json({
            success: true,
            message: "Unit released successfully",
            data: inventory
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/properties/inventory/:id/sold
 * @desc    Mark unit as sold
 */
exports.markAsSold = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { salePrice, commissionAmount } = req.body;

        const inventory = await Inventory.findById(id);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory not found"
            });
        }

        if (inventory.status !== "booked") {
            return res.status(400).json({
                success: false,
                message: `Unit cannot be marked as sold. Current status: ${inventory.status}`
            });
        }

        inventory.status = "sold";
        inventory.soldBy = userId;
        inventory.soldAt = new Date();
        inventory.salePrice = salePrice || inventory.price;
        inventory.commissionAmount = commissionAmount || 0;

        await inventory.save();

        // Update property sold units count
        const soldCount = await Inventory.countDocuments({ propertyId: inventory.propertyId, status: "sold" });
        await Property.findByIdAndUpdate(inventory.propertyId, { soldUnits: soldCount });

        return res.status(200).json({
            success: true,
            message: "Unit marked as sold successfully",
            data: inventory
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};