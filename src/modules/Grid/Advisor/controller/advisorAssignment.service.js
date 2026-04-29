const GridAdvisor = require('../model/index.js');

exports.suggestAdvisor = async ({ area, preferred_city, type }) => {
  const location = area || preferred_city || null;

  // Step 1 — base filter: only active advisors
  const baseFilter = { status: 'active' };

  // Step 2 — location + propertyType match (PRD 4.5)
  const locationFilter = location
    ? { ...baseFilter, 'specialisation.locations': { $regex: location, $options: 'i' } }
    : baseFilter;  

  const typeFilter = type
    ? { ...baseFilter, 'specialisation.propertyTypes': { $regex: type, $options: 'i' } }
    : baseFilter;

  // Step 3 — Try best match: location + type both
  let advisors = await GridAdvisor.find({
    ...baseFilter,
    ...(location ? { 'specialisation.locations': { $regex: location, $options: 'i' } } : {}),
    ...(type     ? { 'specialisation.propertyTypes': { $regex: type, $options: 'i' } } : {}),
  })
    .select('firstName lastName email specialisation leaderboard workload status')
    .lean();

  // Fallback 1 — location only
  if (!advisors.length && location) {
    advisors = await GridAdvisor.find(locationFilter)
      .select('firstName lastName email specialisation leaderboard workload status')
      .lean();
  }

  // Fallback 2 — type only
  if (!advisors.length && type) {
    advisors = await GridAdvisor.find(typeFilter)
      .select('firstName lastName email specialisation leaderboard workload status')
      .lean();
  }

  // Fallback 3 — any active advisor
  if (!advisors.length) {
    advisors = await GridAdvisor.find(baseFilter)
      .select('firstName lastName email specialisation leaderboard workload status')
      .lean();
  }

  if (!advisors.length) return null;

  // Step 4 — Sort: high composite score + low active leads (PRD 4.5)
  advisors.sort((a, b) => {
    const scoreA = a.leaderboard?.compositeScore  || 0;
    const scoreB = b.leaderboard?.compositeScore  || 0;
    const loadA  = a.workload?.activeLeadsCount   || 0;
    const loadB  = b.workload?.activeLeadsCount   || 0;

    // Primary: higher score wins
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tiebreak: lower workload wins
    return loadA - loadB;
  });

  return advisors[0]; 
};