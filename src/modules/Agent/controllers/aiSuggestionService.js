// services/aiSuggestionService.js
import Lead from "../models/AgentLeaad.js";
import Property from "../../properties/models/PropertyModel.js";

export const getSuggestionsFromForm = async (formData) => {
  try {
    const { budget, bedrooms, preferred_location, property_type } = formData;

    console.log("🔍 Analyzing form data:", {
      budget,
      location: preferred_location,
      bedrooms,
      propertyType: property_type
    });

    // Build dynamic query based on form data
    let query = {
      isAvailable: true
    };

    // Budget filter (flexible)
    if (budget && budget > 0) {
      if (budget < 100000) {
        query.price = {
          $gte: budget * 0.5,
          $lte: budget * 2.0
        };
      } else {
        query.price = {
          $gte: budget * 0.5,
          $lte: budget * 1.5
        };
      }
    }

    // Bedroom filter
    if (bedrooms && bedrooms > 0) {
      query.bedrooms = {
        $gte: Math.max(1, bedrooms - 1),
        $lte: bedrooms + 1
      };
    }

    // Location filter - search in multiple fields
    if (preferred_location) {
      query.$or = [
        { area: { $regex: preferred_location, $options: "i" } },
        { city: { $regex: preferred_location, $options: "i" } },
        { street: { $regex: preferred_location, $options: "i" } },
        { propertyName: { $regex: preferred_location, $options: "i" } }
      ];
    }

    // Property type filter
    if (property_type) {
      query.propertyType = { $regex: property_type, $options: "i" };
    }

    console.log("📦 Query:", JSON.stringify(query, null, 2));

    // Fetch matching properties
    const properties = await Property.find(query)
      .populate("developer", "name")
      .limit(50);

    console.log(`📊 Found ${properties.length} properties`);

    // Calculate scores for found properties
    const suggestions = properties.map(property => {
      const score = calculateMatchScoreFromForm(formData, property);
      const reasons = generateMatchReasonsFromForm(formData, property);
      const factors = calculateMatchFactors(formData, property);
      
      return {
        property: {
          _id: property._id,
          propertyName: property.propertyName,
          price: property.price,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          area: property.area,
          city: property.city,
          propertyType: property.propertyType,
          developer: property.developer?.name,
          developerId: property.developer?._id,
          mainLogo: property.mainLogo,
          handover: property.handover,
          amenities: property.amenities
        },
        matchScore: score,
        matchReasons: reasons,
        matchFactors: factors
      };
    });

    // Return top matches
    return suggestions
      .filter(s => s.matchScore > 30)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

  } catch (error) {
    console.error("❌ Form Suggestion Error:", error);
    return [];
  }
};

// Calculate match score
function calculateMatchScoreFromForm(formData, property) {
  let score = 0;
  let totalWeight = 0;

  // Budget match (30% weight)
  if (formData.budget && property.price && property.price > 0) {
    const budgetDiff = Math.abs(formData.budget - property.price);
    const budgetMatch = Math.max(0, 100 - (budgetDiff / Math.max(formData.budget, 1) * 100));
    score += budgetMatch * 0.3;
    totalWeight += 0.3;
  }

  // Location match (40% weight)
  if (formData.preferred_location) {
    const locationMatch = calculateLocationMatch(
      formData.preferred_location,
      property.area,
      property.city
    );
    score += locationMatch * 0.4;
    totalWeight += 0.4;
  }

  // Bedroom match (20% weight)
  if (formData.bedrooms && property.bedrooms) {
    if (formData.bedrooms === property.bedrooms) {
      score += 20;
    } else if (Math.abs(formData.bedrooms - property.bedrooms) === 1) {
      score += 15;
    } else {
      score += 5;
    }
    totalWeight += 0.2;
  }

  // Property type match (10% weight)
  if (formData.property_type && property.propertyType) {
    if (formData.property_type.toLowerCase() === property.propertyType.toLowerCase()) {
      score += 10;
    }
    totalWeight += 0.1;
  }

  return totalWeight > 0 ? Math.round(score / totalWeight) : 40;
}

