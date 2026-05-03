const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'phi3';

/**
 * Helper to add 5:30 to a HH:MM time string deterministically
 */
const convertToIST = (timeStr) => {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);

  let totalMinutes = h * 60 + m + (5 * 60 + 30);

  // Wrap around 24 hours
  totalMinutes = totalMinutes % (24 * 60);

  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;

  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

/**
 * Validates a time string is in HH:MM format. Returns the time if valid, null otherwise.
 */
const sanitizeTime = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1]), m = parseInt(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Uses an AI agent to parse a Google Calendar event into a structured interview event.
 */
const parseCalendarEvent = async (calendarEvent, activeRoles) => {
  const summary = calendarEvent.summary || '';
  const description = calendarEvent.description || '';
  const startDateTime = calendarEvent.start?.dateTime || calendarEvent.start?.date || '';
  const endDateTime = calendarEvent.end?.dateTime || calendarEvent.end?.date || '';

  console.log(`\n========== [CalendarAgent] PROCESSING EVENT ==========`);
  console.log(`[CalendarAgent] Event ID: ${calendarEvent.id}`);
  console.log(`[CalendarAgent] Summary/Title: "${summary}"`);
  console.log(`[CalendarAgent] Description: "${description}"`);
  console.log(`[CalendarAgent] Start (UTC): ${startDateTime}`);
  console.log(`[CalendarAgent] End (UTC): ${endDateTime}`);
  console.log(`[CalendarAgent] Active roles to match: [${activeRoles.join(', ')}]`);

  const prompt = `
    You are an HR assistant. Analyze this Google Calendar event. Identify if this event is related to a job role, interview, or a hiring activity.
    
    Event Title: ${summary}
    Description: ${description}
    Event Time (UTC): ${startDateTime} to ${endDateTime}

    Active Role List:
    ${activeRoles.join(', ')}

    Tasks:
    1. Identify if this event is related to a job role or hiring activity. 
    2. Role Matching: Find the most similar role from the Active Role List. Even if there are typos, missing words, or capitalization differences (e.g., "ui dev" matches "UI Developer"), you MUST return the exact role name from the list.
    3. If the event IS an interview/hiring activity but NO role from the list matches, return matched_role as "Open Role".
    4. If the event is NOT related to interviews or hiring at all, return is_activity=false.
    5. Extract the date (YYYY-MM-DD).
    6. Extract the start_time and end_time (HH:MM) EXACTLY as they appear in the UTC timestamp provided above. DO NOT convert them. The time MUST be in HH:MM format (e.g., "09:00", "14:30"). Never return text like "TBC" or "N/A".
    7. Candidate Count:
       - Look for ANY number associated with candidates (e.g., "2 candidate", "for 3", "5 pax", "1 person", "2 people", "4" etc.).
       - If a number is found in the title or description, extract it as num_candidates.
       - If no number is found in the title or description, return 5 as the default value for num_candidates

    Return ONLY JSON:
    {
      "is_activity": true,
      "matched_role": "Exact Role Name from List or Open Role",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "num_candidates": integer value of candidate count, e.g., 5
    }
  `;

  console.log(`[CalendarAgent] Sending prompt to Ollama...`);

  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      format: 'json'
    });

    console.log(`[CalendarAgent] Raw Ollama response: "${response.data.response}"`);

    let result;
    try {
      result = JSON.parse(response.data.response);
      console.log(`[CalendarAgent] Parsed JSON:`, JSON.stringify(result, null, 2));
    } catch (parseErr) {
      console.error(`[CalendarAgent] ❌ JSON Parse Failure: ${parseErr.message}`);
      return null;
    }

    if (!result.is_activity) {
      console.log(`[CalendarAgent] ⏭️ SKIPPED: Agent said is_activity=false`);
      return null;
    }

    // Determine the final role
    let finalRole = null;

    if (result.matched_role) {
      // Check if it matches an active role (case-insensitive)
      finalRole = activeRoles.find(r => r.toLowerCase() === result.matched_role.toLowerCase());

      // If agent returned "Open Role" explicitly
      if (!finalRole && result.matched_role.toLowerCase() === 'open role') {
        finalRole = 'Open Role';
      }

      // Partial match fallback against the title
      if (!finalRole) {
        console.log(`[CalendarAgent] Role "${result.matched_role}" not in active list. Attempting partial match...`);
        finalRole = activeRoles.find(r => summary.toLowerCase().includes(r.toLowerCase()));
      }
    }

    // Final fallback: if it IS an activity but no role matched, call it Open Role
    if (!finalRole) {
      const lowerSummary = summary.toLowerCase();
      const lowerDesc = description.toLowerCase();
      const interviewKeywords = ['interview', 'hiring', 'recruit', 'candidate', 'screening', 'assessment'];
      const hasInterviewKeyword = interviewKeywords.some(kw => lowerSummary.includes(kw) || lowerDesc.includes(kw));

      if (hasInterviewKeyword || result.is_activity) {
        finalRole = 'Open Role';
        console.log(`[CalendarAgent] No specific role matched. Defaulting to "Open Role".`);
      } else {
        console.log(`[CalendarAgent] ❌ Not an interview event. Skipping.`);
        return null;
      }
    }

    // Sanitize times — prevent "TBC", "N/A", etc. from crashing Postgres
    let startTime = sanitizeTime(result.start_time);
    let endTime = sanitizeTime(result.end_time);

    // Fallback: extract time from the raw Google Calendar timestamps
    if (!startTime && startDateTime.includes('T')) {
      const timePart = startDateTime.split('T')[1];
      startTime = sanitizeTime(timePart?.substring(0, 5));
    }
    if (!endTime && endDateTime.includes('T')) {
      const timePart = endDateTime.split('T')[1];
      endTime = sanitizeTime(timePart?.substring(0, 5));
    }

    // If still no valid start time, skip
    if (!startTime) {
      console.log(`[CalendarAgent] ❌ Could not determine a valid start time. Skipping.`);
      return null;
    }
    // Default end time: start + 4 hours
    if (!endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      let endMinutes = (sh * 60 + sm + 240) % (24 * 60);
      endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
      console.log(`[CalendarAgent] End time missing/invalid. Defaulting to ${endTime} (start + 4h)`);
    }

    // Deterministic IST Conversion (+5:30)
    const istStart = convertToIST(startTime);
    const istEnd = convertToIST(endTime);

    const finalResult = {
      role: finalRole,
      event_date: result.date,
      start_time: istStart,
      end_time: istEnd,
      num_candidates: parseInt(result.num_candidates) || 5,
      extra_candidates: 0,
      google_event_id: calendarEvent.id,
    };

    console.log(`[CalendarAgent] ✅ SUCCESS: ${finalRole}`);
    console.log(`[CalendarAgent] 🕒 Conversion: UTC ${startTime} -> IST ${istStart}`);
    console.log(`[CalendarAgent] 👥 Candidates: ${finalResult.num_candidates}`);
    return finalResult;

  } catch (err) {
    console.error(`[CalendarAgent] ❌ Error calling Ollama:`, err.message);
    return null;
  }
};

module.exports = { parseCalendarEvent };
