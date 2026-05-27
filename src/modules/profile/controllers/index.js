import AllUsers from "../../../modules/auth/models/user/user.model.js"
import Freelancer from "../../../modules/auth/models/Freelancer/freelancer.model.js"
import Customer from "../../../modules/auth/models/user/customer.model.js"
import Admin from "../../../modules/auth/models/User.js"
import Vendor from "../../../modules/auth/models/Vendor/B2cvendor.model.js"
import Agent from "../../Grid/Agent/models/agent.js"
import Agency from "../../Grid/agency/models/index.js"
import VaultAgent from "../../vault/models/Agent.js"
import VaultPartner from "../../vault/models/Partner.js"
import Developer from "../../Grid/Developer/models/developer.model.js"
import GridAdvisor from "../../Grid/Advisor/model/index.js"
import VaultAdvisor from "../../vault/models/XotoAdvisor.js";
import VaultMortgageOps from "../../vault/models/MortgageOps.js";
import GridReferralPartner from "../../Grid/ReferralPartner/Model/ReferralPartner.model.js";
// ── Commission eligibility status for VaultAgent ─────────────────────
function buildAgentCommissionStatus(agent) {
  if (agent.agentType === "ReferralPartner") {
    const steps = [
      { key: "phone",    label: "Phone verified",            done: !!agent.isPhoneVerified },
      { key: "eid",      label: "Emirates ID uploaded",      done: !!(agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) },
      { key: "eidVerif", label: "Emirates ID verified",      done: !!agent.emiratesId?.verified },
      { key: "bank",     label: "Bank details provided",     done: !!agent.bankDetails?.iban },
      { key: "bankVerif","label": "Bank details verified",   done: !!agent.bankDetails?.verified },
      { key: "admin",    label: "Admin account verification",done: !!agent.isVerified },
    ];
    const pending = steps.filter(s => !s.done);
    return {
      type:               "referral_partner",
      isActive:           agent.isActive,
      canSubmitLeads:     agent.isActive,
      commissionEligible: agent.commissionEligible,
      pendingSteps:       pending,
      allDone:            pending.length === 0,
      message: pending.length === 0
        ? "Account fully verified — you can earn commission on all disbursed leads."
        : `Account active for submitting leads. Complete ${pending.length} step${pending.length > 1 ? "s" : ""} to unlock commission.`,
    };
  }

  if (agent.agentType === "PartnerAffiliatedAgent") {
    const affiliationPending = agent.affiliationStatus === "pending";
    const steps = [
      { key: "affiliation", label: "Affiliation approved by partner", done: agent.affiliationStatus === "verified" },
      { key: "eid",         label: "Emirates ID uploaded",            done: !!(agent.emiratesId?.number && agent.emiratesId?.frontImageUrl) },
      { key: "bank",        label: "Bank details provided",           done: !!agent.bankDetails?.iban },
    ];
    const pending = steps.filter(s => !s.done);
    return {
      type:                  "partner_affiliated_agent",
      isActive:              agent.isActive,
      canSubmitLeads:        agent.isActive,
      affiliationStatus:     agent.affiliationStatus,
      commissionEligible:    false,
      commissionNote:        "Commission for your leads is paid to your partner company. Your partner determines your internal payout rate.",
      internalCommissionPct: agent.partnerInternalCommission?.percentage ?? null,
      partnerName:           agent.partnerId?.companyName ?? null,
      pendingSteps:          pending,
      allDone:               pending.length === 0,
      message: affiliationPending
        ? "Your account is active for submitting leads. Waiting for partner approval to access full features."
        : pending.length === 0
          ? "Account fully set up. Commission is paid to your partner company."
          : `Account active for submitting leads. Complete ${pending.length} step${pending.length > 1 ? "s" : ""} to finish your profile setup.`,
    };
  }
  return null;
}

// ── Role ke basis par model return karo ──────────────────────────────
const getModelByRole = (roleName) => {
    if (!roleName) return null;
    switch (roleName.toLowerCase()) {
        case "supervisor":
        case "accountant": return AllUsers;
        case "freelancer": return Freelancer;
        case "customer": return Customer;
        case "superadmin":
        case "admin":
        case "vaultadmin": return Admin;
        case "vendor-b2c": return Vendor;
        case "agent": return Agent;
        case "developer": return Developer;
        case "agency": return Agency;
        case "vaultpartner": return VaultPartner;
        case "vaultagent": return VaultAgent;
        case "gridadvisor": return GridAdvisor;
        case "vault-advisor": return VaultAdvisor;
        case "vault-mortgage-ops": return VaultMortgageOps;
        case "gridreferralpartner": return GridReferralPartner;

        default: return null;
    }
};

