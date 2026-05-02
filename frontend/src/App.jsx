import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import InterviewScheduler from './components/InterviewScheduler';
import axios from 'axios';
import { LayoutDashboard, CalendarCheck, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (token) {
      axios.get(`${API_URL}/jobs`).then(res => setJobs(res.data)).catch(console.error);
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) return <Login onLoginSuccess={setToken} />;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'interviews', label: 'Interviews', icon: CalendarCheck },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed && <h2 className="sidebar-title">HR Platform</h2>}
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.id}
              className={`sidebar-nav-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
              title={item.label}>
              <item.icon size={20} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-nav-item logout-btn" onClick={handleLogout} title="Logout">
            <LogOut size={20} />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeSection === 'dashboard' && (
          <Dashboard token={token} onLogout={handleLogout} />
        )}
        {activeSection === 'interviews' && (
          <InterviewScheduler token={token} jobs={jobs} />
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .app-layout { display: flex; min-height: 100vh; }

        .sidebar {
          width: 240px; min-height: 100vh; background: rgba(15, 23, 42, 0.95);
          border-right: 1px solid var(--border); display: flex; flex-direction: column;
          transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1); position: sticky; top: 0;
          backdrop-filter: blur(20px); z-index: 50;
        }
        .sidebar.collapsed { width: 64px; }

        .sidebar-header {
          padding: 1.25rem; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--border); min-height: 64px;
        }
        .sidebar-title { font-size: 1.1rem; font-weight: 800; background: linear-gradient(135deg, #6366f1, #10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; white-space: nowrap; }
        .sidebar-toggle { background: rgba(255,255,255,0.06); padding: 0.4rem; border-radius: 0.4rem; color: var(--text-muted); }
        .sidebar-toggle:hover { background: rgba(255,255,255,0.12); color: var(--text); }

        .sidebar-nav { flex: 1; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
        .sidebar-nav-item {
          display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.75rem;
          border-radius: 0.5rem; color: var(--text-muted); background: transparent;
          font-size: 0.875rem; font-weight: 500; width: 100%; text-align: left;
          transition: all 0.15s; white-space: nowrap; overflow: hidden;
        }
        .sidebar-nav-item:hover { background: rgba(255,255,255,0.06); color: var(--text); }
        .sidebar-nav-item.active { background: rgba(99,102,241,0.15); color: var(--primary); font-weight: 600; }
        .sidebar.collapsed .sidebar-nav-item { justify-content: center; padding: 0.7rem; }

        .sidebar-footer { padding: 0.75rem; border-top: 1px solid var(--border); }
        .logout-btn:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

        .main-content { flex: 1; min-width: 0; padding: 2rem; max-width: 1400px; }
      `}} />
    </div>
  );
}

export default App;
