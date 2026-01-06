// export function extractLeadFromText(text) {

//     let userText = text.replace(/\\n/g, '\n').replace(/\\r/g, '');

//   const get = (label) => {
//     const regex = new RegExp(`${label}\\s*:\\s*(.+)`, 'i');
//     const match = userText.match(regex);
//     return match ? match[1].trim() : null;
//   };

//   const lead = {
//     name: get("Name"),
//     phone_number: get("Phone Number"),
//     email: get("Email"),
//     property_type: get("Property Type"),
//     city:get("City"),
//     // area: get("Area / Location"),
//     description: get("Brief Requirement")
//   };

//   // minimal validation
//   if (!lead.phone_number || !/^\d{8,15}$/.test(lead.phone_number)) {
//     return { isValid: false };
//   }

//   return { isValid: true, lead };
// }


export function extractLeadFromText(text) {
  if (!text) return { isValid: false };

  // Normalize text
  const cleanedText = text
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .trim();

  // Split by comma
  const parts = cleanedText
    .split(",")
    .map(p => p.trim())
    .filter(Boolean);

  // Expected format:
  // Name, Phone, Property Type, Area, Requirement
  if (parts.length < 5) {
    return { isValid: false };
  }

  const [
    name,
    phone_number,
    email,
    property_type,
    area,
    description
  ] = parts;

  // Phone validation (8–15 digits)
  const phoneCleaned = phone_number.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(phoneCleaned)) {
    return { isValid: false };
  }

  const lead = {
    name,
    phone_number: phoneCleaned,
    email,
    property_type,
    city: area,
    description
  };

  return { isValid: true, lead };
}
