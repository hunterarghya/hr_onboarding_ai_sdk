import React from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const Login = () => {
  const handleLogin = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/google`);
      window.location.href = response.data.url;
    } catch (err) {
      console.error('Error initiating Google Login:', err);
      alert('Failed to connect to backend. Make sure it is running.');
    }
  };

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="glass-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '1rem', fontSize: '2rem' }}>HR Onboarding</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Streamline your recruitment with AI-powered email scanning and candidate matching.
        </p>
        <button onClick={handleLogin} className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" style={{ width: '20px' }} />
          Login with Google
        </button>
      </div>
    </div>
  );
};

export default Login;
