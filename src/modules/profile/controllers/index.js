import AllUsers from "../../../modules/auth/models/user/user.model.js"
import Freelancer from "../../../modules/auth/models/Freelancer/freelancer.model.js"
import Customer from "../../../modules/auth/models/user/customer.model.js"
import Admin from "../../../modules/auth/models/User.js"
import Vendor from "../../../modules/auth/models/Vendor/B2cvendor.model.js"
import Agent from "../../Agent/models/agent.js"
import Developer from "../../properties/models/DeveloperModel.js"

// Helper function: Role ke basis par model return karne ke liye
const getModelByRole = (roleName) => {
    switch (roleName) {
        case "Supervisor":
        case "Accountant": return AllUsers;
        case "Freelancer": return Freelancer;
        case "Customer": return Customer;
        case "SuperAdmin": return Admin;
      case "Admin": return Admin;
        case "Vendor-B2C": return Vendor;
        case "Agent": return Agent;
        case "Developer": return Developer;
        default: return null;
    }
};

export const getProfileData = async (req, res) => {
    try {
        const user = req.user;
        const Model = getModelByRole(user.role.name);

        if (!Model) return res.status(400).json({ message: "Invalid Role" });

        let query = Model.findOne({ _id: user._id });

        // Specific population based on roles
        if (user.role.name === "Freelancer") {
            query.populate("payment.preferred_currency services_offered.category services_offered.subcategories.type");
        } else if (user.role.name === "Vendor-B2C") {
            query.populate("store_details.categories");
        } else {
            query.populate("role");
        }

        const data = await query;
        return res.status(200).json({ data });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching data", error: error.message });
    }
};




export const updateProfileData = async (req, res) => {
    try {
        const user = req.user;
        const updateData = { ...req.body };
        const Model = getModelByRole(user.role.name);

        if (!Model) return res.status(400).json({ message: "Invalid Role" });

        // Security: Important fields ko delete karein taaki user bypass na kare
        delete updateData.role;
        delete updateData._id;
        delete updateData.isVerifiedByAdmin;
        delete updateData.isVerified;

        const updatedProfile = await Model.findOneAndUpdate(
            { _id: user._id },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: updatedProfile,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Update failed", error: error.message });
    }
};

export const updateProfilePicture = async (req, res) => {
    try {
        const user = req.user;
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Please upload a file" });
        }

        const Model = getModelByRole(user.role.name);
        // S3 URL ya local path
        const fileUrl = req.file.location || req.file.path;

        // --- NAYA LOGIC ---
        // Frontend se hum batayenge ki kahan save karna hai (e.g., 'id_proof', 'rera_certificate')
        let fieldToUpdate = req.body.targetField;

        // --- PURANA LOGIC (SAFE GUARD) ---
        // Agar frontend ne koi field nahi bataya, toh aapka exact purana code chalega!
        if (!fieldToUpdate) {
            fieldToUpdate = (user.role.name === "Agent") ? "profile_photo" : "logo";
        }
        
        // Jo bhi field final hua, usme URL daal do
        const updateData = { [fieldToUpdate]: fileUrl };

        const updatedProfile = await Model.findOneAndUpdate(
            { _id: user._id },
            { $set: updateData },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            // Message ko dynamic kar diya taaki jo upload ho wahi message aaye
            message: `${fieldToUpdate.replace('_', ' ')} updated successfully`,
            data: updatedProfile,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "File update failed", error: error.message });
    }
};