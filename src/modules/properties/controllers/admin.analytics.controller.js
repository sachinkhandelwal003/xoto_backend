/**
 * Admin Analytics Controller
 * Routes wired at /properties/analytics/*
 */
const Property  = require("../models/property.model");
const Inventory = require("../models/property.inventory.model");
const GridLead  = require("../../Grid/Lead/model/gridLead.model");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildDateFilter = (fromDate, toDate) => {
  if (!fromDate && !toDate) return null;
  const f = {};
  if (fromDate) f.$gte = new Date(fromDate);
  if (toDate)   f.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  return f;
};

// group-by-period helper: returns { groupId, sortId }
const periodGroup = (period) => {
  switch (period) {
    case "daily":
      return {
        _id:  { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } },
        sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
        fmt: (g) => `${String(g.month).padStart(2,"0")}/${String(g.day).padStart(2,"0")}`,
      };
    case "weekly":
      return {
        _id:  { year: { $isoWeekYear: "$createdAt" }, week: { $isoWeek: "$createdAt" } },
        sort: { "_id.year": 1, "_id.week": 1 },
        fmt: (g) => `W${g.week}-${g.year}`,
      };
    case "yearly":
      return {
        _id:  { year: { $year: "$createdAt" } },
        sort: { "_id.year": 1 },
        fmt: (g) => String(g.year),
      };
    default: // monthly
      return {
        _id:  { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        sort: { "_id.year": 1, "_id.month": 1 },
        fmt: (g) => `${String(g.month).padStart(2,"0")}/${g.year}`,
      };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 1. OVERVIEW
// GET /properties/analytics/overview
// ════════════════════════════════════════════════════════════════════════════
exports.getAdminOverview = async (req, res) => {
  try {
    const { period = "monthly", dateFrom, dateTo } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);

    // ── Parallel fetches ──
    const propQuery = {};
    if (dateFilter) propQuery.createdAt = dateFilter;

    const [allProperties, allLeads] = await Promise.all([
      Property.find({}).lean(),
      GridLead.find({ is_deleted: { $ne: true }, ...(dateFilter ? { createdAt: dateFilter } : {}) }).lean(),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── KPI Stats ──
    const stats = {
      totalListings:   allProperties.length,
      activeListings:  allProperties.filter(p => p.approvalStatus === "approved").length,
      pendingApproval: allProperties.filter(p => p.approvalStatus === "pending").length,
      totalViews:      allProperties.reduce((s, p) => s + (p.viewCount    || 0), 0),
      totalWishlisted: allProperties.reduce((s, p) => s + (p.wishlistCount || 0), 0),
      totalLeads:      allLeads.length,
      newThisMonth:    allProperties.filter(p => new Date(p.createdAt) >= startOfMonth).length,
      soldThisMonth:   0, // inventory sold this month — computed below
    };

    // ── Inventory sold this month ──
    try {
      const soldUnits = await Inventory.countDocuments({
        status: { $in: ["sold", "spa_signed", "booked"] },
        soldAt: { $gte: startOfMonth },
      });
      stats.soldThisMonth = soldUnits;
    } catch (_) { /* inventory model may differ */ }

    // ── Trend (new listings + views + leads per period) ──
    const pg = periodGroup(period);
    const trendMap = {};

    allProperties.forEach(p => {
      if (dateFilter && !(new Date(p.createdAt) >= (dateFilter.$gte || 0) && new Date(p.createdAt) <= (dateFilter.$lte || Infinity))) return;
      const d   = new Date(p.createdAt);
      const key = buildKey(pg, d);
      if (!trendMap[key]) trendMap[key] = { period: key, newListings: 0, views: 0, leads: 0 };
      trendMap[key].newListings += 1;
      trendMap[key].views       += (p.viewCount || 0);
    });

    allLeads.forEach(l => {
      const d   = new Date(l.createdAt);
      const key = buildKey(pg, d);
      if (!trendMap[key]) trendMap[key] = { period: key, newListings: 0, views: 0, leads: 0 };
      trendMap[key].leads += 1;
    });

    const trend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period));

    // ── By Status ──
    const statusMap = {};
    allProperties.forEach(p => {
      const s = p.approvalStatus || "draft";
      statusMap[s] = (statusMap[s] || 0) + 1;
    });
    const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // ── By Property Type ──
    const typeMap = {};
    allProperties.forEach(p => {
      const t = p.propertyType || "Unknown";
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    const byType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));

    // ── Top Properties by views ──
    const topProperties = [...allProperties]
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      .slice(0, 8)
      .map(p => ({
        _id:          p._id,
        propertyName: p.propertyName || p.projectName || "Unnamed",
        area:         p.locality || p.area || "",
        viewCount:    p.viewCount    || 0,
        wishlistCount:p.wishlistCount || 0,
      }));

    return res.status(200).json({
      success: true,
      data: { stats, trend, byStatus, byType, topProperties },
    });
  } catch (err) {
    console.error("❌ Admin overview error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 2. LEAD REPORTS
// GET /properties/analytics/leads
// ════════════════════════════════════════════════════════════════════════════
exports.getAdminLeadReports = async (req, res) => {
  try {
    const { period = "monthly", dateFrom, dateTo, propertyId, source, status } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);

    // ── Build lead query ──
    const leadQuery = { is_deleted: { $ne: true } };
    if (dateFilter)  leadQuery.createdAt = dateFilter;
    if (propertyId)  leadQuery["source.listing_id"] = propertyId;
    if (source)      leadQuery["source.channel"]    = source;
    // status filter maps to the lead `status` field ('new','contacted','qualified',etc.)
    if (status) {
      const statusMap = { New: "new", Contacted: "contacted", Qualified: "qualified", Converted: "completed", Lost: "not_proceeding" };
      leadQuery.status = statusMap[status] || status.toLowerCase();
    }

    const [leads, properties] = await Promise.all([
      GridLead.find(leadQuery)
        .populate("assigned_to", "firstName lastName")
        .lean(),
      Property.find({}).select("_id propertyName projectName locality area").lean(),
    ]);

    // Build property lookup map
    const propMap = {};
    properties.forEach(p => { propMap[p._id.toString()] = p; });

    // ── Summary KPIs ──
    const converted = leads.filter(l => l.status === "completed" || l.status === "spa_signed").length;
    const summary = {
      totalLeads:     leads.length,
      newLeads:       leads.filter(l => l.status === "new").length,
      qualified:      leads.filter(l => l.status === "qualified").length,
      converted,
      conversionRate: leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0,
      avgResponseHrs: null,
    };

    // ── Volume trend ──
    const pg = periodGroup(period);
    const trendMap = {};

    leads.forEach(l => {
      const d   = new Date(l.createdAt);
      const key = buildKey(pg, d);
      if (!trendMap[key]) trendMap[key] = { period: key, total: 0, converted: 0, lost: 0 };
      trendMap[key].total += 1;
      if (l.status === "completed" || l.status === "spa_signed") trendMap[key].converted += 1;
      if (l.status === "not_proceeding")                         trendMap[key].lost       += 1;
    });
    const volumeTrend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period));

    // ── By Source (channel) ──
    const srcMap = {};
    leads.forEach(l => {
      const ch = l.source?.channel || "unknown";
      srcMap[ch] = (srcMap[ch] || 0) + 1;
    });
    const bySource = Object.entries(srcMap).map(([source, count]) => ({ source, count }));

    // ── By Status ──
    const stMap = {};
    leads.forEach(l => {
      const s = l.status || "new";
      stMap[s] = (stMap[s] || 0) + 1;
    });
    const statusLabels = { new: "New", contacted: "Contacted", qualified: "Qualified", in_discussion: "In Discussion", site_visit_scheduled: "Site Visit", offer_made: "Offer Made", reserved: "Reserved", spa_signed: "SPA Signed", completed: "Converted", not_proceeding: "Lost" };
    const byStatus = Object.entries(stMap).map(([status, count]) => ({ status: statusLabels[status] || status, count }));

    // ── Top properties by lead count ──
    const propLeadMap = {};
    leads.forEach(l => {
      const lid = l.source?.listing_id?.toString();
      if (lid) propLeadMap[lid] = (propLeadMap[lid] || 0) + 1;
    });
    const topProperties = Object.entries(propLeadMap)
      .map(([id, leads]) => ({
        id,
        name: (propMap[id]?.propertyName || propMap[id]?.projectName || "Unknown").substring(0, 20),
        leads,
      }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 8);

    // ── Lead records ──
    const records = leads.slice(0, 200).map(l => {
      const prop     = propMap[l.source?.listing_id?.toString()];
      const firstName = l.contact_info?.name?.first_name || "";
      const lastName  = l.contact_info?.name?.last_name  || "";
      return {
        _id:          l._id,
        customerName: (firstName || lastName) ? `${firstName} ${lastName}`.trim() : "—",
        email:        l.contact_info?.email?.address || "",
        phone:        l.contact_info?.mobile?.number || "",
        propertyName: prop?.propertyName || prop?.projectName || "General Lead",
        area:         prop?.locality || prop?.area || "",
        source:       l.source?.channel || "unknown",
        status:       statusLabels[l.status] || l.status || "New",
        lead_type:    l.lead_type || "",
        assignedTo:   l.assigned_to
          ? `${l.assigned_to.firstName || ""} ${l.assigned_to.lastName || ""}`.trim() || String(l.assigned_to._id || l.assigned_to)
          : "—",
        createdAt:    l.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: { summary, volumeTrend, bySource, byStatus, topProperties, records },
    });
  } catch (err) {
    console.error("❌ Admin lead reports error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 3. LEAD REPORTS — CSV EXPORT
// GET /properties/analytics/leads/export
// ════════════════════════════════════════════════════════════════════════════
exports.exportLeadReport = async (req, res) => {
  try {
    const { dateFrom, dateTo, propertyId, source, status } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);

    const leadQuery = { is_deleted: { $ne: true } };
    if (dateFilter)  leadQuery.createdAt = dateFilter;
    if (propertyId)  leadQuery["source.listing_id"] = propertyId;
    if (source)      leadQuery["source.channel"] = source;
    if (status)      leadQuery.classification = status;

    const [leads, properties] = await Promise.all([
      GridLead.find(leadQuery)
        .populate("assigned_to", "firstName lastName")
        .lean(),
      Property.find({}).select("_id propertyName projectName locality").lean(),
    ]);

    const propMap = {};
    properties.forEach(p => { propMap[p._id.toString()] = p; });

    const rows = [
      ["Customer Name", "Email", "Phone", "Property", "Area", "Source", "Status", "Lead Type", "Assigned To", "Created At"],
    ];

    const statusLabels = { new: "New", contacted: "Contacted", qualified: "Qualified", in_discussion: "In Discussion", site_visit_scheduled: "Site Visit", offer_made: "Offer Made", reserved: "Reserved", spa_signed: "SPA Signed", completed: "Converted", not_proceeding: "Lost" };
    leads.forEach(l => {
      const prop        = propMap[l.source?.listing_id?.toString()];
      const firstName   = l.contact_info?.name?.first_name || "";
      const lastName    = l.contact_info?.name?.last_name  || "";
      const advisorName = l.assigned_to
        ? `${l.assigned_to.firstName || ""} ${l.assigned_to.lastName || ""}`.trim()
        : "";
      rows.push([
        `${firstName} ${lastName}`.trim() || "",
        l.contact_info?.email?.address   || "",
        l.contact_info?.mobile?.number   || "",
        prop?.propertyName || prop?.projectName || "General Lead",
        prop?.locality     || "",
        l.source?.channel  || "",
        statusLabels[l.status] || l.status || "",
        l.lead_type        || "",
        advisorName,
        l.createdAt ? new Date(l.createdAt).toISOString().split("T")[0] : "",
      ]);
    });

    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="lead_report_${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error("❌ Lead export error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 4. LISTING REPORTS
// GET /properties/analytics/listings
// ════════════════════════════════════════════════════════════════════════════
exports.getAdminListingReports = async (req, res) => {
  try {
    const { period = "monthly", dateFrom, dateTo, propertySubType, approvalStatus, saleStatus, developerId } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);

    const propQuery = {};
    if (dateFilter)       propQuery.createdAt        = dateFilter;
    if (propertySubType)  propQuery.propertySubType   = propertySubType;
    if (approvalStatus)   propQuery.approvalStatus    = approvalStatus;
    if (developerId)      propQuery.developer         = developerId;

    const properties = await Property.find(propQuery).lean();
    const allIds     = properties.map(p => p._id);

    // Inventory for sale status
    const inventory = allIds.length > 0
      ? await Inventory.find({ propertyId: { $in: allIds } }).lean()
      : [];

    // Filter by saleStatus if provided
    let filteredProps = properties;
    if (saleStatus) {
      const soldIds = new Set(inventory.filter(u => {
        if (saleStatus === "Sold")     return ["sold", "spa_signed", "booked"].includes(u.status);
        if (saleStatus === "Reserved") return u.status === "reserved";
        return u.status === "available";
      }).map(u => u.propertyId?.toString()));
      filteredProps = properties.filter(p => soldIds.has(p._id.toString()));
    }

    // ── Summary ──
    const totalViews     = filteredProps.reduce((s, p) => s + (p.viewCount    || 0), 0);
    const totalWishlisted= filteredProps.reduce((s, p) => s + (p.wishlistCount || 0), 0);
    const summary = {
      totalListings:  filteredProps.length,
      activeListings: filteredProps.filter(p => p.approvalStatus === "approved").length,
      totalViews,
      totalWishlisted,
      available:      inventory.filter(u => u.status === "available").length,
      reserved:       inventory.filter(u => u.status === "reserved").length,
      sold:           inventory.filter(u => ["sold","spa_signed","booked"].includes(u.status)).length,
      avgViews:       filteredProps.length > 0 ? totalViews / filteredProps.length : 0,
    };

    // ── Trend ──
    const pg = periodGroup(period);
    const trendMap = {};
    filteredProps.forEach(p => {
      const d   = new Date(p.createdAt);
      const key = buildKey(pg, d);
      if (!trendMap[key]) trendMap[key] = { period: key, added: 0, sold: 0, views: 0 };
      trendMap[key].added  += 1;
      trendMap[key].views  += (p.viewCount || 0);
    });
    inventory.filter(u => ["sold","spa_signed","booked"].includes(u.status) && u.soldAt).forEach(u => {
      const d   = new Date(u.soldAt);
      const key = buildKey(pg, d);
      if (!trendMap[key]) trendMap[key] = { period: key, added: 0, sold: 0, views: 0 };
      trendMap[key].sold += 1;
    });
    const trend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period));

    // ── By Sub-Type ──
    const subTypeMap = {};
    filteredProps.forEach(p => {
      const t = p.propertySubType || "other";
      subTypeMap[t] = (subTypeMap[t] || 0) + 1;
    });
    const bySubType = Object.entries(subTypeMap).map(([subType, count]) => ({ subType, count }));

    // ── By Approval Status ──
    const approvalMap = {};
    filteredProps.forEach(p => {
      const s = p.approvalStatus || "draft";
      approvalMap[s] = (approvalMap[s] || 0) + 1;
    });
    const byApproval = Object.entries(approvalMap).map(([status, count]) => ({ status, count }));

    // ── By Sale Status ──
    const propIdToSaleStatus = {};
    inventory.forEach(u => {
      const pid = u.propertyId?.toString();
      if (!pid) return;
      if (["sold","spa_signed","booked"].includes(u.status)) propIdToSaleStatus[pid] = "Sold";
      else if (u.status === "reserved" && !propIdToSaleStatus[pid]) propIdToSaleStatus[pid] = "Reserved";
      else if (!propIdToSaleStatus[pid]) propIdToSaleStatus[pid] = "Available";
    });
    const saleMap = { Sold: 0, Reserved: 0, Available: 0 };
    filteredProps.forEach(p => {
      const s = propIdToSaleStatus[p._id.toString()] || "Available";
      saleMap[s] = (saleMap[s] || 0) + 1;
    });
    const bySaleStatus = Object.entries(saleMap).map(([status, count]) => ({ status, count }));

    // ── By Area ──
    const areaMap = {};
    filteredProps.forEach(p => {
      const a = p.locality || p.area || "Unknown";
      areaMap[a] = (areaMap[a] || 0) + 1;
    });
    const byArea = Object.entries(areaMap)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Top Viewed & Wishlisted ──
    const topViewed     = [...filteredProps].sort((a, b) => (b.viewCount    || 0) - (a.viewCount    || 0)).slice(0, 10);
    const topWishlisted = [...filteredProps].sort((a, b) => (b.wishlistCount|| 0) - (a.wishlistCount|| 0)).slice(0, 10);

    // ── Records ──
    const records = filteredProps.slice(0, 200).map(p => ({
      _id:             p._id,
      propertyName:    p.propertyName || p.projectName || "",
      area:            p.locality || p.area || "",
      propertySubType: p.propertySubType || "",
      approvalStatus:  p.approvalStatus || "",
      saleStatus:      propIdToSaleStatus[p._id.toString()] || "Available",
      priceRange:      p.priceRange || null,
      price_min:       p.price_min  || p.price || null,
      price_max:       p.price_max  || null,
      viewCount:       p.viewCount  || 0,
      wishlistCount:   p.wishlistCount || 0,
      createdAt:       p.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: { summary, trend, bySubType, byApproval, bySaleStatus, byArea, topViewed, topWishlisted, records },
    });
  } catch (err) {
    console.error("❌ Admin listing reports error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 5. LISTING REPORTS — CSV EXPORT
// GET /properties/analytics/listings/export
// ════════════════════════════════════════════════════════════════════════════
exports.exportListingReport = async (req, res) => {
  try {
    const { dateFrom, dateTo, propertySubType, approvalStatus, developerId } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);

    const propQuery = {};
    if (dateFilter)      propQuery.createdAt      = dateFilter;
    if (propertySubType) propQuery.propertySubType = propertySubType;
    if (approvalStatus)  propQuery.approvalStatus  = approvalStatus;
    if (developerId)     propQuery.developer       = developerId;

    const properties = await Property.find(propQuery).lean();

    const rows = [
      ["Property Name", "Area", "Sub Type", "Approval Status", "Views", "Wishlisted", "Price From", "Price To", "Created At"],
    ];

    properties.forEach(p => {
      rows.push([
        p.propertyName || p.projectName || "",
        p.locality     || p.area        || "",
        p.propertySubType || "",
        p.approvalStatus  || "",
        p.viewCount       || 0,
        p.wishlistCount   || 0,
        p.priceRange?.min || p.price_min || p.price || "",
        p.priceRange?.max || p.price_max || "",
        p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : "",
      ]);
    });

    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="listing_report_${new Date().toISOString().split("T")[0]}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error("❌ Listing export error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Internal: build chart key from date ─────────────────────────────────────
function buildKey(pg, date) {
  const g = {};
  const id = pg._id;
  if (id.year)  g.year  = date.getFullYear();
  if (id.month) g.month = date.getMonth() + 1;
  if (id.day)   g.day   = date.getDate();
  if (id.week) {
    // ISO week number
    const tmp = new Date(date.getTime()); tmp.setHours(0,0,0,0);
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    g.week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    g.year = tmp.getFullYear();
  }
  return pg.fmt(g);
}
