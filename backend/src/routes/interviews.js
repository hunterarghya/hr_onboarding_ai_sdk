const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { createCalendarEvent, deleteCalendarEvent, fetchRecentCalendarEvents, registerCalendarWebhook } = require('../services/calendar');
const { parseCalendarEvent } = require('../services/calendarAgent');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---- Auth Middleware ----
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    req.userData = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// ============================================================
// INTERVIEW EVENTS CRUD
// ============================================================

/**
 * GET /interviews/events
 * Fetch all interview events, ordered by date.
 */
router.get('/events', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM interview_events ORDER BY event_date ASC, start_time ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching interview events:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /interviews/events
 * Create a new interview event (in-app). Optionally sync to Google Calendar.
 */
router.post('/events', authenticate, async (req, res) => {
  const { role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, sync_calendar } = req.body;

  if (!role || !event_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'role, event_date, start_time, end_time are required' });
  }

  const mode = interview_mode || 'offline';

  try {
    let googleEventId = null;

    // Sync to Google Calendar if requested
    if (sync_calendar !== false) {
      try {
        googleEventId = await createCalendarEvent(req.userData.tokens, {
          role,
          event_date,
          start_time,
          end_time,
          num_candidates: num_candidates || 5,
          extra_candidates: extra_candidates || 0,
          interview_mode: mode,
          venue_or_link: venue_or_link || '',
        });
      } catch (calErr) {
        console.error('--- [Calendar] Sync failed, saving locally only:', calErr.message);
      }
    }

    const result = await pool.query(
      `INSERT INTO interview_events (role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, google_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [role, event_date, start_time, end_time, num_candidates || 5, extra_candidates || 0, mode, venue_or_link || null, googleEventId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating interview event:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /interviews/events/:id
 * Delete an interview event (cascades to interview_candidates).
 */
router.delete('/events/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    // Get the event to find google_event_id
    const eventResult = await pool.query('SELECT google_event_id FROM interview_events WHERE id = $1', [id]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const googleEventId = eventResult.rows[0].google_event_id;

    // Delete from Google Calendar
    if (googleEventId) {
      try {
        await deleteCalendarEvent(req.userData.tokens, googleEventId);
      } catch (calErr) {
        console.error('--- [Calendar] Delete sync failed:', calErr.message);
      }
    }

    // Delete from DB (cascades to interview_candidates)
    await pool.query('DELETE FROM interview_events WHERE id = $1', [id]);

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('Error deleting interview event:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// CANDIDATE ASSIGNMENT
// ============================================================

/**
 * GET /interviews/events/:id/candidates
 * Fetch candidates assigned to an interview event.
 */
router.get('/events/:id/candidates', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.*, ic.assigned_at
       FROM interview_candidates ic
       JOIN candidates c ON c.id = ic.candidate_id
       WHERE ic.event_id = $1
       ORDER BY c.score DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching interview candidates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /interviews/events/:id/candidates/manual
 * Manually assign candidates to an event (checkbox selection).
 * Body: { candidate_ids: [1, 2, 3] }
 */
router.post('/events/:id/candidates/manual', async (req, res) => {
  const { id } = req.params;
  const { candidate_ids } = req.body;

  if (!candidate_ids || !Array.isArray(candidate_ids)) {
    return res.status(400).json({ error: 'candidate_ids array is required' });
  }

  try {
    await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [id]);

    if (candidate_ids.length > 0) {
      // Insert new assignments
      const values = candidate_ids.map((cid, i) => `($1, $${i + 2})`).join(', ');
      const params = [id, ...candidate_ids];

      await pool.query(
        `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
         ON CONFLICT (event_id, candidate_id) DO NOTHING`,
        params
      );
    }

    res.json({ message: 'Candidates assigned successfully', count: candidate_ids.length });
  } catch (err) {
    console.error('Error assigning candidates manually:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /interviews/events/:id/candidates/manual
 * Edit (re-choose) candidates for an event. Same logic as POST but uses PATCH semantics.
 * Body: { candidate_ids: [1, 2, 3] }
 */
router.patch('/events/:id/candidates/manual', async (req, res) => {
  const { id } = req.params;
  const { candidate_ids } = req.body;

  if (!candidate_ids || !Array.isArray(candidate_ids)) {
    return res.status(400).json({ error: 'candidate_ids array is required' });
  }

  try {
    // Clear and re-insert
    await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [id]);

    if (candidate_ids.length > 0) {
      const values = candidate_ids.map((cid, i) => `($1, $${i + 2})`).join(', ');
      const params = [id, ...candidate_ids];

      await pool.query(
        `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
         ON CONFLICT (event_id, candidate_id) DO NOTHING`,
        params
      );

    }

    res.json({ message: 'Candidates updated successfully', count: candidate_ids.length });
  } catch (err) {
    console.error('Error updating candidates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /interviews/events/:id/candidates/auto
 * Auto-assign top N candidates by score for the event's role.
 * N = num_candidates + extra_candidates from the event.
 */
router.post('/events/:id/candidates/auto', async (req, res) => {
  const { id } = req.params;

  try {
    // Get the event details
    const eventResult = await pool.query('SELECT * FROM interview_events WHERE id = $1', [id]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];
    const totalSlots = event.num_candidates + (event.extra_candidates || 0);

    // Find already-assigned candidate IDs across ALL events for this role
    // so we don't double-book candidates
    const alreadyAssigned = await pool.query(
      `SELECT ic.candidate_id FROM interview_candidates ic
       JOIN interview_events ie ON ie.id = ic.event_id
       WHERE ie.role = $1 AND ic.event_id != $2`,
      [event.role, id]
    );
    const excludeIds = alreadyAssigned.rows.map(r => r.candidate_id);

    // Get top N shortlisted candidates, excluding already-assigned ones
    let query;
    let params;

    if (event.role === 'Open Role') {
      // Open Role: candidates whose role_applied is NOT in any active job_roles
      const activeRolesResult = await pool.query('SELECT role FROM job_roles');
      const activeRolesList = activeRolesResult.rows.map(r => r.role);

      query = `
        SELECT id FROM candidates
        WHERE status IN ('shortlisted', 'applied', 'marked')
          AND (role_applied IS NULL OR role_applied NOT IN (${activeRolesList.map((_, i) => `$${i + 1}`).join(',')}))
      `;
      params = [...activeRolesList];
      let paramIdx = activeRolesList.length + 1;

      if (excludeIds.length > 0) {
        query += ` AND id != ALL($${paramIdx}::int[])`;
        params.push(excludeIds);
        paramIdx++;
      }
      query += ` ORDER BY score DESC LIMIT $${paramIdx}`;
      params.push(totalSlots);
    } else {
      query = `
        SELECT id FROM candidates
        WHERE role_applied = $1
          AND status IN ('shortlisted', 'applied', 'marked')
      `;
      params = [event.role];
      let paramIdx = 2;

      if (excludeIds.length > 0) {
        query += ` AND id != ALL($${paramIdx}::int[])`;
        params.push(excludeIds);
        paramIdx++;
      }
      query += ` ORDER BY score DESC LIMIT $${paramIdx}`;
      params.push(totalSlots);
    }

    const candidatesResult = await pool.query(query, params);
    const candidateIds = candidatesResult.rows.map(r => r.id);

    if (candidateIds.length === 0) {
      return res.json({ message: 'No eligible candidates found', count: 0 });
    }

    // Clear existing and insert
    await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [id]);

    const values = candidateIds.map((cid, i) => `($1, $${i + 2})`).join(', ');
    const insertParams = [id, ...candidateIds];

    await pool.query(
      `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
       ON CONFLICT (event_id, candidate_id) DO NOTHING`,
      insertParams
    );



    res.json({ message: 'Candidates auto-assigned successfully', count: candidateIds.length });
  } catch (err) {
    console.error('Error auto-assigning candidates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /interviews/events/auto-assign-all
 * Auto-assign candidates across multiple events for the same role, 
 * using a max-heap style approach: fill earliest dates first with highest scores.
 * Body: { role: "Backend Developer" }
 */
router.post('/events/auto-assign-all', async (req, res) => {
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ error: 'role is required' });
  }

  try {
    // Get all events for this role, ordered by date
    const eventsResult = await pool.query(
      `SELECT * FROM interview_events WHERE role = $1 ORDER BY event_date ASC, start_time ASC`,
      [role]
    );
    const events = eventsResult.rows;

    if (events.length === 0) {
      return res.json({ message: 'No events found for this role', count: 0 });
    }

    // Get all eligible candidates for this role, sorted by score DESC (max-heap)
    const candidatesResult = await pool.query(
      `SELECT id, score FROM candidates
       WHERE role_applied = $1
         AND status IN ('shortlisted', 'applied', 'marked')
       ORDER BY score DESC`,
      [role]
    );
    const allCandidates = candidatesResult.rows;

    let candidateIndex = 0;
    let totalAssigned = 0;

    for (const event of events) {
      const totalSlots = event.num_candidates + (event.extra_candidates || 0);
      const candidatesForEvent = [];

      // Take next N candidates from the sorted list
      while (candidatesForEvent.length < totalSlots && candidateIndex < allCandidates.length) {
        candidatesForEvent.push(allCandidates[candidateIndex].id);
        candidateIndex++;
      }

      if (candidatesForEvent.length === 0) continue;

      // Clear and insert
      await pool.query('DELETE FROM interview_candidates WHERE event_id = $1', [event.id]);

      const values = candidatesForEvent.map((cid, i) => `($1, $${i + 2})`).join(', ');
      const params = [event.id, ...candidatesForEvent];

      await pool.query(
        `INSERT INTO interview_candidates (event_id, candidate_id) VALUES ${values}
         ON CONFLICT (event_id, candidate_id) DO NOTHING`,
        params
      );

      totalAssigned += candidatesForEvent.length;
    }

    res.json({ message: `Auto-assigned ${totalAssigned} candidates across ${events.length} events` });
  } catch (err) {
    console.error('Error in bulk auto-assign:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================================
// GOOGLE CALENDAR SYNC (Pull events from calendar)
// ============================================================

/**
 * POST /interviews/sync-calendar
 * Pulls recent events from Google Calendar, runs them through the AI agent,
 * and creates interview events for any detected interview schedules.
 */
router.post('/sync-calendar', authenticate, async (req, res) => {
  console.log(`\n\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║           CALENDAR SYNC STARTED                      ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  try {
    // Fetch active roles
    const rolesResult = await pool.query('SELECT role FROM job_roles');
    const activeRoles = rolesResult.rows.map(r => r.role);
    console.log(`[Sync] Active roles from DB (${activeRoles.length}):`, activeRoles);

    if (activeRoles.length === 0) {
      console.log(`[Sync] ❌ No active roles found — aborting sync.`);
      return res.json({ message: 'No active job roles found', imported: 0 });
    }

    // Fetch recent calendar events
    console.log(`[Sync] Fetching calendar events from Google Calendar API...`);
    console.log(`[Sync] User tokens present: access_token=${!!req.userData.tokens?.access_token}, refresh_token=${!!req.userData.tokens?.refresh_token}`);

    const calendarEvents = await fetchRecentCalendarEvents(req.userData.tokens);
    console.log(`[Sync] ✅ Found ${calendarEvents.length} calendar events from Google`);

    // Log each raw calendar event
    calendarEvents.forEach((ev, i) => {
      console.log(`[Sync] Event #${i + 1}: id="${ev.id}" | summary="${ev.summary}" | start=${ev.start?.dateTime || ev.start?.date} | end=${ev.end?.dateTime || ev.end?.date}`);
    });

    // Get existing google_event_ids to avoid duplicates
    const existingResult = await pool.query(
      'SELECT id, google_event_id FROM interview_events WHERE google_event_id IS NOT NULL'
    );
    const existingGoogleIds = new Set(existingResult.rows.map(r => r.google_event_id));
    console.log(`[Sync] Already imported event IDs in DB: [${[...existingGoogleIds].join(', ')}]`);

    // Delete events from DB that no longer exist in Google Calendar
    const calendarEventIds = new Set(calendarEvents.map(e => e.id));
    let deletedCount = 0;
    for (const row of existingResult.rows) {
      if (!calendarEventIds.has(row.google_event_id)) {
        await pool.query('DELETE FROM interview_events WHERE id = $1', [row.id]);
        deletedCount++;
        console.log(`[Sync] 🗑️ DELETED from DB (removed from Google Calendar): ${row.google_event_id}`);
      }
    }
    if (deletedCount > 0) console.log(`[Sync] Deleted ${deletedCount} stale events from DB.`);

    let imported = 0;
    let skippedDuplicate = 0;
    let skippedAgent = 0;

    for (let idx = 0; idx < calendarEvents.length; idx++) {
      const calEvent = calendarEvents[idx];
      console.log(`\n[Sync] --- Processing event ${idx + 1}/${calendarEvents.length}: "${calEvent.summary}" (${calEvent.id}) ---`);

      // Skip if already imported
      if (existingGoogleIds.has(calEvent.id)) {
        console.log(`[Sync] ⏭️ SKIPPED (already imported): ${calEvent.id}`);
        skippedDuplicate++;
        continue;
      }

      // Run through AI agent
      console.log(`[Sync] Sending to AI agent for parsing...`);
      const parsed = await parseCalendarEvent(calEvent, activeRoles);

      if (!parsed) {
        console.log(`[Sync] ⏭️ SKIPPED (agent returned null — not an interview or missing data)`);
        skippedAgent++;
        continue;
      }

      console.log(`[Sync] Agent returned valid interview data:`, JSON.stringify(parsed));

      // Insert into DB
      console.log(`[Sync] Inserting into interview_events table...`);
      await pool.query(
        `INSERT INTO interview_events (role, event_date, start_time, end_time, num_candidates, extra_candidates, interview_mode, venue_or_link, google_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING`,
        [parsed.role, parsed.event_date, parsed.start_time, parsed.end_time, parsed.num_candidates, parsed.extra_candidates, parsed.interview_mode || 'offline', parsed.venue_or_link || null, parsed.google_event_id]
      );

      imported++;
      console.log(`[Sync] ✅ IMPORTED: ${parsed.role} on ${parsed.event_date} (${parsed.start_time}-${parsed.end_time})`);
    }

    console.log(`\n[Sync] ═══ SYNC COMPLETE ═══`);
    console.log(`[Sync] Total events from calendar: ${calendarEvents.length}`);
    console.log(`[Sync] Imported: ${imported}`);
    console.log(`[Sync] Skipped (duplicate): ${skippedDuplicate}`);
    console.log(`[Sync] Skipped (not interview): ${skippedAgent}`);

    res.json({ message: `Calendar sync complete`, imported });
  } catch (err) {
    console.error('[Sync] ❌ FATAL ERROR during sync:', err);
    console.error('[Sync] Error message:', err.message);
    console.error('[Sync] Error stack:', err.stack);
    res.status(500).json({ error: 'Calendar sync failed', details: err.message });
  }
});

/**
 * POST /interviews/webhook
 * Google Calendar push notification endpoint.
 * When a calendar event changes, this triggers the sync.
 */
router.post('/webhook', async (req, res) => {
  // Google sends a verification request — respond 200 immediately
  res.status(200).send('OK');

  console.log('--- [Calendar Webhook] Push notification received ---');
  // Note: In production, this would trigger a sync for the specific user.
  // For now, the sync is manual via /sync-calendar endpoint.
});

/**
 * POST /interviews/register-webhook
 * Register a webhook with Google Calendar for push notifications.
 */
router.post('/register-webhook', authenticate, async (req, res) => {
  const { webhook_url } = req.body;

  if (!webhook_url) {
    return res.status(400).json({ error: 'webhook_url is required' });
  }

  try {
    const result = await registerCalendarWebhook(req.userData.tokens, webhook_url);
    res.json({ message: 'Webhook registered', data: result });
  } catch (err) {
    console.error('Error registering webhook:', err);
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

/**
 * GET /interviews/eligible-candidates/:eventId
 * Get all shortlisted candidates for the role of a specific event.
 * Used for the manual selection table.
 */
router.get('/eligible-candidates/:eventId', async (req, res) => {
  const { eventId } = req.params;

  try {
    const eventResult = await pool.query('SELECT role FROM interview_events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const role = eventResult.rows[0].role;

    let result;

    if (role === 'Open Role') {
      // Open Role: candidates whose role_applied doesn't match any active job_roles
      const activeRolesResult = await pool.query('SELECT role FROM job_roles');
      const activeRolesList = activeRolesResult.rows.map(r => r.role);

      if (activeRolesList.length > 0) {
        const placeholders = activeRolesList.map((_, i) => `$${i + 1}`).join(',');
        result = await pool.query(
          `SELECT * FROM candidates 
           WHERE status IN ('shortlisted', 'applied', 'marked')
             AND (role_applied IS NULL OR role_applied NOT IN (${placeholders}))
           ORDER BY score DESC`,
          activeRolesList
        );
      } else {
        // No active roles at all — show all candidates
        result = await pool.query(
          `SELECT * FROM candidates WHERE status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC`
        );
      }
    } else {
      result = await pool.query(
        `SELECT * FROM candidates WHERE role_applied = $1 AND status IN ('shortlisted', 'applied', 'marked') ORDER BY score DESC`,
        [role]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching eligible candidates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
