import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Layers,
  History,
  Settings,
  Monitor,
  Undo2,
  Redo2,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Trophy,
  Download,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Wifi,
  Laptop,
  LogOut,
  Shield,
  Unplug,
} from 'lucide-react';
import { TimerWidget } from '../components/TimerDisplay.jsx';
import { AnimatedScore } from '../components/AnimatedScore.jsx';

const TEAM_COLORS = [
  '#2563EB',
  '#DC2626',
  '#16A34A',
  '#D97706',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#4F46E5',
];

export function AdminPage({
  state,
  devices = [],
  users = [],
  notice = null,
  connected,
  clockOffsetMs,
  emit,
  currentUser,
  sessionToken,
  onLogout,
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [customPoints, setCustomPoints] = useState({});
  const [customMinutes, setCustomMinutes] = useState(1);
  const [customSeconds, setCustomSeconds] = useState(0);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState(TEAM_COLORS[0]);
  const [newRoundName, setNewRoundName] = useState('');
  const [newRoundDuration, setNewRoundDuration] = useState(60);
  const [newRoundQuestions, setNewRoundQuestions] = useState(10);
  const [confirmReset, setConfirmReset] = useState(false);
  const [networkInfo, setNetworkInfo] = useState(null);

  // Secondary Quizmaster creation form
  const [newQmUsername, setNewQmUsername] = useState('');
  const [newQmName, setNewQmName] = useState('');
  const [newQmPasscode, setNewQmPasscode] = useState('');
  const [newAdminPasscode, setNewAdminPasscode] = useState('');

  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => r.json())
      .then(setNetworkInfo)
      .catch(() => {});
  }, []);

  if (!state) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px' }}>Connecting to Quiz Server...</h2>
          <p style={{ margin: 0, color: '#64748b' }}>Loading local competition database</p>
        </div>
      </div>
    );
  }

  const isPrimaryAdmin = currentUser?.role === 'primary_admin';
  const perms = currentUser?.permissions || {};
  const canScore = isPrimaryAdmin || Boolean(perms.canScore);
  const canControlTimer = isPrimaryAdmin || Boolean(perms.canControlTimer);
  const canManageRounds = isPrimaryAdmin || Boolean(perms.canManageRounds);
  const canUndo = isPrimaryAdmin || Boolean(perms.canUndo);

  const { competition, rounds, teams, leaderboard, roundScores, history, canUndo: hasUndo, canRedo, settings, timer } = state;
  const currentRound = rounds.find((r) => r.id === competition?.currentRoundId) || rounds[0];
  const isLocked = settings.lockOnTimeUp && timer.phase === 'time_up';

  const openPresentation = () => {
    if (window.electronAPI?.openPresentation) {
      window.electronAPI.openPresentation();
    } else {
      window.open('/presentation', 'QuizPresentation', 'width=1280,height=720');
    }
  };

  const handleScore = (teamId, delta) => {
    if (isLocked || !canScore) return;
    emit('score:adjust', { teamId, delta });
  };

  const handleCustomScore = (teamId, sign) => {
    if (isLocked || !canScore) return;
    const raw = parseInt(customPoints[teamId] || '0', 10);
    if (!raw || raw <= 0) return;
    emit('score:adjust', { teamId, delta: sign * raw });
    setCustomPoints((prev) => ({ ...prev, [teamId]: '' }));
  };

  const handleSetCustomTimer = () => {
    if (!canControlTimer) return;
    const total = Math.max(5, Number(customMinutes) * 60 + Number(customSeconds));
    emit('timer:reset', { durationSeconds: total });
  };

  const lanBase =
    networkInfo?.ips?.[0]?.address
      ? `http://${networkInfo.ips[0].address}:${networkInfo.port}`
      : `http://localhost:${networkInfo?.port || 3847}`;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { id: 'teams', label: 'Teams', icon: Users, visible: isPrimaryAdmin },
    { id: 'rounds', label: 'Rounds', icon: Layers, visible: canManageRounds },
    { id: 'history', label: 'Score History', icon: History, visible: true },
    { id: 'devices', label: 'Devices & Users', icon: Laptop, visible: true },
    { id: 'settings', label: 'Settings', icon: Settings, visible: isPrimaryAdmin },
  ].filter((i) => i.visible);

  return (
    <div className={`admin-shell ${settings.animationsEnabled ? '' : 'animations-disabled'}`}>
      {/* Left Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <h1>Quizmaster Control</h1>
          <span>
            {currentUser?.displayName} ({isPrimaryAdmin ? 'Primary Admin' : 'Secondary QM'})
          </span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wifi size={13} />
            Projector URL ({devices.length} online):
          </div>
          <div
            style={{
              fontSize: 12,
              background: 'rgba(255,255,255,0.08)',
              padding: '6px 8px',
              borderRadius: 6,
              wordBreak: 'break-all',
              color: '#e2e8f0',
              marginBottom: 10,
            }}
          >
            {lanBase}/presentation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={openPresentation}>
              <Monitor size={16} />
              Open Presentation
            </button>
            <button
              className="btn btn-sm"
              style={{ width: '100%', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.15)' }}
              onClick={onLogout}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="admin-main">
        {/* Top Bar */}
        <header className="admin-topbar">
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{competition?.title}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {currentRound ? currentRound.name : 'No Round'} &bull; Question {competition?.currentQuestionNumber}
              {currentRound ? ` / ${currentRound.questionCount}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 999,
                background: connected ? '#dcfce7' : '#fee2e2',
                color: connected ? '#15803d' : '#b91c1c',
              }}
            >
              {connected ? `Synced (${devices.length} devices)` : 'Reconnecting...'}
            </span>

            {canUndo && (
              <>
                <button className="btn btn-sm" disabled={!hasUndo} onClick={() => emit('score:undo')}>
                  <Undo2 size={15} /> Undo
                </button>
                <button className="btn btn-sm" disabled={!canRedo} onClick={() => emit('score:redo')}>
                  <Redo2 size={15} /> Redo
                </button>
              </>
            )}

            {isPrimaryAdmin &&
              (competition?.status === 'round_complete' || competition?.status === 'finished' ? (
                <button className="btn btn-sm btn-primary" onClick={() => emit('competition:resume')}>
                  Resume Board
                </button>
              ) : (
                <>
                  <button className="btn btn-sm btn-amber" onClick={() => emit('round:complete')}>
                    <CheckCircle2 size={15} /> End Round
                  </button>
                  <button className="btn btn-sm btn-success" onClick={() => emit('competition:finish')}>
                    <Trophy size={15} /> Announce Winner
                  </button>
                </>
              ))}
          </div>
        </header>

        {/* Live Activity / Conflict / Connection Toast */}
        {notice && (
          <div
            style={{
              padding: '8px 24px',
              fontSize: 13,
              fontWeight: 600,
              background:
                notice.tone === 'error'
                  ? '#fee2e2'
                  : notice.tone === 'warning'
                  ? '#fef3c7'
                  : '#eff6ff',
              color:
                notice.tone === 'error'
                  ? '#b91c1c'
                  : notice.tone === 'warning'
                  ? '#92400e'
                  : '#1e40af',
              borderBottom: '1px solid #cbd5e1',
            }}
          >
            {notice.text}
          </div>
        )}

        <div className="admin-content">
          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Top Row: Timer + Question/Round Controls + Leaderboard Preview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
                {/* Timer Controls Card */}
                <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Timer Controls</h3>
                    {canControlTimer && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          className="input"
                          style={{ width: 58, padding: '4px 6px' }}
                          value={customMinutes}
                          onChange={(e) => setCustomMinutes(Math.max(0, Number(e.target.value)))}
                          aria-label="Minutes"
                        />
                        <span>m</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          className="input"
                          style={{ width: 58, padding: '4px 6px' }}
                          value={customSeconds}
                          onChange={(e) => setCustomSeconds(Math.max(0, Math.min(59, Number(e.target.value))))}
                          aria-label="Seconds"
                        />
                        <span>s</span>
                        <button className="btn btn-sm" onClick={handleSetCustomTimer}>
                          Set
                        </button>
                      </div>
                    )}
                  </div>

                  <TimerWidget timer={timer} clockOffsetMs={clockOffsetMs} settings={settings} />

                  {canControlTimer ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {timer.phase === 'running' ? (
                        <button className="btn btn-amber" style={{ flex: 1 }} onClick={() => emit('timer:pause')}>
                          <Pause size={16} /> Pause
                        </button>
                      ) : timer.phase === 'paused' ? (
                        <button className="btn btn-success" style={{ flex: 1 }} onClick={() => emit('timer:resume')}>
                          <Play size={16} /> Resume
                        </button>
                      ) : (
                        <button className="btn btn-success" style={{ flex: 1 }} onClick={() => emit('timer:start')}>
                          <Play size={16} /> Start
                        </button>
                      )}
                      <button className="btn" onClick={() => emit('timer:reset', {})}>
                        <RotateCcw size={16} /> Reset
                      </button>
                      <button className="btn btn-sm" onClick={() => emit('timer:adjust', { deltaSeconds: 10 })}>
                        +10s
                      </button>
                      <button className="btn btn-sm" onClick={() => emit('timer:adjust', { deltaSeconds: -10 })}>
                        -10s
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                      Timer control permission not granted for your account.
                    </div>
                  )}
                </div>

                {/* Round & Question Card */}
                <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Round &amp; Question</h3>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                        Active Round
                      </label>
                      <select
                        className="select"
                        style={{ width: '100%' }}
                        disabled={!canManageRounds}
                        value={competition?.currentRoundId || ''}
                        onChange={(e) => emit('round:select', { id: Number(e.target.value) })}
                      >
                        {rounds.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.durationSeconds}s)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Question Number</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className="btn btn-sm"
                          disabled={!canManageRounds}
                          onClick={() =>
                            emit('competition:update', {
                              currentQuestionNumber: Math.max(1, (competition?.currentQuestionNumber || 1) - 1),
                            })
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span className="tabular-nums" style={{ fontSize: 22, fontWeight: 800, minWidth: 36, textAlign: 'center' }}>
                          {competition?.currentQuestionNumber || 1}
                        </span>
                        <button
                          className="btn btn-sm"
                          disabled={!canManageRounds}
                          onClick={() =>
                            emit('competition:update', {
                              currentQuestionNumber: (competition?.currentQuestionNumber || 1) + 1,
                            })
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {canManageRounds && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => emit('round:next')}>
                        <ArrowRight size={16} /> Next Round
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Leaderboard Preview */}
                <div className="card" style={{ padding: 18 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Leaderboard Preview</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {leaderboard.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 10px',
                          borderRadius: 7,
                          background: t.rank === 1 ? '#eff6ff' : '#f8fafc',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, width: 22, color: t.rank === 1 ? '#2563eb' : '#64748b' }}>
                            #{t.rank}
                          </span>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              backgroundColor: t.color,
                              display: 'inline-block',
                            }}
                          />
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                        </div>
                        <span className="tabular-nums" style={{ fontWeight: 800, fontSize: 16 }}>
                          {t.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {isLocked && (
                <div
                  className="card"
                  style={{
                    padding: '12px 16px',
                    background: '#fef2f2',
                    borderColor: '#fca5a5',
                    color: '#b91c1c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    Scoring is locked because Time is Up (Settings &rarr; Lock on Time Up).
                  </span>
                  {canControlTimer && (
                    <button className="btn btn-sm" onClick={() => emit('timer:reset', {})}>
                      Reset Timer to Unlock
                    </button>
                  )}
                </div>
              )}

              {/* Team Score Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16 }}>
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="card"
                    style={{
                      padding: 18,
                      borderTop: `5px solid ${team.color}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{team.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          Correct: {team.correctCount} &bull; Wrong: {team.incorrectCount}
                        </div>
                      </div>
                      <div style={{ fontSize: 36, fontWeight: 800, color: team.color }}>
                        <AnimatedScore value={team.score} animationsEnabled={settings.animationsEnabled} />
                      </div>
                    </div>

                    {canScore ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                          {[5, 10, 20, 50].map((pts) => (
                            <button
                              key={pts}
                              className="btn btn-success btn-sm"
                              disabled={isLocked}
                              onClick={() => handleScore(team.id, pts)}
                            >
                              +{pts}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          {[-5, -10, -20].map((pts) => (
                            <button
                              key={pts}
                              className="btn btn-danger btn-sm"
                              disabled={isLocked}
                              onClick={() => handleScore(team.id, pts)}
                            >
                              {pts}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="number"
                            min={1}
                            placeholder="Custom pts"
                            className="input"
                            style={{ flex: 1, minWidth: 0, padding: '6px 8px' }}
                            value={customPoints[team.id] || ''}
                            onChange={(e) => setCustomPoints((prev) => ({ ...prev, [team.id]: e.target.value }))}
                          />
                          <button
                            className="btn btn-success btn-sm"
                            disabled={isLocked}
                            onClick={() => handleCustomScore(team.id, 1)}
                          >
                            +Add
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={isLocked}
                            onClick={() => handleCustomScore(team.id, -1)}
                          >
                            -Sub
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#64748b' }}>Score editing disabled for your role.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: TEAMS (Primary Admin only) */}
          {activeTab === 'teams' && isPrimaryAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 12px' }}>Add New Team</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 200 }}
                    placeholder="Team name (e.g., Team Einstein)"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {TEAM_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewTeamColor(c)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: newTeamColor === c ? '3px solid #0f172a' : '2px solid #ffffff',
                          cursor: 'pointer',
                        }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      emit('team:add', { name: newTeamName, color: newTeamColor });
                      setNewTeamName('');
                    }}
                  >
                    <Plus size={16} /> Add Team
                  </button>
                </div>
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 12px' }}>Participating Teams ({teams.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: 10,
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <input
                        type="color"
                        value={team.color}
                        onChange={(e) => emit('team:update', { id: team.id, color: e.target.value })}
                        style={{ width: 36, height: 34, border: 'none', background: 'transparent', cursor: 'pointer' }}
                      />
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 160 }}
                        defaultValue={team.name}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== team.name) {
                            emit('team:update', { id: team.id, name: e.target.value });
                          }
                        }}
                      />
                      <span className="tabular-nums" style={{ fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
                        {team.score} pts
                      </span>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={teams.length <= 1}
                        onClick={() => emit('team:delete', { id: team.id })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: ROUNDS */}
          {activeTab === 'rounds' && canManageRounds && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 940 }}>
              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 12px' }}>Add Round</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 200 }}
                    placeholder="Round name (e.g., Round 4: Audio Visual)"
                    value={newRoundName}
                    onChange={(e) => setNewRoundName(e.target.value)}
                  />
                  <label style={{ fontSize: 13 }}>
                    Timer (sec):{' '}
                    <input
                      type="number"
                      min={5}
                      className="input"
                      style={{ width: 75 }}
                      value={newRoundDuration}
                      onChange={(e) => setNewRoundDuration(Number(e.target.value))}
                    />
                  </label>
                  <label style={{ fontSize: 13 }}>
                    Questions:{' '}
                    <input
                      type="number"
                      min={1}
                      className="input"
                      style={{ width: 65 }}
                      value={newRoundQuestions}
                      onChange={(e) => setNewRoundQuestions(Number(e.target.value))}
                    />
                  </label>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      emit('round:add', {
                        name: newRoundName,
                        durationSeconds: newRoundDuration,
                        questionCount: newRoundQuestions,
                      });
                      setNewRoundName('');
                    }}
                  >
                    <Plus size={16} /> Add Round
                  </button>
                </div>
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 12px' }}>Competition Rounds</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rounds.map((r) => {
                    const isCurrent = r.id === competition?.currentRoundId;
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: 12,
                          border: isCurrent ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          background: isCurrent ? '#eff6ff' : '#ffffff',
                          borderRadius: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <input
                          className="input"
                          style={{ flex: 1, minWidth: 180 }}
                          defaultValue={r.name}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== r.name) {
                              emit('round:update', { id: r.id, name: e.target.value });
                            }
                          }}
                        />
                        <label style={{ fontSize: 12 }}>
                          Sec:
                          <input
                            type="number"
                            className="input"
                            style={{ width: 68, marginLeft: 4 }}
                            defaultValue={r.durationSeconds}
                            onBlur={(e) =>
                              emit('round:update', { id: r.id, durationSeconds: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label style={{ fontSize: 12 }}>
                          Qs:
                          <input
                            type="number"
                            className="input"
                            style={{ width: 60, marginLeft: 4 }}
                            defaultValue={r.questionCount}
                            onBlur={(e) =>
                              emit('round:update', { id: r.id, questionCount: Number(e.target.value) })
                            }
                          />
                        </label>
                        <button
                          className={`btn btn-sm ${isCurrent ? 'btn-primary' : ''}`}
                          onClick={() => emit('round:select', { id: r.id })}
                        >
                          {isCurrent ? 'Active' : 'Activate'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={rounds.length <= 1}
                          onClick={() => emit('round:delete', { id: r.id })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card" style={{ padding: 18, overflowX: 'auto' }}>
                <h3 style={{ margin: '0 0 12px' }}>Round-wise Scores</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Team</th>
                      {rounds.map((r) => (
                        <th key={r.id} style={{ padding: '8px 10px' }}>
                          {r.name}
                        </th>
                      ))}
                      <th style={{ padding: '8px 10px' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{t.name}</td>
                        {rounds.map((r) => {
                          const rs = roundScores.find((x) => x.roundId === r.id && x.teamId === t.id);
                          return (
                            <td key={r.id} className="tabular-nums" style={{ padding: '8px 10px' }}>
                              {rs ? rs.score : 0}
                            </td>
                          );
                        })}
                        <td className="tabular-nums" style={{ padding: '8px 10px', fontWeight: 800 }}>
                          {t.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SCORE HISTORY */}
          {activeTab === 'history' && (
            <div className="card" style={{ padding: 18, maxWidth: 960 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ margin: 0 }}>Score History</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {canUndo && (
                    <>
                      <button className="btn btn-sm" disabled={!hasUndo} onClick={() => emit('score:undo')}>
                        <Undo2 size={15} /> Undo Last
                      </button>
                      <button className="btn btn-sm" disabled={!canRedo} onClick={() => emit('score:redo')}>
                        <Redo2 size={15} /> Redo
                      </button>
                    </>
                  )}
                  <a
                    className="btn btn-primary btn-sm"
                    href={`/api/export-csv?token=${encodeURIComponent(sessionToken || '')}`}
                    download
                  >
                    <Download size={15} /> Export CSV
                  </a>
                </div>
              </div>

              {history.length === 0 ? (
                <p style={{ color: '#64748b' }}>No score changes recorded yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Time</th>
                      <th style={{ padding: '8px 10px' }}>Quizmaster</th>
                      <th style={{ padding: '8px 10px' }}>Team</th>
                      <th style={{ padding: '8px 10px' }}>Round / Q</th>
                      <th style={{ padding: '8px 10px' }}>Change</th>
                      <th style={{ padding: '8px 10px' }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>
                          {new Date(h.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{h.actorName || 'Quizmaster'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{h.teamName}</td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>
                          {h.roundName || 'Round'} (Q{h.questionNumber})
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: '8px 10px',
                            fontWeight: 700,
                            color: h.delta > 0 ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {h.delta > 0 ? `+${h.delta}` : h.delta}
                        </td>
                        <td className="tabular-nums" style={{ padding: '8px 10px' }}>
                          {h.previousScore} &rarr; <strong>{h.newScore}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB: CONNECTED DEVICES & USERS */}
          {activeTab === 'devices' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 980 }}>
              {/* Local Network Connection Info */}
              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wifi size={18} /> Local Network Connection Addresses (Offline LAN)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      Quizmaster Control URL
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, wordBreak: 'break-all' }}>
                      {lanBase}/control
                    </div>
                  </div>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      Projector Presentation URL
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, wordBreak: 'break-all' }}>
                      {lanBase}/presentation
                    </div>
                  </div>
                </div>
              </div>

              {/* Connected Devices Table */}
              <div className="card" style={{ padding: 18, overflowX: 'auto' }}>
                <h3 style={{ margin: '0 0 12px' }}>Connected Devices ({devices.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Device Name</th>
                      <th style={{ padding: '8px 10px' }}>User</th>
                      <th style={{ padding: '8px 10px' }}>Role</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px' }}>Last Activity</th>
                      {isPrimaryAdmin && <th style={{ padding: '8px 10px' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.socketId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.deviceName}</td>
                        <td style={{ padding: '8px 10px' }}>{d.userName}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background:
                                d.userRole === 'primary_admin'
                                  ? '#dbeafe'
                                  : d.userRole === 'presentation'
                                  ? '#f1f5f9'
                                  : '#dcfce7',
                              color:
                                d.userRole === 'primary_admin'
                                  ? '#1e40af'
                                  : d.userRole === 'presentation'
                                  ? '#475569'
                                  : '#15803d',
                            }}
                          >
                            {d.userRole === 'primary_admin'
                              ? 'Primary Admin'
                              : d.userRole === 'presentation'
                              ? 'Presentation'
                              : 'Secondary QM'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#16a34a', fontWeight: 600 }}>{d.status}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>
                          {new Date(d.lastActivity).toLocaleTimeString()}
                        </td>
                        {isPrimaryAdmin && (
                          <td style={{ padding: '8px 10px' }}>
                            {d.userRole !== 'primary_admin' && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => emit('device:disconnect', { socketId: d.socketId })}
                              >
                                <Unplug size={14} /> Disconnect
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Secondary Quizmasters & Security (Primary Admin Only) */}
              {isPrimaryAdmin && (
                <>
                  <div className="card" style={{ padding: 18 }}>
                    <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Shield size={18} /> Access Code &amp; Primary Admin Security
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                        Quizmaster Join Access Code
                        <input
                          className="input"
                          defaultValue={settings.quizmasterAccessCode || ''}
                          onBlur={(e) => emit('settings:update', { quizmasterAccessCode: e.target.value.trim() })}
                        />
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                        Change Primary Admin Passcode
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="password"
                            className="input"
                            style={{ flex: 1 }}
                            placeholder="New passcode (min 4 chars)"
                            value={newAdminPasscode}
                            onChange={(e) => setNewAdminPasscode(e.target.value)}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              if (newAdminPasscode.length >= 4) {
                                emit('user:admin_passcode', { newPasscode: newAdminPasscode });
                                setNewAdminPasscode('');
                              }
                            }}
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: 18 }}>
                    <h3 style={{ margin: '0 0 12px' }}>Manage Secondary Quizmasters</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                      <input
                        className="input"
                        placeholder="Username (e.g., qm2)"
                        value={newQmUsername}
                        onChange={(e) => setNewQmUsername(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Display Name"
                        value={newQmName}
                        onChange={(e) => setNewQmName(e.target.value)}
                      />
                      <input
                        type="password"
                        className="input"
                        placeholder="Passcode"
                        value={newQmPasscode}
                        onChange={(e) => setNewQmPasscode(e.target.value)}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          emit('user:create', {
                            username: newQmUsername,
                            displayName: newQmName,
                            passcode: newQmPasscode,
                          });
                          setNewQmUsername('');
                          setNewQmName('');
                          setNewQmPasscode('');
                        }}
                      >
                        <Plus size={16} /> Add Quizmaster
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {users.map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: 12,
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            flexWrap: 'wrap',
                            background: u.role === 'primary_admin' ? '#eff6ff' : '#ffffff',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>
                              {u.displayName}{' '}
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                                (@{u.username})
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#475569' }}>
                              {u.role === 'primary_admin' ? 'Primary Admin (Protected)' : 'Secondary Quizmaster'}
                            </div>
                          </div>

                          {u.role !== 'primary_admin' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              {[
                                ['canScore', 'Score'],
                                ['canControlTimer', 'Timer'],
                                ['canManageRounds', 'Rounds'],
                                ['canUndo', 'Undo'],
                              ].map(([permKey, label]) => (
                                <label key={permKey} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(u.permissions?.[permKey])}
                                    onChange={(e) =>
                                      emit('user:update', {
                                        id: u.id,
                                        permissions: { [permKey]: e.target.checked },
                                      })
                                    }
                                  />
                                  {label}
                                </label>
                              ))}

                              <button
                                className={`btn btn-sm ${u.active ? '' : 'btn-amber'}`}
                                onClick={() => emit('user:update', { id: u.id, active: !u.active })}
                              >
                                {u.active ? 'Enabled' : 'Disabled'}
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => emit('user:delete', { id: u.id })}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: SETTINGS (Primary Admin only) */}
          {activeTab === 'settings' && isPrimaryAdmin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
              <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ margin: 0 }}>Competition &amp; Timer Rules</h3>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                  Competition Title
                  <input
                    className="input"
                    defaultValue={competition?.title}
                    onBlur={(e) => emit('competition:update', { title: e.target.value })}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Default Timer (seconds)
                    <input
                      type="number"
                      min={5}
                      className="input"
                      value={settings.defaultTimerDuration}
                      onChange={(e) =>
                        emit('settings:update', { defaultTimerDuration: Math.max(5, Number(e.target.value)) })
                      }
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Starting Countdown (sec)
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className="input"
                      value={settings.startingCountdownDuration}
                      onChange={(e) =>
                        emit('settings:update', { startingCountdownDuration: Math.max(0, Number(e.target.value)) })
                      }
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Amber Warning (sec)
                    <input
                      type="number"
                      min={5}
                      className="input"
                      value={settings.warningAmberSeconds}
                      onChange={(e) =>
                        emit('settings:update', { warningAmberSeconds: Math.max(5, Number(e.target.value)) })
                      }
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                    Red Warning (sec)
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={settings.warningRedSeconds}
                      onChange={(e) =>
                        emit('settings:update', { warningRedSeconds: Math.max(1, Number(e.target.value)) })
                      }
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={settings.allowNegativeScores}
                      onChange={(e) => emit('settings:update', { allowNegativeScores: e.target.checked })}
                    />
                    Allow negative team scores
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={settings.lockOnTimeUp}
                      onChange={(e) => emit('settings:update', { lockOnTimeUp: e.target.checked })}
                    />
                    Lock score entry when timer reaches 00:00
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={settings.animationsEnabled}
                      onChange={(e) => emit('settings:update', { animationsEnabled: e.target.checked })}
                    />
                    Enable visual animations (disable for low-performance laptops)
                  </label>
                </div>
              </div>

              <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3 style={{ margin: 0 }}>Sound Effects (Offline Local Audio)</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={(e) => emit('settings:update', { soundEnabled: e.target.checked })}
                    />
                    Master Sound Enabled
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    Volume: {Math.round((settings.soundVolume ?? 0.8) * 100)}%
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.soundVolume ?? 0.8}
                      onChange={(e) => emit('settings:update', { soundVolume: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                  {[
                    ['countdown', 'Countdown (3-2-1)'],
                    ['go', 'GO! Announcement'],
                    ['positive', 'Positive Score'],
                    ['negative', 'Negative Score'],
                    ['tick', 'Final 10s Ticking'],
                    ['timeUp', 'Time-Up Alert'],
                    ['roundComplete', 'Round Completion'],
                    ['winner', 'Winner Fanfare'],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={settings.soundCategories?.[key] !== false}
                        onChange={(e) =>
                          emit('settings:update', {
                            soundCategories: { [key]: e.target.checked },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 18, borderColor: '#fca5a5' }}>
                <h3 style={{ margin: '0 0 8px', color: '#b91c1c' }}>Reset Competition</h3>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
                  Clear all scores and history to start fresh. Protected against accidental clicks.
                </p>
                {!confirmReset ? (
                  <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
                    <AlertTriangle size={16} /> Reset Scores &amp; Rounds
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        emit('competition:reset', { resetToDefaults: false });
                        setConfirmReset(false);
                      }}
                    >
                      Confirm: Reset Scores (Keep Teams)
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        emit('competition:reset', { resetToDefaults: true });
                        setConfirmReset(false);
                      }}
                    >
                      Factory Reset All
                    </button>
                    <button className="btn" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
