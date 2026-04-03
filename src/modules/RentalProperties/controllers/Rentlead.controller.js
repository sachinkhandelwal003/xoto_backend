const RentalLead = require("../models/Rentlead.model");
const RentalProperty = require("../models/Rentproperty.model");

// ─── HELPER ──────────────────────────────────────────────────────────────────
const formatLead = (lead) => {
  const obj = lead.toObject ? lead.toObject() : lead;
  return {
    ...obj,
    statusLabel: {
      new: "New Lead",
      assigned: "Assigned",
      contacted: "Contacted",
      closed: "Closed",
      lost: "Lost",
    }[obj.status] || obj.status,
    statusColor: {
      new: "blue",
      assigned: "purple",
      contacted: "orange",
      closed: "green",
      lost: "red",
    }[obj.status] || "default",
  };
};

// ─── CREATE LEAD ─────────────────────────────────────────────────────────────
// Called when customer clicks "Contact" on a listing
// POST /rental/lead/create
exports.createLead = async (req, res) => {
  try {
    const { propertyId } = req.body;

    // req.user comes from auth middleware (JWT decoded)
    const customerId = req.user._id;
    const customerName = req.user.name || req.user.fullName || "";
    const customerEmail = req.user.email || "";
    const customerPhone = req.user.phone || req.user.mobile || "";

    // Fetch property details for denormalization
    const property = await RentalProperty.findById(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    // Check for existing lead (customer already contacted this property)
    const existing = await RentalLead.findOne({
      property: propertyId,
      customer: customerId,
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        message: "You have already shown interest in this property. Our agent will contact you soon.",
        data: formatLead(existing),
      });
    }

    const lead = new RentalLead({
      property: propertyId,
      propertyTitle: property.title,
      propertyArea: property.location?.area || "",
      propertyEmirate: property.emirate || "",
      propertyPrice: property.price || 0,

      customer: customerId,
      customerName,
      customerEmail,
      customerPhone,

      status: "new",
    });

    await lead.save();

    res.status(201).json({
      success: true,
      message: "Your interest has been recorded. An agent will contact you shortly.",
      data: formatLead(lead),
    });
  } catch (err) {
    // Duplicate key (race condition) — treat as existing
    if (err.code === 11000) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        message: "You have already shown interest in this property.",
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET ALL LEADS (ADMIN) ────────────────────────────────────────────────────
// GET /rental/lead/all
exports.getLeads = async (req, res) => {
  try {
    let { page = 1, limit = 10, status, search, assignedAgent } = req.query;

    page = Math.max(1, Number(page));
    limit = Math.min(50, Math.max(1, Number(limit)));

    const filter = {};

    if (status) filter.status = status;
    if (assignedAgent === "unassigned") filter.assignedAgent = null;
    else if (assignedAgent) filter.assignedAgent = assignedAgent;

    if (search) {
      const rx = { $regex: search, $options: "i" };
      filter.$or = [
        { propertyTitle: rx },
        { customerName: rx },
        { customerEmail: rx },
        { propertyArea: rx },
        { propertyEmirate: rx },
      ];
    }

    const total = await RentalLead.countDocuments(filter);
    const leads = await RentalLead.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("assignedAgent", "name email")
      .lean();

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: leads.map(formatLead),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET SINGLE LEAD ─────────────────────────────────────────────────────────
// GET /rental/lead/:id
exports.getSingleLead = async (req, res) => {
  try {
    const lead = await RentalLead.findById(req.params.id)
      .populate("assignedAgent", "name email phone")
      .lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.json({ success: true, data: formatLead(lead) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── ASSIGN AGENT ────────────────────────────────────────────────────────────
// PUT /rental/lead/:id/assign
exports.assignAgent = async (req, res) => {
  try {
    const { agentId, agentName } = req.body;

    const lead = await RentalLead.findByIdAndUpdate(
      req.params.id,
      {
        assignedAgent: agentId,
        assignedAgentName: agentName || "",
        assignedAt: new Date(),
        status: "assigned",
      },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.json({
      success: true,
      message: `Lead assigned to ${agentName || "agent"} successfully`,
      data: formatLead(lead),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── UPDATE STATUS ────────────────────────────────────────────────────────────
// PUT /rental/lead/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const update = { status };
    if (notes !== undefined) update.notes = notes;

    const lead = await RentalLead.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.json({ success: true, message: "Status updated", data: formatLead(lead) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
// DELETE /rental/lead/:id
exports.deleteLead = async (req, res) => {
  try {
    const lead = await RentalLead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    res.json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};