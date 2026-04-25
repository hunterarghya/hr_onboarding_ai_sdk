const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'phi3';

/**
 * Matches a resume against a job description using Ollama.
 * @param {string} resumeText 
 * @param {string} jobDescription 
 * @returns {Promise<{isMatch: boolean, score: number, extractedData: object}>}
 */
const matchResume = async (resumeText, jobDescription) => {
  console.log('Starting AI matching...');

  const prompt = `
    You are an expert HR recruiter. Compare the following resume text with the job description.
    
    Job Description:
    ${jobDescription}
    
    Resume Text:
    ${resumeText}
    
    Extract the candidate's name, email, and phone number from the resume.
    If any field is not found, return an empty string or null, NOT the word "string".
    
    Tasks:
    1. Extract candidate name, email, phone, and experience level.
    2. Score the match between the resume and the job description (0-100).
    3. Determine if the match score is 60 or above.
    
    Return ONLY a JSON object in the following format:
    {
      "name": "Full Name or null",
      "email": "email@example.com or null",
      "phone": "Phone number or null",
      "experience_level": "e.g. 5 years or null",
      "score": number,
      "isMatch": boolean
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
