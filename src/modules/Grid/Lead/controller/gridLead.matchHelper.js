// ════════════════════════════════════════════════════════════════════════════
// gridLead.matchHelper.js
// Import: const { matchPropertiesForLead } = require('./gridLead.matchHelper');
// ════════════════════════════════════════════════════════════════════════════

const Property = require('../../../properties/models/property.model.js');

// ── Score a single property against requirements ──────────────────────────
const scoreProperty = (property, requirements, mode) => {
  let score = 0;
  const { budget_max, bedrooms, location_preferences = [], area_sqft_min } = requirements;

  const areas = location_preferences
    .map(l => (typeof l === 'string' ? l : l.area))
    .filter(Boolean);

  if (areas.some(a => property.area?.toLowerCase().includes(a.toLowerCase()))) score += 40;

  const propPrice = property.price_min || property.price || 0;
  if (budget_max && propPrice <= Number(budget_max)) score += 30;

  if (bedrooms && property.bedrooms >= Number(bedrooms)) score += 15;
  if (property.isFeatured) score += 10;
  if (area_sqft_min && (property.builtUpArea_min || property.builtUpArea) >= Number(area_sqft_min)) score += 5;

  if (mode === 'relaxed') score -= 5;
  if (mode === 'broad')   score -= 15;

  return score;
};

// ── Run one DB query pass with the given match mode ───────────────────────
const tryMatch = async (requirements, mode, limit) => {
  const {
    property_type,
    transaction_type,
    location_preferences = [],
    budget_min,
    budget_max,
    bedrooms,
    bathrooms,
    area_sqft_min,
    area_sqft_max,
    furnished,
  } = requirements;

  const query = { approvalStatus: 'approved', listingStatus: 'active' };

  // Transaction type
  if (transaction_type === 'rent') {
    query.propertySubType = 'rental';
  } else {
    query.propertySubType = { $in: ['off_plan', 'secondary', 'commercial'] };
  }

  // Unit type
  if (property_type) {
    query.unitType = { $regex: property_type, $options: 'i' };
  }

  // Budget — relax in 'relaxed' / 'broad' mode
  if (budget_max) {
    const multiplier = mode === 'relaxed' ? 1.2 : mode === 'broad' ? 1.5 : 1.0;
    query.$or = [
      { price:     { $lte: Number(budget_max) * multiplier } },
      { price_min: { $lte: Number(budget_max) * multiplier } },
    ];
    if (budget_min && mode === 'strict') {
      query.$or = query.$or.map(c => ({
        ...c,
        ...Object.fromEntries(
          Object.entries(c).map(([k, v]) => [k, { ...v, $gte: Number(budget_min) * 0.8 }])
        ),
      }));
    }
  }

  // Bedrooms
  if (bedrooms && mode === 'strict') {
    query.bedrooms = { $gte: Number(bedrooms) };
  } else if (bedrooms && mode === 'relaxed') {
    query.bedrooms = { $gte: Math.max(0, Number(bedrooms) - 1) };
  }
  // broad mode: no bedroom filter

  // Location — broad mode mein ignore
  const areas = location_preferences
    .sort((a, b) => (a.priority || 5) - (b.priority || 5))
    .map(l => (typeof l === 'string' ? l : l.area))
    .filter(Boolean);

  if (areas.length > 0 && mode !== 'broad') {
    query.area = { $in: areas.map(a => new RegExp(a, 'i')) };
  }

  const properties = await Property.find(query)
    .sort({ isFeatured: -1, createdAt: -1 })
    .limit(limit)
    .populate('developer', 'name logo')
    .lean();

  return properties
    .map(p => ({ ...p, matchScore: scoreProperty(p, requirements, mode) }))
    .sort((a, b) => b.matchScore - a.matchScore);
};

// ── Main matcher: strict → relaxed → broad ───────────────────────────────
const matchPropertiesForLead = async (requirements = {}, limit = 10) => {
  const { property_type, budget_min, budget_max, bedrooms, location_preferences } = requirements || {};
  const hasMeaningfulCriteria =
    property_type || budget_min || budget_max || bedrooms ||
    (Array.isArray(location_preferences) && location_preferences.length > 0);

  if (!hasMeaningfulCriteria) {
    return { matches: [], matchType: 'none', note: 'No requirements specified' };
  }

  // 1. Strict / exact match
  const exact = await tryMatch(requirements, 'strict', limit);
  if (exact.length >= 3) {
    return { matches: exact, matchType: 'exact' };
  }

  // 2. Relaxed — budget +20%, bedrooms -1
  const relaxed = await tryMatch(requirements, 'relaxed', limit);
  if (relaxed.length >= 3) {
    return {
      matches: relaxed,
      matchType: 'relaxed',
      note: 'Showing properties slightly above budget',
    };
  }

  // 3. Broad — ignore location, budget +50%
  const broader = await tryMatch(requirements, 'broad', limit);
  return {
    matches: broader,
    matchType: 'broad',
    note: 'Showing properties in other areas matching your criteria',
  };
};

module.exports = { matchPropertiesForLead, scoreProperty };