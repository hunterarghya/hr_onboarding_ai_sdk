const { google } = require('googleapis');

/**
 * Creates an authenticated Google Calendar service instance.
 */
const getCalendarService = (tokens) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * Creates an interview event on Google Calendar.
 * @param {object} tokens - OAuth tokens
 * @param {object} eventData - { role, event_date, start_time, end_time, num_candidates, extra_candidates }
 * @returns {string} Google Calendar event ID
 */
const createCalendarEvent = async (tokens, eventData) => {
  const calendar = getCalendarService(tokens);

  const startDateTime = `${eventData.event_date}T${eventData.start_time}:00`;
  const endDateTime = `${eventData.event_date}T${eventData.end_time}:00`;

  const extraText = eventData.extra_candidates > 0
    ? ` + ${eventData.extra_candidates} extra`
    : '';

  const mode = eventData.interview_mode || 'offline';
  const modeLabel = mode === 'online' ? 'Online (Virtual)' : 'Offline (In-Person)';
  const venueInfo = eventData.venue_or_link
    ? (mode === 'online' ? `Meet Link: ${eventData.venue_or_link}` : `Venue: ${eventData.venue_or_link}`)
    : '';

  const descriptionParts = [
    `Role: ${eventData.role}`,
    `Candidates: ${eventData.num_candidates}${extraText}`,
    `Mode: ${modeLabel}`,
    venueInfo,
    `Type: HR Interview Schedule`
  ].filter(Boolean);

  const event = {
    summary: `Interview: ${eventData.role}`,
    description: descriptionParts.join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Kolkata',
    },
    colorId: '9', // Blueberry
  };

  // For online interviews, request Google Meet conferencing
  if (mode === 'online' && !eventData.venue_or_link) {
    event.conferenceData = {
      createRequest: {
        requestId: `hr-interview-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
  }

  const insertOptions = {
    calendarId: 'primary',
    resource: event,
  };

  // Enable conferenceDataVersion if we're creating a Meet link
  if (event.conferenceData) {
    insertOptions.conferenceDataVersion = 1;
  }

  const response = await calendar.events.insert(insertOptions);

  console.log(`--- [Calendar] Created event: ${response.data.id} ---`);
  return response.data.id;
};

/**
 * Deletes a Google Calendar event.
 */
const deleteCalendarEvent = async (tokens, googleEventId) => {
  if (!googleEventId) return;
  const calendar = getCalendarService(tokens);
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });
    console.log(`--- [Calendar] Deleted event: ${googleEventId} ---`);
  } catch (err) {
    console.error(`--- [Calendar] Error deleting event ${googleEventId}:`, err.message);
  }
};

/**
 * Fetches recent calendar events (last 7 days to next 60 days).
 */
const fetchRecentCalendarEvents = async (tokens) => {
  const calendar = getCalendarService(tokens);

  // Debug: List all calendars first to see what we have access to
  try {
    const calendarList = await calendar.calendarList.list();
    console.log(`[Calendar Fetch] Available Calendars for this user:`);
    calendarList.data.items.forEach(cal => {
      console.log(`[Calendar Fetch] - Name: "${cal.summary}" | ID: ${cal.id} | Primary: ${cal.primary || false} | Access: ${cal.accessRole}`);
    });
  } catch (err) {
    console.error(`[Calendar Fetch] ❌ Could not fetch calendar list:`, err.message);
  }

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 7);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 60);

  console.log(`[Calendar Fetch] Querying Google Calendar API (primary)...`);
  console.log(`[Calendar Fetch] Time range: ${timeMin.toISOString()} → ${timeMax.toISOString()}`);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: 100,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = response.data.items || [];
  console.log(`[Calendar Fetch] ✅ API returned ${items.length} events from primary calendar`);
  
  return items;
};

/**
 * Registers a webhook (watch) on the primary calendar for push notifications.
 * @param {object} tokens - OAuth tokens
 * @param {string} webhookUrl - The public URL that will receive push notifications
 * @returns {object} Watch response
 */
const registerCalendarWebhook = async (tokens, webhookUrl) => {
  const calendar = getCalendarService(tokens);

  const channelId = `hr-interview-${Date.now()}`;
  const response = await calendar.events.watch({
    calendarId: 'primary',
    resource: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
    },
  });

  console.log(`--- [Calendar] Webhook registered: ${channelId} ---`);
  return response.data;
};

module.exports = {
  getCalendarService,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchRecentCalendarEvents,
  registerCalendarWebhook,
};
