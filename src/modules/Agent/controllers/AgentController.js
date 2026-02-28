import mongoose from "mongoose";
import Lead from "../models/AgentLeaad.js";


/* ======================
CREATE LEAD
====================== */
export const createLead = async (req, res) => {

  try {

    const {
      name,
      email,
      phone_number,
      requirement_description
    } = req.body;

    const agentid = req.user._id; // JWT se agent ID

    // Validation
    if (
      !name?.first_name ||
      !name?.last_name ||
      !email ||
      !phone_number ||
      !requirement_description
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing"
      });
    }

    // Duplicate Check
    const duplicate = await Lead.findOne({
      $or: [{ email }, { phone_number }]
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Lead already exists"
      });
    }

    // Create
    const lead = await Lead.create({
      name,
      email,
      phone_number,
      requirement_description,
      agent: agentid
    });

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: lead
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};
// get all leads
export const getAllLeads = async (req, res) => {
  try {

    // Query params
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 5;

    const skip = (page - 1) * limit;

    // Total count
    const total = await Lead.countDocuments({
      agent: req.user._id
    });

    // Paginated data
    const leads = await Lead.find({
      agent: req.user._id
    })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: leads
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET LEAD BY ID
====================== */
export const getLeadById = async (req, res) => {

  try {

    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      });
    }

    const lead = await Lead.findOne({
      _id: id,
      agent: req.user._id
    }).populate("agent", "first_name last_name email");

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      data: lead
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ======================
UPDATE LEAD
====================== */
export const updateLead = async (req, res) => {

  try {

    const id = req.params.id;

    const updatedLead = await Lead.findOneAndUpdate(
      { _id: id, agent: req.user._id },
      { $set: req.body },
      { new: true }
    );

    if (!updatedLead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      message: "Lead updated successfully",
      data: updatedLead
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ======================
DELETE LEAD
====================== */
export const deleteLead = async (req, res) => {

  try {

    const deleted = await Lead.findOneAndUpdate(
      {
        _id: req.params.id,
        agent: req.user._id
      },
      {
        isDeleted: true,        // mark deleted
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      message: "Lead deleted successfully" // ✅ message show
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


