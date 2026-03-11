const mongoose = require("mongoose");

const SiteVisitSchema = new mongoose.Schema({

lead:{
type:mongoose.Schema.Types.ObjectId,
ref:"Lead",
required:true
},

agent:{
type:mongoose.Schema.Types.ObjectId,
ref:"Agent",
required:true
},

property:{
type:mongoose.Schema.Types.ObjectId,
ref:"Property"
},

developer:{
type:mongoose.Schema.Types.ObjectId,
ref:"Developer"
},

requestedDate:{
type:Date
},

scheduledDate:{
type:Date
},

visitTime:{
type:String
},

clientName:{
type:String
},

clientPhone:{
type:String
},

status:{
type:String,
enum:[
"requested",
"approved",
"scheduled",
"completed",
"cancelled"
],
default:"requested"
},

adminApprovedBy:{
type:mongoose.Schema.Types.ObjectId,
ref:"Admin"
},

feedback:{
type:String
},

interestScore:{
type:Number
}

},{timestamps:true});

module.exports =
mongoose.models.SiteVisit ||
mongoose.model("SiteVisit",SiteVisitSchema);