// controllers/SiteVisitController.js
const mongoose = require("mongoose");
const SiteVisit = require("../models/SiteVisit");
const Lead = require("../models/AgentLeaad");
const LeadInterest = require("../models/LeadInterest");
const Property = require("../../properties/models/property.model");

/**
 * CREATE SITE VISIT
 * POST /api/lead/create-site-visit
 */
exports.createSiteVisit = async (req, res) => {
  try {
    const { lead: leadId, property: propertyId, interestId, scheduledDate, visitTime, notes } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ success: false, message: "Property not found" });

    const visit = await SiteVisit.create({
      lead: leadId,
      agent: lead.agent,
      property: propertyId,
      developer: property.developer,
      interestId: interestId || null,
      requestedDate: new Date(),
      scheduledDate,
      visitTime,
      clientName: lead.customer ? `${lead.customer.first_name} ${lead.customer.last_name}` : "",
      clientPhone: lead.phone_number,
      notes: notes || "",
      status: "requested"
    });

    await visit.scheduleReminders();

    // Update Lead
    await Lead.findByIdAndUpdate(leadId, { status: "visit", lastActivity: "Site visit requested" });

    // Update LeadInterest
    if (interestId) {
      await LeadInterest.findByIdAndUpdate(interestId, {
        site_visit_requested: true,
        site_visit: visit._id,
        site_visit_requested_at: new Date(),
        conversion_stage: "site_visit_requested",
        $inc: { engagement_score: 30 }
      });
    }

    return res.json({
      success: true,
      message: "Site visit created",
      data: { ...visit.toObject(), formattedDateTime: visit.formattedDateTime }
    });

  } catch (error) {
    console.error("Create Site Visit Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * APPROVE SITE VISIT (Admin)
 * POST /api/lead/approve-site-visit/:id
 */
exports.approveSiteVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate, adminId } = req.body;

    const visit = await SiteVisit.findByIdAndUpdate(
      id,
      { status: "scheduled", scheduledDate, adminApprovedBy: adminId, approvedAt: new Date() },
      { new: true }
    );

    if (!visit) return res.status(404).json({ success: false, message: "Site visit not found" });

    await visit.scheduleReminders();

    return res.json({ success: true, message: "Site visit approved", data: visit });

  } catch (error) {
    console.error("Approve Site Visit Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * UPDATE SITE VISIT STATUS (with feedback)
 * POST /api/lead/update-site-visit/:id
 */
exports.updateSiteVisitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback, interestScore, liked, disliked, objections, questions } = req.body;

    const visit = await SiteVisit.findById(id);
    if (!visit) return res.status(404).json({ success: false, message: "Site visit not found" });

    if (status === "completed") {
      await visit.complete({ feedback, interestScore, liked, disliked, objections, questions });

      // Update Lead based on interest score
      if (interestScore >= 7) {
        await Lead.findByIdAndUpdate(visit.lead, {
          status: "deal",
          lastActivity: `Site visit completed - High interest (${interestScore}/10)`
        });
        if (visit.interestId) {
          await LeadInterest.findByIdAndUpdate(visit.interestId, {
            conversion_stage: "site_visit_completed",
            $inc: { engagement_score: 40 }
          });
        }
      } else if (interestScore >= 4) {
        await Lead.findByIdAndUpdate(visit.lead, {
          status: "lead",
          lastActivity: `Site visit completed - Moderate interest (${interestScore}/10)`
        });
      } else {
        await Lead.findByIdAndUpdate(visit.lead, {
          status: "lead",
          lastActivity: `Site visit completed - Low interest (${interestScore}/10)`
        });
      }
    } else if (status === "cancelled") {
      visit.status = "cancelled";
      visit.cancellationReason = feedback || "Cancelled";
      visit.cancelledAt = new Date();
      await visit.save();
      await Lead.findByIdAndUpdate(visit.lead, { status: "lead", lastActivity: "Site visit cancelled" });
    } else {
      visit.status = status;
      if (feedback) visit.feedback = feedback;
      await visit.save();
    }

    return res.json({ success: true, message: `Site visit status updated to ${status}`, data: visit });

  } catch (error) {
    console.error("Update Site Visit Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * RESCHEDULE SITE VISIT
 * POST /api/lead/reschedule-site-visit/:id
 */
exports.rescheduleSiteVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const { newDate, reason } = req.body;

    const visit = await SiteVisit.findById(id);
    if (!visit) return res.status(404).json({ success: false, message: "Site visit not found" });

    await visit.reschedule(new Date(newDate), reason, req.user?._id);

    return res.json({ success: true, message: "Site visit rescheduled", data: visit });

  } catch (error) {
    console.error("Reschedule Site Visit Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET SITE VISITS BY LEAD
 * GET /api/lead/by-lead/:leadId
 */
exports.getSiteVisitsByLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    const visits = await SiteVisit.find({ lead: leadId })
      .populate("property", "propertyName price")
      .populate("agent", "first_name last_name")
      .sort({ scheduledDate: -1 });

    return res.json({ success: true, count: visits.length, data: visits });

  } catch (error) {
    console.error("Get Site Visits Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET SITE VISITS BY AGENT
 * GET /api/lead/by-agent/:agentId
 */
exports.getSiteVisitsByAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await SiteVisit.countDocuments({ agent: agentId });
    const visits = await SiteVisit.find({ agent: agentId })
      .populate("lead", "customer name")
      .populate("property", "propertyName")
      .skip(skip)
      .limit(limit)
      .sort({ scheduledDate: -1 });

    return res.json({
      success: true,
      data: visits,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: page, totalItems: total, limit }
    });

  } catch (error) {
    console.error("Get Agent Site Visits Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET ALL SITE VISITS (Admin)
 * GET /api/lead/get-all-site-visits
 */
exports.getAllSiteVisits = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, agentId } = req.query;

    let query = {};
    if (status) query.status = status;
    if (agentId) query.agent = agentId;

    const total = await SiteVisit.countDocuments(query);
    const visits = await SiteVisit.find(query)
      .populate("lead", "customer name")
      .populate("agent", "first_name last_name email")
      .populate("property", "propertyName")
      .populate("developer", "name")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: visits.length,
      data: visits,
      pagination: { totalPages: Math.ceil(total / limit), currentPage: page, totalItems: total, limit }
    });

  } catch (error) {
    console.error("Get All Site Visits Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET SITE VISIT BY ID
 * GET /api/lead/site-visit/:id
 */
exports.getSiteVisitById = async (req, res) => {
  try {
    const { id } = req.params;
    const visit = await SiteVisit.findById(id)
      .populate("lead", "customer name phone_number")
      .populate("agent", "first_name last_name email")
      .populate("property", "propertyName price area")
      .populate("developer", "name")
      .populate("interestId");

    if (!visit) return res.status(404).json({ success: false, message: "Site visit not found" });

    return res.json({ success: true, data: visit });

  } catch (error) {
    console.error("Get Site Visit Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CHECK REMINDERS (Cron Job)
 * GET /api/lead/check-reminders
 */
exports.checkReminders = async (req, res) => {
  try {
    const now = new Date();
    const visits = await SiteVisit.find({
      status: "scheduled",
      "reminders.status": "pending",
      "reminders.scheduledFor": { $lte: now }
    });

    let remindersSent = 0;
    for (const visit of visits) {
      const pendingReminder = visit.reminders.find(r => r.status === "pending" && r.scheduledFor <= now);
      if (pendingReminder) {
        pendingReminder.status = "sent";
        pendingReminder.sentAt = now;
        await visit.save();
        remindersSent++;
        // Here you would actually send SMS/Email/WhatsApp
        console.log(`Reminder sent for visit ${visit._id}`);
      }
    }

    return res.json({ success: true, message: `Processed ${remindersSent} reminders` });

  } catch (error) {
    console.error("Check Reminders Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