// Generate match reasons
function generateMatchReasonsFromForm(formData, property) {
  const reasons = [];

  if (formData.budget && property.price) {
    if (property.price <= formData.budget) {
      reasons.push(`✅ Within budget (${formatPrice(property.price)})`);
    } else {
      const diff = ((property.price - formData.budget) / formData.budget * 100).toFixed(0);
      reasons.push(`💰 ${diff}% above budget`);
    }
  }

  if (formData.preferred_location) {
    if (property.area?.toLowerCase().includes(formData.preferred_location.toLowerCase())) {
      reasons.push(`📍 Perfect location in ${property.area}`);
    } else if (property.city?.toLowerCase().includes(formData.preferred_location.toLowerCase())) {
      reasons.push(`📍 Located in ${property.city}`);
    } else {
      reasons.push(`📍 Near ${property.area || property.city}`);
    }
  }

  if (formData.bedrooms && property.bedrooms) {
    if (formData.bedrooms === property.bedrooms) {
      reasons.push(`🛏️ Exact ${property.bedrooms} bedroom${property.bedrooms > 1 ? 's' : ''}`);
    } else {
      reasons.push(`🛏️ ${property.bedrooms} bedroom${property.bedrooms > 1 ? 's' : ''} available`);
    }
  }

  if (property.developer?.name) {
    reasons.push(`🏗️ By ${property.developer.name}`);
  }

  if (property.handover) {
    reasons.push(`📅 Handover: ${property.handover}`);
  }

  return reasons;
}

// Calculate match factors
function calculateMatchFactors(formData, property) {
  return {
    budget_match: formData.budget ? 
      calculateBudgetMatch(formData.budget, property.price) : 0,
    location_match: formData.preferred_location ?
      calculateLocationMatch(formData.preferred_location, property.area, property.city) : 0,
    bedroom_match: formData.bedrooms ?
      calculateBedroomMatch(formData.bedrooms, property.bedrooms) : 0,
    property_type_match: formData.property_type ?
      calculateTypeMatch(formData.property_type, property.propertyType) : 0
  };
}

// Helper functions
function calculateBudgetMatch(leadBudget, propertyPrice) {
  if (!leadBudget || !propertyPrice) return 50;
  const diff = Math.abs(leadBudget - propertyPrice);
  const percentDiff = (diff / leadBudget) * 100;
  
  if (percentDiff <= 5) return 100;
  if (percentDiff <= 10) return 90;
  if (percentDiff <= 15) return 75;
  if (percentDiff <= 20) return 60;
  if (percentDiff <= 30) return 40;
  if (percentDiff <= 50) return 30;
  return 20;
}

function calculateLocationMatch(leadLocation, propertyArea, propertyCity) {
  if (!leadLocation) return 50;
  
  const leadLower = leadLocation.toLowerCase();
  const areaLower = (propertyArea || "").toLowerCase();
  const cityLower = (propertyCity || "").toLowerCase();
  
  if (areaLower.includes(leadLower)) return 100;
  if (cityLower.includes(leadLower)) return 90;
  if (leadLower.includes(areaLower)) return 80;
  if (leadLower.includes(cityLower)) return 70;
  
  const leadWords = leadLower.split(' ');
  const areaWords = areaLower.split(' ');
  const cityWords = cityLower.split(' ');
  
  for (let word of leadWords) {
    if (word.length > 2) {
      if (areaWords.some(w => w.includes(word))) return 60;
      if (cityWords.some(w => w.includes(word))) return 50;
    }
  }
  
  return 30;
}

function calculateBedroomMatch(leadBedrooms, propertyBedrooms) {
  if (!leadBedrooms || !propertyBedrooms) return 50;
  if (leadBedrooms === propertyBedrooms) return 100;
  if (Math.abs(leadBedrooms - propertyBedrooms) === 1) return 75;
  if (Math.abs(leadBedrooms - propertyBedrooms) === 2) return 50;
  return 30;
}

function calculateTypeMatch(leadType, propertyType) {
  if (!leadType || !propertyType) return 50;
  return leadType.toLowerCase() === propertyType.toLowerCase() ? 100 : 70;
}

function formatPrice(price) {
  if (price >= 1000000) {
    return (price / 1000000).toFixed(1) + 'M AED';
  }
  if (price >= 1000) {
    return (price / 1000).toFixed(0) + 'K AED';
  }
  return price + ' AED';
}