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
        "pre approval"
    ];

    return strongSignals.some(word => text.includes(word));
    }
