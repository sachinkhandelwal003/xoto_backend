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
      .populate("agent", "first_name last_name email phone_number")
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
/* ======================
CREATE SITE VISIT WITH AM/PM TIME
====================== */
export const createSiteVisit = async (req, res) => {
  try {
    const { 
      lead: leadId, 
      property: propertyId, 
      interestId,
      scheduledDate,
      visitTime, // This will be like "02:30 PM"
      visitDate 
    } = req.body;

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

    // Create date object from scheduledDate or visitDate
    let finalScheduledDate = scheduledDate || visitDate;
    
    // If we have both date and time, combine them
    if (finalScheduledDate && visitTime) {
      // Model will handle combining in pre-save hook
    }

    // Create site visit
    const visit = await SiteVisit.create({
      lead: leadId,
      agent: req.body.agent || lead.agent,
      property: propertyId,
      developer: property.developer,
      interestId: interestId || null,
      requestedDate: new Date(),
      scheduledDate: finalScheduledDate,
      visitTime: visitTime, // "02:30 PM" format
      clientName: req.body.clientName || `${lead.name.first_name} ${lead.name.last_name}`,
      clientPhone: req.body.clientPhone || lead.phone_number,
      status: "requested",
      reminderPreferences: {
        sendReminder: true,
        reminderHours: [24, 2],
        preferredMethods: ["sms", "whatsapp"]
      }
    });

    // Schedule reminders
    await visit.scheduleReminders();

    // Update lead status
    await Lead.findByIdAndUpdate(
      leadId,
      {
        status: "visit",
        lastActivity: "Site visit requested"
      }
    );

    // Update LeadInterest if interestId provided
    if (interestId) {
      await LeadInterest.findByIdAndUpdate(interestId, {
        site_visit_requested: true,
        site_visit: visit._id,
        site_visit_requested_at: new Date(),
        $inc: { engagement_score: 30 }
      });
    }

    res.json({
      success: true,
      message: "Site visit created successfully",
      data: {
        ...visit.toObject(),
        formattedTime: visit.formatTime(),
        formattedDateTime: visit.formattedDateTime
      }
    });

  } catch (error) {
    console.error("Error creating site visit:", error);
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
    const { page = 1, limit = 10, status, agentId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (status) query.status = status;
    if (agentId) query.agent = agentId;

    const total = await SiteVisit.countDocuments(query);
    const visits = await SiteVisit.find(query)
      .populate("lead", "name email phone_number")
      .populate("agent", "first_name last_name email")
      .populate("property")
      .populate("developer", "name")
      .populate("adminApprovedBy", "email")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: visits.length,
      total,
      data: visits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
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
GET SITE VISIT BY ID
====================== */
export const getSiteVisitById = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id)
      .populate("lead")
      .populate("agent", "first_name last_name email")
      .populate("property")
      .populate("developer", "name")
      .populate("interestId");

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    // Add virtual fields
    const visitObj = visit.toObject();
    visitObj.hoursUntilVisit = visit.hoursUntilVisit;
    visitObj.needsReminder = visit.needsReminder;

    res.json({
      success: true,
      data: visitObj
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
        adminApprovedBy: req.body.adminId,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    // Reschedule reminders with new date
    await visit.scheduleReminders();

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
    
    const validStatuses = ["requested", "approved", "scheduled", "completed", "cancelled", "no_show"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    // Handle different status updates
    if (status === "completed") {
      await visit.complete({ feedback, interestScore, liked, disliked, objections });
      
      // Update lead based on interest score
      if (interestScore >= 7) {
        await Lead.findByIdAndUpdate(visit.lead, {
          status: "deal",
          lastActivity: "Site visit completed - High interest"
        });

        // Update LeadInterest if exists
        if (visit.interestId) {
          await LeadInterest.findByIdAndUpdate(visit.interestId, {
            conversion_stage: "site_visit_completed",
            $inc: { engagement_score: 40 }
          });
        }
      } else {
        await Lead.findByIdAndUpdate(visit.lead, {
          lastActivity: "Site visit completed - Moderate interest"
        });
      }
    } 
    else if (status === "cancelled") {
      visit.status = "cancelled";
      visit.cancellationReason = feedback || "Cancelled";
      visit.cancelledAt = new Date();
      await visit.save();

      // Update lead status back to lead
      await Lead.findByIdAndUpdate(visit.lead, {
        status: "lead",
        lastActivity: "Site visit cancelled"
      });
    }
    else {
      // Simple status update
      visit.status = status;
      if (feedback) visit.feedback = feedback;
      await visit.save();
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
RESCHEDULE SITE VISIT
====================== */
export const rescheduleSiteVisit = async (req, res) => {
  try {
    const { newDate, reason, rescheduledBy } = req.body;

    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Site visit not found"
      });
    }

    await visit.reschedule(new Date(newDate), reason, rescheduledBy);

    res.json({
      success: true,
      message: "Site visit rescheduled successfully",
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
      .populate("property", "propertyName price")
      .populate("agent", "first_name last_name")
      .sort({ scheduledDate: -1 });

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
      .populate("lead", "name")
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
CHECK REMINDERS (Cron Job)
====================== */
export const checkReminders = async (req, res) => {
  try {
    const visitsNeedingReminders = await SiteVisit.findVisitsNeedingReminders();
    const remindersSent = [];

    for (const visit of visitsNeedingReminders) {
      const reminderIndex = visit.reminders.findIndex(r => r.status === "pending");
      if (reminderIndex !== -1) {
        // Here you would actually send the reminder via SMS/Email/WhatsApp
        console.log(`Sending reminder for visit ${visit._id}`);
        await visit.markReminderSent(reminderIndex);
        remindersSent.push(visit._id);
      }
    }

    res.json({
      success: true,
      message: `Processed ${remindersSent.length} reminders`,
      data: remindersSent
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};