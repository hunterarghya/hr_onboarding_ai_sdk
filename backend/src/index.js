require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const candidateRoutes = require('./routes/candidates');
const whatsappRoutes = require('./routes/whatsapp');
const interviewRoutes = require('./routes/interviews');
const { initWhatsApp } = require('./services/whatsapp');
const { initCollection, upsertJobDescription } = require('./services/vectorMatch');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize WhatsApp
initWhatsApp();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Database
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_roles (
        id SERIAL PRIMARY KEY,
        role VARCHAR(255) NOT NULL,
        salary VARCHAR(100),
        qualification TEXT,
        skills TEXT,
        experience VARCHAR(100),
        location VARCHAR(255),
        shortlist_mode VARCHAR(20) DEFAULT 'manual',
        deadline TIMESTAMP,
        min_score INTEGER DEFAULT 60,
        criteria_weights JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS candidates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        role_applied VARCHAR(255),
        date_applied TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resume_content TEXT,
        score INTEGER,
        experience_level VARCHAR(100),
        status VARCHAR(50) DEFAULT 'shortlisted',
        resume_url TEXT,
        applied_through VARCHAR(50),
        current_location VARCHAR(255),
        current_ctc VARCHAR(100),
        offered_role VARCHAR(255),
        offered_salary VARCHAR(100),
        offered_location VARCHAR(255),
        joining_date DATE
      );

      CREATE TABLE IF NOT EXISTS scan_timestamps (
        id SERIAL PRIMARY KEY,
        source_type VARCHAR(20) NOT NULL,
        source_id VARCHAR(255) NOT NULL DEFAULT 'default',
        last_scanned_at TIMESTAMP NOT NULL DEFAULT '1970-01-01',
        UNIQUE(source_type, source_id)
      );

      CREATE TABLE IF NOT EXISTS interview_events (
        id SERIAL PRIMARY KEY,
        role VARCHAR(255) NOT NULL,
        event_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        num_candidates INTEGER DEFAULT 5,
        extra_candidates INTEGER DEFAULT 0,
        interview_mode VARCHAR(50) DEFAULT 'offline',
        venue_or_link TEXT,
        google_event_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS interview_candidates (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES interview_events(id) ON DELETE CASCADE,
        candidate_id INTEGER NOT NULL REFERENCES candidates(id),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, candidate_id)
      );
    `);
    console.log('Database tables initialized');

    // Migration safety
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE job_roles ADD COLUMN IF NOT EXISTS criteria_weights JSONB DEFAULT '{}';
        ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offered_role VARCHAR(255);
        ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offered_salary VARCHAR(100);
        ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offered_location VARCHAR(255);
        ALTER TABLE candidates ADD COLUMN IF NOT EXISTS joining_date DATE;
        ALTER TABLE interview_events ADD COLUMN IF NOT EXISTS interview_mode VARCHAR(20) DEFAULT 'offline';
        ALTER TABLE interview_events ADD COLUMN IF NOT EXISTS venue_or_link TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    // Initialize Qdrant collection and sync existing jobs
    await initCollection();
    const existingJobs = await pool.query('SELECT * FROM job_roles');
    for (const job of existingJobs.rows) {
      await upsertJobDescription(job);
    }
    console.log(`--- [Vector] Synced ${existingJobs.rows.length} jobs to Qdrant ---`);

  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

// Routes
app.use('/auth', authRoutes);
app.use('/jobs', jobRoutes);
app.use('/candidates', candidateRoutes);
app.use('/whatsapp', whatsappRoutes);
app.use('/interviews', interviewRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
