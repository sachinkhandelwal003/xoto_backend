const mongoose = require("mongoose");

const DeveloperSchema = new mongoose.Schema({
    name: { type: String, trim: true, default: "", required: false}
}, { timestamps: true });

const Developer = mongoose.model("Developer",DeveloperSchema,"Developers");
module.exports = Developer;
