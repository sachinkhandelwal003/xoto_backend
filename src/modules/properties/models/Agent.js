// const mongoose = require("mongoose");

// const AgentSchema = new mongoose.Schema({

//     name: {
//         type: String,
//         trim: true,
//         default: "",
//         required: false
//     },

//     email: {
//         type: String,
//         lowercase: true,
//         default: "",
//         required: false,
//     },

//     phone_number: {
//         type: String,
//         trim: true,
//         default: "",
//         required: false
//     },

//     country_code: {
//         type: String,
//         trim: true,
//         default: "+91",
//         required: false
//     },

//     password: {
//         type: String,
//         required: false
//     },

//     profile_photo: {
//         type: String,
//         default: "",
//         required: false
//     },


//     agentType: {
//         type: String,
//         enum: ["individual", "agency"],
//         default: "individual",
//         required: false
//     },

//     agencyId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Agency",
//         default: null,
//         required: false
//     },

//     letterOfAuthority: {
//         type: String,
//         default: "",
//         required: false
//     },


//     country: {
//         type: String,
//         default: "",
//         required: false
//     },

//     city: {
//         type: String,
//         default: "",
//         required: false
//     },

//     operatingRegions: [{
//         type: String,
//         required: false
//     }],

//     status: {
//         type: String,
//         enum: ["pending", "approved", "rejected", "suspended"],
//         default: "pending",
//         required: false
//     },

//     isVerifiedByAdmin: {
//         type: Boolean,
//         default: false,
//         required: false
//     },

//     isActive: {
//         type: Boolean,
//         default: true,
//         required: false
//     },


//     subscriptionPlan: {
//         type: String,
//         enum: ["free", "paid"],
//         default: "free",
//         required: false
//     },

//     subscriptionExpiry: {
//         type: Date,
//         default: null,
//         required: false
//     },


//     notificationSettings_email: {
//         type: Boolean, default: true,
//         required: false
//     },
//     notificationSettings_sms: {
//         type: Boolean, default: false,
//         required: false
//     },
//     notificationSettings_whatsapp: {
//         type: Boolean, default: true,
//         required: false
//     },

//     presentationsGenerated_count: {
//         type: Number,
//         default: 0,
//         required: false
//     },

//     leadsCreated_count: {
//         type: Number,
//         default: 0,
//         required: false
//     },

//     dealsClosed_count: {
//         type: Number,
//         default: 0,
//         required: false
//     },

// }, { timestamps: true });

// const Agent = mongoose.model("Agent", AgentSchema, "Agents");
// module.exports = Agent;
