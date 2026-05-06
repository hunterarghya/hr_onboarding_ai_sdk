const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { fetchEmails, getAttachments } = require('../services/gmail');
const { fetchPDFsFromGroup, getWhatsAppStatus } = require('../services/whatsapp');
const { analyzeEmail } = require('../services/ai');
const { uploadResume } = require('../services/imagekit');
const { parseResume } = require('../services/resumeParser');
const { matchResumeToJobs } = require('../services/vectorMatch');
const jwt = require('jsonwebtoken');
const pdf = require('pdf-parse');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let isScanning = false;

// ---- Timestamp Helpers ----

const getLastScanTimestamp = async (sourceType, sourceId = 'default') => {
  const result = await pool.query(
    'SELECT last_scanned_at FROM scan_timestamps WHERE source_type = $1 AND source_id = $2',
    [sourceType, sourceId]
  );
  if (result.rows.length > 0) {
    return new Date(result.rows[0].last_scanned_at);
  }
  return null; // First scan ever — no filter
};

const updateLastScanTimestamp = async (sourceType, sourceId = 'default', timestamp = new Date()) => {
  await pool.query(
    `INSERT INTO scan_timestamps (source_type, source_id, last_scanned_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_type, source_id)
     DO UPDATE SET last_scanned_at = $3`,
    [sourceType, sourceId, timestamp]
  );
};

// ---- Scan Route ----

