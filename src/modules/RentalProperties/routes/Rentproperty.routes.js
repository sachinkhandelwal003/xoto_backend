const express = require("express");
const router = express.Router();

const {
  createProperty,
  getProperties,
  getSingleProperty,
  deleteProperty,
  updateProperty
} = require("../controllers/Rentproperty.controller");

// CREATE
router.post("/create", createProperty);

// GET ALL (FILTER + PAGINATION)
router.get("/search", getProperties);

// GET ONE
router.get("/:id", getSingleProperty);

// DELETE
router.delete("/:id", deleteProperty);

// updated Property
router.post("/update-property/:id", updateProperty)

module.exports = router;