const mongoose = require("mongoose");

const RentalPropertySchema = new mongoose.Schema({

  // 🏷 BASIC INFO
  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    default: ""
  },

  // 🌍 LOCATION
  emirate: {
    type: String,
    required: true,
    trim: true
  },

  location: {
    address: {
      type: String,
      default: "",
      trim: true
    },
    area: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    }
  },

  // 💰 PRICING
  price: {
    type: Number,
    required: true,
    min: 0
  },

  monthly: {
    type: Number,
    default: 0,
    min: 0
  },

  deposit: {
    type: Number,
    default: 0,
    min: 0
  },

  // 🏠 PROPERTY DETAILS
  type: {
    type: String,
    enum: ["Apartment", "Villa", "Penthouse", "Townhouse", "Studio"],
    required: true
  },

  bhk: {
    type: String,
    default: ""
  },

  size: {
    type: Number,
    default: 0,
    min: 0
  },

  baths: {
    type: Number,
    default: 0,
    min: 0
  },

  furnishing: {
    type: String,
    enum: ["Fully Furnished", "Semi Furnished", "Unfurnished"],
    default: "Unfurnished"
  },

  tenants: {
    type: String,
    default: ""
  },

  // 📅 AVAILABILITY
  availableFrom: {
    type: Date,
    default: null
  },

  isImmediate: {
    type: Boolean,
    default: true
  },

  // 🧩 AMENITIES
  amenities: [{
    type: String,
   enum: [
  "Pool",
  "Gym",
  "Parking",
  "Sea View",
  "Balcony",
  "Chiller Free",
  "WiFi",
  "Near Metro",
  "DEWA Included",
  "Kids Play Area",
  "Maid's Room"
]
  }],

  // 🖼 IMAGES
  images: {
    type: [String],
    required: true,
    validate: {
      validator: function (arr) {
        return arr.length > 0;
      },
      message: "At least one image is required"
    }
  },

  // ✅ FLAGS
  verified: {
    type: Boolean,
    default: false
  },

  ejari: {
    type: Boolean,
    default: false
  },

  // ⭐ OPTIONAL
  // rating: {
  //   type: Number,
  //   default: 0,
  //   min: 0,
  //   max: 5
  // },

  reviews: {
    type: Number,
    default: 0,
    min: 0
  },

  // 👤 AGENT INFO
  // agent: {
  //   name: {
  //     type: String,
  //     default: ""
  //   },
  //   role: {
  //     type: String,
  //     default: ""
  //   }
  // },

  // 🔐 OWNER
  owner: {
    type: String,
    default: ""
  }

}, {
  timestamps: true
});


// ⚡ INDEXES (corrected)
RentalPropertySchema.index({ price: 1 });
RentalPropertySchema.index({ type: 1 });
RentalPropertySchema.index({ bhk: 1 });
RentalPropertySchema.index({ "location.area": 1 });
RentalPropertySchema.index({ emirate: 1 });


// 🔥 EXPORT
module.exports = mongoose.model("RentalProperty", RentalPropertySchema);