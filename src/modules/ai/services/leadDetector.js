export function isPotentialCustomer(userText = "") {
    if (!userText || typeof userText !== "string") return false;

    const text = userText.toLowerCase();


    const negativeSignals = [
        "just asking",
        "curious",
        "job",
        "career",
        "intern",
        "complaint",
        "support",
        "problem",
        "bug",
        "error",
        "how does xoto work",
        "what is xoto"
    ];

    if (negativeSignals.some(word => text.includes(word))) {
        return false;
    }

    const strongSignals = [
        "landscaping",
        "garden",
        "villa landscaping",
        "interior",
        "interiors",
        "kitchen",
        "wardrobe",
        "renovation",
        "design",

        // money intent
        "price",
        "cost",
        "budget",
        "estimate",
        "quotation",
        "quote",

        // action intent
        "consultation",
        "site visit",
        "call",
        "contact",
        "expert",
        "help me",

        // real estate
        "buy",
        "purchase",
        "rent",
        "sell",
        "property",
        "villa",
        "townhouse",
        "apartment",
        "off plan",
        "ready property",

        // mortgage
        "mortgage",
        "loan",
        "emi",
        "finance",
        "home loan",
        "pre approval",

        // UPPERCASE versions
        "LANDSCAPING",
        "GARDEN",
        "VILLA LANDSCAPING",
        "INTERIOR",
        "INTERIORS",
        "KITCHEN",
        "WARDROBE",
        "RENOVATION",
        "DESIGN",

        "PRICE",
        "COST",
        "BUDGET",
        "ESTIMATE",
        "QUOTATION",
        "QUOTE",

        "CONSULTATION",
        "SITE VISIT",
        "CALL",
        "CONTACT",
        "EXPERT",
        "HELP ME",

        "BUY",
        "PURCHASE",
        "RENT",
        "SELL",
        "PROPERTY",
        "VILLA",
        "TOWNHOUSE",
        "APARTMENT",
        "OFF PLAN",
        "READY PROPERTY",

        "MORTGAGE",
        "LOAN",
        "EMI",
        "FINANCE",
        "HOME LOAN",
        "PRE APPROVAL"
    ];


    return strongSignals.some(word => text.includes(word));
}
