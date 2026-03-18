import mongoose from "mongoose";
import Lead from "../models/AgentLeaad.js";
import SiteVisit from "../models/SiteVisit.js";
import Property from "../../properties/models/PropertyModel.js";
import LeadInterest from "../models/LeadInterest.js";

/* ======================
CREATE LEAD (FR-A40)
====================== */
export const createLead = async (req, res) => {
  try {
    const agentId = req.body.agent;
    const { name, phone_number, project, aiSuggestions } = req.body;

    // Validation
    if (!name?.first_name || !name?.last_name || !phone_number) {
      return res.status(400).json({
        success: false,
        message: "First name, last name and phone number are required"
      });
    }

    // Duplicate check
    const duplicate = await Lead.findOne({
      phone_number: phone_number,
      agent: agentId,
      isDeleted: false
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Lead with this phone number already exists"
      });
    }

    // Fetch developer from property
    let developerId = null;
    if (project) {
      const property = await Property.findById(project);
      if (property) {
        developerId = property.developer;
      }
    }

    // Create lead
    const lead = await Lead.create({
      ...req.body,
      agent: agentId,
      developer: developerId,
      status: req.body.status || "customer"
    });

    // ✅ Store AI suggestions as LeadInterests
    let createdInterests = [];
    if (aiSuggestions && aiSuggestions.length > 0) {
      const interestPromises = aiSuggestions.map(suggestion => 
        LeadInterest.create({
          lead: lead._id,
          property: suggestion.property._id,
          developer: suggestion.property.developerId,
          agent: agentId,
          interest_source: "ai_suggested",
          ai_match: {
            score: suggestion.matchScore,
            reasons: suggestion.matchReasons,
            factors: suggestion.matchFactors,
            generated_at: new Date()
          },
          conversion_stage: "interest",
          engagement_score: suggestion.matchScore
        })
      );
      
      createdInterests = await Promise.all(interestPromises);
    }

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: {
        lead,
        interests: createdInterests
      }
    });

  } catch (error) {
    console.error("Error in createLead:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET ALL LEADS (with filters)
====================== */
export const getAllLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { developer, agent, status, search } = req.query;

    let query = { isDeleted: false };

    // Filters
    if (developer) query.developer = developer;
    if (agent) query.agent = agent;
    if (status) query.status = status;

    // Search by name or phone
    if (search) {
      query.$or = [
        { "name.first_name": { $regex: search, $options: "i" } },
        { "name.last_name": { $regex: search, $options: "i" } },
        { phone_number: { $regex: search, $options: "i" } }
      ];
    }

    // Total count
    const total = await Lead.countDocuments(query);

    // Paginated data
    const leads = await Lead.find(query)
      .populate("agent", "first_name last_name email")
      .populate("project", "propertyName")
      .populate("developer", "name")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Leads fetched successfully",
      count: leads.length,
      data: leads,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET LEAD BY ID WITH INTERESTS
====================== */
export const getLeadById = async (req, res) => {
  try {
    const id = req.params.id;
    const { includeInterests } = req.query; // Optional query param to include interests

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      });
    }

    // Fetch lead data
    const lead = await Lead.findById(id)
      .populate("agent", "first_name last_name email phone_number")
      .populate("project", "propertyName price")
      .populate("developer", "name");

    if (!lead || lead.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    // Prepare response object
    const response = {
      success: true,
      data: {
        lead: lead
      }
    };

    // If includeInterests=true, fetch all lead interests
    if (includeInterests === 'true') {
      const LeadInterest = mongoose.model('LeadInterest');
      
      const interests = await LeadInterest.find({ 
        lead: id,
        is_active: true,
        is_deleted: false 
      })
        .populate("property")
        .populate("developer", "name")
        .populate("site_visit")
        .sort({ 
          is_selected: -1,
          engagement_score: -1,
          createdAt: -1 
        });

      // Add virtual fields to each interest
      const enhancedInterests = interests.map(interest => {
        const interestObj = interest.toObject();
        interestObj.is_hot = interest.is_hot;
        interestObj.conversion_probability = interest.conversion_probability;
        return interestObj;
      });

      // Add interests to response
      response.data.interests = enhancedInterests;
      
      // Add analytics
      response.data.analytics = {
        totalInterests: interests.length,
        hotLeads: interests.filter(i => i.is_hot).length,
        selectedProperty: interests.find(i => i.is_selected) || null,
        stageBreakdown: {
          interest: interests.filter(i => i.conversion_stage === "interest").length,
          brochure_sent: interests.filter(i => i.conversion_stage === "brochure_sent").length,
          viewed: interests.filter(i => i.conversion_stage === "viewed").length,
          site_visit_requested: interests.filter(i => i.conversion_stage === "site_visit_requested").length,
          site_visit_completed: interests.filter(i => i.conversion_stage === "site_visit_completed").length,
          deal: interests.filter(i => i.conversion_stage === "deal").length
        }
      };
    }

    return res.json(response);

  } catch (error) {
    console.error("Error in getLeadById:", error);
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      });
    }

    // If project is updated, update developer
    let updateData = { ...req.body };
    
    if (req.body.project) {
      const property = await Property.findById(req.body.project);
      if (property) {
        updateData.developer = property.developer;
      }
    }

    const updatedLead = await Lead.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: updateData },
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
DELETE LEAD (Soft Delete)
====================== */
export const deleteLead = async (req, res) => {
  try {
    const deleted = await Lead.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
        lastActivity: "Lead deleted"
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
      message: "Lead deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
UPDATE LEAD STATUS (FR-A42)
====================== */
export const updateLeadStatus = async (req, res) => {
  try {
    const { status, dealValue } = req.body;
    const validStatuses = ["customer", "lead", "visit", "deal", "booking", "closed", "lost"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    const lead = await Lead.findById(req.params.id).populate("project");

    if (!lead || lead.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    let commissionAmount = lead.commission || 0;

    // Calculate commission only for deal/booking/closed stages
    if (status === "deal" || status === "booking" || status === "closed") {
      if (lead.project) {
        const property = await Property.findById(lead.project);
        if (property) {
          if (property.commissionType === "percentage") {
            commissionAmount = (dealValue * property.commission) / 100;
          } else {
            commissionAmount = property.commission;
          }
        }
      }
    }

    lead.status = status;
    lead.dealValue = dealValue || lead.dealValue;
    lead.commission = commissionAmount;
    lead.lastActivity = `Status updated to ${status}`;

    // Set timestamps for specific statuses
    if (status === "lost") lead.lostAt = new Date();
    if (status === "closed") lead.convertedAt = new Date();

    await lead.save();

    res.json({
      success: true,
      message: `Lead status updated to ${status}`,
      data: lead
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
CREATE SITE VISIT (FR-A50)
====================== */
export const createSiteVisit = async (req, res) => {
  try {
    const { lead: leadId, property: propertyId } = req.body;

    // Check lead exists
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    // Check property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found"
      });
    }

    // Get developer from property
    const developerId = property.developer;

    // Create site visit
    const visit = await SiteVisit.create({
      lead: leadId,
      agent: req.body.agent || lead.agent,
      property: propertyId,
      developer: developerId,
      requestedDate: req.body.visitDate || new Date(),
      visitTime: req.body.visitTime,
      clientName: req.body.clientName || `${lead.name.first_name} ${lead.name.last_name}`,
      clientPhone: req.body.clientPhone || lead.phone_number,
      status: "requested"
    });

    // Update lead status to "visit"
    await Lead.findByIdAndUpdate(
      leadId,
      {
        status: "visit",
        siteVisit: visit._id,
        lastActivity: "Site visit requested"
      }
    );

    res.json({
      success: true,
      message: "Site visit created successfully",
      data: visit
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET ALL SITE VISITS
====================== */
export const getAllSiteVisits = async (req, res) => {
  try {
    const visits = await SiteVisit.find({})
      .populate("lead")
      .populate("agent", "first_name last_name email")
      .populate("property", "propertyName")
      .populate("developer", "name")
      .populate("adminApprovedBy", "email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: visits.length,
      data: visits
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET SITE VISIT BY ID
====================== */
export const getSiteVisitById = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id)
      .populate("lead")
      .populate("agent", "first_name last_name email")
      .populate("property", "propertyName price")
      .populate("developer", "name");

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    res.json({
      success: true,
      data: visit
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
APPROVE SITE VISIT (Admin)
====================== */
export const approveSiteVisit = async (req, res) => {
  try {
    const visit = await SiteVisit.findByIdAndUpdate(
      req.params.id,
      {
        status: "scheduled",
        scheduledDate: req.body.scheduledDate,
        adminApprovedBy: req.body.adminId
      },
      { new: true }
    );

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    res.json({
      success: true,
      message: "Site visit approved and scheduled",
      data: visit
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
UPDATE SITE VISIT STATUS
====================== */
export const updateSiteVisitStatus = async (req, res) => {
  try {
    const { status, feedback, interestScore, liked, disliked, objections } = req.body;
    
    const validStatuses = ["requested", "approved", "scheduled", "completed", "cancelled"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    const visit = await SiteVisit.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        feedback,
        interestScore,
        liked,
        disliked,
        objections
      },
      { new: true }
    );

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    // If visit completed, update lead with feedback
    if (status === "completed") {
      await Lead.findByIdAndUpdate(
        visit.lead,
        {
          visitFeedback: feedback,
          lastActivity: "Site visit completed",
          // If high interest, move to deal stage
          ...(interestScore >= 7 && { status: "deal" })
        }
      );
    }

    res.json({
      success: true,
      message: `Site visit status updated to ${status}`,
      data: visit
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET SITE VISITS BY LEAD
====================== */
export const getSiteVisitsByLead = async (req, res) => {
  try {
    const visits = await SiteVisit.find({ lead: req.params.leadId })
      .populate("property", "propertyName")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: visits.length,
      data: visits
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET SITE VISITS BY AGENT
====================== */
export const getSiteVisitsByAgent = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await SiteVisit.countDocuments({ agent: req.params.agentId });

    const visits = await SiteVisit.find({ agent: req.params.agentId })
      .populate("lead")
      .populate("property", "propertyName")
      .skip(skip)
      .limit(limit)
      .sort({ scheduledDate: -1 });

    res.json({
      success: true,
      data: visits,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
CANCEL SITE VISIT
====================== */
export const cancelSiteVisit = async (req, res) => {
  try {
    const { reason } = req.body;

    const visit = await SiteVisit.findByIdAndUpdate(
      req.params.id,
      {
        status: "cancelled",
        feedback: reason || "Cancelled by agent/client"
      },
      { new: true }
    );

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    // Update lead status back to lead
    await Lead.findByIdAndUpdate(
      visit.lead,
      {
        status: "lead",
        lastActivity: "Site visit cancelled"
      }
    );

    res.json({
      success: true,
      message: "Site visit cancelled",
      data: visit
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};