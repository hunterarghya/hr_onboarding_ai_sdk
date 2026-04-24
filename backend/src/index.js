require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const candidateRoutes = require('./routes/candidates');
const whatsappRoutes = require('./routes/whatsapp');
const { initWhatsApp } = require('./services/whatsapp');

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
        status VARCHAR(50) DEFAULT 'shortlisted'
      );
    `);
    console.log('Database tables initialized');
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
