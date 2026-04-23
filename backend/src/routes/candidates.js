const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { fetchEmails, getAttachments } = require('../services/gmail');
const { analyzeEmail, matchResume } = require('../services/ai');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Trigger Email Scanning Agent
router.post('/scan', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  let userData;
  try {
    userData = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const tokens = userData.tokens;
  console.log('Starting scan for user:', userData.email);

  try {
    // 1. Get all job descriptions to match against
    const jobRolesResult = await pool.query('SELECT * FROM job_roles');
    const jobRoles = jobRolesResult.rows;

    if (jobRoles.length === 0) {
      return res.status(400).json({ error: 'No job roles created yet. Please create a job role first.' });
    }

    // 2. Fetch top 10 emails
    const emails = await fetchEmails(tokens);
    let candidatesFound = 0;

    for (const email of emails) {
      const headers = email.payload.headers;
      const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '';
      const fromHeader = headers.find(h => h.name === 'From')?.value || '';
      
      // Extract email from "Name <email@example.com>" or "email@example.com" format
      const senderEmail = fromHeader.match(/<(.+?)>/)?.[1] || fromHeader.match(/\S+@\S+/)?.[0] || fromHeader;

      console.log(`Analyzing email: "${subjectHeader}" from ${senderEmail}`);
      
      // 3. Analyze if it's a job application
      const analysis = await analyzeEmail(subjectHeader, email.snippet);
      console.log(`AI Analysis for "${subjectHeader}":`, analysis);
      
      if (analysis.isApplication) {
        console.log(`✅ Application identified for: ${analysis.position}`);
        
        // 4. Extract PDF attachments
        const attachments = await getAttachments(tokens, email.id, email.payload.parts || []);
        
        for (const attachment of attachments) {
          console.log(`--------------------------------------------------`);
          console.log(`Processing PDF: ${attachment.filename}`);
          console.log(`Extracted Text Snippet (first 500 chars):`);
          console.log(attachment.text.substring(0, 500) + '...');
          console.log(`--------------------------------------------------`);
          
          // 5. Match against each job role
          for (const role of jobRoles) {
            console.log(`Matching against role: ${role.role}`);
            const matchResult = await matchResume(attachment.text, `Role: ${role.role}, Skills: ${role.skills}, Experience: ${role.experience}`);
            
            if (matchResult.isMatch && matchResult.score >= 60) {
              const finalEmail = matchResult.email && matchResult.email !== 'string' ? matchResult.email : senderEmail;
              console.log(`🎯 MATCH FOUND! Candidate: ${matchResult.name}, Score: ${matchResult.score}%, Email: ${finalEmail}`);
              
              // 6. Store in database
              await pool.query(
                `INSERT INTO candidates (name, email, phone, role_applied, resume_content, score, experience_level, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  matchResult.name || 'Unknown',
                  finalEmail,
                  matchResult.phone || 'N/A',
                  role.role,
                  attachment.text.substring(0, 2000), // Storing more content
                  matchResult.score,
                  matchResult.experience_level || 'N/A',
                  'shortlisted'
                ]
              );
              candidatesFound++;
              break; 
            } else {
              console.log(`❌ No match for role ${role.role} (Score: ${matchResult.score || 0}%)`);
            }
          }
        }
      }
    }

    res.json({ message: `Scan complete. Found and shortlisted ${candidatesFound} candidates.` });
  } catch (err) {
    console.error('Error during scan:', err);
    res.status(500).json({ error: 'Internal Server Error during scanning' });
  }
});

// Get Shortlisted Candidates
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM candidates ORDER BY date_applied DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching candidates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
