const axios = require('axios');

const generateNarrative = async (property, clientNotes, settings) => {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY environment variable is not set. Presentation AI generation requires a GROQ API key.');
  }
  const prompt = `
You are a luxury real estate copywriter for Xoto, a premium UAE real estate platform.

PROPERTY DATA:
- Name: ${property.propertyName || 'N/A'}
- Location: ${property.area || ''}, ${property.city || ''}
- Type: ${property.type || 'Residential'}
- Price: ${property.price || 'On Request'} ${settings.currency || 'AED'}
- Bedrooms: ${property.bedrooms || 'N/A'}
- Area: ${property.builtUpArea || 'N/A'} ${settings.areaUnit || 'sqft'}
- Developer: ${property.developer || 'N/A'}
- Completion: ${property.completionDate || 'N/A'}
- Facilities: ${
  Array.isArray(property.facilities)
    ? property.facilities.join(', ')
    : typeof property.facilities === 'object' && property.facilities !== null
      ? Object.values(property.facilities).flat().join(', ')
      : property.facilities || 'N/A'
}
- Description: ${property.description || ''}

CLIENT CONTEXT:
- Client Name: ${clientNotes.clientName || 'Valued Client'}
- Budget: ${clientNotes.budget || 'N/A'}
- Requirements: ${clientNotes.requirements || 'N/A'}
- Tone: ${settings.tone || 'professional'}

Generate a presentation narrative in ${settings.language || 'English'}.

Return ONLY valid JSON, no markdown, no explanation:
{
  "propertyOverview": "2-3 sentence premium summary tailored to this client",
  "keyHighlights": ["highlight 1", "highlight 2", "highlight 3", "highlight 4", "highlight 5"],
  "locationCommunity": "Area overview with nearby amenities and lifestyle",
  "investmentAngle": "Why this is a smart investment opportunity",
  "nextSteps": "Personalized call to action for the client"
}`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const text = response.data.choices[0].message.content;

  // Clean and parse JSON
  const cleaned = text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(cleaned);
};

module.exports = { generateNarrative };