const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const Handlebars = require('handlebars');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================
// EMAIL TEMPLATES CRUD
// ============================================================

/**
 * GET /templates
 * Fetch all email templates, ordered by type then name.
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM email_templates ORDER BY type ASC, is_default DESC, name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /templates/:id
 * Fetch a single template by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching template:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /templates
 * Create a new email template.
 * Body: { name, subject, body, type }
 */
router.post('/', async (req, res) => {
  const { name, subject, body, type } = req.body;

  if (!name || !body) {
    return res.status(400).json({ error: 'name and body are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO email_templates (name, subject, body, type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, subject || '', body, type || 'custom']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /templates/:id
 * Update an existing template.
 * Body: { name, subject, body, type }
 */
router.put('/:id', async (req, res) => {
  const { name, subject, body, type } = req.body;
  const { id } = req.params;

  if (!name || !body) {
    return res.status(400).json({ error: 'name and body are required' });
  }

  try {
    const result = await pool.query(
      `UPDATE email_templates SET name = $1, subject = $2, body = $3, type = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [name, subject || '', body, type || 'custom', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /templates/:id
 * Delete a template (default templates can also be deleted).
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM email_templates WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /templates/:id/preview
 * Render a template with sample data using Handlebars.
 * Body: { sampleData: { name, email, ... } } (optional, uses defaults if not provided)
 */
router.post('/:id/preview', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result.rows[0];
    const sampleData = req.body.sampleData || getDefaultSampleData(template.type);

    const compiledBody = Handlebars.compile(template.body)(sampleData);
    const compiledSubject = Handlebars.compile(template.subject)(sampleData);

    res.json({
      subject: compiledSubject,
      body: compiledBody,
      sampleData
    });
  } catch (err) {
    console.error('Error previewing template:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /templates/preview-raw
 * Preview unsaved template content with sample data.
 * Body: { subject, body, type, sampleData (optional) }
 */
router.post('/preview-raw', async (req, res) => {
  const { subject, body, type, sampleData } = req.body;

  if (!body) {
    return res.status(400).json({ error: 'body is required' });
  }

  try {
    const data = sampleData || getDefaultSampleData(type || 'custom');
    const compiledBody = Handlebars.compile(body)(data);
    const compiledSubject = Handlebars.compile(subject || '')(data);

    res.json({
      subject: compiledSubject,
      body: compiledBody,
      sampleData: data
    });
  } catch (err) {
    console.error('Error previewing raw template:', err);
    res.status(500).json({ error: 'Template compilation error', details: err.message });
  }
});

// ============================================================
// SAMPLE DATA FOR PREVIEW
// ============================================================

function getDefaultSampleData(type) {
  const base = {
    name: 'Ronit Sharma',
    email: 'ronit.sharma@email.com',
    phone: '+91 98765 43210',
    role_applied: 'Backend Developer',
    experience_level: '3 years',
    current_location: 'Bangalore',
    current_ctc: '₹8,00,000',
    score: 85,
  };

  const interview = {
    interview_date: '6th May 2026',
    interview_start_time: '2:00 PM',
    interview_end_time: '5:00 PM',
    interview_mode: 'Offline (In-Person)',
    venue_or_link: 'Ripplewalk Office, 4th Floor, Sector 62, Noida',
  };

  const offer = {
    offered_role: 'Senior Backend Developer',
    offered_salary: '₹15,00,000 / year',
    offered_location: 'Bangalore',
    joining_date: '1st June 2026',
  };

  switch (type) {
    case 'rejection':
      return { ...base };
    case 'invite':
      return { ...base, ...interview };
    case 'offer':
      return { ...base, ...offer };
    default:
      return { ...base, ...interview, ...offer };
  }
}

module.exports = router;
