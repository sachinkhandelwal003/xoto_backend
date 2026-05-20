const matchPropertiesForLead = async (requirements = {}, limit = 10) => {
  const results = await tryMatch(requirements, 'strict', limit);
  
  if (results.length >= 3) {
    return { matches: results, matchType: 'exact' };
  }

  // Fallback 1: Budget 20% loosen karo
  const relaxed = await tryMatch(requirements, 'relaxed', limit);
  if (relaxed.length >= 3) {
    return { matches: relaxed, matchType: 'relaxed', note: 'Showing properties slightly above budget' };
  }

  // Fallback 2: Location ignore karo, sirf type+budget
  const broader = await tryMatch(requirements, 'broad', limit);
  return { matches: broader, matchType: 'broad', note: 'Showing properties in other areas matching your criteria' };
};

const tryMatch = async (requirements, mode, limit) => {
  const {
    property_type, transaction_type,
    location_preferences = [],
    budget_min, budget_max,
    bedrooms, bathrooms,
    area_sqft_min, area_sqft_max,
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

  // Budget — relax in 'relaxed' mode
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
        )
      }));
    }
  }

  // Bedrooms — strict only
  if (bedrooms && mode === 'strict') {
    query.bedrooms = { $gte: Number(bedrooms) };
  } else if (bedrooms && mode === 'relaxed') {
    query.bedrooms = { $gte: Math.max(0, Number(bedrooms) - 1) }; // 1 bed kam bhi chalega
  }

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

  return properties.map(p => ({ ...p, matchScore: scoreProperty(p, requirements, mode) }))
    .sort((a, b) => b.matchScore - a.matchScore);
};

const scoreProperty = (property, requirements, mode) => {
  let score = 0;
  const { budget_max, bedrooms, location_preferences = [], area_sqft_min } = requirements;

  const areas = location_preferences.map(l => typeof l === 'string' ? l : l.area).filter(Boolean);
  if (areas.some(a => property.area?.toLowerCase().includes(a.toLowerCase()))) score += 40;

  const propPrice = property.price_min || property.price || 0;
  if (budget_max && propPrice <= Number(budget_max)) score += 30;

  if (bedrooms && property.bedrooms >= Number(bedrooms)) score += 15;
  if (property.isFeatured) score += 10;
  if (area_sqft_min && (property.builtUpArea_min || property.builtUpArea) >= Number(area_sqft_min)) score += 5;

  // Mode penalty — relaxed/broad results score thoda kam
  if (mode === 'relaxed') score -= 5;
  if (mode === 'broad')   score -= 15;

  return score;
};