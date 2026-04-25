import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, RefreshCw, LogOut, MessageCircle, Mail, MapPin, Phone, FileText, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Dashboard = ({ token, onLogout }) => {
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'not connected', qrCodeData: null });
  const [waGroups, setWaGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [showQR, setShowQR] = useState(false);
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
    const interval = setInterval(fetchWAStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (waStatus.status === 'ready') {
      fetchWAGroups();
    }
  }, [waStatus.status]);

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

  const fetchWAStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/whatsapp/status`);
      setWaStatus(response.data);
      // Removed automatic setShowQR(true)
    } catch (err) {
      console.error('Error fetching WA status:', err);
    }
  };

  const fetchWAGroups = async () => {
    try {
      const response = await axios.get(`${API_URL}/whatsapp/groups`);
      setWaGroups(response.data);
    } catch (err) {
      console.error('Error fetching WA groups:', err);
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

  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await axios.post(`${API_URL}/candidates/scan`, {
        whatsappGroupId: selectedGroup
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(response.data.message);
      fetchCandidates();
    } catch (err) {
      console.error('Error scanning:', err);
      alert('Scanning failed. Check logs.');
    } finally {
      setScanning(false);
    }
  };

  const getStatusColor = () => {
    switch(waStatus.status) {
      case 'ready': return '#10b981';
      case 'authenticated': return '#3b82f6';
      case 'qr': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return 'var(--text-muted)';
    }
  };

  const isScanDisabled = scanning || (selectedGroup && waStatus.status !== 'ready');

  return (
    <div className="container">
      <nav className="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>HR Dashboard</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getStatusColor() }}></div>
              <span style={{ fontWeight: '500' }}>WhatsApp: {waStatus.status}</span>
            </div>
            {waStatus.status !== 'ready' && waStatus.status !== 'authenticated' && (
              <button 
                onClick={() => setShowQR(true)} 
                className="btn-primary" 
                style={{ padding: '4px 12px', fontSize: '0.75rem', backgroundColor: 'var(--primary)' }}
              >
                {waStatus.status === 'qr' ? 'View QR Code' : 'Connect WhatsApp'}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {waStatus.status === 'ready' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select 
                value={selectedGroup} 
                onChange={e => setSelectedGroup(e.target.value)}
                style={{ width: '200px', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)' }}
              >
                <option value="">No WhatsApp Group</option>
                {waGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button onClick={fetchWAGroups} title="Refresh Groups" style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.1)' }}>
                <RefreshCw size={16} />
              </button>
            </div>
          )}
          <button onClick={handleScan} disabled={isScanDisabled} className="btn-primary" style={{ backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {scanning ? <RefreshCw className="spin" size={18} /> : <Search size={18} />}
            {scanning ? 'Processing...' : 'Scan Mail & WhatsApp'}
          </button>
          <button onClick={onLogout} className="btn-primary" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)' }}>
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {showQR && waStatus.qrCodeData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="glass-card" style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '1rem' }}>Scan QR for WhatsApp</h3>
            <img src={waStatus.qrCodeData} alt="WhatsApp QR" style={{ borderRadius: '0.5rem', marginBottom: '1rem' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Open WhatsApp on your phone and scan</p>
            <button onClick={() => setShowQR(false)} style={{ marginTop: '1rem' }}>Close</button>
          </div>
        </div>
      )}

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
                <th>Source</th>
                <th>Name</th>
                <th>Role</th>
                <th>Mobile</th>
                <th>Experience</th>
                <th>Score</th>
                <th>Resume</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {c.applied_through === 'WhatsApp' ? (
                        <span title="WhatsApp" style={{ color: '#10b981', display: 'flex' }}><MessageCircle size={16} /></span>
                      ) : (
                        <span title="Gmail" style={{ color: '#ef4444', display: 'flex' }}><Mail size={16} /></span>
                      )}
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{c.applied_through}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.email}</div>
                  </td>
                  <td>{c.role_applied}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                      <Phone size={12} opacity={0.5} /> {c.phone}
                    </div>
                  </td>
                  <td>{c.experience_level}</td>
                  <td>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '1rem', 
                      background: c.score >= 80 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: c.score >= 80 ? '#10b981' : '#f59e0b',
                      fontSize: '0.875rem',
                      fontWeight: '600'
                    }}>
                      {c.score}%
                    </span>
                  </td>
                  <td>
                    {c.resume_url ? (
                      <a 
                        href={c.resume_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn-primary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={14} /> PDF <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>No PDF</span>
                    )}
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
