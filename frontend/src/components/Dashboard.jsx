import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Eye, Edit, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Dashboard = ({ token }) => {
  const [jobs, setJobs] = useState([]);
  const [submittingJob, setSubmittingJob] = useState(false);
  const [viewingJob, setViewingJob] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  
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
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/jobs`);
      setJobs(response.data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
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

  const updateCriteriaWeight = (jobState, setJobState, key, value) => {
    const weights = { ...(jobState.criteria_weights || {}) };
    if (value === 0) {
      delete weights[key];
    } else {
      weights[key] = value;
    }
    setJobState({ ...jobState, criteria_weights: weights });
  };

  return (
    <div className="container">
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

      <style dangerouslySetInnerHTML={{
        __html: `
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
      `}} />
    </div>
  );
};

export default Dashboard;
