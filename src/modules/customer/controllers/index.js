import Quotation from "../../auth/models/leads/quotation.model.js"
import Estimate from "../../auth/models/leads/estimate.model.js"

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
