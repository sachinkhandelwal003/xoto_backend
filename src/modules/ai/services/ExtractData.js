export function extractLeadFromText(text) {
  const get = (label) => {
    const regex = new RegExp(`${label}\\s*:\\s*(.+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  };

  const lead = {
    name: get("Name"),
    phone_number: get("Phone Number"),
    email: get("Email"),
    property_type: get("Property Type"),
    city:get("City"),
    // area: get("Area / Location"),
    description: get("Brief Requirement")
  };

  // minimal validation
  if (!lead.phone_number || !/^\d{8,15}$/.test(lead.phone_number)) {
    return { isValid: false };
  }

  return { isValid: true, lead };
}
