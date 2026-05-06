import React, { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Handlebars from 'handlebars';
import axios from 'axios';
import {
  FileText, Plus, Save, Copy, Trash2, Eye, EyeOff, Edit, X,
  GripVertical, ChevronDown, ChevronRight, RefreshCw
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ============================================================
// VARIABLE DEFINITIONS (organized by section)
// ============================================================
const VARIABLE_SECTIONS = [
  {
    label: 'Candidate Info',
    color: '#6366f1',
    variables: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'role_applied', label: 'Role Applied' },
      { key: 'experience_level', label: 'Experience' },
      { key: 'current_location', label: 'Location' },
      { key: 'current_ctc', label: 'Current CTC' },
      { key: 'score', label: 'Score' },
    ]
  },
  {
    label: 'Interview Details',
    color: '#f59e0b',
    variables: [
      { key: 'interview_date', label: 'Interview Date' },
      { key: 'interview_start_time', label: 'Start Time' },
      { key: 'interview_end_time', label: 'End Time' },
      { key: 'interview_mode', label: 'Mode (Online/Offline)' },
      { key: 'venue_or_link', label: 'Venue / Meet Link' },
    ]
  },
  {
    label: 'Offer Details',
    color: '#10b981',
    variables: [
      { key: 'offered_role', label: 'Offered Role' },
      { key: 'offered_salary', label: 'Offered Salary' },
      { key: 'offered_location', label: 'Offered Location' },
      { key: 'joining_date', label: 'Joining Date' },
    ]
  }
];

// Sample data for preview
const SAMPLE_DATA = {
  name: 'Ronit Sharma',
  email: 'ronit.sharma@email.com',
  phone: '+91 98765 43210',
  role_applied: 'Backend Developer',
  experience_level: '3 years',
  current_location: 'Bangalore',
  current_ctc: '₹8,00,000',
  score: 85,
  interview_date: '6th May 2026',
  interview_start_time: '2:00 PM',
  interview_end_time: '5:00 PM',
  interview_mode: 'Offline (In-Person)',
  venue_or_link: 'Ripplewalk Office, 4th Floor, Sector 62, Noida',
  offered_role: 'Senior Backend Developer',
  offered_salary: '₹15,00,000 / year',
  offered_location: 'Bangalore',
  joining_date: '1st June 2026',
};

const TYPE_LABELS = {
  rejection: { label: 'Rejection', color: '#ef4444' },
  invite: { label: 'Interview Invite', color: '#f59e0b' },
  offer: { label: 'Offer Letter', color: '#10b981' },
  custom: { label: 'Custom', color: '#6366f1' },
};

