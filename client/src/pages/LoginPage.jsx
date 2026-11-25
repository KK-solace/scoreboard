import React, { useState } from 'react';
import { KeyRound, Lock, Monitor, UserCheck } from 'lucide-react';

function guessDeviceName() {
  const ua = navigator.userAgent || '';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android Device';
  if (/Macintosh/i.test(ua)) return 'Mac Laptop';
  if (/Windows/i.test(ua)) return 'Windows Laptop';
  return 'Quizmaster Browser';
}

export function LoginPage({ onAuthenticated, initialError = null }) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('admin');
  const [passcode, setPasscode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [deviceName, setDeviceName] = useState(guessDeviceName);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, passcode, deviceName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
      } else {
        onAuthenticated({ token: data.token, user: data.user, deviceName });
      }
    } catch {
      setError('Unable to reach local quiz server.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, accessCode, deviceName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not join with access code');
      } else {
        onAuthenticated({ token: data.token, user: data.user, deviceName });
      }
    } catch {
      setError('Unable to reach local quiz server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'var(--bg-board)',
      }}
    >
      <div className="card" style={{ maxWidth: 440, width: '100%', padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#eff6ff',
              color: '#2563eb',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <Lock size={24} />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Quizmaster Control</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Local offline authentication for authorized quizmasters
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            className={`btn ${tab === 'login' ? 'btn-primary' : ''}`}
            onClick={() => {
              setTab('login');
              setError(null);
            }}
          >
            <UserCheck size={15} /> Account Login
          </button>
          <button
            type="button"
            className={`btn ${tab === 'join' ? 'btn-primary' : ''}`}
            onClick={() => {
              setTab('join');
              setError(null);
            }}
          >
            <KeyRound size={15} /> Access Code
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 7,
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#b91c1c',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Username
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Passcode
              <input
                type="password"
                className="input"
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Device Name
              <input
                className="input"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In to Control Panel'}
            </button>
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
              Default Primary Admin: <code>admin</code> / <code>admin123</code>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Your Name
              <input
                className="input"
                placeholder="e.g., Ms. Sharma"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Quizmaster Access Code
              <input
                type="password"
                className="input"
                placeholder="Ask Primary Quizmaster"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              Device Name
              <input
                className="input"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-success btn-lg" type="submit" disabled={loading}>
              {loading ? 'Joining...' : 'Join as Secondary Quizmaster'}
            </button>
          </form>
        )}

        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 18, paddingTop: 14, textAlign: 'center' }}>
          <a href="/presentation" className="btn btn-sm" style={{ textDecoration: 'none', width: '100%' }}>
            <Monitor size={15} /> Open Presentation Mode (Projector)
          </a>
        </div>
      </div>
    </div>
  );
}
