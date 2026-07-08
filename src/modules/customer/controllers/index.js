import Quotation from "../../auth/models/leads/quotation.model.js"
import Estimate from "../../auth/models/leads/estimate.model.js"
import Customer from "../../auth/models/user/customer.model.js"
import jwt from "jsonwebtoken"

// ────────────────────────────────────────────────────────────
// Customer OTP Login — verify OTP then return JWT
// POST /customer/otp-login
// body: { country_code, phone_number, otp }
// ────────────────────────────────────────────────────────────
export const customerOtpLogin = async (req, res) => {
  try {
    const { country_code, phone_number, otp } = req.body;

    if (!country_code || !phone_number || !otp) {
      return res.status(400).json({ success: false, message: "Country code, phone number, and OTP are required" });
    }

    // OTP verification (bypass: 000033 in dev)
    const BYPASS_OTP = process.env.BYPASS_OTP || "000033";
    if (otp !== BYPASS_OTP) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Find customer by mobile
    const cc = country_code.startsWith("+") ? country_code : `+${country_code}`;
    const customer = await Customer.findOne({
      "mobile.country_code": cc,
      "mobile.number": phone_number,
      is_deleted: false,
    }).populate("role", "code name isSuperAdmin level");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "No account found with this mobile number. Please register first.",
      });
    }

    if (!customer.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated. Contact support." });
    }

    // Mark mobile as verified
    if (!customer.isMobileVerified) {
      customer.isMobileVerified = true;
      await customer.save();
    }

    // Generate JWT
    const payload = {
      id: customer._id,
      email: customer.email,
      type: "customer",
      role: {
        id: customer.role?._id || null,
        code: customer.role?.code ?? null,
        name: customer.role?.name ?? "customer",
        isSuperAdmin: false,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || "30d",
    });

    const userObj = customer.toObject();
    delete userObj.__v;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: userObj,
      type: "customer",
    });

  } catch (error) {
    console.error("customerOtpLogin error:", error);
    return res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

export const getAllQuotations = async (req, res) => {
    try {
        let { customer_id, page = 1, limit = 10 } = req.query;

        if (!customer_id) {
            return res.status(400).json({
                message: "Customer Id is necessary",
            });
        }

        page = Number(page);
        limit = Number(limit);
        let skip = (page - 1) * limit;

        const query = { customer: customer_id };

        // 🔹 TOTAL COUNT (for pagination)
        const total = await Estimate.countDocuments(query);

        // 🔹 DATA FETCH
        const allEstimates = await Estimate.find(query)
            .populate([
                { path: "subcategory" },
                { path: "type" },
                { path: "package" },

                { path: "assigned_supervisor", select: "name email role" },
                { path: "assigned_by", select: "name email role" },
                { path: "deal_converted_by", select: "name email role" },
                { path: "customer", select: "name email mobile" },

                { path: "sent_to_freelancers", select: "name email mobile" },

                {
                    path: "final_quotation",
                    populate: { path: "created_by estimate" },
                },
                {
                    path: "admin_final_quotation",
                    populate: { path: "created_by estimate" },
                },
                {
                    path: "freelancer_selected_quotation",
                    populate: { path: "created_by estimate" },
                },

                {
                    path: "freelancer_quotations.freelancer",
                    select: "name email mobile",
                },
                {
                    path: "freelancer_quotations.quotation",
                    populate: { path: "created_by estimate" },
                },
            ])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.status(200).json({
            success: true,
            data: allEstimates,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Server error",
        });
    }
};
