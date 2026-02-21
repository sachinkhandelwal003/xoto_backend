const mongoose = require('mongoose');

const virtualStagingSchema = new mongoose.Schema({

user:{
type:mongoose.Schema.Types.ObjectId,
ref:'User',
required:true
},

originalImage:{
public_id:{type:String,required:true},
url:{type:String,required:true}
},

stagedImage:{
public_id:{type:String},
url:{type:String}
},

// ROOM TYPE
roomType:{
type:String,
required:true,
enum:[
'Living Room',
'Bedroom',
'Kitchen',
'Home Office'
],
default:'Living Room'
},

// STYLE DROPDOWN SUPPORT
style:{
type:String,
required:true,
enum:[
'Modern',
'Contemporary',
'Scandinavian',
'Luxury'
],
default:'Modern'
},

status:{
type:String,
enum:[
'pending',
'processing',
'completed',
'failed'
],
default:'pending'
},

projectName:{
type:String,
default:'Xoto Property'
}

},{timestamps:true});

module.exports =
mongoose.model(
'VirtualStaging',
virtualStagingSchema
);