const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema({

  // CLIENT INFO
  name:{
    first_name:{
      type:String,
      required:true
    },

    last_name:{
      type:String,
      required:true
    }
  },

  email:{
    type:String
  },

  phone_number:{
    type:String,
    required:true
  },

  // PROPERTY INTEREST
  project:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Property"
  },
  //developer
  developer:{
  type:mongoose.Schema.Types.ObjectId,
  ref:"Developer"
},

  property_interest:{
    type:String
  },

  // CLIENT REQUIREMENT
  requirement_description:{
    type:String
  },

  budget:{
    type:Number
  },

  preferred_location:{
    type:String
  },

  bedrooms:{
    type:Number
  },

  property_type:{
    type:String
  },

  // AGENT
  agent:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Agent",
    required:true
  },

  // LEAD SOURCE (FRD requirement)
  source:{
    type:String,
    enum:["manual","presentation","enquiry","site_visit"],
    default:"manual"
  },

  // PIPELINE STATUS (FRD FLOW)
  status:{
    type:String,
    enum:[
      "lead",
      "visit",
      "deal",
      "booking",
      "closed",
      "lost"
    ],
    default:"lead"
  },

  siteVisit:{
type:mongoose.Schema.Types.ObjectId,
ref:"SiteVisit"
},

  // ACTIVITY TRACKING
  lastActivity:{
    type:String,
    default:"New Lead"
  },

  followUpDate:{
    type:Date
  },

  visitDate:{
    type:Date
  },

  visitFeedback:{
    type:String
  },

  // DEAL INFO
  dealValue:{
    type:Number
  },

  commission:{
    type:Number
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
mongoose.models.Lead ||
mongoose.model("Lead",LeadSchema);