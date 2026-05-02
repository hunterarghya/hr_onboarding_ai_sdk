import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, RefreshCw, LogOut, MessageCircle, Mail, MapPin, Phone, FileText, ExternalLink, Eye, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Dashboard = ({ token, onLogout }) => {
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'not connected', qrCodeData: null });
  const [waGroups, setWaGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [submittingJob, setSubmittingJob] = useState(false);
  const [viewingJob, setViewingJob] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  
  // Pagination & Filtering States
  const [candidatePagination, setCandidatePagination] = useState({
    hasNextPage: false,
    nextCursor: null,
    currentCursor: null,
    cursorStack: []
  });
  const [filters, setFilters] = useState({ role: '', source: '', status: '' });

  const [newJob, setNewJob] = useState({
    role: '',
    salary: '',
    qualification: '',
    skills: '',
    experience: '',
    location: '',
    shortlist_mode: 'manual',
    deadline: '',
    min_score: 60,
    criteria_weights: {}
  });

  useEffect(() => {
    fetchJobs();
    fetchCandidates();
    const interval = setInterval(fetchWAStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Refresh candidates when filters change
  useEffect(() => {
    fetchCandidates(null); // Reset to first page
  }, [filters]);


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

  const fetchCandidates = async (cursor = null) => {
    setLoading(true);
    try {
      const params = { limit: 10, ...filters };
      if (cursor) params.cursor = cursor;
      
      const response = await axios.get(`${API_URL}/candidates`, { params });
      setCandidates(response.data.data);
      setCandidatePagination(prev => ({
        ...prev,
        hasNextPage: response.data.hasNextPage,
        nextCursor: response.data.nextCursor,
        currentCursor: cursor
      }));
    } catch (err) {
      console.error('Error fetching candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (candidatePagination.nextCursor) {
      setCandidatePagination(prev => ({
        ...prev,
        cursorStack: [...prev.cursorStack, prev.currentCursor]
      }));
      fetchCandidates(candidatePagination.nextCursor);
    }
  };

  const handlePrevPage = () => {
    const stack = [...candidatePagination.cursorStack];
    const prevCursor = stack.pop();
    setCandidatePagination(prev => ({ ...prev, cursorStack: stack }));
    fetchCandidates(prevCursor);
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
    if (submittingJob) return;
    setSubmittingJob(true);
    try {
      await axios.post(`${API_URL}/jobs`, newJob);
      setNewJob({
        role: '',
        salary: '',
        qualification: '',
        skills: '',
        experience: '',
        location: '',
        shortlist_mode: 'manual',
        deadline: '',
        min_score: 60,
        criteria_weights: {}
      });
      await fetchJobs();
    } catch (err) {
      console.error('Error creating job:', err);
    } finally {
      setSubmittingJob(false);
    }
  };

  const handleUpdateJob = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${API_URL}/jobs/${editingJob.id}`, editingJob);
      setEditingJob(null);
      fetchJobs();
    } catch (err) {
      console.error('Error updating job:', err);
      alert('Update failed');
    }
  };

  const handleDeleteJob = async (id) => {
    if (!window.confirm('Are you sure you want to delete this job role? This will not affect existing candidates.')) return;
    try {
      await axios.delete(`${API_URL}/jobs/${id}`);
      fetchJobs();
    } catch (err) {
      console.error('Error deleting job:', err);
      alert('Delete failed');
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await axios.post(`${API_URL}/candidates/scan`, {
        whatsappGroupIds: selectedGroups
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

  const handleStatusChange = async (candidateId, newStatus) => {
    try {
      await axios.patch(`${API_URL}/candidates/${candidateId}/status`, { status: newStatus });
      fetchCandidates();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Status update failed');
    }
  };

  const updateCriteriaWeight = (jobState, setJobState, key, value) => {
    const weights = { ...(jobState.criteria_weights || {}) };
    if (value === 0) {
      delete weights[key];
    } else {
      weights[key] = value;
    }
    setJobState({ ...jobState, criteria_weights: weights });
  };

  const getStatusColor = () => {
    switch (waStatus.status) {
      case 'ready': return '#10b981';
      case 'authenticated': return '#3b82f6';
      case 'qr': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return 'var(--text-muted)';
    }
  };

  const toggleGroup = (groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const isScanDisabled = scanning || (selectedGroups.length > 0 && waStatus.status !== 'ready');

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
              <div style={{ position: 'relative' }}>
                <div
                  style={{ width: '220px', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontSize: '0.85rem', cursor: 'pointer', minHeight: '36px' }}
                  onClick={(e) => { e.currentTarget.nextSibling.style.display = e.currentTarget.nextSibling.style.display === 'block' ? 'none' : 'block'; }}
                >
                  {selectedGroups.length === 0 ? 'Select Groups...' : `${selectedGroups.length} group(s) selected`}
                </div>
                <div style={{
                  display: 'none',
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#121212',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  zIndex: 100,
                  maxHeight: '400px',
                  overflowY: 'auto',
                  marginTop: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
                }}>
                  {waGroups.map(g => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                      {g.name}
                    </label>
                  ))}
                  {waGroups.length === 0 && <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No groups found</div>}
                </div>
              </div>
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
              <input value={newJob.role} onChange={e => setNewJob({ ...newJob, role: e.target.value })} placeholder="e.g. Backend Developer" required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>Salary</label>
                <input value={newJob.salary} onChange={e => setNewJob({ ...newJob, salary: e.target.value })} placeholder="$100k - $120k" />
              </div>
              <div className="input-group">
                <label>Location</label>
                <input value={newJob.location} onChange={e => setNewJob({ ...newJob, location: e.target.value })} placeholder="Remote / NYC" />
              </div>
            </div>
            <div className="input-group">
              <label>Experience Required</label>
              <input value={newJob.experience} onChange={e => setNewJob({ ...newJob, experience: e.target.value })} placeholder="3+ Years" />
            </div>
            <div className="input-group">
              <label>Skills (Comma separated)</label>
              <input value={newJob.skills} onChange={e => setNewJob({ ...newJob, skills: e.target.value })} placeholder="Node.js, Postgres, Redis" />
            </div>
            <div className="input-group">
              <label>Qualifications</label>
              <textarea value={newJob.qualification} onChange={e => setNewJob({ ...newJob, qualification: e.target.value })} placeholder="Degree in CS..." rows="3"></textarea>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Advanced Settings</h4>

              {/* Shortlisting Mode Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>Shortlisting Mode</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto will process candidates immediately</div>
                </div>
                <div className="toggle-container" onClick={() => setNewJob({ ...newJob, shortlist_mode: newJob.shortlist_mode === 'manual' ? 'auto' : 'manual' })}>
                  <div className={`toggle-track ${newJob.shortlist_mode === 'auto' ? 'active' : ''}`}>
                    <div className="toggle-thumb"></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', minWidth: '50px' }}>{newJob.shortlist_mode.toUpperCase()}</span>
                </div>
              </div>

              {/* Deadline Picker */}
              <div className="input-group">
                <label>Application Deadline</label>
                <input
                  type="datetime-local"
                  value={newJob.deadline}
                  onChange={e => setNewJob({ ...newJob, deadline: e.target.value })}
                  required
                />
              </div>

              {/* Match Score Slider */}
              <div className="input-group" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label>Minimum Match Score</label>
                  <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{newJob.min_score}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newJob.min_score}
                  onChange={e => setNewJob({ ...newJob, min_score: parseInt(e.target.value) })}
                  style={{ width: '100%' }}
                  className="custom-slider"
                />
              </div>

              {/* Criteria Weight Sliders */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Scoring Criteria (Optional)</h4>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Set weights for each criterion. Leave at 0 to ignore.</p>
                {['skills', 'projects', 'experience'].map(key => (
                  <div key={key} className="input-group" style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <label style={{ textTransform: 'capitalize' }}>{key}</label>
                      <span style={{ fontWeight: '700', color: 'var(--accent)', fontSize: '0.85rem' }}>{newJob.criteria_weights?.[key] || 0}</span>
                    </div>
                    <input
                      type="range" min="0" max="10"
                      value={newJob.criteria_weights?.[key] || 0}
                      onChange={e => updateCriteriaWeight(newJob, (v) => setNewJob(v), key, parseInt(e.target.value))}
                      className="custom-slider" style={{ width: '100%' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingJob}
              className="btn-primary"
              style={{ width: '100%', marginTop: '1.5rem', opacity: submittingJob ? 0.7 : 1 }}
            >
              {submittingJob ? 'Posting Job...' : 'Post Job Description'}
            </button>
          </form>
        </section>

        {/* Existing Jobs List */}
        <section className="glass-card">
          <h3 style={{ marginBottom: '1.5rem' }}>Active Job Roles</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {jobs.map(job => {
              const isExpired = job.deadline && new Date(job.deadline) < new Date();
              return (
                <div key={job.id} className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', position: 'relative', opacity: isExpired ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <div style={{ fontWeight: '600', paddingRight: '5rem' }}>{job.role}</div>
                    {isExpired && <span className="badge badge-success" style={{ background: '#ef4444', color: 'white', fontSize: '0.65rem' }}>CLOSED</span>}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{job.location} • {job.salary}</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>{job.skills}</div>

                  <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setViewingJob(job)} title="View" style={{ padding: '0.25rem', background: 'transparent', color: 'var(--text-muted)' }}><Eye size={16} /></button>
                    <button onClick={() => setEditingJob(job)} title="Edit" style={{ padding: '0.25rem', background: 'transparent', color: 'var(--text-muted)' }}><Edit size={16} /></button>
                    <button onClick={() => handleDeleteJob(job.id)} title="Delete" style={{ padding: '0.25rem', background: 'transparent', color: '#ef4444' }}><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}
            {jobs.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No jobs posted yet.</p>}
          </div>
        </section>
      </div>

      {/* View Job Modal */}
      {viewingJob && (
        <div className="modal-overlay">
          <div className="glass-card" style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Job Details: {viewingJob.role}</h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div><strong>Location:</strong> {viewingJob.location || 'N/A'}</div>
              <div><strong>Salary:</strong> {viewingJob.salary || 'N/A'}</div>
              <div><strong>Experience:</strong> {viewingJob.experience || 'N/A'}</div>
              <div><strong>Skills:</strong> {viewingJob.skills || 'N/A'}</div>
              <div><strong>Shortlisting:</strong> {viewingJob.shortlist_mode.toUpperCase()}</div>
              <div><strong>Min Score:</strong> {viewingJob.min_score}%</div>
              <div><strong>Deadline:</strong> {new Date(viewingJob.deadline).toLocaleString()}</div>
              <div>
                <strong>Qualifications:</strong>
                <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{viewingJob.qualification}</p>
              </div>
            </div>
            <button onClick={() => setViewingJob(null)} className="btn-primary" style={{ marginTop: '2rem', width: '100%' }}>Close</button>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {editingJob && (
        <div className="modal-overlay">
          <div className="glass-card" style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Edit Job Role</h2>
            <form onSubmit={handleUpdateJob}>
              <div className="input-group">
                <label>Job Role</label>
                <input value={editingJob.role} onChange={e => setEditingJob({ ...editingJob, role: e.target.value })} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label>Salary</label>
                  <input value={editingJob.salary} onChange={e => setEditingJob({ ...editingJob, salary: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>Location</label>
                  <input value={editingJob.location} onChange={e => setEditingJob({ ...editingJob, location: e.target.value })} />
                </div>
              </div>
              <div className="input-group">
                <label>Experience Required</label>
                <input value={editingJob.experience} onChange={e => setEditingJob({ ...editingJob, experience: e.target.value })} />
              </div>
              <div className="input-group">
                <label>Skills</label>
                <input value={editingJob.skills} onChange={e => setEditingJob({ ...editingJob, skills: e.target.value })} />
              </div>
              <div className="input-group">
                <label>Qualifications</label>
                <textarea value={editingJob.qualification} onChange={e => setEditingJob({ ...editingJob, qualification: e.target.value })} rows="3"></textarea>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>Shortlisting Mode</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto will process candidates immediately</div>
                  </div>
                  <div className="toggle-container" onClick={() => setEditingJob({ ...editingJob, shortlist_mode: editingJob.shortlist_mode === 'manual' ? 'auto' : 'manual' })}>
                    <div className={`toggle-track ${editingJob.shortlist_mode === 'auto' ? 'active' : ''}`}>
                      <div className="toggle-thumb"></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600', minWidth: '50px' }}>{editingJob.shortlist_mode.toUpperCase()}</span>
                  </div>
                </div>

                <div className="input-group">
                  <label>Application Deadline</label>
                  <input
                    type="datetime-local"
                    value={editingJob.deadline ? new Date(editingJob.deadline).toISOString().slice(0, 16) : ''}
                    onChange={e => setEditingJob({ ...editingJob, deadline: e.target.value })}
                  />
                </div>

                <div className="input-group" style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label>Minimum Match Score</label>
                    <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{editingJob.min_score}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={editingJob.min_score} onChange={e => setEditingJob({ ...editingJob, min_score: parseInt(e.target.value) })} style={{ width: '100%' }} className="custom-slider" />
                </div>

                {/* Criteria Weight Sliders */}
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Scoring Criteria (Optional)</h4>
                  {['skills', 'projects', 'experience'].map(key => (
                    <div key={key} className="input-group" style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <label style={{ textTransform: 'capitalize' }}>{key}</label>
                        <span style={{ fontWeight: '700', color: 'var(--accent)', fontSize: '0.85rem' }}>{editingJob.criteria_weights?.[key] || 0}</span>
                      </div>
                      <input
                        type="range" min="0" max="10"
                        value={editingJob.criteria_weights?.[key] || 0}
                        onChange={e => updateCriteriaWeight(editingJob, (v) => setEditingJob(v), key, parseInt(e.target.value))}
                        className="custom-slider" style={{ width: '100%' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Changes</button>
                <button type="button" onClick={() => setEditingJob(null)} className="btn-primary" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidates Table */}
      <section className="glass-card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={20} /> Shortlisted Candidates
          </h3>
          <button onClick={() => fetchCandidates(null)} title="Refresh Table" style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="filter-bar">
          <select className="filter-select" value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value })}>
            <option value="">All Roles</option>
            <option value="Open">Open</option>
            {jobs.map(j => <option key={j.id} value={j.role}>{j.role}</option>)}
          </select>
          <select className="filter-select" value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}>
            <option value="">All Sources</option>
            <option value="Gmail">Gmail</option>
            <option value="WhatsApp">WhatsApp</option>
          </select>
          <select className="filter-select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Statuses</option>
            <option value="applied">Applied</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="hold">Hold</option>
            <option value="rejected">Rejected</option>
            <option value="selected">Selected</option>
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Source</th>
                <th>Name</th>
                <th>Role</th>
                <th>Mobile</th>
                <th>Location</th>
                <th>CTC</th>
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
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                      <MapPin size={12} opacity={0.5} /> {c.current_location}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{c.current_ctc}</div>
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
                    <select
                      value={c.status}
                      onChange={(e) => handleStatusChange(c.id, e.target.value)}
                      className={`status-select status-${c.status}`}
                    >
                      <option value="applied">Applied</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="hold">Hold</option>
                      <option value="rejected">Rejected</option>
                      <option value="selected">Selected</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No candidates found yet. Run "Scan Mail" to search your inbox.
            </div>
          )}
        </div>

        <div className="pagination-controls">
          <button onClick={handlePrevPage} disabled={candidatePagination.cursorStack.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', opacity: candidatePagination.cursorStack.length === 0 ? 0.5 : 1 }}>
            <ChevronLeft size={16} /> Previous
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Page {candidatePagination.cursorStack.length + 1}</span>
          <button onClick={handleNextPage} disabled={!candidatePagination.hasNextPage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', opacity: !candidatePagination.hasNextPage ? 0.5 : 1 }}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </section>


      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        .toggle-container {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
        }
        .toggle-track {
          width: 48px;
          height: 24px;
          background: rgba(255,255,255,0.1);
          border-radius: 12px;
          position: relative;
          transition: all 0.3s ease;
          border: 1px solid var(--border);
        }
        .toggle-track.active {
          background: var(--primary);
          border-color: var(--primary);
        }
        .toggle-thumb {
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .active .toggle-thumb {
          left: 26px;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .custom-slider {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
          appearance: none;
          cursor: pointer;
          margin-top: 0.5rem;
        }
        .custom-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: var(--primary);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
        .status-select {
          padding: 4px 12px;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: var(--text);
          outline: none;
        }
        .status-applied { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border-color: rgba(59, 130, 246, 0.3); }
        .status-shortlisted { background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
        .status-hold { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); }
        .status-rejected { background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
        .status-selected { background: #065f46; color: #ffffff; border-color: #047857; text-transform: uppercase; box-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
      `}} />
    </div>
  );
};

export default Dashboard;