// ============================================================
// MAIN TEMPLATES COMPONENT
// ============================================================
const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formType, setFormType] = useState('custom');

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing your email template...' }),
    ],
    content: '',
    editable: true,
  });

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API_URL}/templates`);
      setTemplates(res.data);
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  };

  const selectTemplate = (template) => {
    setActiveTemplate(template);
    setFormName(template.name);
    setFormSubject(template.subject);
    setFormType(template.type);
    if (editor) editor.commands.setContent(template.body || '');
    setIsEditing(false);
    setIsCreating(false);
    setShowPreview(false);
  };

  const startNewTemplate = () => {
    setActiveTemplate(null);
    setFormName('');
    setFormSubject('');
    setFormType('custom');
    if (editor) editor.commands.setContent('');
    setIsCreating(true);
    setIsEditing(true);
    setShowPreview(false);
  };

  const startEditing = () => {
    setIsEditing(true);
    setShowPreview(false);
  };

  const cancelEditing = () => {
    if (activeTemplate) {
      selectTemplate(activeTemplate);
    } else {
      setIsCreating(false);
      setIsEditing(false);
      if (editor) editor.commands.setContent('');
    }
  };

  const handleSave = async () => {
    const body = editor?.getHTML() || '';
    if (!formName.trim() || !body.trim() || body === '<p></p>') {
      alert('Template name and content are required.');
      return;
    }

    try {
      if (isCreating) {
        const res = await axios.post(`${API_URL}/templates`, {
          name: formName, subject: formSubject, body, type: formType
        });
        setActiveTemplate(res.data);
      } else if (activeTemplate) {
        const res = await axios.put(`${API_URL}/templates/${activeTemplate.id}`, {
          name: formName, subject: formSubject, body, type: formType
        });
        setActiveTemplate(res.data);
      }
      setIsEditing(false);
      setIsCreating(false);
      fetchTemplates();
    } catch (err) {
      console.error('Error saving template:', err);
      alert('Failed to save template');
    }
  };

  const handleSaveAsNew = async () => {
    const body = editor?.getHTML() || '';
    if (!formName.trim()) { alert('Template name is required.'); return; }

    try {
      const res = await axios.post(`${API_URL}/templates`, {
        name: formName + ' (Copy)', subject: formSubject, body, type: formType
      });
      setActiveTemplate(res.data);
      setFormName(res.data.name);
      setIsEditing(false);
      setIsCreating(false);
      fetchTemplates();
    } catch (err) {
      console.error('Error saving as new:', err);
      alert('Failed to save template');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await axios.delete(`${API_URL}/templates/${id}`);
      if (activeTemplate?.id === id) {
        setActiveTemplate(null);
        setIsEditing(false);
        if (editor) editor.commands.setContent('');
      }
      fetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const handlePreview = () => {
    const body = editor?.getHTML() || '';
    try {
      const compiledBody = Handlebars.compile(body)(SAMPLE_DATA);
      const compiledSubject = Handlebars.compile(formSubject || '')(SAMPLE_DATA);
      setPreviewHtml(compiledBody);
      setPreviewSubject(compiledSubject);
      setShowPreview(true);
    } catch (err) {
      alert('Template has syntax errors: ' + err.message);
    }
  };

  const insertVariable = (key) => {
    if (!editor || !isEditing) return;
    editor.chain().focus().insertContent(`{{${key}}}`).run();
  };

  const handleDragStart = (e, key) => {
    e.dataTransfer.setData('text/plain', `{{${key}}}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const toggleSection = (label) => {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // Group templates by type
  const groupedTemplates = templates.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {});

  return (
    <div className="container">
      <div style={{ display: 'flex', gap: '1.5rem', minHeight: 'calc(100vh - 6rem)' }}>

        {/* Left Panel — Template List */}
        <div className="glass-card" style={{ width: '280px', flexShrink: 0, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}><FileText size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />Templates</h3>
            <button onClick={fetchTemplates} title="Refresh" style={{ padding: '0.3rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.4rem' }}>
              <RefreshCw size={14} />
            </button>
          </div>

          <button onClick={startNewTemplate} className="btn-primary" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem' }}>
            <Plus size={16} /> New Template
          </button>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {Object.entries(groupedTemplates).map(([type, items]) => (
              <div key={type}>
                <div style={{
                  fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: TYPE_LABELS[type]?.color || '#888', padding: '0.5rem 0.25rem 0.25rem', marginTop: '0.5rem'
                }}>
                  {TYPE_LABELS[type]?.label || type}
                </div>
                {items.map(t => (
                  <button key={t.id}
                    onClick={() => selectTemplate(t)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '0.5rem 0.6rem', borderRadius: '0.4rem',
                      background: activeTemplate?.id === t.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: activeTemplate?.id === t.id ? 'var(--primary)' : 'var(--text-muted)',
                      fontSize: '0.85rem', fontWeight: activeTemplate?.id === t.id ? 600 : 400,
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    {t.is_default && <span style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.08)', padding: '0.15rem 0.4rem', borderRadius: '1rem' }}>Default</span>}
                  </button>
                ))}
              </div>
            ))}
            {templates.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>No templates yet.</p>
            )}
          </div>
        </div>

        {/* Center — Editor */}
        <div className="glass-card" style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!activeTemplate && !isCreating ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ textAlign: 'center' }}>
                <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p>Select a template to view or edit, or create a new one.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Template meta fields */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 2, minWidth: '200px' }}>
                  <label>Template Name</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} disabled={!isEditing}
                    placeholder="e.g. Backend Dev Offer Letter" />
                </div>
                <div className="input-group" style={{ flex: 1, minWidth: '140px' }}>
                  <label>Type</label>
                  <select value={formType} onChange={e => setFormType(e.target.value)} disabled={!isEditing}
                    className="filter-select" style={{ width: '100%' }}>
                    <option value="rejection">Rejection</option>
                    <option value="invite">Interview Invite</option>
                    <option value="offer">Offer Letter</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label>Email Subject</label>
                <input value={formSubject} onChange={e => setFormSubject(e.target.value)} disabled={!isEditing}
                  placeholder="e.g. Offer of Employment - {{offered_role}}" />
              </div>

              {/* Editor area */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Body</label>
                <div
                  style={{
                    flex: 1, border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem',
                    background: isEditing ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                    overflowY: 'auto', minHeight: '200px',
                    cursor: isEditing ? 'text' : 'default',
                  }}
                  onDrop={(e) => {
                    if (!isEditing || !editor) return;
                    e.preventDefault();
                    const text = e.dataTransfer.getData('text/plain');
                    if (text) {
                      editor.chain().focus().insertContent(text).run();
                    }
                  }}
                  onDragOver={(e) => { if (isEditing) e.preventDefault(); }}
                >
                  <EditorContent editor={editor} />
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!isEditing ? (
                  <>
                    <button onClick={startEditing} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      <Edit size={16} /> Edit
                    </button>
                    <button onClick={handlePreview} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                      <Eye size={16} /> Preview
                    </button>
                    <button onClick={() => handleDelete(activeTemplate.id)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <Trash2 size={16} /> Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleSave} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      <Save size={16} /> {isCreating ? 'Create Template' : 'Save'}
                    </button>
                    {!isCreating && (
                      <button onClick={handleSaveAsNew} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>
                        <Copy size={16} /> Save as New
                      </button>
                    )}
                    <button onClick={handlePreview} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                      <Eye size={16} /> Preview
                    </button>
                    <button onClick={cancelEditing} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <X size={16} /> Cancel
                    </button>
                  </>
                )}
              </div>

              {/* Preview panel */}
              {showPreview && (
                <div style={{ border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.75rem', padding: '1.5rem', background: 'rgba(16,185,129,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0, color: '#10b981' }}><Eye size={16} /> Mail Preview (Sample Data)</h4>
                    <button onClick={() => setShowPreview(false)} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.25rem' }}>
                      <EyeOff size={16} />
                    </button>
                  </div>
                  {previewSubject && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Subject: </span>
                      <span style={{ fontSize: '0.9rem' }}>{previewSubject}</span>
                    </div>
                  )}
                  <div
                    style={{
                      padding: '1.5rem', background: '#ffffff', borderRadius: '0.5rem', color: '#1a1a1a',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      fontSize: '0.95rem', lineHeight: 1.6,
                    }}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic' }}>
                    ↑ This is how the email will appear to the candidate. Variables are filled with sample data.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel — Variable Pool */}
        <div className="glass-card" style={{ width: '220px', flexShrink: 0, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <GripVertical size={16} /> Variables
          </h4>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
            {isEditing ? 'Click or drag into the editor ↓' : 'Enter edit mode to use variables'}
          </p>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {VARIABLE_SECTIONS.map(section => (
              <div key={section.label}>
                <button
                  onClick={() => toggleSection(section.label)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '0.4rem 0.25rem', background: 'transparent',
                    color: section.color, fontSize: '0.75rem', fontWeight: 700, border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}
                >
                  {collapsedSections[section.label] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {section.label}
                </button>

                {!collapsedSections[section.label] && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', padding: '0.25rem 0' }}>
                    {section.variables.map(v => (
                      <span key={v.key}
                        draggable={isEditing}
                        onDragStart={(e) => handleDragStart(e, v.key)}
                        onClick={() => insertVariable(v.key)}
                        style={{
                          padding: '0.25rem 0.5rem', borderRadius: '1rem', fontSize: '0.72rem', fontWeight: 600,
                          background: `${section.color}22`, color: section.color,
                          border: `1px solid ${section.color}44`,
                          cursor: isEditing ? 'grab' : 'not-allowed',
                          opacity: isEditing ? 1 : 0.5,
                          userSelect: 'none', whiteSpace: 'nowrap',
                          transition: 'all 0.15s',
                        }}
                        title={`{{${v.key}}}`}
                      >
                        {v.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .ProseMirror {
          outline: none;
          min-height: 180px;
          font-size: 0.9rem;
          line-height: 1.7;
          color: var(--text);
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-muted);
          pointer-events: none;
          height: 0;
          opacity: 0.5;
        }
        .ProseMirror p { margin: 0.25em 0; }
        .ProseMirror strong { color: var(--accent); }
        .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 { margin-top: 1em; }
      `}} />
    </div>
  );
};

export default Templates;
