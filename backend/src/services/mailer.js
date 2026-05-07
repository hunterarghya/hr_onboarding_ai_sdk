const { google } = require('googleapis');
const Handlebars = require('handlebars');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Creates an authenticated Gmail service from OAuth tokens.
 */
const getGmailService = (tokens) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

/**
 * Builds an RFC 2822 email and base64url-encodes it for the Gmail API.
 */
const buildRawEmail = (to, from, subject, htmlBody) => {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
};

/**
 * Compiles a Handlebars template string with data.
 */
const compileTemplate = (templateStr, data) => {
  return Handlebars.compile(templateStr)(data);
};

/**
 * Send interview invite emails to candidates of a specific event.
 * Only sends to candidates where invite_sent = false.
 */
const sendInterviewInvites = async (tokens, senderEmail, eventId, templateId) => {
  const gmail = getGmailService(tokens);

  // Get template
  const tpl = await pool.query('SELECT * FROM email_templates WHERE id = $1', [templateId]);
  if (tpl.rows.length === 0) throw new Error('Template not found');
  const template = tpl.rows[0];

  // Get event
  const evt = await pool.query('SELECT * FROM interview_events WHERE id = $1', [eventId]);
  if (evt.rows.length === 0) throw new Error('Event not found');
  const event = evt.rows[0];

  // Get unsent candidates
  const candidates = await pool.query(
    `SELECT c.*, ic.id as ic_id
     FROM interview_candidates ic
     JOIN candidates c ON c.id = ic.candidate_id
     WHERE ic.event_id = $1 AND ic.invite_sent = false`,
    [eventId]
  );

  let sent = 0, failed = 0, skipped = 0;

  for (const candidate of candidates.rows) {
    if (!candidate.email) { skipped++; continue; }

    try {
      const data = {
        ...candidate,
        interview_date: event.event_date
          ? new Date(event.event_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : '',
        interview_start_time: event.start_time?.slice(0, 5) || '',
        interview_end_time: event.end_time?.slice(0, 5) || '',
        interview_mode: event.interview_mode === 'online' ? 'Online (Virtual)' : 'Offline (In-Person)',
        venue_or_link: event.venue_or_link || 'To be confirmed',
      };

      const compiledSubject = compileTemplate(template.subject, data);
      const compiledBody = compileTemplate(template.body, data);
      const raw = buildRawEmail(candidate.email, senderEmail, compiledSubject, compiledBody);

      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      await pool.query('UPDATE interview_candidates SET invite_sent = true WHERE id = $1', [candidate.ic_id]);

      console.log(`[Mailer] ✅ Invite sent to ${candidate.name} (${candidate.email})`);
      sent++;
    } catch (err) {
      console.error(`[Mailer] ❌ Failed to send to ${candidate.email}:`, err.message);
      failed++;
    }
  }

  return { sent, failed, skipped, total: candidates.rows.length };
};

/**
 * Send offer letter emails to selected candidates.
 * Only sends to candidates where offer_sent = false.
 */
const sendOfferLetters = async (tokens, senderEmail, templateId, candidateIds) => {
  const gmail = getGmailService(tokens);

  // Get template
  const tpl = await pool.query('SELECT * FROM email_templates WHERE id = $1', [templateId]);
  if (tpl.rows.length === 0) throw new Error('Template not found');
  const template = tpl.rows[0];

  // Get unsent candidates from the provided list
  const placeholders = candidateIds.map((_, i) => `$${i + 1}`).join(',');
  const candidates = await pool.query(
    `SELECT * FROM candidates
     WHERE id IN (${placeholders}) AND status = 'selected' AND offer_sent = false`,
    candidateIds
  );

  let sent = 0, failed = 0, skipped = 0;

  for (const candidate of candidates.rows) {
    if (!candidate.email) { skipped++; continue; }

    try {
      const data = {
        ...candidate,
        joining_date: candidate.joining_date
          ? new Date(candidate.joining_date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          : '',
      };

      const compiledSubject = compileTemplate(template.subject, data);
      const compiledBody = compileTemplate(template.body, data);
      const raw = buildRawEmail(candidate.email, senderEmail, compiledSubject, compiledBody);

      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      await pool.query('UPDATE candidates SET offer_sent = true WHERE id = $1', [candidate.id]);

      console.log(`[Mailer] ✅ Offer sent to ${candidate.name} (${candidate.email})`);
      sent++;
    } catch (err) {
      console.error(`[Mailer] ❌ Failed to send offer to ${candidate.email}:`, err.message);
      failed++;
    }
  }

  return { sent, failed, skipped, total: candidates.rows.length };
};

module.exports = { sendInterviewInvites, sendOfferLetters };