router.post('/scan', async (req, res) => {
  if (isScanning) return res.status(409).json({ message: 'Scan already in progress' });

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  let userData;
  try {
    userData = jwt.verify(token, process.env.JWT_SECRET || 'secret');
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }

  // Accept multiple group IDs (array) or single (string, backward compatible)
  const { whatsappGroupIds, whatsappGroupId } = req.body;
  const groupIds = whatsappGroupIds || (whatsappGroupId ? [whatsappGroupId] : []);
  const tokens = userData.tokens;
  isScanning = true;

  console.log(`--- [Pipeline] Starting Global Scan for ${userData.email} ---`);
  const allAttachments = [];

  try {
    const jobRolesResult = await pool.query('SELECT * FROM job_roles');
    const jobRoles = jobRolesResult.rows;

    // --- 1. Gmail Phase (timestamp-filtered) ---
    try {
      console.log('--- [Phase 1] Gmail Scanning ---');
      let gmailLastScan = await getLastScanTimestamp('gmail');
      if (!gmailLastScan) {
        // First scan ever — only look at yesterday and today, not the entire mailbox
        gmailLastScan = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }
      console.log(`--- [Gmail] Scanning emails after: ${gmailLastScan.toISOString()} ---`);

      const emails = await fetchEmails(tokens, gmailLastScan);
      for (const email of emails) {
        const payload = email.payload;
        if (!payload || !payload.parts) continue;

        const subject = email.payload.headers.find(h => h.name === 'Subject')?.value || '';
        const body = email.snippet || '';
        const senderEmail = email.payload.headers.find(h => h.name === 'From')?.value || '';

        const analysis = await analyzeEmail(subject, body);
        if (analysis.isApplication) {
          console.log(`--- [Gmail] ✅ Application Found: "${subject}" ---`);
          const gmailAttachments = await getAttachments(tokens, email.id, payload.parts);
          allAttachments.push(...gmailAttachments.map(a => ({
            ...a, source: 'Gmail', sender: senderEmail
          })));
        }
      }

      // Update Gmail timestamp to NOW
      await updateLastScanTimestamp('gmail');
      console.log('--- [Gmail] Timestamp updated ---');
    } catch (gmailErr) {
      console.error('--- [Phase 1] Gmail Error ---', gmailErr);
    }

    // --- 2. WhatsApp Phase (multi-group, timestamp-filtered) ---
    if (groupIds.length > 0) {
      console.log(`--- [Phase 2] WhatsApp Scanning (${groupIds.length} group(s)) ---`);
      const waStatus = getWhatsAppStatus();
      if (waStatus.status === 'ready') {
        for (const gid of groupIds) {
          try {
            const waLastScan = await getLastScanTimestamp('whatsapp', gid);
            console.log(`--- [WhatsApp] Group ${gid} last scan: ${waLastScan ? waLastScan.toISOString() : 'NEVER'} ---`);

            const waAttachments = await fetchPDFsFromGroup(gid, waLastScan);
            allAttachments.push(...waAttachments);

            // Update this group's timestamp to NOW
            await updateLastScanTimestamp('whatsapp', gid);
          } catch (waErr) {
            console.error(`--- [Phase 2] WhatsApp Error (group ${gid}) ---`, waErr);
          }
        }
      } else {
        console.log(`--- [WhatsApp] Skipping: Status is ${waStatus.status} ---`);
      }
    }

    // --- 3. Unified Processing Phase (Vector Matching) ---
    console.log(`--- [Phase 3] Processing Unified List (${allAttachments.length} total) ---`);
    let candidatesFound = 0;

    for (const attachment of allAttachments) {
      try {
        console.log(`--- [Process] Handling: ${attachment.filename} (${attachment.source}) ---`);

        const pdfBuffer = Buffer.from(attachment.data, 'base64');
        const pdfParsed = await pdf(pdfBuffer);
        const resumeText = pdfParsed.text;

        if (!resumeText || resumeText.length < 50) continue;

        // Step A: Deterministic extraction (regex, zero LLM)
        const parsed = parseResume(resumeText);
        console.log(`--- [Parser] Extracted: ${parsed.name}, ${parsed.email}, ${parsed.phone} ---`);

        // Step B: Vector matching — find best job role + score (zero LLM)
        const { target_role, score } = await matchResumeToJobs(resumeText, parsed.sections, jobRoles);
        console.log(`--- [Vector] Match: ${target_role} (score: ${score}) ---`);

        // Step C: Look up the target role in the database
        let targetRole = jobRoles.find(r => r.role === target_role);

        if (!targetRole) {
          targetRole = {
            role: 'Open',
            shortlist_mode: 'manual',
            min_score: 0
          };
        }

        const minScoreRequired = targetRole.min_score || 60;
        const isAuto = targetRole.shortlist_mode === 'auto';

        // Step D: Auto/Manual Junction
        if (targetRole.shortlist_mode === 'manual' || (isAuto && score >= minScoreRequired)) {
          const finalEmail = (parsed.email && parsed.email !== 'N/A') ? parsed.email : (attachment.sender || 'N/A');
          const finalStatus = targetRole.shortlist_mode === 'manual' ? 'applied' : 'shortlisted';

          // Defensive truncation
          const safeName = (parsed.name || 'Unknown').substring(0, 250);
          const safePhone = (parsed.phone || 'N/A').substring(0, 45);
          const safeExperience = (parsed.experience_level || 'N/A').substring(0, 95);
          const safeLocation = (parsed.current_location || 'N/A').substring(0, 250);
          const safeCtc = (parsed.current_ctc || 'N/A').substring(0, 95);

          const existing = await pool.query('SELECT id FROM candidates WHERE email = $1 AND role_applied = $2', [finalEmail, targetRole.role]);

          if (existing.rows.length > 0) {
            const ikUrl = await uploadResume(attachment.data, attachment.filename);
            await pool.query(
              `UPDATE candidates SET score = $1, date_applied = NOW(), resume_url = $2, applied_through = $3, current_location = $4, current_ctc = $5, status = $6 WHERE id = $7`,
              [score, ikUrl, attachment.source, safeLocation, safeCtc, finalStatus, existing.rows[0].id]
            );
            console.log(`--- [Database] Updated: ${safeName} under ${targetRole.role} ---`);
          } else {
            const ikUrl = await uploadResume(attachment.data, attachment.filename);
            await pool.query(
              `INSERT INTO candidates (name, email, phone, role_applied, resume_content, score, experience_level, status, resume_url, applied_through, current_location, current_ctc)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [safeName, finalEmail, safePhone, targetRole.role, resumeText.substring(0, 2000), score, safeExperience, finalStatus, ikUrl, attachment.source, safeLocation, safeCtc]
            );
            console.log(`--- [Database] Saved New: ${safeName} under ${targetRole.role} ---`);
          }
          candidatesFound++;
        } else {
          console.log(`--- [Skip] ${parsed.name} scored ${score} < ${minScoreRequired} for ${targetRole.role} (Auto mode) ---`);
        }
      } catch (procErr) {
        console.error(`--- [Process] Error processing ${attachment.filename}:`, procErr);
      }
    }

    res.json({ message: 'Scan complete', count: candidatesFound });

  } catch (err) {
    console.error('--- [Pipeline] Fatal Error ---', err);
    res.status(500).json({ message: 'Scan failed', error: err.message });
  } finally {
    isScanning = false;
  }
});

router.get('/', async (req, res) => {
  const { limit = 10, cursor, role, status, source, name, minScore, maxScore, scoreSort } = req.query;
  const pageSize = parseInt(limit);

  try {
    let query = 'SELECT * FROM candidates WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filters
    if (role) {
      query += ` AND role_applied = $${paramIndex++}`;
      params.push(role);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (source) {
      query += ` AND applied_through = $${paramIndex++}`;
      params.push(source);
    }
    if (name) {
      query += ` AND name ILIKE $${paramIndex++}`;
      params.push(`%${name}%`);
    }
    if (minScore !== undefined && minScore !== '') {
      query += ` AND score >= $${paramIndex++}`;
      params.push(parseInt(minScore));
    }
    if (maxScore !== undefined && maxScore !== '') {
      query += ` AND score <= $${paramIndex++}`;
      params.push(parseInt(maxScore));
    }

    // Cursor Logic (Dynamic Keyset)
    if (cursor) {
      const [cScore, cTime, cId] = cursor.split('|');
      const scoreVal = parseInt(cScore);

      if (scoreSort === 'highToLow') {
        query += ` AND (score < $${paramIndex} OR (score = $${paramIndex} AND (date_applied < $${paramIndex + 1} OR (date_applied = $${paramIndex + 1} AND id < $${paramIndex + 2}))))`;
        params.push(scoreVal, cTime, cId);
        paramIndex += 3;
      } else if (scoreSort === 'lowToHigh') {
        query += ` AND (score > $${paramIndex} OR (score = $${paramIndex} AND (date_applied < $${paramIndex + 1} OR (date_applied = $${paramIndex + 1} AND id < $${paramIndex + 2}))))`;
        params.push(scoreVal, cTime, cId);
        paramIndex += 3;
      } else {
        // Default: Newest First
        query += ` AND (date_applied < $${paramIndex} OR (date_applied = $${paramIndex} AND id < $${paramIndex + 1}))`;
        params.push(cTime, cId);
        paramIndex += 2;
      }
    }

    // Dynamic Ordering
    let orderBy = 'ORDER BY date_applied DESC, id DESC';
    if (scoreSort === 'highToLow') {
      orderBy = 'ORDER BY score DESC, date_applied DESC, id DESC';
    } else if (scoreSort === 'lowToHigh') {
      orderBy = 'ORDER BY score ASC, date_applied DESC, id DESC';
    }

    query += ` ${orderBy} LIMIT $${paramIndex}`;
    params.push(pageSize + 1);

    const result = await pool.query(query, params);
    const rows = result.rows;

    const hasNextPage = rows.length > pageSize;
    const data = hasNextPage ? rows.slice(0, pageSize) : rows;

    let nextCursor = null;
    if (hasNextPage) {
      const lastItem = data[data.length - 1];
      // Store score, date, and id in the cursor to maintain sort position
      nextCursor = `${lastItem.score}|${lastItem.date_applied.toISOString()}|${lastItem.id}`;
    }

    res.json({
      data,
      nextCursor,
      hasNextPage
    });
  } catch (err) {
    console.error('Error fetching candidates:', err);
    res.status(500).json({ message: 'Error fetching candidates' });
  }
});

// Update Candidate Status
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, offered_role, offered_salary, offered_location, joining_date } = req.body;
  try {
    if (status === 'selected') {
      // All offer fields are mandatory for 'selected'
      if (!offered_role || !offered_salary || !offered_location || !joining_date) {
        return res.status(400).json({ error: 'All offer fields (offered_role, offered_salary, offered_location, joining_date) are required for "selected" status.' });
      }
      await pool.query(
        'UPDATE candidates SET status = $1, offered_role = $2, offered_salary = $3, offered_location = $4, joining_date = $5 WHERE id = $6',
        [status, offered_role, offered_salary, offered_location, joining_date, id]
      );
    } else {
      await pool.query('UPDATE candidates SET status = $1 WHERE id = $2', [status, id]);
    }
    res.json({ message: 'Status updated successfully' });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get distinct filter values for selected candidates
router.get('/selected/filters', async (req, res) => {
  try {
    const roles = await pool.query('SELECT DISTINCT offered_role FROM candidates WHERE status = $1 AND offered_role IS NOT NULL ORDER BY offered_role', ['selected']);
    const locations = await pool.query('SELECT DISTINCT offered_location FROM candidates WHERE status = $1 AND offered_location IS NOT NULL ORDER BY offered_location', ['selected']);
    res.json({
      roles: roles.rows.map(r => r.offered_role),
      locations: locations.rows.map(r => r.offered_location)
    });
  } catch (err) {
    console.error('Error fetching selected filters:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get Selected Candidates (with offer details, filtering & cursor pagination)
router.get('/selected', async (req, res) => {
  const { limit = 10, cursor, offered_role, offered_location, dateFrom, dateTo } = req.query;
  const pageSize = parseInt(limit);

  try {
    let query = 'SELECT id, name, email, phone, offered_role, offered_salary, offered_location, joining_date, status FROM candidates WHERE status = $1';
    const params = ['selected'];
    let paramIndex = 2;

    // Filters
    if (offered_role) {
      query += ` AND offered_role = $${paramIndex++}`;
      params.push(offered_role);
    }
    if (offered_location) {
      query += ` AND offered_location = $${paramIndex++}`;
      params.push(offered_location);
    }
    if (dateFrom) {
      query += ` AND joining_date >= $${paramIndex++}`;
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ` AND joining_date <= $${paramIndex++}`;
      params.push(dateTo);
    }

    // Cursor Logic (keyset pagination on joining_date ASC, id ASC)
    if (cursor) {
      const [cDate, cId] = cursor.split('|');
      query += ` AND (joining_date > $${paramIndex} OR (joining_date = $${paramIndex} AND id > $${paramIndex + 1}))`;
      params.push(cDate, cId);
      paramIndex += 2;
    }

    query += ` ORDER BY joining_date ASC, id ASC LIMIT $${paramIndex}`;
    params.push(pageSize + 1);

    const result = await pool.query(query, params);
    const rows = result.rows;

    const hasNextPage = rows.length > pageSize;
    const data = hasNextPage ? rows.slice(0, pageSize) : rows;

    let nextCursor = null;
    if (hasNextPage) {
      const lastItem = data[data.length - 1];
      nextCursor = `${lastItem.joining_date ? new Date(lastItem.joining_date).toISOString().split('T')[0] : ''}|${lastItem.id}`;
    }

    res.json({ data, nextCursor, hasNextPage });
  } catch (err) {
    console.error('Error fetching selected candidates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
