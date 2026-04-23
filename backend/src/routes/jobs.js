const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create Job Role
router.post('/', async (req, res) => {
  const { role, salary, qualification, skills, experience, location } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO job_roles (role, salary, qualification, skills, experience, location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [role, salary, qualification, skills, experience, location]
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

module.exports = router;
