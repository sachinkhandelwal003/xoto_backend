  // services/aiSuggestionService.js
  const Property = require("../../../properties/models/property.model");

  /**
   * Get property suggestions based on lead preferences
   * @param {Object} preferences - Lead preferences
   * @returns {Array} - Sorted property suggestions with match scores
   */
  // controllers/LeadController.js

  exports.fetchPropertySuggestions = async (req, res) => {
    try {
      // ✅ Get agent ID from authenticated user
      const agentId = req.user.id; // or req.user._id

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

      // ✅ CRITICAL FIX: Only show this agent's secondary properties
      let query = {
        isAvailable: true,
        approvalStatus: "approved",
        listingStatus: "active",
        $or: [
          // All approved off-plan properties
          { propertySubType: "off_plan" },
          // Only this agent's secondary properties
          { 
            propertySubType: "secondary",
            agent: agentId  // 👈 KEY: Filter by logged-in agent
          }
        ]
      };

      // Budget filter
      if (parsedBudget && (parsedBudget.min || parsedBudget.max)) {
        const priceConditions = [];
        
        if (parsedBudget.min) {
          priceConditions.push(
            { price: { $gte: parsedBudget.min } },
            { price_min: { $gte: parsedBudget.min } }
          );
        }
        if (parsedBudget.max) {
          priceConditions.push(
            { price: { $lte: parsedBudget.max } },
            { price_min: { $lte: parsedBudget.max } }
          );
        }
        
        if (priceConditions.length > 0) {
          query.$and = [{ $or: priceConditions }];
        }
      }

      // Bedrooms filter
      if (parsedBedrooms && (parsedBedrooms.min || parsedBedrooms.max)) {
        query.bedrooms = {};
        if (parsedBedrooms.min) query.bedrooms.$gte = parsedBedrooms.min;
        if (parsedBedrooms.max) query.bedrooms.$lte = parsedBedrooms.max;
      }

      // Area filter
      if (parsedArea && (parsedArea.min || parsedArea.max)) {
        query.builtUpArea = {};
        if (parsedArea.min) query.builtUpArea.$gte = parsedArea.min;
        if (parsedArea.max) query.builtUpArea.$lte = parsedArea.max;
      }

      // Location filter
      if (locations && locations.length > 0) {
        const locationRegex = locations.map(loc => new RegExp(loc, 'i'));
        query.area = { $in: locationRegex };
      }

      // Property type filter
      if (propertyTypes && propertyTypes.length > 0) {
        query.unitType = { $in: propertyTypes };
      }

      // Fetch properties
      const properties = await Property.find(query)
        .populate("developer", "name email logo")
        .limit(100);

      // If no properties found
      if (properties.length === 0) {
        return res.json({
          success: true,
          count: 0,
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
          data: [],
          message: "No properties found matching your criteria"
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

      return res.json({
        success: true,
        count: paginatedData.length,
        total: filteredSuggestions.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(filteredSuggestions.length / parseInt(limit)),
        data: paginatedData
      });

    } catch (error) {
      console.error("Fetch Property Suggestions Error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message
      });
    }
  };

  /**
   * Calculate match score between preferences and property
   */
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

    return reasons.slice(0, 5); // Max 5 reasons
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