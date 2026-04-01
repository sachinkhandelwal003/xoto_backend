// controllers/LeadController.js
const mongoose = require("mongoose");
const Lead = require("../models/AgentLeaad");
const LeadInterest = require("../models/LeadInterest");
const SiteVisit = require("../models/SiteVisit");
const Property = require("../../properties/models/property.model");
const { getPropertySuggestions } = require("./aiSuggestionService");

/**
 * CREATE LEAD with preferences
 * POST /api/lead/create-lead
 */
/**
 * CREATE LEAD with preferences and selected properties
 * POST /api/agent/lead/create-lead
 */
exports.createLead = async (req, res) => {
  try {
    const {
      customer,
      agent,
      name,
      phone_number,
      email,
      budget,
      preferred_location,
      bedrooms,
      property_type,
      area,
      specific_project,
      requirement_description,
      source,
      selected_properties  // Array of property IDs selected by agent
    } = req.body;

    // Validate required fields
    if (!customer || !agent) {
      return res.status(400).json({
        success: false,
        message: "Customer and Agent are required"
      });
    }

    // Check for existing lead
    const existingLead = await Lead.findOne({ customer, isDeleted: false });
    if (existingLead) {
      return res.status(400).json({
        success: false,
        message: "Lead already exists for this customer"
      });
    }

    // Get developer if specific project selected
    let developerId = null;
    if (specific_project) {
      const property = await Property.findOne({ propertyName: specific_project });
      if (property) developerId = property.developer;
    }

    // Create lead with all preferences
    const lead = await Lead.create({
      customer,
      agent,
      name: name || { first_name: "", last_name: "" },
      phone_number: phone_number || "",
      email: email || "",
      budget: budget || { min: 0, max: 0 },
      preferred_location: preferred_location || [],
      bedrooms: bedrooms || { min: 0, max: 0 },
      property_type: property_type || [],
      area: area || { min: 0, max: 0 },
      specific_project: specific_project || "",
      requirement_description: requirement_description || "",
      developer: developerId,
      source: source || "manual",
      status: "customer"
    });

    // Create LeadInterests for selected properties (manually selected by agent)
    let selectedInterests = [];
    if (selected_properties && selected_properties.length > 0) {
      // Verify properties exist before creating interests
      const validProperties = await Property.find({ 
        _id: { $in: selected_properties },
        isAvailable: true,
        approvalStatus: "approved",
        listingStatus: "active"
      });
      
      const validPropertyIds = validProperties.map(p => p._id.toString());
      
      const interestPromises = validPropertyIds.map(propertyId =>
        LeadInterest.create({
          lead: lead._id,
          property: propertyId,
          developer: null,
          agent: agent,
          interest_source: "agent_added",
          conversion_stage: "interest",
          engagement_score: 60,
          notes: "Property selected by agent during lead creation"
        })
      );
      selectedInterests = await Promise.all(interestPromises);
    }

    return res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: {
        lead,
        interests: selectedInterests,
        totalInterests: selectedInterests.length,
        selectedCount: selectedInterests.length
      }
    });

  } catch (error) {
    console.error("Create Lead Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
// controllers/LeadController.js

exports.fetchPropertySuggestions = async (req, res) => {
  try {
    // ✅ Get agent ID from authenticated user
    const agentId = req.user.id || req.user._id;

    const { 
      budget, 
      preferred_location, 
      bedrooms, 
      property_type, 
      area,
      limit = 10,
      page = 1
    } = req.query;

    // Parse query parameters
    let parsedBudget = null;
    let parsedBedrooms = null;
    let parsedArea = null;
    let locations = [];
    let propertyTypes = [];

    try {
      if (budget) parsedBudget = JSON.parse(budget);
      if (bedrooms) parsedBedrooms = JSON.parse(bedrooms);
      if (area) parsedArea = JSON.parse(area);
      if (preferred_location) locations = JSON.parse(preferred_location);
      if (property_type) propertyTypes = JSON.parse(property_type);
    } catch (parseError) {
      console.error("Parse error:", parseError);
    }

    // ========== BUILD QUERIES (Same logic as getAgentProperties) ==========
    
    // Query 1: Agent's own secondary properties (ONLY this agent's)
    let secondaryQuery = { 
      agent: agentId, 
      propertySubType: "secondary",
      approvalStatus: "approved",
      listingStatus: "active"
    };
    
    // Query 2: All approved off-plan properties (from developers)
    let offplanQuery = { 
      propertySubType: "off_plan",
      approvalStatus: "approved",
      listingStatus: "active"
    };

    // ========== APPLY FILTERS ==========
    const commonFilters = {};

    // Budget filter
    if (parsedBudget && (parsedBudget.min || parsedBudget.max)) {
      // For secondary: use price
      secondaryQuery.price = {};
      if (parsedBudget.min) secondaryQuery.price.$gte = parsedBudget.min;
      if (parsedBudget.max) secondaryQuery.price.$lte = parsedBudget.max;
      
      // For off-plan: use price_min (range)
      if (parsedBudget.min) offplanQuery.price_min = { $gte: parsedBudget.min };
      if (parsedBudget.max) offplanQuery.price_min = { ...offplanQuery.price_min, $lte: parsedBudget.max };
    }

    // Bedrooms filter
    if (parsedBedrooms && (parsedBedrooms.min || parsedBedrooms.max)) {
      commonFilters.bedrooms = {};
      if (parsedBedrooms.min) commonFilters.bedrooms.$gte = parsedBedrooms.min;
      if (parsedBedrooms.max) commonFilters.bedrooms.$lte = parsedBedrooms.max;
    }

    // Area filter
    if (parsedArea && (parsedArea.min || parsedArea.max)) {
      // For secondary: use builtUpArea
      secondaryQuery.builtUpArea = {};
      if (parsedArea.min) secondaryQuery.builtUpArea.$gte = parsedArea.min;
      if (parsedArea.max) secondaryQuery.builtUpArea.$lte = parsedArea.max;
      
      // For off-plan: use builtUpArea_min
      offplanQuery.builtUpArea_min = {};
      if (parsedArea.min) offplanQuery.builtUpArea_min.$gte = parsedArea.min;
      if (parsedArea.max) offplanQuery.builtUpArea_min.$lte = parsedArea.max;
    }

    // Location filter
    if (locations && locations.length > 0) {
      commonFilters.area = { $in: locations.map(loc => new RegExp(loc, 'i')) };
    }

    // Property type filter
    if (propertyTypes && propertyTypes.length > 0) {
      commonFilters.unitType = { $in: propertyTypes };
    }

    // Apply common filters to both queries
    Object.assign(secondaryQuery, commonFilters);
    Object.assign(offplanQuery, commonFilters);

    // ========== FETCH PROPERTIES ==========
    let properties = [];
    
    // Fetch agent's own secondary properties
    const secondaryProperties = await Property.find(secondaryQuery)
      .populate("developer", "name email logo")
      .sort({ createdAt: -1 });
    
    properties.push(...secondaryProperties);
    
    // Fetch all approved off-plan properties
    const offplanProperties = await Property.find(offplanQuery)
      .populate("developer", "name email logo")
      .sort({ createdAt: -1 });
    
    properties.push(...offplanProperties);

    // If no properties found
    if (properties.length === 0) {
      return res.json({
        success: true,
        count: 0,
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: 0,
        data: []
      });
    }

    // Preferences for match calculation
    const preferences = {
      budget: parsedBudget,
      preferred_location: locations,
      bedrooms: parsedBedrooms,
      property_type: propertyTypes,
      area: parsedArea
    };

    // Calculate match scores
    const suggestions = properties.map(property => {
      const score = calculateMatchScore(preferences, property);
      const reasons = generateMatchReasons(preferences, property);
      const factors = calculateMatchFactors(preferences, property);

      return {
        property: {
          _id: property._id,
          propertyName: property.propertyName,
          price: property.price || property.price_min,
          price_min: property.price_min,
          price_max: property.price_max,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          builtUpArea: property.builtUpArea || property.builtUpArea_min,
          area: property.area,
          city: property.city,
          unitType: property.unitType,
          developer: property.developer?.name,
          developerId: property.developer?._id,
          mainLogo: property.mainLogo,
          propertySubType: property.propertySubType,
          completionDate: property.completionDate,
          handover: property.handover,
          amenities: property.amenities,
          photos: property.photos
        },
        matchScore: score,
        matchReasons: reasons,
        matchFactors: factors
      };
    });

    // Filter and sort
    const filteredSuggestions = suggestions
      .filter(s => s.matchScore > 30)
      .sort((a, b) => b.matchScore - a.matchScore);

    // Pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedData = filteredSuggestions.slice(startIndex, startIndex + parseInt(limit));

    // ========== GET STATISTICS (Similar to getAgentProperties) ==========
    const stats = {
      secondaryTotal: await Property.countDocuments({ agent: agentId, propertySubType: "secondary", approvalStatus: "approved", listingStatus: "active" }),
      offplanTotal: await Property.countDocuments({ propertySubType: "off_plan", approvalStatus: "approved", listingStatus: "active" })
    };

    return res.json({
      success: true,
      count: paginatedData.length,
      total: filteredSuggestions.length,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(filteredSuggestions.length / parseInt(limit)),
      data: paginatedData,
      stats: stats,
      filters: {
        budget: parsedBudget,
        locations: locations,
        bedrooms: parsedBedrooms,
        property_type: propertyTypes,
        area: parsedArea
      }
    });

  } catch (error) {
    console.error("Fetch Property Suggestions Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
};

function calculateMatchScore(preferences, property) {
  let totalScore = 0;
  let weights = 0;

  // Budget match (40% weight)
  if (preferences.budget && (property.price || property.price_min)) {
    const propertyPrice = property.price || property.price_min;
    if (preferences.budget.min && preferences.budget.max) {
      if (propertyPrice >= preferences.budget.min && propertyPrice <= preferences.budget.max) {
        totalScore += 40;
      } else if (propertyPrice < preferences.budget.min) {
        totalScore += 25;
      } else {
        totalScore += 15;
      }
    } else if (preferences.budget.min) {
      totalScore += propertyPrice >= preferences.budget.min ? 40 : 20;
    }
    weights += 40;
  }

  // Bedrooms match (25% weight)
  if (preferences.bedrooms && property.bedrooms) {
    if (preferences.bedrooms.min && preferences.bedrooms.max) {
      if (property.bedrooms >= preferences.bedrooms.min && property.bedrooms <= preferences.bedrooms.max) {
        totalScore += 25;
      } else if (Math.abs(property.bedrooms - preferences.bedrooms.min) <= 1) {
        totalScore += 15;
      } else {
        totalScore += 5;
      }
    } else if (preferences.bedrooms.min) {
      totalScore += property.bedrooms >= preferences.bedrooms.min ? 25 : 10;
    }
    weights += 25;
  }

  // Location match (20% weight)
  if (preferences.preferred_location && preferences.preferred_location.length > 0 && property.area) {
    const matched = preferences.preferred_location.some(loc =>
      property.area.toLowerCase().includes(loc.toLowerCase())
    );
    totalScore += matched ? 20 : 5;
    weights += 20;
  }

  // Property type match (15% weight)
  if (preferences.property_type && preferences.property_type.length > 0 && property.unitType) {
    const matched = preferences.property_type.some(type =>
      property.unitType.toLowerCase().includes(type.toLowerCase())
    );
    totalScore += matched ? 15 : 5;
    weights += 15;
  }

  return weights > 0 ? Math.round((totalScore / weights) * 100) : 50;
}

/**
 * Generate match reasons for display
 */
function generateMatchReasons(preferences, property) {
  const reasons = [];
  const propertyPrice = property.price || property.price_min;

  // Budget reason
  if (preferences.budget && propertyPrice) {
    if (preferences.budget.min && preferences.budget.max) {
      if (propertyPrice >= preferences.budget.min && propertyPrice <= preferences.budget.max) {
        reasons.push(`✅ Within budget (${propertyPrice.toLocaleString()} AED)`);
      } else if (propertyPrice < preferences.budget.min) {
        reasons.push(`💰 Below budget (${propertyPrice.toLocaleString()} AED)`);
      } else {
        reasons.push(`💰 Above budget (${propertyPrice.toLocaleString()} AED)`);
      }
    } else if (preferences.budget.min) {
      if (propertyPrice >= preferences.budget.min) {
        reasons.push(`✅ Within budget (${propertyPrice.toLocaleString()} AED)`);
      } else {
        reasons.push(`💰 Below budget (${propertyPrice.toLocaleString()} AED)`);
      }
    }
  }

  // Location reason
  if (preferences.preferred_location && property.area) {
    const matched = preferences.preferred_location.some(loc =>
      property.area.toLowerCase().includes(loc.toLowerCase())
    );
    if (matched) {
      reasons.push(`📍 Located in ${property.area}`);
    } else {
      reasons.push(`📍 Near ${property.area}`);
    }
  }

  // Bedroom reason
  if (preferences.bedrooms && property.bedrooms) {
    if (preferences.bedrooms.min && preferences.bedrooms.max) {
      if (property.bedrooms >= preferences.bedrooms.min && property.bedrooms <= preferences.bedrooms.max) {
        reasons.push(`🛏️ ${property.bedrooms} bedrooms (matches requirement)`);
      }
    } else if (preferences.bedrooms.min) {
      if (property.bedrooms >= preferences.bedrooms.min) {
        reasons.push(`🛏️ ${property.bedrooms} bedrooms (meets minimum)`);
      }
    }
  }

  // Developer reason
  if (property.developer?.name) {
    reasons.push(`🏗️ By ${property.developer.name}`);
  }

  // Handover/Completion reason
  if (property.propertySubType === "off_plan") {
    if (property.completionDate?.year) {
      reasons.push(`📅 Handover: ${property.completionDate.quarter || "Q"} ${property.completionDate.year}`);
    }
    reasons.push(`🏢 Off-Plan Project`);
  } else {
    reasons.push(`🏠 Ready to Move`);
  }

  return reasons.slice(0, 5);
}

/**
 * Calculate individual match factors
 */
function calculateMatchFactors(preferences, property) {
  const propertyPrice = property.price || property.price_min;

  return {
    budget_match: preferences.budget && propertyPrice ?
      (propertyPrice >= (preferences.budget.min || 0) && propertyPrice <= (preferences.budget.max || Infinity) ? 100 : 40) : 50,
    location_match: preferences.preferred_location && property.area ?
      (preferences.preferred_location.some(loc => property.area.toLowerCase().includes(loc.toLowerCase())) ? 100 : 30) : 50,
    bedroom_match: preferences.bedrooms && property.bedrooms ?
      (property.bedrooms >= (preferences.bedrooms.min || 0) && property.bedrooms <= (preferences.bedrooms.max || Infinity) ? 100 : 40) : 50,
    property_type_match: preferences.property_type && property.unitType ?
      (preferences.property_type.some(type => property.unitType.toLowerCase().includes(type.toLowerCase())) ? 100 : 50) : 50,
    area_match: preferences.area && property.builtUpArea ?
      (property.builtUpArea >= (preferences.area.min || 0) && property.builtUpArea <= (preferences.area.max || Infinity) ? 100 : 40) : 50
  };
}

/**
 * GET LEAD by ID with interests
 * GET /api/lead/get-lead/:id?includeInterests=true
 */
exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeInterests } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const lead = await Lead.findById(id)
      .populate("customer", "first_name last_name email phone_number")
      .populate("agent", "first_name last_name email")
      .populate("developer", "name")
      .populate("selected_property", "propertyName price area");

    if (!lead || lead.isDeleted) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    const response = { success: true, data: { lead } };

    if (includeInterests === 'true') {
      const interests = await LeadInterest.find({
        lead: id,
        is_active: true,
        is_deleted: false
      })
        .populate("property", "propertyName price area unitType bedrooms bathrooms propertySubType mainLogo photos")
        .populate("developer", "name")
        .populate("site_visit")
        .sort({ is_selected: -1, engagement_score: -1, createdAt: -1 });

      response.data.interests = interests.map(i => i.toObject());
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
    console.error("Get Lead Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * SELECT PROPERTY (Customer chooses property)
 * PUT /api/lead/select-property
 */
exports.selectProperty = async (req, res) => {
  try {
    const { leadId, interestId, propertyId } = req.body;

    // Update LeadInterest
    const interest = await LeadInterest.findByIdAndUpdate(
      interestId,
      {
        is_selected: true,
        selected_at: new Date(),
        conversion_stage: "deal",
        engagement_score: 100
      },
      { new: true }
    );

    if (!interest) {
      return res.status(404).json({ success: false, message: "Interest not found" });
    }

    // Update Lead
    await Lead.findByIdAndUpdate(leadId, {
      selected_property: propertyId,
      lastActivity: "Property selected by customer"
    });

    return res.json({
      success: true,
      message: "Property selected successfully",
      data: interest
    });

  } catch (error) {
    console.error("Select Property Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * ADD LEAD INTEREST (Add more properties manually)
 * POST /api/lead/add-interest
 */
exports.addLeadInterest = async (req, res) => {
  try {
    const { leadId, propertyId, interest_source = "agent_added", notes } = req.body;

    // Check if interest already exists
    const existingInterest = await LeadInterest.findOne({ lead: leadId, property: propertyId });
    if (existingInterest) {
      return res.status(400).json({
        success: false,
        message: "This property is already added to lead interests"
      });
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    const interest = await LeadInterest.create({
      lead: leadId,
      property: propertyId,
      developer: property.developer,
      agent: lead.agent,
      interest_source: interest_source,
      conversion_stage: "interest",
      engagement_score: 50,
      notes: notes || ""
    });

    return res.json({
      success: true,
      message: "Property added to lead interests",
      data: interest
    });

  } catch (error) {
    console.error("Add Lead Interest Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * REMOVE LEAD INTEREST (Remove property from interests)
 * DELETE /api/lead/remove-interest/:interestId
 */
exports.removeLeadInterest = async (req, res) => {
  try {
    const { interestId } = req.params;

    const interest = await LeadInterest.findByIdAndUpdate(
      interestId,
      { is_deleted: true, deleted_at: new Date() },
      { new: true }
    );

    if (!interest) {
      return res.status(404).json({ success: false, message: "Interest not found" });
    }

    return res.json({
      success: true,
      message: "Property removed from lead interests"
    });

  } catch (error) {
    console.error("Remove Lead Interest Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * UPDATE LEAD STATUS
 * POST /api/lead/update-status/:id
 */
exports.updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, dealValue } = req.body;
    const validStatuses = ["customer", "lead", "visit", "deal", "booking", "closed", "lost"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const lead = await Lead.findById(id);
    if (!lead || lead.isDeleted) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    lead.status = status;
    lead.dealValue = dealValue || lead.dealValue;
    lead.lastActivity = `Status updated to ${status}`;
    if (status === "lost") lead.lostAt = new Date();
    if (status === "closed") lead.convertedAt = new Date();

    await lead.save();

    return res.json({
      success: true,
      message: `Lead status updated to ${status}`,
      data: lead
    });

  } catch (error) {
    console.error("Update Status Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * UPDATE LEAD
 * POST /api/lead/update-lead/:id
 */
exports.updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const updatedLead = await Lead.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { ...req.body, lastActivity: "Lead updated" } },
      { new: true }
    );

    if (!updatedLead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    return res.json({ success: true, message: "Lead updated", data: updatedLead });

  } catch (error) {
    console.error("Update Lead Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE LEAD (Soft Delete)
 * DELETE /api/lead/delete-lead/:id
 */
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Lead.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date(), lastActivity: "Lead deleted" },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    return res.json({ success: true, message: "Lead deleted successfully" });

  } catch (error) {
    console.error("Delete Lead Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET ALL LEADS with filters
 * GET /api/lead/get-all-leads
 */
exports.getAllLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { agent, status, search } = req.query;

    let query = { isDeleted: false };
    if (agent) query.agent = agent;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { "name.first_name": { $regex: search, $options: "i" } },
        { "name.last_name": { $regex: search, $options: "i" } },
        { phone_number: { $regex: search, $options: "i" } }
      ];
    }

    const total = await Lead.countDocuments(query);
    const leads = await Lead.find(query)
      .populate("customer", "first_name last_name email phone_number")
      .populate("agent", "first_name last_name email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
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
    console.error("Get Leads Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
