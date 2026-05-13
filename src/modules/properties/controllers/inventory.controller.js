// controllers/inventoryController.js

const Inventory = require("../models/property.inventory.model");
const Property = require("../models/property.model");
const mongoose = require("mongoose");
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
        const { propertyId, units } = req.body;

        console.log("=== CREATE INVENTORY ===");
        console.log("developerId:", developerId);
        console.log("propertyId:", propertyId);
        console.log("units:", JSON.stringify(units, null, 2));

        // Validate required fields
        if (!propertyId || !units || !Array.isArray(units) || units.length === 0) {
            return res.status(400).json({
                success: false,
                message: "propertyId and units array are required"
            });
        }

        // Check if property exists and belongs to developer
        const property = await Property.findOne({ 
            _id: propertyId,
            $or: [
                { developer: developerId },
                { developerId: developerId },
                { createdBy: developerId }
            ]
        });

        if (!property) {
            console.log("Property not found. propertyId:", propertyId, "developerId:", developerId);
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        if (property.propertySubType !== "off_plan") {
            return res.status(400).json({
                success: false,
                message: "Inventory can only be added for off-plan properties"
            });
        }

        const createdUnits = [];
        const skippedUnits = [];

        for (const unit of units) {
            // Validate unit has required fields
            if (!unit.unitNumber) {
                skippedUnits.push({ unit, reason: "Missing unitNumber" });
                continue;
            }

            // Check for duplicate unit number in same property
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
                currency: unit.currency || "AED",
                hasView: unit.hasView || false,
                viewType: unit.viewType || [],
                parkingSpaces: unit.parkingSpaces || 0,
                furnishing: unit.furnishing || "unfurnished",
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

        // Update property total units
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
        
        // Handle duplicate key error
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
                    currency: unit.currency || "AED",
                    hasView: unit.hasView || false,
                    viewType: unit.viewType || [],
                    parkingSpaces: unit.parkingSpaces || 0,
                    furnishing: unit.furnishing || "unfurnished",
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

        const total = await Inventory.countDocuments(query);
        const inventory = await Inventory.find(query)
            .sort({ floorNumber: 1, unitNumber: 1 })
            .skip(skip)
            .limit(limit);

        // Get counts by status
        const counts = {
            totalUnits: await Inventory.countDocuments({ propertyId }),
            byStatus: {
                available: await Inventory.countDocuments({ propertyId, status: "available" }),
                reserved: await Inventory.countDocuments({ propertyId, status: "reserved" }),
                booked: await Inventory.countDocuments({ propertyId, status: "booked" }),
                sold: await Inventory.countDocuments({ propertyId, status: "sold" })
            },
            byUnitType: {}
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

        return res.status(200).json({
            success: true,
            data: inventory,
            counts: counts,
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

    const inventory = await Inventory.findById(unitId);

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Unit not found"
      });
    }

    return res.status(200).json({
      success: true,
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

        const updatedInventory = await Inventory.findByIdAndUpdate(
            id,
            { ...req.body },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Inventory updated successfully",
            data: updatedInventory
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