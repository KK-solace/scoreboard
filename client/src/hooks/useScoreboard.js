import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

function makeEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useScoreboard({ mode = 'control', token = null, deviceName = 'Browser' } = {}) {
  const [state, setState] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [notice, setNotice] = useState(null);
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const socketRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const showNotice = useCallback((text, tone = 'info') => {
    setNotice({ text, tone, id: Date.now() });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(() => {
    if (mode !== 'presentation' && !token) {
      return;
    }

    setAuthError(null);
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 600,
      auth: {
        mode,
        token,
        deviceName,
      },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('state:get');
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason !== 'io client disconnect') {
        showNotice('Connection lost. Attempting to reconnect...', 'warning');
      }
    });

    socket.on('auth:error', (payload) => {
      setAuthError(payload?.message || 'Session expired or disconnected.');
      socket.disconnect();
    });

    socket.on('action:error', (payload) => {
      showNotice(payload?.message || 'Action not permitted.', 'error');
    });

    socket.on('devices:sync', (list) => {
      if (Array.isArray(list)) setDevices(list);
    });

    socket.on('users:sync', (list) => {
      if (Array.isArray(list)) setUsers(list);
    });

    socket.on('device:notice', (info) => {
      if (!info) return;
      if (info.type === 'joined') {
        showNotice(`${info.userName} (${info.deviceName}) connected.`, 'info');
      } else if (info.type === 'left') {
        showNotice(`${info.userName} (${info.deviceName}) disconnected.`, 'warning');
      }
    });

    socket.on('state:sync', (payload) => {
      if (payload?.state) {
        if (payload.state.serverTime) {
          setClockOffsetMs(payload.state.serverTime - Date.now());
        }
        setState(payload.state);
        if (payload.event) {
          setLastEvent({ ...payload.event, _seq: Math.random() });
          if (payload.event.type === 'score' && payload.event.actorName) {
            const sign = payload.event.delta > 0 ? `+${payload.event.delta}` : payload.event.delta;
            showNotice(`${payload.event.actorName}: ${payload.event.teamName} (${sign})`, 'info');
          } else if (payload.event.actorName && payload.event.type?.startsWith('timer_')) {
            const label = payload.event.type.replace('timer_', '');
            showNotice(`${payload.event.actorName} ${label}ed timer`, 'info');
          }
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [mode, token, deviceName, showNotice]);

  const emit = useCallback((eventName, payload = {}) => {
    if (socketRef.current) {
      socketRef.current.emit(eventName, {
        ...payload,
        eventId: payload?.eventId || makeEventId(),
      });
    }
  }, []);

  return {
    state,
    lastEvent,
    devices,
    users,
    notice,
    connected,
    authError,
    clockOffsetMs,
    emit,
  };
}
