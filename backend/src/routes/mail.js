const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { sendInterviewInvites, sendOfferLetters } = require('../services/mailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Auth middleware — extracts user data (email + OAuth tokens) from JWT
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.userData = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ============================================================
// INTERVIEW INVITES
// ============================================================

/**
 * POST /mail/interview-invites/:eventId
 * Send interview invites to unsent candidates of one event.
 * Body: { templateId }
 */
router.post('/interview-invites/:eventId', authenticate, async (req, res) => {
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId is required' });

  try {
    const result = await sendInterviewInvites(
      req.userData.tokens, req.userData.email,
      parseInt(req.params.eventId), parseInt(templateId)
    );
    res.json({ message: 'Invites processed', ...result });
  } catch (err) {
    console.error('[Mail] Error sending invites:', err);
    res.status(500).json({ error: 'Failed to send invites', details: err.message });
  }
});

/**
 * POST /mail/interview-invites-all
 * Send interview invites to ALL unsent candidates across ALL events.
 * Body: { templateId }
 */
router.post('/interview-invites-all', authenticate, async (req, res) => {
  const { templateId } = req.body;
  if (!templateId) return res.status(400).json({ error: 'templateId is required' });

  try {
    const eventsResult = await pool.query(
      `SELECT DISTINCT ie.id FROM interview_events ie
       JOIN interview_candidates ic ON ic.event_id = ie.id
       WHERE ic.invite_sent = false`
    );

    let totalSent = 0, totalFailed = 0, totalSkipped = 0;

    for (const event of eventsResult.rows) {
      const result = await sendInterviewInvites(
        req.userData.tokens, req.userData.email,
        event.id, parseInt(templateId)
      );
      totalSent += result.sent;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
    }

    res.json({
      message: 'Bulk invites processed',
      sent: totalSent, failed: totalFailed, skipped: totalSkipped,
      eventsProcessed: eventsResult.rows.length
    });
  } catch (err) {
    console.error('[Mail] Error sending bulk invites:', err);
    res.status(500).json({ error: 'Failed to send bulk invites', details: err.message });
  }
});

// ============================================================
// OFFER LETTERS
// ============================================================

/**
 * POST /mail/offer-letters
 * Send offer letters to specified selected candidates.
 * Body: { templateId, candidateIds: [1, 2, ...] }
 */
router.post('/offer-letters', authenticate, async (req, res) => {
  const { templateId, candidateIds } = req.body;
  if (!templateId || !candidateIds?.length) {
    return res.status(400).json({ error: 'templateId and candidateIds are required' });
  }

  try {
    const result = await sendOfferLetters(
      req.userData.tokens, req.userData.email,
      parseInt(templateId), candidateIds.map(id => parseInt(id))
    );
    res.json({ message: 'Offer letters processed', ...result });
  } catch (err) {
    console.error('[Mail] Error sending offers:', err);
    res.status(500).json({ error: 'Failed to send offers', details: err.message });
  }
});

// ============================================================
// STATUS QUERIES
// ============================================================

/**
 * GET /mail/unsent-invites-count
 * Returns events that have unsent candidates (for warning indicators).
 */
router.get('/unsent-invites-count', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ie.id as event_id, ie.event_date,
              COUNT(ic.id) FILTER (WHERE ic.invite_sent = false) as unsent_count,
              COUNT(ic.id) as total_count
       FROM interview_events ie
       JOIN interview_candidates ic ON ic.event_id = ie.id
       GROUP BY ie.id, ie.event_date
       HAVING COUNT(ic.id) FILTER (WHERE ic.invite_sent = false) > 0`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching unsent invites:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
