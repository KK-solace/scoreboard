import React, { useEffect, useRef, useState } from 'react';
import { Award, Crown, Maximize2, Minimize2, Trophy, X } from 'lucide-react';
import { TimerWidget, useTimerDisplay } from '../components/TimerDisplay.jsx';
import { AnimatedScore } from '../components/AnimatedScore.jsx';
import { playSound, preloadSounds } from '../utils/sound.js';

const CONFETTI_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const PARTICLE_VECTORS = [
  { px: '-42px', py: '-38px', color: '#16a34a' },
  { px: '44px', py: '-36px', color: '#2563eb' },
  { px: '-52px', py: '6px', color: '#d97706' },
  { px: '52px', py: '8px', color: '#16a34a' },
  { px: '-24px', py: '-54px', color: '#22c55e' },
  { px: '24px', py: '-54px', color: '#eab308' },
];

export function PresentationPage({ state, lastEvent, clockOffsetMs }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [teamEffects, setTeamEffects] = useState({});
  const [overtakenBanner, setOvertakenBanner] = useState(null);
  const [dismissedOverlayKey, setDismissedOverlayKey] = useState(null);
  const lastStatusRef = useRef(state?.competition?.status);

  const activeOverlayKey =
    state?.competition?.status === 'finished'
      ? `finished-${state?.competition?.updatedAt || ''}`
      : state?.competition?.status === 'round_complete'
      ? `round-${state?.competition?.updatedAt || ''}`
      : state?.timer?.phase === 'time_up' && state?.competition?.status === 'active'
      ? `timeup-${state?.timer?.durationMs || ''}-${state?.competition?.currentQuestionNumber || ''}`
      : null;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && activeOverlayKey) {
        setDismissedOverlayKey(activeOverlayKey);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeOverlayKey]);

  useEffect(() => {
    preloadSounds();
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // React to score, round complete, and winner events
  useEffect(() => {
    if (!lastEvent || !state) return;
    const { settings } = state;

    if (lastEvent.type === 'score' && lastEvent.teamId) {
      const isUp = lastEvent.delta > 0;
      playSound(isUp ? 'positive' : 'negative', settings);

      setTeamEffects((prev) => ({
        ...prev,
        [lastEvent.teamId]: {
          delta: lastEvent.delta,
          key: Date.now() + Math.random(),
        },
      }));

      if (lastEvent.overtaken && lastEvent.newLeaderId) {
        const leader = state.teams.find((t) => t.id === lastEvent.newLeaderId);
        if (leader) {
          setOvertakenBanner(`${leader.name} takes the lead!`);
          setTimeout(() => setOvertakenBanner(null), 2600);
        }
      }

      const timer = setTimeout(() => {
        setTeamEffects((prev) => {
          const copy = { ...prev };
          delete copy[lastEvent.teamId];
          return copy;
        });
      }, 1350);
      return () => clearTimeout(timer);
    }
  }, [lastEvent]);

  useEffect(() => {
    if (!state) return;
    const currentStatus = state.competition?.status;
    if (currentStatus !== lastStatusRef.current) {
      if (currentStatus === 'round_complete') {
        playSound('roundComplete', state.settings);
      } else if (currentStatus === 'finished') {
        playSound('winner', state.settings);
      }
      lastStatusRef.current = currentStatus;
    }
  }, [state?.competition?.status]);

  const { countdownStep } = useTimerDisplay(
    state?.timer,
    clockOffsetMs,
    state?.settings,
    true // Presentation Mode plays countdown, tick, and time-up sounds
  );

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (!state) {
    return (
      <div className="presentation-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px' }}>Waiting for Quiz Server...</h2>
          <p style={{ margin: 0, color: '#64748b' }}>Presentation display will sync automatically</p>
        </div>
      </div>
    );
  }

  const { competition, rounds, leaderboard, settings, timer } = state;
  const currentRound = rounds.find((r) => r.id === competition?.currentRoundId) || rounds[0];
  const topScore = leaderboard[0]?.score ?? 0;
  const winners = leaderboard.filter((t) => t.score === topScore);

  return (
    <div className={`presentation-root ${settings.animationsEnabled ? '' : 'animations-disabled'}`}>
      {/* TOP SECTION: Competition, Round, Question */}
      <header className="presentation-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>
            {competition?.title}
          </h1>
          <div style={{ fontSize: 16, color: '#475569', fontWeight: 600, marginTop: 2 }}>
            {currentRound ? currentRound.name : 'Quiz Round'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '8px 18px',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
              Question
            </div>
            <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 800, color: '#1e3a8a' }}>
              {competition?.currentQuestionNumber}
              {currentRound ? ` / ${currentRound.questionCount}` : ''}
            </div>
          </div>

          <button
            className="btn btn-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Overtake Toast */}
      {overtakenBanner && settings.animationsEnabled && (
        <div
          style={{
            position: 'fixed',
            top: 94,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            color: '#ffffff',
            padding: '10px 22px',
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.25)',
            zIndex: 60,
          }}
        >
          <Crown size={18} color="#facc15" />
          {overtakenBanner}
        </div>
      )}

      {/* CENTRAL SECTION: Timer + Leaderboard | Team Score Cards */}
      <main className="presentation-main">
        {/* Left Column: Large Timer + Live Leaderboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <TimerWidget timer={timer} clockOffsetMs={clockOffsetMs} settings={settings} large />

          <div className="card" style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#64748b',
                marginBottom: 10,
              }}
            >
              Live Standings
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leaderboard.map((team) => (
                <div
                  key={team.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: team.rank === 1 ? '#eff6ff' : '#f8fafc',
                    border: team.rank === 1 ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                    transition: 'transform 0.3s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      className="tabular-nums"
                      style={{
                        fontWeight: 800,
                        fontSize: 16,
                        width: 28,
                        color: team.rank === 1 ? '#2563eb' : '#64748b',
                      }}
                    >
                      #{team.rank}
                    </span>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: team.color,
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</span>
                  </div>
                  <span className="tabular-nums" style={{ fontWeight: 800, fontSize: 20 }}>
                    {team.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Area: Team Score Cards */}
        <div className="presentation-teams-grid">
          {leaderboard.map((team) => {
            const effect = teamEffects[team.id];
            const isUp = effect && effect.delta > 0;
            const isDown = effect && effect.delta < 0;
            const isLeader = team.rank === 1 && team.score > 0;

            return (
              <div
                key={team.id}
                className={`presentation-team-card ${isLeader ? 'is-leader' : ''} ${
                  isUp ? 'anim-score-up' : isDown ? 'anim-score-down' : ''
                }`}
                style={{
                  borderTop: `8px solid ${team.color}`,
                }}
              >
                {/* Floating delta + Particles */}
                {effect && (
                  <>
                    <div
                      key={`delta-${effect.key}`}
                      className={`floating-delta ${isUp ? 'positive' : 'negative'}`}
                    >
                      {isUp ? `+${effect.delta}` : effect.delta}
                    </div>
                    {isUp &&
                      settings.animationsEnabled &&
                      PARTICLE_VECTORS.map((p, idx) => (
                        <span
                          key={`p-${effect.key}-${idx}`}
                          className="particle-dot"
                          style={{
                            top: '28%',
                            left: '50%',
                            backgroundColor: p.color,
                            '--px': p.px,
                            '--py': p.py,
                          }}
                        />
                      ))}
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{team.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                      Correct: {team.correctCount} &bull; Wrong: {team.incorrectCount}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 800,
                      background: isLeader ? '#fef3c7' : '#f1f5f9',
                      color: isLeader ? '#b45309' : '#475569',
                    }}
                  >
                    {isLeader && <Crown size={14} />}#{team.rank}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 78,
                    fontWeight: 900,
                    color: team.color,
                    textAlign: 'center',
                    margin: '16px 0',
                    lineHeight: 1,
                  }}
                >
                  <AnimatedScore value={team.score} animationsEnabled={settings.animationsEnabled} />
                </div>

                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: '#f1f5f9',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${topScore > 0 ? Math.max(4, Math.round((team.score / topScore) * 100)) : 0}%`,
                      background: team.color,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* BOTTOM SECTION: Status */}
      <footer className="presentation-bottom">
        <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>
          Status:{' '}
          <strong style={{ color: '#0f172a' }}>
            {competition?.status === 'round_complete'
              ? 'Round Completed'
              : competition?.status === 'finished'
              ? 'Competition Finished'
              : timer.phase === 'running'
              ? 'Question in Progress'
              : timer.phase === 'time_up'
              ? "Time's Up"
              : 'Ready'}
          </strong>
        </div>
        <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>
          {winners.length === 1 && topScore > 0
            ? `Leading: ${winners[0].name} (${winners[0].score} pts)`
            : winners.length > 1 && topScore > 0
            ? `Tied for 1st: ${winners.map((w) => w.name).join(', ')} (${topScore} pts)`
            : 'Scores ready'}
        </div>
      </footer>

      {/* STARTING COUNTDOWN OVERLAY (3 -> 2 -> 1 -> GO!) */}
      {timer.phase === 'starting_countdown' && countdownStep && (
        <div className="overlay-backdrop">
          <div
            key={countdownStep}
            className="countdown-number"
            style={{
              fontSize: countdownStep === 'GO!' ? 150 : 190,
              fontWeight: 900,
              color: countdownStep === 'GO!' ? '#4ade80' : '#ffffff',
              textShadow: '0 10px 30px rgba(0,0,0,0.45)',
            }}
          >
            {countdownStep}
          </div>
        </div>
      )}

      {/* TIME'S UP OVERLAY */}
      {timer.phase === 'time_up' && competition?.status === 'active' && dismissedOverlayKey !== activeOverlayKey && (
        <div className="overlay-backdrop" style={{ background: 'rgba(127, 29, 29, 0.72)' }}>
          <div className="overlay-card" style={{ borderColor: '#dc2626' }}>
            <button
              className="btn btn-sm"
              onClick={() => setDismissedOverlayKey(activeOverlayKey)}
              style={{ position: 'absolute', top: 14, right: 14 }}
              aria-label="Close overlay"
            >
              <X size={16} /> Exit
            </button>
            <div style={{ fontSize: 64, fontWeight: 900, color: '#dc2626', marginBottom: 8 }}>TIME&apos;S UP!</div>
            <p style={{ fontSize: 20, color: '#475569', margin: 0 }}>
              Waiting for the quizmaster to proceed.
            </p>
          </div>
        </div>
      )}

      {/* ROUND COMPLETION OVERLAY */}
      {competition?.status === 'round_complete' && dismissedOverlayKey !== activeOverlayKey && (
        <div className="overlay-backdrop">
          <div className="overlay-card">
            <button
              className="btn btn-sm"
              onClick={() => setDismissedOverlayKey(activeOverlayKey)}
              style={{ position: 'absolute', top: 14, right: 14 }}
              aria-label="Close overlay"
            >
              <X size={16} /> Exit
            </button>
            <Award size={56} color="#2563eb" style={{ marginBottom: 10 }} />
            <h2 style={{ fontSize: 34, margin: '0 0 6px' }}>Round Complete!</h2>
            <p style={{ fontSize: 18, color: '#475569', margin: '0 0 22px' }}>
              {currentRound?.name} has concluded. Current Standings:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              {leaderboard.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderRadius: 8,
                    background: t.rank === 1 ? '#eff6ff' : '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  <span>
                    #{t.rank} &nbsp; {t.name}
                  </span>
                  <span className="tabular-nums" style={{ color: t.color }}>
                    {t.score} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WINNER ANNOUNCEMENT OVERLAY + CONFETTI */}
      {competition?.status === 'finished' && dismissedOverlayKey !== activeOverlayKey && (
        <div className="overlay-backdrop">
          {settings.animationsEnabled &&
            Array.from({ length: 36 }).map((_, idx) => (
              <div
                key={idx}
                className="confetti-piece"
                style={{
                  left: `${(idx * 2.8) % 100}%`,
                  backgroundColor: CONFETTI_COLORS[idx % CONFETTI_COLORS.length],
                  animationDuration: `${2.4 + (idx % 5) * 0.45}s`,
                  animationDelay: `${(idx % 6) * 0.15}s`,
                }}
              />
            ))}
          <div className="overlay-card" style={{ borderColor: '#f59e0b' }}>
            <button
              className="btn btn-sm"
              onClick={() => setDismissedOverlayKey(activeOverlayKey)}
              style={{ position: 'absolute', top: 14, right: 14 }}
              aria-label="Close overlay"
            >
              <X size={16} /> Exit
            </button>
            <Trophy size={72} color="#d97706" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase', color: '#b45309', letterSpacing: '0.1em' }}>
              Final Results
            </div>
            <h2 style={{ fontSize: 40, margin: '6px 0 8px', color: '#0f172a' }}>
              {winners.length > 1
                ? `Co-Champions: ${winners.map((w) => w.name).join(' & ')}`
                : `Winner: ${winners[0]?.name || ''}`}
            </h2>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#16a34a', margin: '0 0 22px' }}>
              Winning Score: {topScore} points
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              {leaderboard.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderRadius: 8,
                    background: t.rank === 1 ? '#fef3c7' : '#f8fafc',
                    border: t.rank === 1 ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  <span>
                    #{t.rank} &nbsp; {t.name}
                  </span>
                  <span className="tabular-nums">{t.score} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
