const SiteVisit = require('../model/siteVisit.model');

// POST /agent/lead/create-site-visit
exports.createSiteVisit = async (req, res) => {
  try {
    const { lead, property, scheduledDate, visitTime, clientName, clientPhone, visitType, notes } = req.body;

    if (!lead || !property || !scheduledDate || !visitTime) {
      return res.status(400).json({ success: false, message: 'lead, property, scheduledDate and visitTime are required' });
    }

    const visit = await SiteVisit.create({
      lead,
      property,
      agent: req.user?._id,
      scheduledDate,
      visitTime,
      clientName,
      clientPhone,
      visitType: visitType || 'in_person',
      notes,
      status: 'requested',
    });

    const populated = await SiteVisit.findById(visit._id)
      .populate('lead', 'contact_info source status')
      .populate('property', 'propertyName projectName area')
      .populate('agent', 'name email')
      .lean();

    return res.status(201).json({ success: true, message: 'Viewing request created', data: populated });
  } catch (err) {
    console.error('createSiteVisit error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /agent/lead/get-all-site-visits
exports.getAllSiteVisits = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};

    const roleCode = req.user?.role?.code;
    const isSuperAdmin = req.user?.role?.isSuperAdmin;

    // Role-based filtering
    if (isSuperAdmin || roleCode === 1 || roleCode === '1') {
      // Admin: see all
    } else if (roleCode === 24 || roleCode === '24') {
      // Advisor: only visits assigned to them
      filter.advisor = req.user._id;
    } else {
      // Agent / anyone else: only their own visits
      filter.agent = req.user._id;
    }

    if (status) filter.status = status;

    const [data, total] = await Promise.all([
      SiteVisit.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('lead', 'contact_info source status')
        .populate('property', 'propertyName projectName area photos mainImage')
        .populate('agent', 'name email')
        .populate('advisor', 'name email phone')
        .lean(),
      SiteVisit.countDocuments(filter),
    ]);

    return res.json({ success: true, data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getAllSiteVisits error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /agent/lead/update-site-visit/:id
exports.updateSiteVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, advisor, confirmedDate, confirmedTime, adminNote } = req.body;

    const update = {};
    if (status)        update.status        = status;
    if (advisor)       update.advisor       = advisor;
    if (confirmedDate) update.confirmedDate = confirmedDate;
    if (confirmedTime) update.confirmedTime = confirmedTime;
    if (adminNote)     update.adminNote     = adminNote;

    const visit = await SiteVisit.findByIdAndUpdate(id, { $set: update }, { new: true })
      .populate('lead', 'contact_info source status')
      .populate('property', 'propertyName projectName area')
      .populate('agent', 'name email')
      .populate('advisor', 'name email phone')
      .lean();

    if (!visit) return res.status(404).json({ success: false, message: 'Viewing request not found' });

    return res.json({ success: true, message: 'Updated successfully', data: visit });
  } catch (err) {
    console.error('updateSiteVisit error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
