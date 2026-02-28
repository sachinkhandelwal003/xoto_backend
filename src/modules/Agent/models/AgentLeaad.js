const mongoose = require("mongoose");

const LeadSchema = new mongoose.Schema({

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
    type:String,
    required:true
  },

  phone_number:{
    type:String,
    required:true
  },

  requirement_description:{
    type:String,
    required:true
  },

  agent:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Agent",
    required:true
  },

  status:{
    type:String,
    enum:["new","contacted","closed","rejected"],
    default:"new"
  },
 // ✅ Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false
  },

  deletedAt: {
    type: Date,
    default: null
  }
},{ timestamps:true });

module.exports =
mongoose.models.Lead ||
mongoose.model("Lead",LeadSchema);