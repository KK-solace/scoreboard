import React, { useEffect, useState } from 'react';
import { useScoreboard } from './hooks/useScoreboard.js';
import { AdminPage } from './pages/AdminPage.jsx';
import { PresentationPage } from './pages/PresentationPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';

const TOKEN_KEY = 'scoreboard_session_token';
const DEVICE_KEY = 'scoreboard_device_name';

function PresentationView() {
  const { state, lastEvent, clockOffsetMs } = useScoreboard({
    mode: 'presentation',
    deviceName: 'Projector Display',
  });
  return <PresentationPage state={state} lastEvent={lastEvent} clockOffsetMs={clockOffsetMs} />;
}

function ControlView() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedDevice = localStorage.getItem(DEVICE_KEY) || 'Browser';
    if (!savedToken) {
      setChecking(false);
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('expired');
        const data = await res.json();
        setSession({ token: savedToken, user: data.user, deviceName: data.deviceName || savedDevice });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setChecking(false));
  }, []);

  const handleAuthenticated = ({ token, user, deviceName }) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(DEVICE_KEY, deviceName);
    setLoginError(null);
    setSession({ token, user, deviceName });
  };

  const handleLogout = async () => {
    if (session?.token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  };

  const scoreboard = useScoreboard({
    mode: 'control',
    token: session?.token || null,
    deviceName: session?.deviceName || 'Browser',
  });

  useEffect(() => {
    if (scoreboard.authError) {
      localStorage.removeItem(TOKEN_KEY);
      setLoginError(scoreboard.authError);
      setSession(null);
    }
  }, [scoreboard.authError]);

  if (checking) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: 24 }}>Checking session...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onAuthenticated={handleAuthenticated} initialError={loginError} />;
  }

  return (
    <AdminPage
      state={scoreboard.state}
      devices={scoreboard.devices}
      users={scoreboard.users}
      notice={scoreboard.notice}
      connected={scoreboard.connected}
      clockOffsetMs={scoreboard.clockOffsetMs}
      emit={scoreboard.emit}
      currentUser={session.user}
      sessionToken={session.token}
      onLogout={handleLogout}
    />
  );
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const isPresentation = params.get('mode') === 'presentation' || path === '/presentation';

  if (isPresentation) {
    return <PresentationView />;
  }

  return <ControlView />;
}

export default App;
