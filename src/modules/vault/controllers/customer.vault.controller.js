import mongoose from 'mongoose';
import VaultLead from '../models/VaultLead.js';
import Case from '../models/Case.js';
import Customer from '../../../modules/auth/models/user/customer.model.js';
import { Role } from '../../../modules/auth/models/role/role.model.js';

const isVaultAdmin = async (req) => {
  let code = req.user?.role?.code;
  if (!code) {
    const roleDoc = await Role.findById(req.user?.role?._id || req.user?.role);
    code = roleDoc?.code;
  }
  return code === '18';
};

const CLOSED_LEAD_STATUSES  = ['Disbursed', 'Lost', 'Not Proceeding'];
const CLOSED_CASE_STATUSES  = ['Disbursed', 'Rejected', 'Lost'];

// ── GET /vault/customers ──────────────────────────────────────────────────────
export const getVaultCustomers = async (req, res) => {
  try {
    if (!(await isVaultAdmin(req))) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchStage = { customerId: { $ne: null }, isDeleted: false };
    if (status) matchStage.currentStatus = status;

    const basePipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$customerId',
          totalLeads: { $sum: 1 },
          activeLeads: {
            $sum: {
              $cond: [{ $not: [{ $in: ['$currentStatus', CLOSED_LEAD_STATUSES] }] }, 1, 0],
            },
          },
          latestLeadAt: { $max: '$createdAt' },
          latestStatus: { $last: '$currentStatus' },
          statuses: { $addToSet: '$currentStatus' },
          hasDisbursed: {
            $max: { $cond: [{ $eq: ['$currentStatus', 'Disbursed'] }, 1, 0] },
          },
          // collect non-null applicationIds for case lookup
          applicationIds: { $push: '$conversionInfo.applicationId' },
        },
      },
      // filter out nulls from applicationIds
      {
        $addFields: {
          applicationIds: {
            $filter: {
              input: '$applicationIds',
              as: 'aid',
              cond: { $ne: ['$$aid', null] },
            },
          },
        },
      },
      // join Customer model
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },           // drops rows with no matching customer doc
      // join active Cases
      {
        $lookup: {
          from: 'cases',
          let: { appIds: '$applicationIds' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $gt: [{ $size: '$$appIds' }, 0] },
                    { $in: ['$_id', '$$appIds'] },
                  ],
                },
                currentStatus: { $nin: CLOSED_CASE_STATUSES },
                isDeleted: false,
              },
            },
            { $project: { _id: 1, currentStatus: 1 } },
          ],
          as: 'activeCaseDocs',
        },
      },
      {
        $addFields: {
          activeCases: { $size: '$activeCaseDocs' },
        },
      },
      {
        $project: {
          activeCaseDocs: 0,   // don't send the whole array
          applicationIds: 0,
        },
      },
    ];

    // search filter after join (customer fields)
    const searchStage = search
      ? [{
          $match: {
            $or: [
              { 'customer.name.first_name': { $regex: search, $options: 'i' } },
              { 'customer.name.last_name':  { $regex: search, $options: 'i' } },
              { 'customer.email':           { $regex: search, $options: 'i' } },
              { 'customer.mobile.number':   { $regex: search, $options: 'i' } },
            ],
          },
        }]
      : [];

    const [countResult, customers] = await Promise.all([
      VaultLead.aggregate([...basePipeline, ...searchStage, { $count: 'total' }]),
      VaultLead.aggregate([
        ...basePipeline,
        ...searchStage,
        { $sort: { latestLeadAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $project: {
            _id: 1,
            totalLeads: 1,
            activeLeads: 1,
            activeCases: 1,
            latestLeadAt: 1,
            latestStatus: 1,
            statuses: 1,
            hasDisbursed: 1,
            isVaultOrigin: { $eq: ['$customer.source', 'vault'] },
            customer: {
              _id: 1, name: 1, email: 1, mobile: 1,
              nationality: 1, residencyStatus: 1,
              profilePic: 1, source: 1, createdAt: 1,
            },
          },
        },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;

    return res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('getVaultCustomers error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /vault/customers/:id ──────────────────────────────────────────────────
export const getVaultCustomerProfile = async (req, res) => {
  try {
    if (!(await isVaultAdmin(req))) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const [customer, leads] = await Promise.all([
      Customer.findById(id).lean(),
      VaultLead.find({ customerId: id, isDeleted: false })
        .sort({ createdAt: -1 })
        .select('currentStatus customerInfo propertyDetails loanRequirements conversionInfo assignedTo createdAt updatedAt eligibility')
        .lean(),
    ]);

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const caseIds = leads
      .map(l => l.conversionInfo?.applicationId)
      .filter(Boolean);

    const cases = caseIds.length
      ? await Case.find({ _id: { $in: caseIds }, isDeleted: false })
          .select('caseReference currentStatus propertyInfo clientInfo assignedTo createdAt updatedAt')
          .lean()
      : [];

    const activeLeads  = leads.filter(l => !CLOSED_LEAD_STATUSES.includes(l.currentStatus));
    const activeCases  = cases.filter(c => !CLOSED_CASE_STATUSES.includes(c.currentStatus));

    const stats = {
      totalLeads:  leads.length,
      activeLeads: activeLeads.length,
      qualified:   leads.filter(l => l.currentStatus === 'Qualified').length,
      disbursed:   leads.filter(l => l.currentStatus === 'Disbursed').length,
      totalCases:  cases.length,
      activeCases: activeCases.length,
    };

    return res.status(200).json({
      success: true,
      data: { customer, vaultLeads: leads, vaultCases: cases, stats },
    });
  } catch (err) {
    console.error('getVaultCustomerProfile error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /vault/customers/:id/leads ────────────────────────────────────────────
// Customer-wise filtered lead list (active only by default)
export const getCustomerLeads = async (req, res) => {
  try {
    if (!(await isVaultAdmin(req))) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { id } = req.params;
    const { activeOnly = 'true', page = 1, limit = 20 } = req.query;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const filter = { customerId: id, isDeleted: false };
    if (activeOnly === 'true') {
      filter.currentStatus = { $nin: CLOSED_LEAD_STATUSES };
    }

    const [total, leads] = await Promise.all([
      VaultLead.countDocuments(filter),
      VaultLead.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .select('currentStatus customerInfo propertyDetails loanRequirements assignedTo createdAt updatedAt eligibility conversionInfo')
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error('getCustomerLeads error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
