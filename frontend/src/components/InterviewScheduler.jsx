import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Calendar, Plus, ChevronDown, ChevronUp, Users, Clock, Briefcase,
  CheckSquare, Zap, Edit, Trash2, RefreshCw, Phone, MapPin, Mail, AlertTriangle,
  MessageCircle, FileText, ExternalLink, Save, X
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const InterviewScheduler = ({ token, jobs }) => {
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showEventForm, setShowEventForm] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [eventCandidates, setEventCandidates] = useState({});
  const [eligibleCandidates, setEligibleCandidates] = useState([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(null); // 'manual' | 'auto' | null
  const [editingEventId, setEditingEventId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectionModal, setSelectionModal] = useState({
    isOpen: false,
    candidateId: null,
    candidateName: '',
    eventId: null,
    form: { offered_role: '', offered_salary: '', offered_location: '', joining_date: '' }
  });
  const [mailModal, setMailModal] = useState({ isOpen: false, eventId: null, templates: [], selectedTemplateId: '', sending: false });
  const [unsentCounts, setUnsentCounts] = useState([]);

  const [newEvent, setNewEvent] = useState({
    role: '', start_time: '09:00', end_time: '13:00',
    num_candidates: 5, extra_candidates: 0,
    interview_mode: 'offline', venue_or_link: ''
  });

  const headers = { Authorization: `Bearer ${token}` };

  const fetchEvents = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/interviews/events`);
      setEvents(res.data);
    } catch (err) { console.error('Error fetching events:', err); }
  }, []);

  const fetchUnsentCounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/mail/unsent-invites-count`);
      setUnsentCounts(res.data);
    } catch (err) { console.error('Error fetching unsent counts:', err); }
  }, []);

  useEffect(() => { fetchEvents(); fetchUnsentCounts(); }, [fetchEvents, fetchUnsentCounts]);

  const fetchAssignedCandidates = async (eventId) => {
    try {
      const res = await axios.get(`${API_URL}/interviews/events/${eventId}/candidates`);
      setEventCandidates(prev => ({ ...prev, [eventId]: res.data }));
    } catch (err) { console.error('Error fetching assigned candidates:', err); }
  };

  const fetchEligible = async (eventId) => {
    try {
      const res = await axios.get(`${API_URL}/interviews/eligible-candidates/${eventId}`);
      setEligibleCandidates(res.data);
    } catch (err) { console.error('Error fetching eligible:', err); }
  };

  const handleCreateEvent = async () => {
    if (!newEvent.role || !selectedDate) return;
    try {
      await axios.post(`${API_URL}/interviews/events`, {
        ...newEvent, event_date: selectedDate, sync_calendar: true
      }, { headers });
      setNewEvent({ role: '', start_time: '09:00', end_time: '13:00', num_candidates: 5, extra_candidates: 0, interview_mode: 'offline', venue_or_link: '' });
      setShowEventForm(false);
      fetchEvents();
    } catch (err) { console.error('Error creating event:', err); alert('Failed to create event'); }
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Delete this interview event?')) return;
    try {
      await axios.delete(`${API_URL}/interviews/events/${id}`, { headers });
      fetchEvents();
    } catch (err) { console.error('Error deleting event:', err); }
  };

  const handleSyncCalendar = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API_URL}/interviews/sync-calendar`, {}, { headers });
      alert(`Sync complete: ${res.data.imported} events imported`);
      fetchEvents();
      fetchUnsentCounts();
    } catch (err) { console.error('Sync error:', err); alert('Calendar sync failed'); }
    finally { setSyncing(false); }
  };

  const openMailModal = async (eventId = null) => {
    try {
      const res = await axios.get(`${API_URL}/templates`);
      setMailModal({
        isOpen: true, eventId,
        templates: res.data,
        selectedTemplateId: res.data[0]?.id || '',
        sending: false
      });
    } catch (err) { console.error('Error fetching templates:', err); alert('Failed to load templates'); }
  };

  const handleSendInvites = async () => {
    if (!mailModal.selectedTemplateId) return;
    setMailModal(prev => ({ ...prev, sending: true }));
    try {
      const url = mailModal.eventId
        ? `${API_URL}/mail/interview-invites/${mailModal.eventId}`
        : `${API_URL}/mail/interview-invites-all`;
      const res = await axios.post(url, { templateId: mailModal.selectedTemplateId }, { headers });
      alert(`Done! Sent: ${res.data.sent}, Failed: ${res.data.failed}, Skipped: ${res.data.skipped}`);
      setMailModal(prev => ({ ...prev, isOpen: false, sending: false }));
      fetchUnsentCounts();
      if (mailModal.eventId) fetchAssignedCandidates(mailModal.eventId);
    } catch (err) {
      console.error('Mail error:', err);
      alert('Failed to send emails: ' + (err.response?.data?.details || err.message));
      setMailModal(prev => ({ ...prev, sending: false }));
    }
  };

  const toggleEventExpand = async (eventId) => {
    if (expandedEvent === eventId) {
      setExpandedEvent(null);
      setSelectionMode(null);
      setEditingEventId(null);
      return;
    }
    setExpandedEvent(eventId);
    setSelectionMode(null);
    setEditingEventId(null);
    await fetchAssignedCandidates(eventId);
  };

  const startManualSelection = async (eventId) => {
    setSelectionMode('manual');
    setEditingEventId(null);
    setLoading(true);
    await fetchEligible(eventId);
    // Pre-check already assigned
    const assigned = eventCandidates[eventId] || [];
    setSelectedCandidateIds(new Set(assigned.map(c => c.id)));
    setLoading(false);
  };

  const startEditSelection = async (eventId) => {
    setEditingEventId(eventId);
    setSelectionMode('manual');
    setLoading(true);
    await fetchEligible(eventId);
    const assigned = eventCandidates[eventId] || [];
    setSelectedCandidateIds(new Set(assigned.map(c => c.id)));
    setLoading(false);
  };

  const toggleCandidateSelect = (id) => {
    setSelectedCandidateIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveManualSelection = async (eventId) => {
    const ids = Array.from(selectedCandidateIds);
    try {
      const method = editingEventId ? 'patch' : 'post';
      await axios[method](`${API_URL}/interviews/events/${eventId}/candidates/manual`,
        { candidate_ids: ids }, { headers });

      // Refresh the specific assigned list first
      await fetchAssignedCandidates(eventId);

      // Refresh global events to update badges (e.g. "2 assigned")
      await fetchEvents();

      setSelectionMode(null);
      setEditingEventId(null);
    } catch (err) {
      console.error('Error saving selection:', err);
      alert('Failed to save candidates. Check console for details.');
    }
  };

  const handleStatusChange = async (candidateId, newStatus, eventId) => {
    if (newStatus === 'selected') {
      // Find candidate from eligible or assigned lists
      let candidate = eligibleCandidates.find(c => c.id === candidateId);
      if (!candidate) {
        const assigned = eventCandidates[eventId] || [];
        candidate = assigned.find(c => c.id === candidateId);
      }
      setSelectionModal({
        isOpen: true,
        candidateId,
        candidateName: candidate?.name || '',
        eventId,
        form: {
          offered_role: candidate?.role_applied || '',
          offered_salary: '',
          offered_location: candidate?.current_location || '',
          joining_date: ''
        }
      });
      return;
    }

    try {
      await axios.patch(`${API_URL}/candidates/${candidateId}/status`, { status: newStatus }, { headers });
      if (eventId) await fetchAssignedCandidates(eventId);
      if (selectionMode === 'manual') await fetchEligible(eventId);
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Status update failed');
    }
  };

  const submitSelection = async () => {
    const { offered_role, offered_salary, offered_location, joining_date } = selectionModal.form;
    if (!offered_role || !offered_salary || !offered_location || !joining_date) {
      alert('All fields are required to mark as Selected.');
      return;
    }
    try {
      await axios.patch(`${API_URL}/candidates/${selectionModal.candidateId}/status`, {
        status: 'selected',
        ...selectionModal.form
      }, { headers });
      const eid = selectionModal.eventId;
      setSelectionModal({ isOpen: false, candidateId: null, candidateName: '', eventId: null, form: { offered_role: '', offered_salary: '', offered_location: '', joining_date: '' } });
      if (eid) await fetchAssignedCandidates(eid);
      if (selectionMode === 'manual' && eid) await fetchEligible(eid);
    } catch (err) {
      console.error('Error submitting selection:', err);
      alert('Failed to save selection details.');
    }
  };

  const updateModalForm = (key, value) => {
    setSelectionModal(prev => ({ ...prev, form: { ...prev.form, [key]: value } }));
  };

  const handleAutoAssign = async (eventId) => {
    setSelectionMode('auto');
    try {
      await axios.post(`${API_URL}/interviews/events/${eventId}/candidates/auto`, {}, { headers });
      await fetchAssignedCandidates(eventId);
      await fetchEvents();
    } catch (err) { console.error('Error auto-assigning:', err); alert('Auto-assign failed'); }
  };

  // ---- Calendar rendering ----
  const getDaysInMonth = (date) => {
    const y = date.getFullYear(), m = date.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return { firstDay, daysInMonth, year: y, month: m };
  };

  const { firstDay, daysInMonth, year, month } = getDaysInMonth(calendarMonth);
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const today = new Date().toISOString().split('T')[0];

  const eventDates = new Set(events.map(e => e.event_date?.split('T')[0]));

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const formatDate = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const eventsForSelectedDate = events.filter(e => e.event_date?.split('T')[0] === selectedDate);

  return (
    <div className="interview-scheduler">
      <div className="interview-header" style={{ justifyContent: 'flex-end', marginBottom: '2rem', gap: '0.75rem' }}>
        <button onClick={() => openMailModal(null)} className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <Mail size={16} /> Send All Pending Invites
        </button>
        <button onClick={handleSyncCalendar} disabled={syncing} className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <RefreshCw size={16} className={syncing ? 'spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Google Calendar'}
        </button>
      </div>

      <div className="scheduler-layout">
        {/* Calendar Panel */}
        <div className="calendar-panel glass-card">
          <div className="calendar-nav">
            <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="cal-nav-btn">&lt;</button>
            <span className="cal-month-label">{monthName}</span>
            <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="cal-nav-btn">&gt;</button>
          </div>
          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="cal-header-cell">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              if (!day) return <div key={`e-${i}`} className="cal-cell empty" />;
              const dateStr = formatDate(day);
              const isSelected = dateStr === selectedDate;
              const hasEvents = eventDates.has(dateStr);
              const isToday = dateStr === today;
              const hasUnsent = unsentCounts.some(u => u.event_date?.split('T')[0] === dateStr);
              return (
                <div key={i} className={`cal-cell ${isSelected ? 'selected' : ''} ${hasEvents ? 'has-events' : ''} ${isToday ? 'today' : ''} ${hasUnsent ? 'unsent-warning' : ''}`}
                  onClick={() => { setSelectedDate(dateStr); setExpandedEvent(null); setSelectionMode(null); }}>
                  <span>{day}</span>
                  {hasEvents && <div className="event-dot" />}
                </div>
              );
            })}
          </div>

          {selectedDate && (
            <button onClick={() => setShowEventForm(true)} className="btn-primary add-event-btn">
              <Plus size={16} /> Add Interview Event
            </button>
          )}
        </div>

        {/* Events Panel */}
        <div className="events-panel">
          {showEventForm && selectedDate && (
            <div className="glass-card event-form">
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} /> New Event — {new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </h3>
              <div className="form-row">
                <div className="input-group" style={{ flex: 2 }}>
                  <label>Role</label>
                  <select value={newEvent.role} onChange={e => setNewEvent({ ...newEvent, role: e.target.value })}>
                    <option value="">Select Role...</option>
                    <option value="Open Role">Open Role (General)</option>
                    {jobs.map(j => <option key={j.id} value={j.role}>{j.role}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label>Start Time</label>
                  <input type="time" value={newEvent.start_time} onChange={e => setNewEvent({ ...newEvent, start_time: e.target.value })} />
                </div>
                <div className="input-group">
                  <label>End Time</label>
                  <input type="time" value={newEvent.end_time} onChange={e => setNewEvent({ ...newEvent, end_time: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label>Candidates</label>
                  <input type="number" min="1" value={newEvent.num_candidates} onChange={e => setNewEvent({ ...newEvent, num_candidates: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="input-group">
                  <label>Extra (optional)</label>
                  <input type="number" min="0" value={newEvent.extra_candidates} onChange={e => setNewEvent({ ...newEvent, extra_candidates: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="form-row">
                <div className="input-group" style={{ flex: 1 }}>
                  <label>Mode</label>
                  <div style={{ display: 'flex', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                      type="button"
                      onClick={() => setNewEvent({ ...newEvent, interview_mode: 'offline', venue_or_link: '' })}
                      style={{
                        flex: 1, padding: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                        background: newEvent.interview_mode === 'offline' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                        color: newEvent.interview_mode === 'offline' ? '#fff' : 'var(--text-muted)'
                      }}
                    >
                      <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Offline
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEvent({ ...newEvent, interview_mode: 'online', venue_or_link: '' })}
                      style={{
                        flex: 1, padding: '0.5rem', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                        background: newEvent.interview_mode === 'online' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                        color: newEvent.interview_mode === 'online' ? '#fff' : 'var(--text-muted)'
                      }}
                    >
                      <ExternalLink size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> Online
                    </button>
                  </div>
                </div>
                <div className="input-group" style={{ flex: 2 }}>
                  <label>{newEvent.interview_mode === 'online' ? 'Google Meet Link' : 'Venue / Address'}</label>
                  <input
                    type="text"
                    placeholder={newEvent.interview_mode === 'online' ? 'https://meet.google.com/...' : 'e.g. Office, Floor 3, Room B'}
                    value={newEvent.venue_or_link}
                    onChange={e => setNewEvent({ ...newEvent, venue_or_link: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button onClick={handleCreateEvent} className="btn-primary" style={{ flex: 1 }}><Save size={16} /> Save Event</button>
                <button onClick={() => setShowEventForm(false)} className="btn-primary" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}><X size={16} /> Cancel</button>
              </div>
            </div>
          )}

          {!selectedDate && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Calendar size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>Select a date on the calendar to view or create interview events</p>
            </div>
          )}

          {selectedDate && eventsForSelectedDate.length === 0 && !showEventForm && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p>No interview events on this date.</p>
            </div>
          )}

          {eventsForSelectedDate.map(event => {
            const isExpanded = expandedEvent === event.id;
            const assigned = eventCandidates[event.id] || [];
            const totalSlots = event.num_candidates + (event.extra_candidates || 0);

            return (
              <div key={event.id} className="glass-card event-card">
                <div className="event-card-header" onClick={() => toggleEventExpand(event.id)}>
                  <div className="event-info">
                    <div className="event-role"><Briefcase size={16} /> {event.role}</div>
                    <div className="event-meta">
                      <span><Clock size={14} /> {event.start_time?.slice(0, 5)} — {event.end_time?.slice(0, 5)}</span>
                      <span><Users size={14} /> {event.num_candidates}{event.extra_candidates > 0 ? `+${event.extra_candidates}` : ''} candidates</span>
                      <span style={{ color: event.interview_mode === 'online' ? '#60a5fa' : '#f59e0b' }}>
                        {event.interview_mode === 'online' ? <><ExternalLink size={14} /> Online</> : <><MapPin size={14} /> Offline</>}
                      </span>
                      {event.venue_or_link && (
                        event.interview_mode === 'online'
                          ? <a href={event.venue_or_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#60a5fa', fontSize: '0.8rem', textDecoration: 'underline' }}>Meet Link</a>
                          : <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{event.venue_or_link}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {unsentCounts.find(u => u.event_id === event.id) && (
                      <span className="unsent-badge" title="There are candidates in this event who did not receive interview invite, please review">
                        <AlertTriangle size={14} /> {unsentCounts.find(u => u.event_id === event.id)?.unsent_count} unsent
                      </span>
                    )}
                    {assigned.length > 0 && <span className="badge badge-success">{assigned.length} assigned</span>}
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                      style={{ background: 'transparent', padding: '0.25rem', color: '#ef4444' }}><Trash2 size={16} /></button>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="event-expanded">
                    {/* Selection mode buttons */}
                    {selectionMode === null && (
                      <div className="selection-buttons">
                        <button onClick={() => openMailModal(event.id)} className="btn-primary selection-btn" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                          <Mail size={16} /> Send Invites to Candidates
                        </button>
                        <button onClick={() => startManualSelection(event.id)} className="btn-primary selection-btn">
                          <CheckSquare size={16} /> Choose Candidates Manually
                        </button>
                        <button onClick={() => handleAutoAssign(event.id)} className="btn-primary selection-btn auto-btn">
                          <Zap size={16} /> Auto Select Top {totalSlots} by Score
                        </button>
                      </div>
                    )}

                    {/* Manual selection table */}
                    {selectionMode === 'manual' && (
                      <div className="manual-selection">
                        <h4 style={{ marginBottom: '1rem' }}>
                          {editingEventId ? 'Edit Candidate Selection' : 'Select Candidates for Interview'}
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                            ({selectedCandidateIds.size} selected)
                          </span>
                        </h4>
                        {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading candidates...</p> : (
                          <>
                            <div className="table-container">
                              <table>
                                <thead><tr>
                                  <th style={{ width: '40px' }}><input type="checkbox"
                                    checked={eligibleCandidates.length > 0 && selectedCandidateIds.size === eligibleCandidates.length}
                                    onChange={() => {
                                      if (selectedCandidateIds.size === eligibleCandidates.length) setSelectedCandidateIds(new Set());
                                      else setSelectedCandidateIds(new Set(eligibleCandidates.map(c => c.id)));
                                    }} /></th>
                                  <th>Source</th><th>Name</th><th>Mail</th><th>Role</th><th>Mobile</th><th>Location</th>
                                  <th>CTC</th><th>Experience</th><th>Score</th><th>Resume</th><th>Status</th>
                                </tr></thead>
                                <tbody>
                                  {eligibleCandidates.map(c => (
                                    <tr key={c.id} className={selectedCandidateIds.has(c.id) ? 'row-selected' : ''}>
                                      <td><input type="checkbox" checked={selectedCandidateIds.has(c.id)} onChange={() => toggleCandidateSelect(c.id)} /></td>
                                      <td><div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {c.applied_through === 'WhatsApp' ? <MessageCircle size={14} style={{ color: '#10b981' }} /> : <Mail size={14} style={{ color: '#ef4444' }} />}
                                        <span style={{ fontSize: '0.75rem' }}>{c.applied_through}</span>
                                      </div></td>
                                      <td><div style={{ fontWeight: 600 }}>{c.name}</div></td>
                                      <td><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.email}</div></td>
                                      <td><div style={{ fontSize: '0.85rem' }}>{c.role_applied}</div></td>
                                      <td><div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Phone size={12} style={{ opacity: 0.5 }} /> {c.phone}</div></td>
                                      <td><div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={12} style={{ opacity: 0.5 }} /> {c.current_location}</div></td>
                                      <td><div style={{ fontSize: '0.85rem' }}>{c.current_ctc}</div></td>
                                      <td><div style={{ fontSize: '0.85rem' }}>{c.experience_level}</div></td>
                                      <td><span style={{ padding: '0.2rem 0.5rem', borderRadius: '1rem', background: c.score >= 80 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: c.score >= 80 ? '#10b981' : '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>{c.score}%</span></td>
                                      <td>{c.resume_url ? <a href={c.resume_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}><FileText size={14} /></a> : '—'}</td>
                                      <td>
                                        <select
                                          value={c.status}
                                          onChange={(e) => handleStatusChange(c.id, e.target.value, event.id)}
                                          className={`status-select status-${c.status}`}
                                          style={{ fontSize: '0.75rem', padding: '0.2rem' }}
                                        >
                                          <option value="applied">Applied</option>
                                          <option value="shortlisted">Shortlisted</option>
                                          <option value="hold">Hold</option>
                                          <option value="rejected">Rejected</option>
                                          <option value="marked">Mark as Selected</option>
                                          <option value="selected">Selected</option>
                                        </select>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                              <button onClick={() => saveManualSelection(event.id)} className="btn-primary" style={{ flex: 1 }}>
                                <Save size={16} /> {editingEventId ? 'Save Changes' : 'Select Candidates for Interview'}
                              </button>
                              <button onClick={() => { setSelectionMode(null); setEditingEventId(null); }} className="btn-primary" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>
                                <X size={16} /> Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Assigned candidates display */}
                    {selectionMode !== 'manual' && assigned.length > 0 && (
                      <div className="assigned-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <h4 style={{ color: 'var(--accent)' }}>Candidates Chosen for Interview</h4>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => fetchAssignedCandidates(event.id)} title="Refresh List"
                              style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.4rem', color: 'var(--text-muted)' }}>
                              <RefreshCw size={14} />
                            </button>
                            <button onClick={() => startEditSelection(event.id)} className="btn-primary"
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }}>
                              <Edit size={14} /> Edit
                            </button>
                          </div>
                        </div>
                        <div className="table-container">
                          <table>
                            <thead><tr>
                              <th>Source</th><th>Name</th><th>Mail</th><th>Role</th><th>Mobile</th><th>Location</th>
                              <th>CTC</th><th>Experience</th><th>Score</th><th>Resume</th><th>Status</th>
                            </tr></thead>
                            <tbody>
                              {assigned.map(c => (
                                <tr key={c.id}>
                                  <td><div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {c.applied_through === 'WhatsApp' ? <MessageCircle size={14} style={{ color: '#10b981' }} /> : <Mail size={14} style={{ color: '#ef4444' }} />}
                                    <span style={{ fontSize: '0.75rem' }}>{c.applied_through}</span>
                                  </div></td>
                                  <td><div style={{ fontWeight: 600 }}>{c.name}</div></td>
                                  <td><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.email}</div></td>
                                  <td><div style={{ fontSize: '0.85rem' }}>{c.role_applied}</div></td>
                                  <td><div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Phone size={12} style={{ opacity: 0.5 }} /> {c.phone}</div></td>
                                  <td><div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={12} style={{ opacity: 0.5 }} /> {c.current_location}</div></td>
                                  <td><div style={{ fontSize: '0.85rem' }}>{c.current_ctc}</div></td>
                                  <td><div style={{ fontSize: '0.85rem' }}>{c.experience_level}</div></td>
                                  <td><span style={{ padding: '0.2rem 0.5rem', borderRadius: '1rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>{c.score}%</span></td>
                                  <td>{c.resume_url ? <a href={c.resume_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}><FileText size={14} /> <ExternalLink size={12} /></a> : '—'}</td>
                                  <td>
                                    <select
                                      value={c.status}
                                      onChange={(e) => handleStatusChange(c.id, e.target.value, event.id)}
                                      className={`status-select status-${c.status}`}
                                      style={{ fontSize: '0.75rem', padding: '0.2rem' }}
                                    >
                                      <option value="applied">Applied</option>
                                      <option value="shortlisted">Shortlisted</option>
                                      <option value="hold">Hold</option>
                                      <option value="rejected">Rejected</option>
                                      <option value="marked">Mark as Selected</option>
                                      <option value="selected">Selected</option>
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selection Details Modal */}
      {selectionModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ maxWidth: '500px', width: '90%', padding: '2rem' }}>
            <h3 style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>Finalize Selection</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Enter offer details for <strong style={{ color: 'var(--text)' }}>{selectionModal.candidateName}</strong>. All fields are required.
            </p>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="input-group">
                <label>Offered Role</label>
                <input value={selectionModal.form.offered_role} onChange={e => updateModalForm('offered_role', e.target.value)} placeholder="e.g. Senior Frontend Engineer" />
              </div>
              <div className="input-group">
                <label>Salary Offered</label>
                <input value={selectionModal.form.offered_salary} onChange={e => updateModalForm('offered_salary', e.target.value)} placeholder="e.g. ₹12,00,000 / year" />
              </div>
              <div className="input-group">
                <label>Location</label>
                <input value={selectionModal.form.offered_location} onChange={e => updateModalForm('offered_location', e.target.value)} placeholder="e.g. Remote / Bangalore" />
              </div>
              <div className="input-group">
                <label>Joining Date</label>
                <input type="date" value={selectionModal.form.joining_date} onChange={e => updateModalForm('joining_date', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={submitSelection} className="btn-primary" style={{ flex: 1 }}>Confirm Selection</button>
              <button onClick={() => setSelectionModal({ isOpen: false, candidateId: null, candidateName: '', eventId: null, form: { offered_role: '', offered_salary: '', offered_location: '', joining_date: '' } })} className="btn-primary" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Template Selection Modal */}
      {mailModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ maxWidth: '420px', width: '90%', padding: '2rem' }}>
            <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={20} /> Send Interview Invites</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {mailModal.eventId ? 'Send to unsent candidates in this event.' : 'Send to all unsent candidates across all events.'}
            </p>
            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <label>Choose Template</label>
              <select value={mailModal.selectedTemplateId} onChange={e => setMailModal({ ...mailModal, selectedTemplateId: e.target.value })} className="filter-select" style={{ width: '100%' }}>
                {mailModal.templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
                {mailModal.templates.length === 0 && <option value="">No templates found</option>}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleSendInvites} disabled={mailModal.sending || !mailModal.selectedTemplateId} className="btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                {mailModal.sending ? 'Sending...' : 'Send Mails'}
              </button>
              <button onClick={() => setMailModal(prev => ({ ...prev, isOpen: false }))} className="btn-primary" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: SCHEDULER_STYLES }} />
    </div>
  );
};

const SCHEDULER_STYLES = `
.interview-scheduler { padding: 0; }
.interview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
.scheduler-layout { display: flex; gap: 2rem; align-items: start; width: 100%; }
@media (max-width: 1200px) { .scheduler-layout { flex-direction: column; } }

