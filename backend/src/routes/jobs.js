const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create Job Role
router.post('/', async (req, res) => {
  const { role, salary, qualification, skills, experience, location, shortlist_mode, deadline, min_score } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO job_roles (role, salary, qualification, skills, experience, location, shortlist_mode, deadline, min_score) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [role, salary, qualification, skills, experience, location, shortlist_mode || 'manual', deadline, min_score || 60]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating job role:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get All Job Roles
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM job_roles ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching job roles:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Partial Update Job Role
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Dynamically build the SET clause
  const fields = Object.keys(updates);
  if (fields.length === 0) return res.status(400).json({ error: 'No fields provided' });

  const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const values = fields.map(field => updates[field]);
  values.push(id); // For the WHERE clause

  try {
    const result = await pool.query(
      `UPDATE job_roles SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating job role:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete Job Role
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM job_roles WHERE id = $1', [id]);
    res.json({ message: 'Job role deleted successfully' });
  } catch (err) {
    console.error('Error deleting job role:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
