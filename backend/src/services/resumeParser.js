/**
 * Deterministic Resume Parser
 * Extracts candidate information from raw resume text using regex patterns.
 * Zero LLM calls — pure string matching.
 */

/**
 * Extract email address from resume text.
 * Looks for standard email patterns, filters out common false positives.
 */
const extractEmail = (text) => {
  // Match standard email patterns
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  if (!matches || matches.length === 0) return 'N/A';

  // Filter out common false positives (file extensions, URLs, etc.)
  const blacklist = ['example.com', 'email.com', 'domain.com', 'test.com', 'yourmail.com'];
  const valid = matches.filter(e => !blacklist.some(b => e.toLowerCase().includes(b)));

  return valid.length > 0 ? valid[0].toLowerCase() : matches[0].toLowerCase();
};

/**
 * Extract phone number from resume text.
 * Handles Indian (+91), US (+1), and generic international formats.
 */
const extractPhone = (text) => {
  const patterns = [
    // Indian: +91 9876543210, 91-9876543210, 09876543210
    /(?:\+91[\s\-]?|91[\s\-]|0)?[6-9]\d{4}[\s\-]?\d{5}/g,
    // International: +1 (555) 123-4567, +44 7911 123456
    /\+?\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
    // Generic: 10+ digit sequences that look like phone numbers
    /(?:phone|mobile|cell|contact|tel|ph)[\s:.\-]*(\+?\d[\d\s\-()]{8,15}\d)/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      // Clean up: remove excessive whitespace, keep digits and +
      const cleaned = matches[0].replace(/[^\d+\-() ]/g, '').trim();
      if (cleaned.replace(/\D/g, '').length >= 10) {
        return cleaned;
      }
    }
  }
  return 'N/A';
};

/**
 * Extract candidate name from resume text.
 * Heuristic: the name is almost always the first prominent line.
 */
const extractName = (text) => {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines.slice(0, 5)) {
    // Skip lines that are labels or headers
    if (/^(resume|curriculum|cv|profile|contact|address|email|phone|mobile|objective|summary)/i.test(line)) continue;
    // Skip lines that contain only URLs or emails
    if (/^(http|www\.|.*@)/i.test(line)) continue;
    // Skip lines with too many special characters
    if ((line.match(/[^a-zA-Z\s.]/g) || []).length > 2) continue;

    // A good name line: 2-5 words, mostly letters
    const words = line.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 1 && words.length <= 5) {
      const lettersOnly = line.replace(/[^a-zA-Z\s]/g, '').trim();
      if (lettersOnly.length >= 3) {
        return lettersOnly
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }
    }
  }
  return 'Unknown';
};

/**
 * Extract experience level (years of experience).
 * Returns a short string like "3 years" or "N/A".
 */
const extractExperience = (text) => {
  const patterns = [
    // "5+ years of experience"
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/gi,
    // "Experience: 5 years"
    /(?:experience|exp)[\s:]*(\d{1,2})\+?\s*(?:years?|yrs?)/gi,
    // "5 years in" or "5 years working"
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:in|of|working)/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const years = parseInt(match[1]);
      if (years > 0 && years < 50) {
        return `${years} years`;
      }
    }
  }
  return 'N/A';
};

/**
 * Extract current location from resume text.
 */
const extractLocation = (text) => {
  const patterns = [
    // "Location: City, State" or "Address: City"
    /(?:location|address|city|based in|residing)[\s:]*([A-Za-z][A-Za-z,\s]{3,40})/gi,
    // Common Indian cities pattern after other info
    /(?:,\s*)((?:Delhi|Mumbai|Bangalore|Bengaluru|Hyderabad|Chennai|Kolkata|Pune|Noida|Gurugram|Gurgaon|Jaipur|Ahmedabad|Lucknow|Chandigarh|Indore|Bhopal|Kochi|Thiruvananthapuram|Coimbatore|Nagpur|Patna|Ghaziabad|Ranchi|Bhubaneswar|Dehradun|Visakhapatnam)[A-Za-z,\s]{0,30})/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1].trim().substring(0, 60);
    }
  }

  // Fallback: search for known cities directly
  const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Noida', 'Gurugram', 'Gurgaon', 'Jaipur', 'Ahmedabad', 'Lucknow', 'Chandigarh', 'Indore', 'Bhopal', 'Kochi', 'Coimbatore', 'Nagpur', 'Patna', 'Ghaziabad', 'Ranchi', 'Bhubaneswar', 'Dehradun', 'New York', 'San Francisco', 'London', 'Singapore', 'Dubai', 'Toronto', 'Berlin', 'Tokyo', 'Sydney'];
  for (const city of cities) {
    if (text.toLowerCase().includes(city.toLowerCase())) {
      return city;
    }
  }

  return 'N/A';
};

/**
 * Extract current CTC / salary information.
 */
const extractCTC = (text) => {
  const patterns = [
    // "CTC: 8 LPA", "Current CTC: 12 lakhs"
    /(?:current\s*)?(?:ctc|salary|compensation|package)[\s:]*(?:(?:INR|Rs\.?|₹)\s*)?(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?|L|cr|crore)/gi,
    // "8 LPA CTC"
    /(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lacs?)\s*(?:ctc|salary|pa|per\s*annum)/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (amount > 0 && amount < 500) {
        return `${amount} LPA`;
      }
    }
  }
  return 'N/A';
};

/**
 * Extract resume sections for weighted scoring.
 * Returns an object with skills, projects, and experience text.
 */
const extractSections = (text) => {
  const sections = {
    skills: '',
    projects: '',
    experience: ''
  };

  const lines = text.split('\n');
  let currentSection = null;

  const sectionHeaders = {
    skills: /^(?:skills|technical\s*skills|core\s*skills|key\s*skills|technologies|tech\s*stack|proficiency)/i,
    projects: /^(?:projects|personal\s*projects|academic\s*projects|key\s*projects|notable\s*projects)/i,
    experience: /^(?:experience|work\s*experience|professional\s*experience|employment|work\s*history)/i,
  };

  // Generic header detector: short line, no punctuation, title-like
  const isHeader = (line) => {
    const trimmed = line.trim();
    return trimmed.length > 2 && trimmed.length < 60 && /^[A-Z]/.test(trimmed);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line is a section header
    let matched = false;
    for (const [sectionName, regex] of Object.entries(sectionHeaders)) {
      if (regex.test(trimmed)) {
        currentSection = sectionName;
        matched = true;
        break;
      }
    }

    // If it's a header for a different section, reset current
    if (!matched && isHeader(trimmed) && /^[A-Z\s]+$/i.test(trimmed) && trimmed.length < 40) {
      // This is a new, unrecognized section header — stop appending to current
      if (currentSection && trimmed.length > 3) {
        currentSection = null;
      }
    }

    // Append to current section
    if (currentSection && !matched) {
      sections[currentSection] += trimmed + ' ';
    }
  }

  // Trim and cap lengths
  for (const key of Object.keys(sections)) {
    sections[key] = sections[key].trim().substring(0, 2000);
  }

  return sections;
};

/**
 * Parse a full resume text and return structured candidate data.
 * This is the main entry point.
 */
const parseResume = (resumeText) => {
  return {
    name: extractName(resumeText),
    email: extractEmail(resumeText),
    phone: extractPhone(resumeText),
    experience_level: extractExperience(resumeText),
    current_location: extractLocation(resumeText),
    current_ctc: extractCTC(resumeText),
    sections: extractSections(resumeText),
  };
};

module.exports = { parseResume, extractEmail, extractPhone, extractName, extractSections };