// ── GET profile ───────────────────────────────────────────────────────
export const getProfileData = async (req, res) => {
  try {
    const user  = req.user;
    const roleName = typeof user.role === "object" ? user.role?.name : user.role;
    const Model = getModelByRole(roleName);
    if (!Model) return res.status(400).json({ message: "Invalid Role" });

    let query = Model.findOne({ _id: user._id });

        // Specific population based on roles
        if (roleName === "Freelancer") {
            query.populate("payment.preferred_currency services_offered.category services_offered.subcategories.type");
        } else if (roleName === "Vendor-B2C") {
            query.populate("store_details.categories");
        }else if (roleName === "GridAdvisor") {
    query.populate("createdBy", "firstName lastName email");  // ← add karo
} else if (roleName === "GridReferralPartner") {
            // Referral partner stores role as a string, so there is no role ref to populate.
} else {
            query.populate("role");
        }

        // VaultAgent — partner info bhi populate karo
        if (roleName === "VaultAgent") {
          query.populate("partnerId", "companyName status _id defaultAgentCommissionPercentage");
        } else if (roleName === "Agent") {
          query.populate("role").populate("agency", "agency_name agencyName companyName");
        }

        const data = await query;

        // For VaultAgent, attach commission eligibility status
        let commissionStatus = null;
        if (roleName === "VaultAgent" && data) {
          commissionStatus = buildAgentCommissionStatus(data);
        }

        return res.status(200).json({ data, ...(commissionStatus ? { commissionStatus } : {}) });
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

    let finalUpdate = { ...updateData };

    if (user.role.name === "GridAdvisor") {
      delete finalUpdate.employeeId;
      delete finalUpdate.status;
      delete finalUpdate.mustResetPassword;
      delete finalUpdate.email;
      delete finalUpdate["identity.isVerified"];
      delete finalUpdate["bankDetails.isVerified"];
    }

    // Handle nested name fields
    const { first_name, last_name, country_code, phone_number } = req.body;
    if (first_name !== undefined) finalUpdate["name.first_name"] = first_name.trim();
    if (last_name  !== undefined) finalUpdate["name.last_name"]  = last_name.trim();

    // Handle nested phone fields
    if (country_code !== undefined) finalUpdate["phone.country_code"] = country_code;
    if (phone_number  !== undefined) finalUpdate["phone.number"]       = phone_number.trim();

    // Block sensitive nested paths
    delete finalUpdate["name"];
    delete finalUpdate["phone"];
    delete finalUpdate["emiratesId.verified"];
    delete finalUpdate["passport.verified"];
    delete finalUpdate["bankDetails.verified"];

    let updateQuery = Model.findOneAndUpdate(
      { _id: user._id },
      { $set: finalUpdate },
      { new: true, runValidators: true }
    ).populate("role");

    if (user.role.name === "VaultAgent") {
      updateQuery = updateQuery.populate("partnerId", "companyName status _id");
    } else if (user.role.name === "Agent") {
      updateQuery = updateQuery.populate("agency", "agency_name agencyName companyName");
    }

    const updatedProfile = await updateQuery;

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
        case "VaultAgent":          fieldToUpdate = "profilePic";       break; // ✅ schema field
        case "Agent":               fieldToUpdate = "profile_photo";    break;
        case "Freelancer":          fieldToUpdate = "profile_photo";    break;
        case "GridReferralPartner": fieldToUpdate = "profilePhotoUrl"; break;
        default:                    fieldToUpdate = "logo";
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
    let updateQuery = Model.findOneAndUpdate(
      { _id: user._id },
      { $set: updateData },
      { new: true }
    ).populate("role");

    if (user.role.name === "VaultAgent") {
      updateQuery = updateQuery.populate("partnerId", "companyName status _id");
    } else if (user.role.name === "Agent") {
      updateQuery = updateQuery.populate("agency", "agency_name agencyName companyName");
    }

    const updatedProfile = await updateQuery;

    return res.status(200).json({
      success: true,
      message: `${fieldToUpdate.replace(/[_.]/g, " ")} updated successfully`,
      data: updatedProfile, // ✅ poora updated profile return karo
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "File update failed", error: error.message });
  }
};
