const MortgageApplication = require("../models/index.js");
const BankMortgageProduct = require("../models/BankProduct.js");
const mortgageApplicationDocument = require("../models/CustomerDocument.js")
const customerBasicDetails = require("../models/CustomerBasicDetails.js")
const { Country, State, City } = require("country-state-city");

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
      ...body, application_id: applicationId
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


const UpdateLeadDocuments = async (req, res) => {
  // application_id,lead_id,loan_type,mortgage_type,loan_preference,income_type,property_value,loan_amount,status,mortgage_manager
  try {

    let { lead_id, application_id, customer_id } = req.query;
    console.log("lead_id, application_id, customer_id", lead_id, application_id, customer_id)
    let mortgageApplicationDocs = await mortgageApplicationDocument.findOne({ lead_id });

    console.log("mortgageApplicationDocsmortgageApplicationDocs", mortgageApplicationDocs)

    if (!mortgageApplicationDocs) {
      return res.status(400).json({
        success: true,
        message: "No application found",
        data: null
      })
    }

    let body = req.body;

    let updatedMortgageApplication = await mortgageApplicationDocument.findOneAndUpdate({
      lead_id
    }, {
      ...req.body
    }, { new: true })

    return res.status(200).json({
      success: true,
      message: "Updated Mortgage Application",
      data: updatedMortgageApplication
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const UpdateMortgageApplicationPersonalDetails = async (req, res) => {
  // application_id,lead_id,loan_type,mortgage_type,loan_preference,income_type,property_value,loan_amount,status,mortgage_manager
  try {

    let { lead_id, application_id, customer_id } = req.query;
    console.log("lead_id, application_id, customer_id", lead_id, application_id, customer_id)
    let customerbasicdetails = await customerBasicDetails.find({ lead_id });

    console.log("mortgageApplicationDocsmortgageApplicationDocs", customerbasicdetails)

    if (customerbasicdetails.length==0) {
      return res.status(400).json({
        success: true,
        message: "No application found",
        data: null
      })
    }

    let body = req.body;

    let updatedcustomerbasicdetails = await customerBasicDetails.findOneAndUpdate({
      lead_id
    }, {
      ...req.body
    }, { new: true })

    return res.status(200).json({
      success: true,
      message: "Updated personal Info in mortgage application",
      data: updatedcustomerbasicdetails
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

    let { lead_id } = req.query;

    let mortgage_application = await MortgageApplication.findOne({ lead_id });
    let upload_your_document = await mortgageApplicationDocument.find({ lead_id });
    let personal_details = await customerBasicDetails.find({ lead_id });

    return res.status(201).json({
      success: true,
      message: "Data fetched successfully",
      data: { mortgage_application, product_selected: {}, upload_your_document: upload_your_document[0], personal_details: personal_details[0], product_requirements: {} }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const createBankProducts = async (req, res) => {
  try {


    let bankProduct = await BankMortgageProduct.create({ ...req.body });


    return res.status(201).json({
      success: true,
      message: "Bank Product created successfully",
      data: bankProduct
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getAllBankProducts = async (req, res) => {
  try {


    let bankProducts = await BankMortgageProduct.find();


    return res.status(200).json({
      success: true,
      message: "Bank Product fetched successfully",
      data: bankProducts
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



const getAllUaeStates = async (req, res) => {
  try {
    const states = State.getStatesOfCountry("AE");

    let allCities = [];

    states.forEach((state) => {
      const cities = City.getCitiesOfState("AE", state.isoCode);
      allCities.push(...cities);
    });

    return res.status(200).json({
      success: true,
      message: "UAE states and cities fetched successfully",
      data: {
        states,
        cities: allCities
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




module.exports = { UpdateMortgageApplicationPersonalDetails,createMortgageApplication, getLeadData, createBankProducts, getAllBankProducts, getAllUaeStates, UpdateLeadDocuments }