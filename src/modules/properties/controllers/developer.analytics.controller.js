const Property     = require("../models/property.model");
const Inventory    = require("../models/property.inventory.model");
const GridLead     = require("../../Grid/Lead/model/gridLead.model");
const Presentation = require("../../Grid/presentation/model/presentation.model");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isDevRole = (role) => {
  if (!role) return false;
  if (typeof role === "object") return Number(role?.code) === 17;
  return role === "developer";
};

const isAdmin = (role) => {
  if (!role) return false;
  if (typeof role === "object") return role?.isSuperAdmin === true || Number(role?.code) === 0 || Number(role?.code) === 1;
  return role === "xoto_super_admin" || role === "xoto_staff_admin";
};

// Quarter boundaries helper
const getQuarterBounds = (quarterOffset = 0) => {
  const now = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  const currentQ = Math.floor(month / 3);
  const targetQ  = currentQ - quarterOffset;
  const adjYear  = year + Math.floor(targetQ / 4);
  const adjQ     = ((targetQ % 4) + 4) % 4;
  const start    = new Date(adjYear, adjQ * 3, 1);
  const end      = new Date(adjYear, adjQ * 3 + 3, 0, 23, 59, 59, 999);
  return { start, end };
};

// Build date filter from query params
const buildDateFilter = (fromDate, toDate) => {
  if (!fromDate && !toDate) return null;
  const f = {};
  if (fromDate) f.$gte = new Date(fromDate);
  if (toDate)   f.$lte = new Date(toDate);
  return f;
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN DEVELOPER ANALYTICS
// GET /developer/analytics
// Query: fromDate, toDate, projectId, unitType
// ════════════════════════════════════════════════════════════════════════════
exports.getDeveloperAnalytics = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isDevRole(role) && !isAdmin(role)) {
      return res.status(403).json({ status: "fail", message: "Developer or Admin access only" });
    }

    const developerId = isAdmin(role) ? (req.query.developerId || userId) : userId;

    const { fromDate, toDate, projectId, unitType } = req.query;
    const dateFilter  = buildDateFilter(fromDate, toDate);
    const hasDateFilter = !!dateFilter;

    // ── 1. Fetch all developer properties ──────────────────────────────────
    let propQuery = { developer: developerId };
    if (projectId) propQuery._id = projectId;

    const properties   = await Property.find(propQuery).lean();
    const allPropertyIds = properties.map(p => p._id);

    if (allPropertyIds.length === 0) {
      return res.status(200).json({ status: "success", data: _emptyResponse() });
    }

    // ── 2. Inventory query ──────────────────────────────────────────────────
    let invQuery = { propertyId: { $in: allPropertyIds } };
    if (unitType) invQuery.unitType = unitType;

    const allInventory = await Inventory.find(invQuery).lean();

    // ── 3. Leads query ──────────────────────────────────────────────────────
    let leadMatchFilter = {
      "source.listing_id": { $in: allPropertyIds },
      is_active: true,
      is_deleted: false,
    };
    if (hasDateFilter) leadMatchFilter.createdAt = dateFilter;
    if (projectId)     leadMatchFilter["source.listing_id"] = projectId;

    const leads = await GridLead.find(leadMatchFilter).lean();

    // ── 4. Presentations query ──────────────────────────────────────────────
    let presQuery = { propertyId: { $in: allPropertyIds } };
    if (hasDateFilter) presQuery.createdAt = dateFilter;
    if (projectId)     presQuery.propertyId = projectId;

    const presentations = await Presentation.find(presQuery).lean();

    // ────────────────────────────────────────────────────────────────────────
    // SECTION A — Enquiry & Interest Metrics
    // ────────────────────────────────────────────────────────────────────────
    const now        = new Date();
    const thirtyDaysAgo  = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo   = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const totalInterestAll   = leads.length;
    const totalInterestMonth = leads.filter(l => l.createdAt >= thirtyDaysAgo).length;
    const priorMonthLeads    = leads.filter(l => l.createdAt >= sixtyDaysAgo && l.createdAt < thirtyDaysAgo).length;

    let momChange = 0;
    if (priorMonthLeads > 0) {
      momChange = Math.round(((totalInterestMonth - priorMonthLeads) / priorMonthLeads) * 100);
    } else if (totalInterestMonth > 0) {
      momChange = 100;
    }

    // Interest per listing — ranked
    const propMap = {};
    properties.forEach(p => { propMap[p._id.toString()] = p.projectName || p.propertyName || "Unnamed"; });

    const interestPerListing = {};
    leads.forEach(l => {
      const lid = l.source?.listing_id?.toString();
      if (lid) interestPerListing[lid] = (interestPerListing[lid] || 0) + 1;
    });

    const interestRanked = Object.entries(interestPerListing)
      .map(([id, count]) => ({ projectId: id, projectName: propMap[id] || "Unknown", count }))
      .sort((a, b) => b.count - a.count);

    // Leads assigned to agents
    const leadsAssignedToAgents = leads.filter(l => l.assigned_to).length;

    // Enquiry source breakdown
    const enquirySourceBreakdown = {
      platformCustomer: leads.filter(l => l.lead_type === "platform").length,
      agentLead:        leads.filter(l => l.lead_type === "agent").length,
      referralPartner:  leads.filter(l => l.lead_type === "referral_partner").length,
      general:          leads.filter(l => l.lead_type === "general").length,
    };

    // ────────────────────────────────────────────────────────────────────────
    // SECTION B — Deals & Transaction Metrics
    // ────────────────────────────────────────────────────────────────────────
    const closedStatuses = ["sold", "spa_signed", "booked"];

    let closedInvQuery = { propertyId: { $in: allPropertyIds } };
    if (unitType) closedInvQuery.unitType = unitType;

    const closedUnits    = allInventory.filter(u => closedStatuses.includes(u.status));
    const availableUnits = allInventory.filter(u => u.status === "available");
    const reservedUnits  = allInventory.filter(u => u.status === "reserved");

    const totalDealsClosed = closedUnits.length;

    // Deals closed per project
    const dealsByProject = {};
    closedUnits.forEach(u => {
      const pid = u.propertyId?.toString();
      if (!dealsByProject[pid]) dealsByProject[pid] = { projectId: pid, projectName: propMap[pid] || "Unknown", deals: 0 };
      dealsByProject[pid].deals++;
    });

    // Deals closed per unit type
    const dealsByUnitType = {};
    closedUnits.forEach(u => {
      const bt = u.bedroomType || u.unitType || "unknown";
      dealsByUnitType[bt] = (dealsByUnitType[bt] || 0) + 1;
    });

    // Units sold/reserved/available per project (donut data)
    const unitStatusPerProject = properties.map(p => {
      const pid = p._id.toString();
      const projInv = allInventory.filter(u => u.propertyId?.toString() === pid);
      return {
        projectId:   pid,
        projectName: propMap[pid],
        available:   projInv.filter(u => u.status === "available").length,
        reserved:    projInv.filter(u => u.status === "reserved").length,
        booked:      projInv.filter(u => u.status === "booked").length,
        sold:        projInv.filter(u => ["sold","spa_signed"].includes(u.status)).length,
        hold:        projInv.filter(u => u.status === "hold").length,
        total:       projInv.length,
      };
    });

    // Average time from first interest to deal closed (pipeline velocity)
    const closedLeads = leads.filter(l => l.deal_record?.closed_at);
    let avgPipelineDays = 0;
    if (closedLeads.length > 0) {
      const totalDays = closedLeads.reduce((sum, l) => {
        const diff = new Date(l.deal_record.closed_at) - new Date(l.createdAt);
        return sum + (diff / (1000 * 60 * 60 * 24));
      }, 0);
      avgPipelineDays = Math.round(totalDays / closedLeads.length);
    }

    // Units sold this quarter vs last quarter
    const thisQ = getQuarterBounds(0);
    const lastQ = getQuarterBounds(1);

    const soldThisQuarter = allInventory.filter(u =>
      closedStatuses.includes(u.status) &&
      u.soldAt && new Date(u.soldAt) >= thisQ.start && new Date(u.soldAt) <= thisQ.end
    ).length;

    const soldLastQuarter = allInventory.filter(u =>
      closedStatuses.includes(u.status) &&
      u.soldAt && new Date(u.soldAt) >= lastQ.start && new Date(u.soldAt) <= lastQ.end
    ).length;

    const quarterComparison = {
      thisQuarter: { label: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`, value: soldThisQuarter },
      lastQuarter: { label: `Q${Math.ceil((new Date(lastQ.start).getMonth() + 1) / 3)} ${new Date(lastQ.start).getFullYear()}`, value: soldLastQuarter },
    };

    // ────────────────────────────────────────────────────────────────────────
    // SECTION C — Listing Performance Metrics
    // ────────────────────────────────────────────────────────────────────────
    const totalViews     = properties.reduce((s, p) => s + (p.viewCount    || 0), 0);
    const totalWishlists = properties.reduce((s, p) => s + (p.wishlistCount || 0), 0);

    const viewsPerListing = properties.map(p => ({
      projectId:   p._id.toString(),
      projectName: propMap[p._id.toString()],
      views:       p.viewCount    || 0,
      wishlists:   p.wishlistCount || 0,
    })).sort((a, b) => b.views - a.views);

    // Listing approval time
    const approvedProps = properties.filter(p => p.approvedAt && p.createdAt);
    const avgApprovalHours = approvedProps.length > 0
      ? Math.round(
          approvedProps.reduce((s, p) => s + (new Date(p.approvedAt) - new Date(p.createdAt)), 0) /
          approvedProps.length / (1000 * 60 * 60)
        )
      : 0;

    // Listings by status
    const listingsByStatus = {
      live:            properties.filter(p => p.approvalStatus === "approved" && p.listingStatus === "active").length,
      pendingApproval: properties.filter(p => p.approvalStatus === "pending").length,
      draft:           properties.filter(p => p.approvalStatus === "draft").length,
      rejected:        properties.filter(p => p.approvalStatus === "rejected").length,
      changesRequested:properties.filter(p => p.approvalStatus === "changes_requested").length,
    };

    // Edit submission history (resubmissions after changes_requested)
    // Tracked via status_history — count leads that were rejected then resubmitted
    // We approximate this via adminComments presence + pending status
    const resubmissionCount = properties.reduce((s, p) => s + (p.resubmissionCount || 0), 0);

    // ────────────────────────────────────────────────────────────────────────
    // SECTION D — Agent Engagement Metrics
    // ────────────────────────────────────────────────────────────────────────
    // Agents who shortlisted (have presented any of this developer's listings)
    const agentPresentedListings = leads.filter(l =>
      l.matched_listings?.some(m => m.presented_to_client === true)
    );
    const uniqueAgentsShortlisted = new Set(
      agentPresentedListings.map(l => l.assigned_to?.toString()).filter(Boolean)
    ).size;

    // Presentations generated
    const presentationsGenerated = presentations.length;

    // Presentations shared (at least one view tracked OR shared_via set on a sub-presentation)
    const presentationsShared = leads.reduce((count, l) => {
      const shared = (l.presentations || []).filter(p => p.shared_via && p.shared_at).length;
      return count + shared;
    }, 0) + presentations.filter(p => p.views?.length > 0).length;

    // ────────────────────────────────────────────────────────────────────────
    // SECTION E — Project Performance Table (combined view)
    // ────────────────────────────────────────────────────────────────────────
    const projectPerformance = properties.map(p => {
      const pid       = p._id.toString();
      const projInv   = allInventory.filter(u => u.propertyId?.toString() === pid);
      const projLeads = leads.filter(l => l.source?.listing_id?.toString() === pid);
      const projPres  = presentations.filter(pr => pr.propertyId?.toString() === pid);

      return {
        projectId:   pid,
        projectName: propMap[pid],
        status:      p.approvalStatus,
        views:       p.viewCount    || 0,
        wishlists:   p.wishlistCount || 0,
        leads:       projLeads.length,
        presentations: projPres.length,
        inventory: {
          total:     projInv.length,
          available: projInv.filter(u => u.status === "available").length,
          reserved:  projInv.filter(u => u.status === "reserved").length,
          sold:      projInv.filter(u => closedStatuses.includes(u.status)).length,
        },
      };
    }).sort((a, b) => b.leads - a.leads);

    // ────────────────────────────────────────────────────────────────────────
    // COMPOSE RESPONSE
    // ────────────────────────────────────────────────────────────────────────
    return res.status(200).json({
      status: "success",
      filters: { fromDate, toDate, projectId, unitType },
      data: {
        enquiryAndInterest: {
          totalInterestAllTime:  totalInterestAll,
          totalInterestThisMonth: totalInterestMonth,
          momChange,
          interestRanked,
          leadsAssignedToAgents,
          enquirySourceBreakdown,
        },
        dealsAndTransactions: {
          totalDealsClosed,
          dealsByProject:    Object.values(dealsByProject),
          dealsByUnitType:   Object.entries(dealsByUnitType).map(([type, count]) => ({ type, count })),
          unitStatusPerProject,
          avgPipelineDays,
          quarterComparison,
        },
        listingPerformance: {
          totalViews,
          totalWishlists,
          viewsPerListing,
          avgApprovalHours,
          listingsByStatus,
          resubmissionCount,
        },
        agentEngagement: {
          uniqueAgentsShortlisted,
          presentationsGenerated,
          presentationsShared,
        },
        projectPerformance,
      },
    });
  } catch (err) {
    console.error("❌ Developer analytics error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// INTEREST TREND CHART
// GET /developer/analytics/trend
// Query: fromDate, toDate, projectId, granularity (daily|weekly)
// ════════════════════════════════════════════════════════════════════════════
exports.getInterestTrend = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isDevRole(role) && !isAdmin(role)) {
      return res.status(403).json({ status: "fail", message: "Developer or Admin access only" });
    }

    const developerId  = isAdmin(role) ? (req.query.developerId || userId) : userId;
    const { fromDate, toDate, projectId, granularity = "daily" } = req.query;

    const properties = await Property.find({ developer: developerId }).select("_id projectName propertyName").lean();
    const allPropertyIds = properties.map(p => p._id);

    if (allPropertyIds.length === 0) {
      return res.status(200).json({ status: "success", data: { trend: [] } });
    }

    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const defaultTo   = new Date();

    const matchStage = {
      "source.listing_id": projectId ? projectId : { $in: allPropertyIds },
      is_deleted: false,
      createdAt: {
        $gte: fromDate ? new Date(fromDate) : defaultFrom,
        $lte: toDate   ? new Date(toDate)   : defaultTo,
      },
    };

    const groupId = granularity === "weekly"
      ? { year: { $isoWeekYear: "$createdAt" }, week: { $isoWeek: "$createdAt" } }
      : { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } };

    const pipeline = [
      { $match: matchStage },
      { $group: { _id: groupId, count: { $sum: 1 } } },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1, "_id.day": 1 } },
    ];

    const trend = await GridLead.aggregate(pipeline);

    // Format labels
    const formatted = trend.map(t => {
      let label;
      if (granularity === "weekly") {
        label = `W${t._id.week}-${t._id.year}`;
      } else {
        const m = String(t._id.month).padStart(2, "0");
        const d = String(t._id.day).padStart(2, "0");
        label = `${t._id.year}-${m}-${d}`;
      }
      return { date: label, count: t.count };
    });

    return res.status(200).json({
      status: "success",
      data: { granularity, trend: formatted },
    });
  } catch (err) {
    console.error("❌ Trend chart error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// CSV EXPORT
// GET /developer/analytics/export
// Query: same filters as main analytics
// ════════════════════════════════════════════════════════════════════════════
exports.exportAnalyticsCSV = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    if (!isDevRole(role) && !isAdmin(role)) {
      return res.status(403).json({ status: "fail", message: "Developer or Admin access only" });
    }

    const developerId  = isAdmin(role) ? (req.query.developerId || userId) : userId;
    const { fromDate, toDate, projectId, unitType } = req.query;
    const dateFilter   = buildDateFilter(fromDate, toDate);

    let propQuery = { developer: developerId };
    if (projectId) propQuery._id = projectId;

    const properties    = await Property.find(propQuery).lean();
    const allPropertyIds = properties.map(p => p._id);

    const propMap = {};
    properties.forEach(p => { propMap[p._id.toString()] = p.projectName || p.propertyName || "Unnamed"; });

    let leadQuery = { "source.listing_id": { $in: allPropertyIds }, is_deleted: false };
    if (dateFilter)  leadQuery.createdAt          = dateFilter;
    if (projectId)   leadQuery["source.listing_id"] = projectId;

    let invQuery = { propertyId: { $in: allPropertyIds } };
    if (unitType)  invQuery.unitType = unitType;

    const [leads, inventory] = await Promise.all([
      GridLead.find(leadQuery).lean(),
      Inventory.find(invQuery).lean(),
    ]);

    // Build CSV rows
    const rows = [];

    // ── Sheet 1: Project Performance ──
    rows.push(["=== PROJECT PERFORMANCE ==="]);
    rows.push(["Project Name", "Status", "Views", "Wishlists", "Leads", "Units Total", "Available", "Reserved", "Sold"]);

    properties.forEach(p => {
      const pid      = p._id.toString();
      const projInv  = inventory.filter(u => u.propertyId?.toString() === pid);
      const projLeads= leads.filter(l => l.source?.listing_id?.toString() === pid);
      rows.push([
        propMap[pid],
        p.approvalStatus,
        p.viewCount    || 0,
        p.wishlistCount || 0,
        projLeads.length,
        projInv.length,
        projInv.filter(u => u.status === "available").length,
        projInv.filter(u => u.status === "reserved").length,
        projInv.filter(u => ["sold","spa_signed","booked"].includes(u.status)).length,
      ]);
    });

    rows.push([]);

    // ── Sheet 2: Interest Summary ──
    rows.push(["=== INTEREST SUMMARY ==="]);
    rows.push(["Project", "Lead Type", "Status", "Assigned To Agent", "Created At"]);

    leads.forEach(l => {
      rows.push([
        propMap[l.source?.listing_id?.toString()] || "Unknown",
        l.lead_type,
        l.status,
        l.assigned_to ? "Yes" : "No",
        l.createdAt ? new Date(l.createdAt).toISOString().split("T")[0] : "",
      ]);
    });

    rows.push([]);

    // ── Sheet 3: Inventory Status ──
    rows.push(["=== INVENTORY STATUS ==="]);
    rows.push(["Project", "Unit Number", "Unit Type", "Bedroom Type", "Area (sqft)", "Price (AED)", "Status", "Sale Price", "Sold At"]);

    inventory.forEach(u => {
      rows.push([
        propMap[u.propertyId?.toString()] || "Unknown",
        u.unitNumber,
        u.unitType,
        u.bedroomType || "",
        u.area || 0,
        u.price || 0,
        u.status,
        u.salePrice || "",
        u.soldAt ? new Date(u.soldAt).toISOString().split("T")[0] : "",
      ]);
    });

    // Convert to CSV string
    const csvContent = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const filename = `xoto_analytics_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error("❌ Export error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// ─── Empty response skeleton ───────────────────────────────────────────────
function _emptyResponse() {
  return {
    enquiryAndInterest:   { totalInterestAllTime: 0, totalInterestThisMonth: 0, momChange: 0, interestRanked: [], leadsAssignedToAgents: 0, enquirySourceBreakdown: {} },
    dealsAndTransactions: { totalDealsClosed: 0, dealsByProject: [], dealsByUnitType: [], unitStatusPerProject: [], avgPipelineDays: 0, quarterComparison: {} },
    listingPerformance:   { totalViews: 0, totalWishlists: 0, viewsPerListing: [], avgApprovalHours: 0, listingsByStatus: {}, resubmissionCount: 0 },
    agentEngagement:      { uniqueAgentsShortlisted: 0, presentationsGenerated: 0, presentationsShared: 0 },
    projectPerformance:   [],
  };
}
