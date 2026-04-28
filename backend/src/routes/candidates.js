const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { fetchEmails, getAttachments } = require('../services/gmail');
const { fetchPDFsFromGroup, getWhatsAppStatus } = require('../services/whatsapp');
const { analyzeEmail, matchResume } = require('../services/ai');
const { uploadResume } = require('../services/imagekit');
const jwt = require('jsonwebtoken');
const pdf = require('pdf-parse');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let isScanning = false;

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

  const { whatsappGroupId } = req.body;
  const tokens = userData.tokens;
  isScanning = true;

  console.log(`--- [Pipeline] Starting Global Scan for ${userData.email} ---`);
  const allAttachments = [];

  try {
    const jobRolesResult = await pool.query('SELECT * FROM job_roles');
    const jobRoles = jobRolesResult.rows;

    // --- 1. Gmail Phase ---
    try {
      console.log('--- [Phase 1] Gmail Scanning ---');
      const emails = await fetchEmails(tokens);
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
    } catch (gmailErr) {
      console.error('--- [Phase 1] Gmail Error ---', gmailErr);
    }

    // --- 2. WhatsApp Phase ---
    if (whatsappGroupId) {
      console.log('--- [Phase 2] WhatsApp Scanning ---');
      const waStatus = getWhatsAppStatus();
      if (waStatus.status === 'ready') {
        try {
          const waAttachments = await fetchPDFsFromGroup(whatsappGroupId);
          allAttachments.push(...waAttachments);
        } catch (waErr) {
          console.error('--- [Phase 2] WhatsApp Error ---', waErr);
        }
      } else {
        console.log(`--- [WhatsApp] Skipping: Status is ${waStatus.status} ---`);
      }
    }

    // --- 3. Unified Processing Phase ---
    console.log(`--- [Phase 3] Processing Unified List (${allAttachments.length} total) ---`);
    let candidatesFound = 0;

    for (const attachment of allAttachments) {
      try {
        console.log(`--- [Process] Handling: ${attachment.filename} (${attachment.source}) ---`);

        const pdfBuffer = Buffer.from(attachment.data, 'base64');
        const pdfParsed = await pdf(pdfBuffer);
        const resumeText = pdfParsed.text;

        if (!resumeText || resumeText.length < 50) continue;

        const activeRolesList = jobRoles.map(r => `Role Name: ${r.role}\nSkills: ${r.skills}\nExperience: ${r.experience}`).join('\n\n---\n\n');

        const matchResult = await matchResume(resumeText, activeRolesList);

        // Defensively clean AI output
        const safeTargetRole = (matchResult.target_role || 'Open').substring(0, 250);
        const safeExperience = (matchResult.experience_level || 'N/A').substring(0, 95);
        const safeLocation = (matchResult.current_location || 'N/A').substring(0, 250);
        const safeCtc = (matchResult.current_ctc || 'N/A').substring(0, 95);

        let targetRole = jobRoles.find(r => r.role === safeTargetRole);
        
        if (!targetRole) {
          targetRole = {
            role: 'Open',
            shortlist_mode: 'manual',
            min_score: 0
          };
        }

        const minScoreRequired = targetRole.min_score || 60;
        const isAuto = targetRole.shortlist_mode === 'auto';
        
        if (targetRole.shortlist_mode === 'manual' || (isAuto && matchResult && matchResult.score >= minScoreRequired)) {
          const finalEmail = (matchResult.email && matchResult.email !== 'null' && matchResult.email !== 'N/A') ? matchResult.email : (attachment.sender || 'N/A');
          const finalStatus = targetRole.shortlist_mode === 'manual' ? 'applied' : 'shortlisted';
          
          const existing = await pool.query('SELECT id FROM candidates WHERE email = $1 AND role_applied = $2', [finalEmail, targetRole.role]);
          
          if (existing.rows.length > 0) {
            const ikUrl = await uploadResume(attachment.data, attachment.filename);
            
            await pool.query(
              `UPDATE candidates SET 
               score = $1, 
               date_applied = NOW(), 
               resume_url = $2,
               applied_through = $3,
               current_location = $4,
               current_ctc = $5,
               status = $6
               WHERE id = $7`,
              [
                matchResult.score, 
                ikUrl, 
                attachment.source, 
                safeLocation, 
                safeCtc,
                finalStatus,
                existing.rows[0].id
              ]
            );
            console.log(`--- [Database] Updated: ${matchResult.name} under ${targetRole.role} ---`);
          } else {
            const ikUrl = await uploadResume(attachment.data, attachment.filename);

            await pool.query(
              `INSERT INTO candidates (name, email, phone, role_applied, resume_content, score, experience_level, status, resume_url, applied_through, current_location, current_ctc)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                (matchResult.name || 'Unknown').substring(0, 250),
                finalEmail,
                (matchResult.phone || 'N/A').substring(0, 45),
                targetRole.role,
                resumeText.substring(0, 2000),
                matchResult.score,
                safeExperience,
                finalStatus,
                ikUrl,
                attachment.source,
                safeLocation,
                safeCtc
              ]
            );
            console.log(`--- [Database] Saved New: ${matchResult.name} under ${targetRole.role} ---`);
          }
          candidatesFound++;
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
  try {
    // Fixed: column name is date_applied, not created_at
    const result = await pool.query('SELECT * FROM candidates ORDER BY date_applied DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching candidates:', err);
    res.status(500).json({ message: 'Error fetching candidates' });
  }
});

module.exports = router;
