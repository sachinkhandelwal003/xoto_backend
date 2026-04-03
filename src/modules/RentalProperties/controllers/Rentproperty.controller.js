const RentalProperty = require("../models/Rentproperty.model");

// 🔧 Helper (UI format fix)
const formatProperty = (property) => {
  const obj = property.toObject();
  return {
    ...obj,
    locationString: `${obj.location?.address || ""}, ${obj.location?.area || ""}`,
    available: obj.isImmediate
      ? "Immediate"
      : obj.availableFrom
      ? new Date(obj.availableFrom).toLocaleDateString("en-GB")
      : "",
  };
};

// ✅ CREATE PROPERTY
exports.createProperty = async (req, res) => {
  try {
    const property = new RentalProperty(req.body);
    await property.save();
    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: formatProperty(property),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ GET ALL (FILTER + PAGINATION + FORMAT)
exports.getProperties = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      type,
      bhk,
      emirate,
      area,
      verified,
      isImmediate,   // ← FIXED: was "immediateOnly" but frontend sends "isImmediate"
      amenities,
      sort,
    } = req.query;

    page  = Math.max(1, Number(page));
    limit = Math.min(50, Math.max(1, Number(limit)));

    let filter = {};

    // 💰 Price — frontend sends only maxPrice, so handle both cases
    if (minPrice && maxPrice) {
      filter.price = { $gte: Number(minPrice), $lte: Number(maxPrice) };
    } else if (maxPrice) {
      filter.price = { $lte: Number(maxPrice) };
    } else if (minPrice) {
      filter.price = { $gte: Number(minPrice) };
    }

    // 🏠 Type
    if (type && type !== "All") filter.type = type;

    // 🛏 BHK
    if (bhk && bhk !== "Any") filter.bhk = bhk;

    // 🌍 Emirate
    if (emirate) filter.emirate = emirate;

    // 📍 Area
    if (area) filter["location.area"] = { $regex: area, $options: "i" };

    // ✅ Verified
    if (verified === "true") filter.verified = true;

    // ⚡ Immediate Availability — FIXED (was completely missing)
    if (isImmediate === "true") filter.isImmediate = true;

    // 🧩 Amenities
if (amenities) {
  const arr = amenities.split(",").map((a) => a.trim()).filter(Boolean);
  if (arr.length > 0) filter.amenities = { $in: arr };
}

    // 📊 Sorting
    let sortOption = { createdAt: -1 };
    if (sort === "low")    sortOption = { price: 1 };
    if (sort === "high")   sortOption = { price: -1 };
    if (sort === "rating") sortOption = { rating: -1 };

    const skip = (page - 1) * limit;
    const total = await RentalProperty.countDocuments(filter);
    const properties = await RentalProperty.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const formatted   = properties.map(formatProperty);
    const totalPages  = Math.ceil(total / limit);

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      data: formatted,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ GET SINGLE
exports.getSingleProperty = async (req, res) => {
  try {
    const property = await RentalProperty.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }
    res.json({ success: true, data: formatProperty(property) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ UPDATE
exports.updateProperty = async (req, res) => {
  try {
    const updatedProperty = await RentalProperty.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedProperty) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }
    res.json({
      success: true,
      message: "Property updated successfully",
      data: formatProperty(updatedProperty),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ❌ DELETE
exports.deleteProperty = async (req, res) => {
  try {
    const property = await RentalProperty.findByIdAndDelete(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }
    res.json({ success: true, message: "Property deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};