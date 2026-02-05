// const AllUsers = require("../modules/auth/models/user/user.model.js");
import AllUsers from "../../../modules/auth/models/user/user.model.js"
import Freelancer from "../../../modules/auth/models/Freelancer/freelancer.model.js"
import Customer from "../../../modules/auth/models/user/customer.model.js"
import Admin from "../../../modules/auth/models/User.js"
import Vendor from "../../../modules/auth/models/Vendor/B2cvendor.model.js"


export const getProfileData = async (req, res) => {
    try {
        let user = req.user;
        console.log("useruseruseruser", user)
        let data = {}
        if (user.role.name == "Supervisor") {
            data = await AllUsers.findOne({ _id: user._id });
        } else if (user.role.name == "Freelancer") {
            data = await Freelancer.findOne({ _id: user._id })
                .populate("payment.preferred_currency")
                .populate("services_offered.category")
                .populate("services_offered.subcategories.type");
        } else if (user.role.name == "Customer") {
            data = await Customer.findOne({ _id: user._id })
        } else if (user.role.name == "SuperAdmin") {
            data = await Admin.findOne({ _id: user._id })
        } else if (user.role.name == "Vendor-B2C") {
            data = await Vendor.findOne({ _id: user._id })
                .populate("store_details.categories");
        }
        else if (user.role.name == "Accountant") {
            data = await AllUsers.findOne({ _id: user._id })
        }

        return res.status(200).json({
            data,
        })
    } catch (error) {
        return res.status(500).json({
            data: "Error came", error
        })
    }
}