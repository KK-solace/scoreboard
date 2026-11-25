import React, { useEffect, useRef, useState } from 'react';
import { playSound } from '../utils/sound.js';

export function formatMMSS(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function useTimerDisplay(timer, clockOffsetMs, settings, enableAudio = false) {
  const [remainingMs, setRemainingMs] = useState(timer?.remainingMs ?? 0);
  const [countdownStep, setCountdownStep] = useState(null);
  const lastTickSecRef = useRef(null);
  const lastCountdownRef = useRef(null);
  const lastPhaseRef = useRef(timer?.phase);

  useEffect(() => {
    if (!timer) return;

    const update = () => {
      const serverNow = Date.now() + clockOffsetMs;

      if (timer.phase === 'starting_countdown' && timer.countdownEndTimestamp) {
        const diff = timer.countdownEndTimestamp - serverNow;
        if (diff > 0) {
          const sec = Math.ceil(diff / 1000);
          setCountdownStep(String(sec));
          if (enableAudio && lastCountdownRef.current !== sec) {
            lastCountdownRef.current = sec;
            playSound('countdown', settings);
          }
        } else {
          setCountdownStep('GO!');
          if (enableAudio && lastCountdownRef.current !== 'GO!') {
            lastCountdownRef.current = 'GO!';
            playSound('go', settings);
          }
        }
        setRemainingMs(timer.remainingMs);
        return;
      }

      lastCountdownRef.current = null;
      setCountdownStep(null);

      if (timer.phase === 'running' && timer.endTimestamp) {
        const rem = Math.max(0, timer.endTimestamp - serverNow);
        setRemainingMs(rem);
        const sec = Math.ceil(rem / 1000);
        if (enableAudio && sec <= 10 && sec > 0 && lastTickSecRef.current !== sec) {
          lastTickSecRef.current = sec;
          playSound('tick', settings);
        }
      } else {
        setRemainingMs(timer.remainingMs ?? 0);
        lastTickSecRef.current = null;
      }
    };

    update();
    const interval = setInterval(update, 80);
    return () => clearInterval(interval);
  }, [timer, clockOffsetMs, settings, enableAudio]);

  useEffect(() => {
    if (enableAudio && timer?.phase === 'time_up' && lastPhaseRef.current !== 'time_up') {
      playSound('timeUp', settings);
    }
    lastPhaseRef.current = timer?.phase;
  }, [timer?.phase, enableAudio, settings]);

  return { remainingMs, countdownStep };
}

export function TimerWidget({ timer, clockOffsetMs, settings, enableAudio = false, large = false }) {
  const { remainingMs } = useTimerDisplay(timer, clockOffsetMs, settings, enableAudio);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const amberThreshold = settings?.warningAmberSeconds ?? 30;
  const redThreshold = settings?.warningRedSeconds ?? 10;

  let color = '#0f172a';
  let bg = '#ffffff';
  let borderColor = '#d0d7de';
  let pulseClass = '';
  let statusText = timer?.phase === 'paused' ? 'PAUSED' : timer?.phase === 'running' ? 'RUNNING' : 'READY';

  if (timer?.phase === 'time_up' || (timer?.phase === 'running' && remainingMs <= 0)) {
    color = '#ffffff';
    bg = '#dc2626';
    borderColor = '#991b1b';
    statusText = "TIME'S UP!";
  } else if (timer?.phase === 'running' || timer?.phase === 'paused') {
    if (secondsLeft <= 2) {
      color = '#b91c1c';
      bg = '#fef2f2';
      borderColor = '#dc2626';
      pulseClass = timer.phase === 'running' ? 'timer-pulse-strong' : '';
      statusText = secondsLeft <= 1 ? 'FINAL SECOND!' : 'HURRY UP!';
    } else if (secondsLeft <= 5) {
      color = '#b91c1c';
      bg = '#fef2f2';
      borderColor = '#ef4444';
      pulseClass = timer.phase === 'running' ? 'timer-pulse-fast' : '';
    } else if (secondsLeft <= redThreshold) {
      color = '#dc2626';
      bg = '#fef2f2';
      borderColor = '#fca5a5';
    } else if (secondsLeft <= amberThreshold) {
      color = '#b45309';
      bg = '#fffbeb';
      borderColor = '#fcd34d';
    }
  }

  return (
    <div
      className={`card ${pulseClass}`}
      style={{
        backgroundColor: bg,
        borderColor,
        borderWidth: 2,
        padding: large ? '24px 20px' : '14px 18px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'background-color 0.25s, border-color 0.25s',
      }}
    >
      <div
        style={{
          fontSize: large ? 14 : 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: timer?.phase === 'time_up' ? '#fee2e2' : '#64748b',
          textTransform: 'uppercase',
        }}
      >
        {statusText}
      </div>
      <div
        className="tabular-nums"
        style={{
          fontSize: large ? 76 : 42,
          fontWeight: 800,
          lineHeight: 1.05,
          color,
        }}
      >
        {timer?.phase === 'time_up' ? '00:00' : formatMMSS(remainingMs)}
      </div>
    </div>
  );
}
