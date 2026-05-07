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
const templateRoutes = require('./routes/templates');
const mailRoutes = require('./routes/mail');
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
        joining_date DATE,
        offer_sent BOOLEAN DEFAULT false
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
        invite_sent BOOLEAN DEFAULT false,
        UNIQUE(event_id, candidate_id)
      );

      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        type VARCHAR(50) NOT NULL DEFAULT 'custom',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default templates (only if none exist)
    const templateCount = await pool.query('SELECT COUNT(*) FROM email_templates WHERE is_default = true');
    if (parseInt(templateCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO email_templates (name, subject, body, type, is_default) VALUES
        ('Rejection Mail', 'Update on Your Application at Ripplewalk', '<p>Hello {{name}},</p><p>Thank you for taking the time to apply at <strong>Ripplewalk</strong> for the <strong>{{role_applied}}</strong> position. After careful consideration, we have decided to move forward with other candidates.</p><p>We truly appreciate your interest and encourage you to apply again in the future.</p><p>Best regards,<br/>Team Ripplewalk</p>', 'rejection', true),
        ('Interview Invitation', 'Interview Invitation - {{role_applied}} at Ripplewalk', '<p>Hello {{name}},</p><p>We are pleased to inform you that you have been shortlisted for an interview for the <strong>{{role_applied}}</strong> position.</p><p>📅 <strong>Date:</strong> {{interview_date}}<br/>🕐 <strong>Time:</strong> {{interview_start_time}} - {{interview_end_time}}<br/>📍 <strong>Mode:</strong> {{interview_mode}}<br/>🔗 <strong>Venue/Link:</strong> {{venue_or_link}}</p><p>Please be on time and bring all necessary documents.</p><p>Best regards,<br/>Team Ripplewalk</p>', 'invite', true),
        ('Offer Letter', 'Offer of Employment - {{offered_role}} at Ripplewalk', '<p>Hello {{name}},</p><p>We are delighted to inform you that you have been selected as <strong>{{offered_role}}</strong> at <strong>Ripplewalk</strong>!</p><p>💰 <strong>CTC:</strong> {{offered_salary}}<br/>📍 <strong>Location:</strong> {{offered_location}}<br/>📅 <strong>Joining Date:</strong> {{joining_date}}</p><p>We look forward to having you on our team. Please confirm your acceptance at the earliest.</p><p>Congratulations!<br/>Team Ripplewalk</p>', 'offer', true)
      `);
      console.log('Default email templates seeded');
    }
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
        ALTER TABLE interview_candidates ADD COLUMN IF NOT EXISTS invite_sent BOOLEAN DEFAULT false;
        ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_sent BOOLEAN DEFAULT false;
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
app.use('/templates', templateRoutes);
app.use('/mail', mailRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
