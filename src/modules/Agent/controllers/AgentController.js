import mongoose from "mongoose";
import Lead from "../models/AgentLeaad.js";
import SiteVisit from "../models/SiteVisit.js" 
import Property from "../../properties/models/PropertyModel.js"
import { query } from "winston";


/* ======================
CREATE LEAD
====================== */
export const createLead = async (req,res)=>{
try{

const agentId = req.body.agent;

const { name, phone_number, project } = req.body;

if(!name?.first_name || !name?.last_name || !phone_number){
return res.status(400).json({
success:false,
message:"Required fields missing"
});
}

// duplicate check
const duplicate = await Lead.findOne({
phone_number:phone_number,
agent:agentId,
isDeleted:false
});

if(duplicate){
return res.status(400).json({
success:false,
message:"Lead already exists"
});
}

// 🔥 property fetch
let developerId = null;

if(project){

const property = await Property.findById(project);

if(property){
developerId = property.developer;
}

}

const lead = await Lead.create({
  ...req.body,
  agent: agentId,
  developer: developerId
});

return res.status(201).json({
success:true,
message:"Lead created successfully",
data:lead,
developer:developerId
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}
};
// get all leads
export const getAllLeads = async (req, res) => {
  try {

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 5;
    const developer = req.query.developer;

    const skip = (page - 1) * limit;

    let query = {};

    if (developer) {
      query.developer = developer;
    }

    // Total count
    const total = await Lead.countDocuments(query);

    // Paginated data
    const leads = await Lead.find(query)
      .populate("agent", "first_name last_name email")
      .populate("project", "propertyName")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Leads fetched successfully",
      count: leads.length,
      data: leads,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalItems: total,
        limit
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ======================
GET LEAD BY ID
====================== */
export const getLeadById = async (req, res) => {

  try {

    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      });
    }

    const lead = await Lead.findById(id).populate("agent", "first_name last_name email");

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      data: lead
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ======================
UPDATE LEAD
====================== */
export const updateLead = async (req, res) => {

  try {

    const id = req.params.id;

    const updatedLead = await Lead.findOneAndUpdate(
      { _id: id },
      { $set: req.body },
      { new: true }
    );

    if (!updatedLead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      message: "Lead updated successfully",
      data: updatedLead
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ======================
DELETE LEAD
====================== */
export const deleteLead = async (req, res) => {

  try {

    const deleted = await Lead.findOneAndUpdate(
     {
  _id: req.params.id
},
      {
        isDeleted: true,        // mark deleted
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    return res.json({
      success: true,
      message: "Lead deleted successfully" // ✅ message show
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


export const updateLeadStatus = async (req, res) => {
  try {

    const { status } = req.body;

    const lead = await Lead.findOneAndUpdate(
      {
  _id: req.params.id
},
      { status },
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({
        success:false,
        message:"Lead not found"
      });
    }

    res.json({
      success:true,
      message:"Status updated",
      data:lead
    });

  } catch (error) {

    res.status(500).json({
      success:false,
      message:error.message
    });

  }
};

export const createSiteVisit = async(req,res)=>{

try{

// property fetch
const property = await Property.findById(req.body.property);

if(!property){
return res.status(404).json({
success:false,
message:"Property not found"
});
}

// developer id property से निकलेगी
const developerId = property.developer;

const visit = await SiteVisit.create({

lead:req.body.lead,
agent:req.body.agent,
property:req.body.property,
developer:developerId,

requestedDate:req.body.visitDate,
visitTime:req.body.visitTime,

clientName:req.body.clientName,
clientPhone:req.body.clientPhone,

status:"requested"

});

await Lead.findByIdAndUpdate(
req.body.lead,
{
status:"visit"
}
);

res.json({
success:true,
data:visit
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};

export const getAllSiteVisits = async (req,res)=>{

try{

const visits = await SiteVisit.find()

.populate("lead")
.populate("agent","first_name last_name")
.populate("property","propertyName")
.populate("developer","name")

.sort({createdAt:-1});

res.json({
success:true,
data:visits
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};

export const approveSiteVisit = async(req,res)=>{

try{

const visit = await SiteVisit.findByIdAndUpdate(

req.params.id,

{
status:"scheduled",
scheduledDate:req.body.scheduledDate,
adminApprovedBy:req.body.adminId
},

{new:true}

);

res.json({
success:true,
data:visit
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};

// backend/controllers/leadController.js (ya jahan tumhare baaki controllers hain)

export const updateSiteVisitStatus = async (req, res) => {
  try {
    // Frontend se jo status aayega (jaise "completed"), wo yahan aayega
    const { status } = req.body; 

    const visit = await SiteVisit.findByIdAndUpdate(
      req.params.id,
      { status: status }, // Status dynamically update hoga
      { new: true }
    );

    if (!visit) {
      return res.status(404).json({ success: false, message: "Visit not found" });
    }

    res.json({
      success: true,
      message: "Site visit status updated!",
      data: visit
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSiteVisitById = async(req,res)=>{

try{

const visit = await SiteVisit.findById(req.params.id)

.populate("lead")
.populate("agent","first_name last_name")
.populate("property","propertyName")
.populate("developer","name");

res.json({
success:true,
data:visit
});

}catch(error){

res.status(500).json({
success:false,
message:error.message
});

}

};