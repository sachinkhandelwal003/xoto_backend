// ════════════════════════════════════════════════════════════════════════════
// gridLead.matchHelper.js
// Import: const { matchPropertiesForLead } = require('./gridLead.matchHelper');
// ════════════════════════════════════════════════════════════════════════════

const Property = require('../../../properties/models/property.model.js');

const UNIT_TYPE_MAP = {
  apartment: 'apartment',
  apartments: 'apartment',
  flat: 'apartment',
  villa: 'villa',
  townhouse: 'townhouse',
  penthouse: 'penthouse',
  studio: 'apartment',
  office: 'office',
  retail: 'retail',
  land: 'plot',
  plot: 'plot',
  warehouse: 'warehouse',
};

const normalizeUnitType = (value) => {
  if (!value) return '';
  const key = String(value).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return UNIT_TYPE_MAP[key] || key;
};

const normalizeFurnishing = (value) => {
  if (!value || value === 'any') return '';
  return String(value).trim().toLowerCase().replace(/-/g, '_');
};

const propertyPrice = (property) => property.price_min || property.price || property.priceRange?.from || 0;
const propertyArea = (property) => property.builtUpArea_min || property.builtUpArea || property.builtUpArea_max || 0;

// ── Score a single property against requirements ──────────────────────────
const scoreProperty = (property, requirements, mode) => {
  let score = 0;
  const {
    budget_min,
    budget_max,
    bedrooms,
    bathrooms,
    location_preferences = [],
    area_sqft_min,
    area_sqft_max,
    furnished,
  } = requirements;

  const areas = location_preferences
    .map(l => (typeof l === 'string' ? l : l.area))
    .filter(Boolean);

  if (areas.some(a => property.area?.toLowerCase().includes(a.toLowerCase()))) score += 40;

  const propPrice = propertyPrice(property);
  if (budget_max && propPrice && propPrice <= Number(budget_max)) score += 20;
  if (budget_min && propPrice && propPrice >= Number(budget_min)) score += 10;

  if (bedrooms && property.bedrooms >= Number(bedrooms)) score += 15;
  if (bathrooms && property.bathrooms >= Number(bathrooms)) score += 10;
  if (property.isFeatured) score += 10;
  const propArea = propertyArea(property);
  if (area_sqft_min && propArea >= Number(area_sqft_min)) score += 5;
  if (area_sqft_max && propArea && propArea <= Number(area_sqft_max)) score += 5;
  if (normalizeFurnishing(furnished) && normalizeFurnishing(property.furnishing) === normalizeFurnishing(furnished)) score += 5;

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
    const unitType = normalizeUnitType(property_type);
    query.$and = [
      ...(query.$and || []),
      { $or: [{ unitType }, { unitTypes: unitType }] },
    ];
  }

  // Budget — relax in 'relaxed' / 'broad' mode
  if (budget_min || budget_max) {
    const multiplier = mode === 'relaxed' ? 1.2 : mode === 'broad' ? 1.5 : 1.0;
    const minMultiplier = mode === 'strict' ? 0.9 : mode === 'relaxed' ? 0.8 : 0.5;
    const priceRange = {};
    if (budget_min) priceRange.$gte = Number(budget_min) * minMultiplier;
    if (budget_max) priceRange.$lte = Number(budget_max) * multiplier;
    query.$and = [
      ...(query.$and || []),
      { $or: [{ price: priceRange }, { price_min: priceRange }] },
    ];
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
