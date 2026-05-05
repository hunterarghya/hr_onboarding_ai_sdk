import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Search, RefreshCw, MessageCircle, Mail, MapPin, Phone, 
  FileText, ExternalLink, ChevronLeft, ChevronRight 
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Candidates = ({ token, jobs }) => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination & Filtering States
  const [candidatePagination, setCandidatePagination] = useState({
    hasNextPage: false,
    nextCursor: null,
    currentCursor: null,
    cursorStack: []
  });
  const [filters, setFilters] = useState({ 
    role: '', 
    source: '', 
    status: '',
    scoreSort: '',
    minScore: 0,
    maxScore: 100,
    name: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCandidates();
  }, []);

  // Refresh candidates when filters change
  useEffect(() => {
    fetchCandidates(null); // Reset to first page
  }, [filters]);

  const fetchCandidates = async (cursor = null) => {
    setLoading(true);
    try {
      const params = { 
        limit: 10, 
        ...filters
      };
      if (cursor) params.cursor = cursor;
      
      const response = await axios.get(`${API_URL}/candidates`, { params });

      setCandidates(response.data.data);
      setCandidatePagination(prev => ({
        ...prev,
        hasNextPage: response.data.hasNextPage,
        nextCursor: response.data.nextCursor,
        currentCursor: cursor,
        cursorStack: cursor === null ? [] : prev.cursorStack
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

  const handleStatusChange = async (candidateId, newStatus) => {
    try {
      await axios.patch(`${API_URL}/candidates/${candidateId}/status`, { status: newStatus });
      fetchCandidates(candidatePagination.currentCursor);
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Status update failed');
    }
  };

  return (
    <div className="container">
      <section className="glass-card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={20} /> Shortlisted Candidates
          </h3>
          <button onClick={() => fetchCandidates(null)} title="Refresh Table" style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '300px' }}>
              <input 
                type="text" 
                placeholder="Search by name..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setFilters({ ...filters, name: searchTerm })}
              />
              <button 
                onClick={() => setFilters({ ...filters, name: searchTerm })}
                className="btn-primary"
                style={{ width: 'auto', padding: '0 1rem' }}
              >
                <Search size={18} />
              </button>
            </div>

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
              <option value="accepted">Accepted</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>Score Sort:</span>
              <select 
                className="filter-select" 
                style={{ minWidth: '160px' }}
                value={filters.scoreSort} 
                onChange={e => setFilters({ ...filters, scoreSort: e.target.value })}
              >
                <option value="">Newest First</option>
                <option value="highToLow">High to Low</option>
                <option value="lowToHigh">Low to High</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>Score Range:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="number" 
                  min="0" max="100" 
                  value={filters.minScore} 
                  onChange={e => setFilters({ ...filters, minScore: e.target.value })}
                  style={{ width: '70px', padding: '0.4rem', textAlign: 'center' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input 
                  type="number" 
                  min="0" max="100" 
                  value={filters.maxScore} 
                  onChange={e => setFilters({ ...filters, maxScore: e.target.value })}
                  style={{ width: '70px', padding: '0.4rem', textAlign: 'center' }}
                />
              </div>
            </div>
          </div>
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
                      <option value="accepted">Accepted</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidates.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No candidates found yet.
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
        .status-accepted { background: rgba(16, 185, 129, 0.1); color: var(--accent); border-color: var(--accent); }
      `}} />
    </div>
  );
};

export default Candidates;