.calendar-panel { width: 340px; flex-shrink: 0; padding: 1.5rem; position: sticky; top: 2rem; }
.events-panel { flex: 1; display: flex; flex-direction: column; gap: 1rem; min-width: 0; }

.calendar-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.cal-nav-btn { background: rgba(255,255,255,0.08); padding: 0.4rem 0.75rem; border-radius: 0.5rem; color: var(--text); font-size: 1rem; }
.cal-nav-btn:hover { background: rgba(255,255,255,0.15); }
.cal-month-label { font-weight: 700; font-size: 1rem; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-header-cell { text-align: center; font-size: 0.7rem; color: var(--text-muted); padding: 0.4rem 0; font-weight: 600; text-transform: uppercase; }
.cal-cell { text-align: center; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; position: relative; font-size: 0.85rem; transition: all 0.15s; }
.cal-cell:hover:not(.empty) { background: rgba(99,102,241,0.15); }
.cal-cell.empty { cursor: default; }
.cal-cell.selected { background: var(--primary); color: white; font-weight: 700; }
.cal-cell.has-events { font-weight: 600; }
.cal-cell.today { border: 1px solid var(--primary); }
.event-dot { width: 5px; height: 5px; background: var(--accent); border-radius: 50%; margin: 2px auto 0; }
.cal-cell.selected .event-dot { background: white; }
.add-event-btn { width: 100%; margin-top: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: linear-gradient(135deg, var(--accent), #059669); }

.status-select {
  padding: 4px 8px;
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
.status-marked { background: rgba(168, 85, 247, 0.2); color: #a855f7; border-color: rgba(168, 85, 247, 0.3); }
.status-selected { background: #065f46; color: #ffffff; border-color: #047857; text-transform: uppercase; box-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }

.events-panel { display: flex; flex-direction: column; gap: 1rem; }
.event-form .form-row { display: flex; gap: 1rem; margin-bottom: 0; }
.event-form .form-row .input-group { flex: 1; }

.event-card { padding: 0; overflow: hidden; transition: all 0.2s; }
.event-card-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 1.5rem; cursor: pointer; transition: background 0.15s; }
.event-card-header:hover { background: rgba(255,255,255,0.03); }
.event-info { display: flex; flex-direction: column; gap: 0.4rem; }
.event-role { font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; }
.event-meta { display: flex; gap: 1.5rem; font-size: 0.8rem; color: var(--text-muted); }
.event-meta span { display: flex; align-items: center; gap: 0.35rem; }

.event-expanded { padding: 0 1.5rem 1.5rem; border-top: 1px solid var(--border); }
.selection-buttons { display: flex; gap: 1rem; padding-top: 1.25rem; }
.selection-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.85rem; font-size: 0.85rem; }
.auto-btn { background: linear-gradient(135deg, var(--accent), #059669); }

.manual-selection { padding-top: 1.25rem; }
.assigned-section { padding-top: 1.25rem; }
.row-selected { background: rgba(99,102,241,0.08); }
.row-selected td { border-color: rgba(99,102,241,0.15); }

.unsent-warning { box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.6); }
.unsent-badge { display: flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; border-radius: 1rem; font-size: 0.72rem; font-weight: 700; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); white-space: nowrap; }
`;

export default InterviewScheduler;
