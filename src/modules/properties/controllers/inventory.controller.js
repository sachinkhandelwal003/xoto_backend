// controllers/inventoryController.js

const Inventory = require("../models/property.inventory.model");
const Property = require("../models/property.model");

/**
 * @route   POST /api/developer/inventory/create
 * @desc    Developer creates inventory for off-plan property
 */
exports.createInventory = async (req, res) => {
    try {
        const developerId = req.user._id;
        const { propertyId, units } = req.body;

        // Check if property exists and belongs to developer
        const property = await Property.findOne({ _id: propertyId, developer: developerId });
        if (!property) {
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

        for (const unit of units) {
            const existingUnit = await Inventory.findOne({
                propertyId,
                unitNumber: unit.unitNumber
            });

            if (existingUnit) {
                continue; // Skip duplicate unit numbers
            }

            const newUnit = await Inventory.create({
                propertyId,
                developerId,
                unitNumber: unit.unitNumber,
                buildingName: unit.buildingName || "",
                floorNumber: unit.floorNumber || 0,
                unitType: unit.unitType,
                bedroomType: unit.bedroomType,
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
                status: "available"
            });

            createdUnits.push(newUnit);
        }

        // Update property total units
        const totalInventory = await Inventory.countDocuments({ propertyId });
        await Property.findByIdAndUpdate(propertyId, { totalInventory });

        return res.status(201).json({
            success: true,
            message: `${createdUnits.length} units added to inventory`,
            data: createdUnits
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   POST /api/developer/inventory/bulk-import
 * @desc    Developer bulk imports inventory via Excel/CSV
 */
exports.bulkImportInventory = async (req, res) => {
    try {
        const developerId = req.user._id;
        const { propertyId, units } = req.body;

        const property = await Property.findOne({ _id: propertyId, developer: developerId });
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
                const existingUnit = await Inventory.findOne({
                    propertyId,
                    unitNumber: unit.unitNumber
                });

                if (existingUnit) {
                    errors.push({ row: i + 1, unitNumber: unit.unitNumber, error: "Unit number already exists" });
                    continue;
                }

                const newUnit = await Inventory.create({
                    propertyId,
                    developerId,
                    unitNumber: unit.unitNumber,
                    buildingName: unit.buildingName || "",
                    floorNumber: unit.floorNumber || 0,
                    unitType: unit.unitType,
                    bedroomType: unit.bedroomType,
                    bedrooms: unit.bedrooms || 0,
                    bathrooms: unit.bathrooms || 0,
                    area: unit.area,
                    areaUnit: unit.areaUnit || "sqft",
                    price: unit.price,
                    currency: unit.currency || "AED",
                    status: "available"
                });

                createdUnits.push(newUnit);
            } catch (err) {
                errors.push({ row: i + 1, unitNumber: unit.unitNumber, error: err.message });
            }
        }

        // Update property total units
        const totalInventory = await Inventory.countDocuments({ propertyId });
        await Property.findByIdAndUpdate(propertyId, { totalInventory });

        return res.status(201).json({
            success: true,
            message: `${createdUnits.length} units imported successfully`,
            data: { created: createdUnits, errors: errors }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   GET /api/developer/inventory/:propertyId
 * @desc    Developer gets inventory by property
 */
exports.getInventoryByProperty = async (req, res) => {
    try {
        const { propertyId } = req.params;
        const developerId = req.user._id;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status; // available, reserved, booked, sold

        const property = await Property.findOne({ _id: propertyId, developer: developerId });
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you don't have permission"
            });
        }

        let query = { propertyId };
        if (status) query.status = status;

        const total = await Inventory.countDocuments(query);
        const inventory = await Inventory.find(query)
            .sort({ floorNumber: 1, unitNumber: 1 })
            .skip(skip)
            .limit(limit);

        // Get counts by status
        const counts = {
            total: await Inventory.countDocuments({ propertyId }),
            available: await Inventory.countDocuments({ propertyId, status: "available" }),
            reserved: await Inventory.countDocuments({ propertyId, status: "reserved" }),
            booked: await Inventory.countDocuments({ propertyId, status: "booked" }),
            sold: await Inventory.countDocuments({ propertyId, status: "sold" })
        };

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
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * @route   PUT /api/developer/inventory/:id
 * @desc    Developer updates inventory unit
 */
exports.updateInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const developerId = req.user._id;

        const inventory = await Inventory.findById(id).populate("propertyId");
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
 * @route   DELETE /api/developer/inventory/:id
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
 * @route   POST /api/inventory/:id/reserve
 * @desc    Agent reserves a unit
 */
exports.reserveUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = req.user._id;
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
        inventory.reservedBy = agentId;
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
 * @route   POST /api/inventory/:id/book
 * @desc    Agent books a unit (after payment)
 */
exports.bookUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = req.user._id;
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
        inventory.bookedBy = agentId;
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
 * @route   POST /api/inventory/:id/release
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
 * @route   POST /api/inventory/:id/sold
 * @desc    Mark unit as sold (after full payment)
 */
exports.markAsSold = async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = req.user._id;
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
        inventory.soldBy = agentId;
        inventory.soldAt = new Date();
        inventory.salePrice = salePrice || inventory.price;
        inventory.commissionAmount = commissionAmount || 0;

        await inventory.save();

        // Update property sold units count
        const property = await Property.findById(inventory.propertyId);
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