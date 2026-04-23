import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, RefreshCw, LogOut, Mail } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Dashboard = ({ token, onLogout }) => {
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [newJob, setNewJob] = useState({
    role: '',
    salary: '',
    qualification: '',
    skills: '',
    experience: '',
    location: ''
  });

  useEffect(() => {
    fetchJobs();
    fetchCandidates();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`);
      setJobs(response.data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  const fetchCandidates = async () => {
    try {
      const response = await axios.get(`${API_URL}/candidates`);
      setCandidates(response.data);
    } catch (err) {
      console.error('Error fetching candidates:', err);
    }
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/jobs`, newJob);
      setNewJob({ role: '', salary: '', qualification: '', skills: '', experience: '', location: '' });
      fetchJobs();
    } catch (err) {
      console.error('Error creating job:', err);
    }
  };

  const handleScanEmails = async () => {
    setScanning(true);
    try {
      const response = await axios.post(`${API_URL}/candidates/scan`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(response.data.message);
      fetchCandidates();
    } catch (err) {
      console.error('Error scanning emails:', err);
      alert('Scanning failed. Make sure your Gmail API is enabled and Ollama is running.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="container">
      <nav className="nav">
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>HR Dashboard</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleScanEmails} disabled={scanning} className="btn-primary" style={{ backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {scanning ? <RefreshCw className="spin" size={18} /> : <Mail size={18} />}
            {scanning ? 'Scanning Inbox...' : 'Scan Mail'}
          </button>
          <button onClick={onLogout} className="btn-primary" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)' }}>
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <div className="grid">
        {/* Job Creation Section */}
        <section className="glass-card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={20} /> Create Job Role
          </h3>
          <form onSubmit={handleCreateJob}>
            <div className="input-group">
              <label>Job Role</label>
              <input value={newJob.role} onChange={e => setNewJob({...newJob, role: e.target.value})} placeholder="e.g. Backend Developer" required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>Salary</label>
                <input value={newJob.salary} onChange={e => setNewJob({...newJob, salary: e.target.value})} placeholder="$100k - $120k" />
              </div>
              <div className="input-group">
                <label>Location</label>
                <input value={newJob.location} onChange={e => setNewJob({...newJob, location: e.target.value})} placeholder="Remote / NYC" />
              </div>
            </div>
            <div className="input-group">
              <label>Experience Required</label>
              <input value={newJob.experience} onChange={e => setNewJob({...newJob, experience: e.target.value})} placeholder="3+ Years" />
            </div>
            <div className="input-group">
              <label>Skills (Comma separated)</label>
              <input value={newJob.skills} onChange={e => setNewJob({...newJob, skills: e.target.value})} placeholder="Node.js, Postgres, Redis" />
            </div>
            <div className="input-group">
              <label>Qualifications</label>
              <textarea value={newJob.qualification} onChange={e => setNewJob({...newJob, qualification: e.target.value})} placeholder="Degree in CS..." rows="3"></textarea>
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>Post Job Description</button>
          </form>
        </section>

        {/* Existing Jobs List */}
        <section className="glass-card">
          <h3 style={{ marginBottom: '1.5rem' }}>Active Job Roles</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {jobs.map(job => (
              <div key={job.id} className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{job.role}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{job.location} • {job.salary}</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>{job.skills}</div>
              </div>
            ))}
            {jobs.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No jobs posted yet.</p>}
          </div>
        </section>
      </div>

      {/* Candidates Table */}
      <section className="glass-card" style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={20} /> Shortlisted Candidates
        </h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Role</th>
                <th>Date Applied</th>
                <th>Name</th>
                <th>Email</th>
                <th>Experience</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.role_applied}</td>
                  <td>{new Date(c.date_applied).toLocaleDateString()}</td>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.experience_level}</td>
                  <td>
                    <span style={{ color: c.score >= 80 ? '#10b981' : '#f59e0b' }}>{c.score}%</span>
                  </td>
                  <td>
                    <span className="badge badge-success">{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No candidates found yet. Run "Scan Mail" to search your inbox.
            </div>
          )}
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
};

export default Dashboard;
