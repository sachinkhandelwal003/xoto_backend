const mongoose = require("mongoose");

const DeveloperSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: "", required: false }, //name is the companyName
    phone_number: { type: String, trim: true, default: "", required: false },
    country_code: { type: String, trim: true, default: "", required: false },
    password:{type: String, trim: true, default: "", required: false},
    email: { type: String, trim: true, default: "", required: false },
    logo: { type: String, default: "", trim: true, required: false },
    description: { type: String, default: "", trim: true, required: false },
     role: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Role',
            required: false,
            default:null
          },
    websiteUrl: {
        type: String,
        default: "",
        trim: true,
        required: false
    },
    country: {
        type: String,
        required: false,
        default: ""
    },
    city: {
        type: String,
        required: false,
        default: ""
    },
    address: {
        type: String,
        required: false,
        default: "",
    },
    reraNumber: {
        type: String,
        required: false,
        default: ""
    },
    documents: [
        { type: String, default: "", trim: true, required: false }
    ],
      resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    isVerifiedByAdmin: {
        type: Boolean,
        default: false,
    },

    presentationsGenerated_stats: { type: Number, default: 0, required: false },
    leadsGenerated_stats: { type: Number, default: 0, required: false },
    unitsSold_stats: { type: Number, default: 0, required: false },
    conversionRate_stats: { type: Number, default: 0, required: false },
}, { timestamps: true });

const Developer = mongoose.model("Developer", DeveloperSchema, "Developers");
module.exports = Developer;



















// const mongoose = require("mongoose");

// const DeveloperSchema = new mongoose.Schema(
// {
//   // =========================
//   // BASIC ACCOUNT INFO
//   // =========================
//   name: {
//     type: String,
//     trim: true,
//     required: true
//   },

//   email: {
//     type: String,
//     required: true,
//     unique: true,
//     lowercase: true,
//     trim: true
//   },

//   password: {
//     type: String,
//     required: true
//   },

//   phone_number: {
//     type: String,
//     trim: true,
//     unique: true,
//     sparse: true
//   },

//   country_code: {
//     type: String,
//     trim: true,
//     default: "+971"
//   },

//   role: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Role",
//     default: null
//   },

//   // =========================
//   // COMPANY INFORMATION
//   // =========================
//   logo: {
//     type: String,
//     default: ""
//   },

//   description: {
//     type: String,
//     trim: true,
//     default: ""
//   },

//   websiteUrl: {
//     type: String,
//     trim: true,
//     default: ""
//   },

//   // =========================
//   // LOCATION
//   // =========================
//   country: {
//     type: String,
//     default: ""
//   },

//   city: {
//     type: String,
//     default: ""
//   },

//   address: {
//     type: String,
//     default: ""
//   },

//   // =========================
//   // LEGAL DETAILS
//   // =========================
//   reraNumber: {
//     type: String,
//     trim: true,
//     default: ""
//   },

//   documents: [
//     {
//       name: {
//         type: String,
//         default: ""
//       },
//       url: {
//         type: String,
//         default: ""
//       }
//     }
//   ],

//   // =========================
//   // VERIFICATION
//   // =========================
//   isVerifiedByAdmin: {
//     type: Boolean,
//     default: false
//   },

//   status: {
//     type: String,
//     enum: ["pending", "active", "suspended"],
//     default: "pending"
//   },

//   lastLogin: {
//     type: Date
//   }

// },
// {
//   timestamps: true
// }
// );



// // =========================
// // INDEXES
// // =========================
// DeveloperSchema.index({ email: 1 });
// DeveloperSchema.index({ phone_number: 1 });
// DeveloperSchema.index({ reraNumber: 1 });



// // =========================
// // REMOVE PASSWORD FROM API RESPONSE
// // =========================
// DeveloperSchema.methods.toJSON = function () {
//   const obj = this.toObject();
//   delete obj.password;
//   return obj;
// };



// // =========================
// // MODEL EXPORT
// // =========================
// const Developer = mongoose.model("Developer", DeveloperSchema, "Developers");

// module.exports = Developer;
