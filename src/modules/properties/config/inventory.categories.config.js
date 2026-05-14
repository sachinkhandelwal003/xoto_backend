
const UNIT_TYPE_TO_INVENTORY_CATEGORY = {
  apartment: "residential_tower",
  penthouse: "residential_tower",
  duplex: "residential_tower",

  villa: "villa_community",

  townhouse: "townhouse_cluster",

  office: "commercial_office",

  retail: "commercial_retail",

  warehouse: "warehouse",

  plot: "land_plot"
};

const inventoryCategories = {
  residential_tower: {
    label: "Residential Tower / Apartment",
    description: "High-rise or mid-rise residential apartments",
    unitTypes: ["apartment", "penthouse", "duplex"],
    configFields: [
      {
        key: "towers",
        label: "Towers / Buildings",
        type: "array",
        required: true,
        fields: [
          { key: "name", label: "Tower Name", type: "text", required: true },
          { key: "totalFloors", label: "Total Floors", type: "number", default: 10 },
          { key: "unitsPerFloor", label: "Units Per Floor", type: "number", default: 2 }
        ]
      },
      {
        key: "floorConfigs",
        label: "Floor Bedroom Configs (which floors have which bedrooms)",
        type: "array",
        required: true,
        fields: [
          { key: "towerName", label: "Tower Name", type: "text", required: true },
          { key: "startFloor", label: "From Floor", type: "number", default: 1 },
          { key: "endFloor", label: "To Floor", type: "number", default: 10 },
          { key: "bedroomType", label: "Bedroom Type", type: "select", options: ["studio", "1bed", "2bed", "3bed", "4bed", "5bed", "6bed", "7bed", "8plus"], default: "2bed" },
          { key: "area", label: "Area (sqft)", type: "number", default: 1200 },
          { key: "price", label: "Price", type: "number", default: 1500000 },
          { key: "hasView", label: "Has View", type: "boolean", default: false },
          { key: "viewType", label: "View Type", type: "multiSelect", options: ["sea", "city", "garden", "landmark", "pool", "park"], default: [] },
          { key: "parkingSpaces", label: "Parking Spaces", type: "number", default: 0 },
          { key: "furnishing", label: "Furnishing", type: "select", options: ["furnished", "semi_furnished", "unfurnished"], default: "unfurnished" },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  },

  villa_community: {
    label: "Villa Community",
    description: "Gated community with villas",
    unitTypes: ["villa"],
    configFields: [
      {
        key: "villaTypes",
        label: "Villa Types",
        type: "array",
        required: true,
        fields: [
          { key: "bedroomType", label: "Bedroom Type", type: "select", options: ["3bed", "4bed", "5bed", "6bed", "7bed", "8plus"], default: "3bed" },
          { key: "area", label: "Built-up Area (sqft)", type: "number", default: 3000 },
          { key: "price", label: "Price", type: "number", default: 2500000 },
          { key: "count", label: "How many?", type: "number", default: 10 },
          { key: "hasView", label: "Has View", type: "boolean", default: false },
          { key: "viewType", label: "View Type", type: "multiSelect", options: ["sea", "city", "garden", "landmark", "pool", "park"], default: [] },
          { key: "parkingSpaces", label: "Parking Spaces", type: "number", default: 0 },
          { key: "furnishing", label: "Furnishing", type: "select", options: ["furnished", "semi_furnished", "unfurnished"], default: "unfurnished" },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  },

  townhouse_cluster: {
    label: "Townhouse Cluster",
    description: "Clusters of townhouses",
    unitTypes: ["townhouse"],
    configFields: [
      {
        key: "townhouseTypes",
        label: "Townhouse Types",
        type: "array",
        required: true,
        fields: [
          { key: "bedroomType", label: "Bedroom Type", type: "select", options: ["2bed", "3bed", "4bed", "5bed"], default: "3bed" },
          { key: "area", label: "Built-up Area (sqft)", type: "number", default: 2000 },
          { key: "price", label: "Price", type: "number", default: 1800000 },
          { key: "count", label: "How many?", type: "number", default: 15 },
          { key: "hasView", label: "Has View", type: "boolean", default: false },
          { key: "viewType", label: "View Type", type: "multiSelect", options: ["sea", "city", "garden", "landmark", "pool", "park"], default: [] },
          { key: "parkingSpaces", label: "Parking Spaces", type: "number", default: 0 },
          { key: "furnishing", label: "Furnishing", type: "select", options: ["furnished", "semi_furnished", "unfurnished"], default: "unfurnished" },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  },

  commercial_office: {
    label: "Commercial Office Building",
    description: "Commercial office spaces",
    unitTypes: ["office"],
    configFields: [
      {
        key: "floors",
        label: "Floors",
        type: "array",
        required: true,
        fields: [
          { key: "floorNumber", label: "Floor Number", type: "number", default: 1 },
          { key: "unitsPerFloor", label: "Units Per Floor", type: "number", default: 4 },
          { key: "area", label: "Area per Unit (sqft)", type: "number", default: 800 },
          { key: "price", label: "Price per Unit", type: "number", default: 800000 },
          { key: "hasView", label: "Has View", type: "boolean", default: false },
          { key: "viewType", label: "View Type", type: "multiSelect", options: ["sea", "city", "garden", "landmark", "pool", "park"], default: [] },
          { key: "parkingSpaces", label: "Parking Spaces", type: "number", default: 0 },
          { key: "furnishing", label: "Furnishing", type: "select", options: ["furnished", "semi_furnished", "unfurnished"], default: "unfurnished" },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  },

  commercial_retail: {
    label: "Retail Mall / Shops",
    description: "Retail spaces and shopping complexes",
    unitTypes: ["retail"],
    configFields: [
      {
        key: "floors",
        label: "Floors",
        type: "array",
        required: true,
        fields: [
          { key: "floorNumber", label: "Floor Number", type: "text", default: "1" },
          { key: "unitsPerFloor", label: "Shops Per Floor", type: "number", default: 6 },
          { key: "area", label: "Area per Shop (sqft)", type: "number", default: 400 },
          { key: "price", label: "Price per Shop", type: "number", default: 500000 },
          { key: "hasView", label: "Has View", type: "boolean", default: false },
          { key: "viewType", label: "View Type", type: "multiSelect", options: ["sea", "city", "garden", "landmark", "pool", "park"], default: [] },
          { key: "parkingSpaces", label: "Parking Spaces", type: "number", default: 0 },
          { key: "furnishing", label: "Furnishing", type: "select", options: ["furnished", "semi_furnished", "unfurnished"], default: "unfurnished" },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  },

  warehouse: {
    label: "Warehouse / Industrial",
    description: "Industrial warehouse spaces",
    unitTypes: ["warehouse"],
    configFields: [
      {
        key: "warehouses",
        label: "Warehouses",
        type: "array",
        required: true,
        fields: [
          { key: "name", label: "Warehouse Name", type: "text", required: true },
          { key: "area", label: "Area (sqft)", type: "number", default: 5000 },
          { key: "price", label: "Price", type: "number", default: 2000000 },
          { key: "count", label: "How many?", type: "number", default: 5 },
          { key: "parkingSpaces", label: "Parking Spaces", type: "number", default: 2 },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  },

  land_plot: {
    label: "Plotted Development",
    description: "Land plots for sale",
    unitTypes: ["plot"],
    configFields: [
      {
        key: "plotTypes",
        label: "Plot Types",
        type: "array",
        required: true,
        fields: [
          { key: "area", label: "Plot Size (sqft)", type: "number", default: 1000 },
          { key: "price", label: "Price", type: "number", default: 300000 },
          { key: "count", label: "How many?", type: "number", default: 20 },
          { key: "areaUnit", label: "Area Unit", type: "select", options: ["sqft", "sqm"], default: "sqft" },
          { key: "currency", label: "Currency", type: "text", default: "AED" },
          { key: "status", label: "Status", type: "select", options: ["available", "hold", "reserved", "booked", "spa_signed", "sold", "handover", "cancelled"], default: "available" }
        ]
      }
    ]
  }
};

function determineInventoryCategory(unitType, propertyType, unitTypesArray = []) {
  if (unitTypesArray && unitTypesArray.length > 0) {
    for (const unitType of unitTypesArray) {
      const normalizedType = (unitType || "").toLowerCase().trim();
      if (UNIT_TYPE_TO_INVENTORY_CATEGORY[normalizedType]) {
        return UNIT_TYPE_TO_INVENTORY_CATEGORY[normalizedType];
      }
    }
  }

  if (unitType) {
    const normalizedType = (unitType || "").toLowerCase().trim();
    if (UNIT_TYPE_TO_INVENTORY_CATEGORY[normalizedType]) {
      return UNIT_TYPE_TO_INVENTORY_CATEGORY[normalizedType];
    }
  }

  if (propertyType) {
    const pType = (propertyType || "").toLowerCase().trim();
    if (pType === "residential") return "residential_tower";
    if (pType === "commercial") return "commercial_office";
  }

  return "residential_tower";
}

module.exports = { 
  inventoryCategories, 
  determineInventoryCategory, 
  UNIT_TYPE_TO_INVENTORY_CATEGORY 
};

