const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'phi3';

/**
 * Matches a resume against a job description using Ollama.
 * @param {string} resumeText 
 * @param {string} jobDescription 
 * @returns {Promise<{isMatch: boolean, score: number, extractedData: object}>}
 */
const matchResume = async (resumeText, activeRolesList) => {
  console.log('Starting AI matching (One-Pass)...');

  const prompt = `
    You are an expert HR recruiter.
    
    Here is a list of active job roles we are hiring for:
    ${activeRolesList}
    
    Resume Text:
    ${resumeText}
    
    Tasks:
    1. Extract candidate name, email, phone, experience level, current location, and current CTC/Salary. If any field is not found, use the exact string "N/A". Keep all answers extremely short (max 5 words per field). Do not explain your reasoning.
    2. Determine which active job role from the list above this candidate is most likely applying for. If they don't fit any of the listed roles, assign them to the exact role name "Open". Return ONLY the exact role name, with no additional text or explanation.
    3. Score the match between the resume and the chosen job role (0-100).
    
    Return ONLY a JSON object in the following format:
    {
      "name": "Full Name",
      "email": "Email Address",
      "phone": "Phone Number",
      "experience_level": "Experience Info",
      "current_location": "Location Info",
      "current_ctc": "CTC Info",
      "target_role": "Exact Role Name or 'Open'",
      "score": 0
    }
  `;

  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      format: 'json'
    });

    const result = JSON.parse(response.data.response);
    console.log('AI Matching Result:', result);
    return result;
  } catch (err) {
    console.error('Error in AI matching:', err);
    throw err;
  }
};

/**
 * Identifies if an email is a job application and contains a resume.
 * @param {string} emailSubject 
 * @param {string} emailBody 
 * @returns {Promise<{isApplication: boolean, position: string}>}
 */
const analyzeEmail = async (emailSubject, emailBody) => {
  console.log('Analyzing email content...');

  const prompt = `
    Identify if the following email is a job application.
    Subject: ${emailSubject}
    Body: ${emailBody}
    
    Return ONLY a JSON object:
    {
      "isApplication": boolean,
      "position": "string or null"
    }
  `;

  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      format: 'json'
    });

    console.log(`Raw AI Response (Email Analysis):`, response.data.response);
    return JSON.parse(response.data.response);
  } catch (err) {
    console.error('Error in email analysis:', err);
    return { isApplication: false, position: null };
  }
};

module.exports = { matchResume, analyzeEmail };
