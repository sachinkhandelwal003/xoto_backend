const MortgageApplication = require("../models/index.js");


// CREATE Mortgage Application
const createMortgageApplication = async (req, res) => {
  // application_id,lead_id,loan_type,mortgage_type,loan_preference,income_type,property_value,loan_amount,status,mortgage_manager
  try {
    // const {
    //   lead_id,
    //   loan_type,
    //   mortgage_type,
    //   loan_preference,
    //   income_type,
    //   property_value,
    //   loan_amount,
    //   mortgage_manager
    // } = req.body;

    // Optional: generate application ID if not sent
    const applicationId =
      req.body.application_id ||
      `XOTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    let body = req.body;
    const application = await MortgageApplication.create({
      ...body,application_id: applicationId
    });

    return res.status(201).json({
      success: true,
      message: "Mortgage application created successfully",
      data: application
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const getLeadData = async (req, res) => {
  // application_id,lead_id,loan_type,mortgage_type,loan_preference,income_type,property_value,loan_amount,status,mortgage_manager
  try {

    let {lead_id} = req.query;

    let mortgage_application = await MortgageApplication.findOne({lead_id});


    return res.status(201).json({
      success: true,
      message: "Data fetched successfully",
      data: {mortgage_application,product_selected:{},upload_your_document:{},personal_details:{},product_requirements:{}}
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


module.exports = {createMortgageApplication,getLeadData}