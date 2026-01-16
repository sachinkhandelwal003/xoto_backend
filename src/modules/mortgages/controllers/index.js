const MortgageApplication = require("../models/index.js");
const BankMortgageProduct = require("../models/BankProduct.js");
const mortgageApplicationDocuments = require("../models/CustomerDocument.js")
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

    let mortgageApplicationDocs = await mortgageApplicationDocuments.findOne({ lead_id, customerId: customer_id });

    console.log("mortgageApplicationDocsmortgageApplicationDocs",mortgageApplicationDocs)

    if (!mortgageApplicationDocs) {
      return res.status(400).json({
        success: true,
        message: "No application found",
        data: null
      })
    }

    let body = req.body;

    let updatedMortgageApplication = await mortgageApplicationDocuments.findOneAndUpdate({
      lead_id, application_id, customer_id
    }, {
      ...req.body
    })

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


const getLeadData = async (req, res) => {
  // application_id,lead_id,loan_type,mortgage_type,loan_preference,income_type,property_value,loan_amount,status,mortgage_manager
  try {

    let { lead_id } = req.query;

    let mortgage_application = await MortgageApplication.findOne({ lead_id });
    let upload_your_document = await mortgageApplicationDocuments.find({ lead_id });

    return res.status(201).json({
      success: true,
      message: "Data fetched successfully",
      data: { mortgage_application, product_selected: {}, upload_your_document: upload_your_document[0], personal_details: {}, product_requirements: {} }
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




module.exports = { createMortgageApplication, getLeadData, createBankProducts, getAllBankProducts, getAllUaeStates ,UpdateLeadDocuments}