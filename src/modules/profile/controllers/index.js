import AllUsers from "../../../modules/auth/models/user/user.model.js"
import Freelancer from "../../../modules/auth/models/Freelancer/freelancer.model.js"
import Customer from "../../../modules/auth/models/user/customer.model.js"
import Admin from "../../../modules/auth/models/User.js"
import Vendor from "../../../modules/auth/models/Vendor/B2cvendor.model.js"
import Agent from "../../Grid/Agent/models/agent.js"
import Agency from "../../Grid/agency/models/index.js"
import VaultAgent from "../../vault/models/Agent.js"
import VaultPartner from "../../vault/models/Partner.js"
import Developer from "../../properties/models/DeveloperModel.js"
import GridAdvisor from "../../Grid/Advisor/model/index.js"
import VaultAdvisor from "../../vault/models/XotoAdvisor.js";
import VaultMortgageOps from "../../vault/models/MortgageOps.js";

// ── Role ke basis par model return karo ──────────────────────────────
const getModelByRole = (roleName) => {
    switch (roleName) {
        case "Supervisor":
        case "Accountant": return AllUsers;
        case "Freelancer": return Freelancer;
        case "Customer": return Customer;
        case "SuperAdmin": return Admin;
      case "Admin": return Admin;
            case "VaultAdmin": return Admin;
        case "Vendor-B2C": return Vendor;
        case "Agent": return Agent;
        case "Developer": return Developer;
                case "Agency": return Agency;
                                case "VaultPartner": return VaultPartner;
                case "VaultAgent": return VaultAgent;
                case "GridAdvisor": return GridAdvisor;
                case "Vault-Advisor": return VaultAdvisor;
                case "Vault-Mortgage-Ops": return VaultMortgageOps;

        default: return null;
    }
};

// ── GET profile ───────────────────────────────────────────────────────
export const getProfileData = async (req, res) => {
  try {
    const user  = req.user;
    const Model = getModelByRole(user.role.name);
    if (!Model) return res.status(400).json({ message: "Invalid Role" });

    let query = Model.findOne({ _id: user._id });

        let query = Model.findOne({ _id: user._id });

        // Specific population based on roles
        if (user.role.name === "Freelancer") {
            query.populate("payment.preferred_currency services_offered.category services_offered.subcategories.type");
        } else if (user.role.name === "Vendor-B2C") {
            query.populate("store_details.categories");
        }else if (user.role.name === "GridAdvisor") {
    query.populate("createdBy", "firstName lastName email");  // ← add karo
} else {
            query.populate("role");
        }

        const data = await query;
        return res.status(200).json({ data });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching data", error: error.message });
    }

    // VaultAgent — partner info bhi populate karo
    if (user.role.name === "VaultAgent") {
      query.populate("partnerId", "companyName status _id");
    }

    const data = await query;
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching data", error: error.message });
  }
};

// ── PUT update profile ────────────────────────────────────────────────
export const updateProfileData = async (req, res) => {
  try {
    const user       = req.user;
    const updateData = { ...req.body };
    const Model      = getModelByRole(user.role.name);
    if (!Model) return res.status(400).json({ message: "Invalid Role" });

    // Security — important fields block karo
    delete updateData.role;
    delete updateData._id;
    delete updateData.password;
    delete updateData.isVerifiedByAdmin;
    delete updateData.isVerified;
    delete updateData.commissionEligible;
    delete updateData.earnings;
    delete updateData.isActive;
    delete updateData.isDeleted;

    let finalUpdate = updateData;

        if (user.role.name === "GridAdvisor") {
    delete updateData.employeeId;
    delete updateData.status;
    delete updateData.mustResetPassword;
    delete updateData.email;
    delete updateData["identity.isVerified"];
    delete updateData["bankDetails.isVerified"];
}

        const updatedProfile = await Model.findOneAndUpdate(
            { _id: user._id },
            { $set: updateData },
            { new: true, runValidators: true }
        );

      finalUpdate = { ...rest };

      // name nested
      if (first_name !== undefined) finalUpdate["name.first_name"] = first_name.trim();
      if (last_name  !== undefined) finalUpdate["name.last_name"]  = last_name.trim();

      // phone nested
      if (country_code !== undefined) finalUpdate["phone.country_code"] = country_code;
      if (phone_number  !== undefined) finalUpdate["phone.number"]       = phone_number.trim();

      // Block sensitive nested paths
      delete finalUpdate["name"];
      delete finalUpdate["phone"];
      delete finalUpdate["emiratesId.verified"];
      delete finalUpdate["passport.verified"];
      delete finalUpdate["bankDetails.verified"];
    }

    const updatedProfile = await Model.findOneAndUpdate(
      { _id: user._id },
      { $set: finalUpdate },
      { new: true, runValidators: true }
    ).populate("role").populate("partnerId", "companyName status _id");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedProfile,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Update failed", error: error.message });
  }
};

// ── POST update profile picture / documents ───────────────────────────
export const updateProfilePicture = async (req, res) => {
  try {
    const user = req.user;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload a file" });
    }

    const Model = getModelByRole(user.role.name);
    if (!Model) return res.status(400).json({ message: "Invalid Role" });

    // ✅ S3 URL — multer-s3 req.file.location mein deta hai
    const fileUrl = req.file.location || req.file.path;

    // Frontend targetField bhejta hai — kahan save karna hai
    let fieldToUpdate = req.body.targetField;

    // ── Default field per role ────────────────────────────────────────
    if (!fieldToUpdate) {
      switch (user.role.name) {
        case "VaultAgent":  fieldToUpdate = "profilePic";    break; // ✅ schema field
        case "Agent":       fieldToUpdate = "profile_photo"; break;
        case "Freelancer":  fieldToUpdate = "profile_photo"; break;
        default:            fieldToUpdate = "logo";
      }
    }

    // ── VaultAgent document fields — nested path handle karo ─────────
    // Frontend bhejta hai: "emiratesId_front", "emiratesId_back",
    //                      "passport_image", "visa_image"
    // Schema mein hain:    "emiratesId.frontImageUrl", "passport.imageUrl" etc.
    if (user.role.name === "VaultAgent") {
      const nestedFieldMap = {
        "emiratesId_front":  "emiratesId.frontImageUrl",
        "emiratesId_back":   "emiratesId.backImageUrl",
        "passport_image":    "passport.imageUrl",
        "visa_image":        "visa.imageUrl",
        // profilePic top-level hi hai — koi mapping nahi
      };
      if (nestedFieldMap[fieldToUpdate]) {
        fieldToUpdate = nestedFieldMap[fieldToUpdate];
      }
    }

    const updateData     = { [fieldToUpdate]: fileUrl };
    const updatedProfile = await Model.findOneAndUpdate(
      { _id: user._id },
      { $set: updateData },
      { new: true }
    ).populate("role").populate("partnerId", "companyName status _id");

    return res.status(200).json({
      success: true,
      message: `${fieldToUpdate.replace(/[_.]/g, " ")} updated successfully`,
      data: updatedProfile, // ✅ poora updated profile return karo
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "File update failed", error: error.message });
  }
};