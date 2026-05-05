import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, RefreshCw, MessageCircle, Mail } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Scanners = ({ token }) => {
  const [scanning, setScanning] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'not connected', qrCodeData: null });
  const [waGroups, setWaGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    fetchWAStatus();
    const interval = setInterval(fetchWAStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (waStatus.status === 'ready') {
      fetchWAGroups();
    }
  }, [waStatus.status]);

  const fetchWAStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/whatsapp/status`);
      setWaStatus(response.data);
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

  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await axios.post(`${API_URL}/candidates/scan`, {
        whatsappGroupIds: selectedGroups
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(response.data.message);
    } catch (err) {
      console.error('Error scanning:', err);
      alert('Scanning failed. Check logs.');
    } finally {
      setScanning(false);
    }
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
      <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* WhatsApp Connection Section */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <MessageCircle size={24} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>WhatsApp Connector</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getStatusColor() }}></div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Status: {waStatus.status}</span>
                </div>
              </div>
            </div>
            
            {waStatus.status !== 'ready' && waStatus.status !== 'authenticated' && (
              <button
                onClick={() => setShowQR(true)}
                className="btn-primary"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {waStatus.status === 'qr' ? 'View QR Code' : 'Connect WhatsApp'}
              </button>
            )}
          </div>

          {/* Group Selector & Scan Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '1rem', alignItems: 'end' }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label>WhatsApp Groups to Scan</label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontSize: '0.9rem', cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center' }}
                  onClick={(e) => { 
                    const dropdown = e.currentTarget.nextSibling;
                    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block'; 
                  }}
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
                  maxHeight: '300px',
                  overflowY: 'auto',
                  marginTop: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                }}>
                  {waGroups.map(g => (
                    <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                      {g.name}
                    </label>
                  ))}
                  {waGroups.length === 0 && <div style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No groups found. Make sure WhatsApp is connected.</div>}
                </div>
              </div>
            </div>
            
            <button onClick={fetchWAGroups} title="Refresh Groups" style={{ height: '44px', width: '44px', padding: 0, borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={20} />
            </button>

            <button 
              onClick={handleScan} 
              disabled={isScanDisabled} 
              className="btn-primary" 
              style={{ height: '44px', backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.5rem' }}
            >
              {scanning ? <RefreshCw className="spin" size={20} /> : <Search size={20} />}
              <span style={{ fontWeight: '600' }}>{scanning ? 'Scanning...' : 'Start Full Scan'}</span>
            </button>
          </div>

          <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.1)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ color: '#3b82f6' }}><Mail size={20} /></div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
              <strong>Full Scan:</strong> This will process unread emails from Gmail and check the selected WhatsApp groups for new resumes.
            </p>
          </div>
        </div>
      </div>

      {showQR && waStatus.qrCodeData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ textAlign: 'center', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Scan QR Code</h3>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', display: 'inline-block', marginBottom: '1.5rem' }}>
              <img src={waStatus.qrCodeData} alt="WhatsApp QR" style={{ display: 'block', width: '250px', height: '250px' }} />
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Open WhatsApp on your phone, go to Linked Devices, and scan this code to connect.
            </p>
            <button onClick={() => setShowQR(false)} className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}>Close</button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
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

export default Scanners;
