const mongoose = require("mongoose");

const CommissionSchema = new mongoose.Schema({

  // PROPERTY
  property:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Property",
    required:true
  },

  // DEVELOPER
  developer:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Developer"
  },

  // AGENT
  agent:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Agent",
    required:true
  },

  // LEAD
  lead:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Lead"
  },

  // PROPERTY PRICE
  propertyPrice:{
    type:Number
  },

  // COMMISSION CONFIG
  commissionType:{
    type:String,
    enum:["fixed","percentage"],
    default:"percentage"
  },

  commissionValue:{
    type:Number
  },

  // FINAL COMMISSION
  commissionAmount:{
    type:Number
  },

  // STATUS
  status:{
    type:String,
    enum:[
      "pending",
      "approved",
      "paid"
    ],
    default:"pending"
  },

  // PAYMENT DATE
  paidAt:{
    type:Date
  },

  // SOFT DELETE
  isDeleted:{
    type:Boolean,
    default:false
  },

  deletedAt:{
    type:Date,
    default:null
  }

},{timestamps:true});


module.exports =
mongoose.models.Commission ||
mongoose.model("Commission",CommissionSchema);