import express from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Server as SocketIOServer } from 'socket.io';
import { initDatabase } from './db.js';
import * as store from './store.js';
import * as auth from './auth.js';

export function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  return ips;
}

export function startServer({ port = Number(process.env.PORT) || 3847, clientDistDir } = {}) {
  initDatabase();
  store.recoverTimer();

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: '*' },
  });

  app.use(express.json());

  // --- Public & Auth Endpoints ---
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverTime: Date.now() });
  });

  app.get('/api/network-info', (_req, res) => {
    res.json({
      port,
      ips: getLocalIps(),
      hostname: os.hostname(),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, passcode, deviceName } = req.body || {};
    const result = auth.loginWithCredentials({
      username,
      passcode,
      deviceName: deviceName || 'Quizmaster Browser',
      ipAddress: req.ip || '',
    });
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });

  app.post('/api/auth/join', (req, res) => {
    const { displayName, accessCode, deviceName } = req.body || {};
    const result = auth.joinWithAccessCode({
      displayName,
      accessCode,
      deviceName: deviceName || 'Remote Device',
      ipAddress: req.ip || '',
    });
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  });

  app.get('/api/auth/me', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = auth.verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    res.json({ user: session.user, deviceName: session.deviceName });
  });

  app.post('/api/auth/logout', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    auth.revokeSession(token);
    res.json({ ok: true });
  });

  app.get('/api/export-csv', (req, res) => {
    const token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const session = auth.verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required to export CSV' });
    }
    const csv = store.generateResultsCsv();
    const state = store.getFullState();
    const safeName = (state.competition?.title || 'quiz-results')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName || 'quiz-results'}.csv"`);
    res.send(csv);
  });

  const distPath = clientDistDir || path.resolve(process.cwd(), 'client/dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // --- Connected Devices Registry ---
  const connectedDevices = new Map();
  let lastActor = null;
  const recentEventIds = new Set();

  function getDevicesList() {
    return Array.from(connectedDevices.values()).map((d) => ({
      socketId: d.socketId,
      deviceName: d.deviceName,
      userName: d.userName,
      userRole: d.userRole,
      ipAddress: d.ipAddress,
      status: d.status,
      lastActivity: d.lastActivity,
      connectedAt: d.connectedAt,
    }));
  }

  function broadcastDevices() {
    const list = getDevicesList();
    for (const [sid, dev] of connectedDevices.entries()) {
      if (dev.userRole !== 'presentation') {
        io.to(sid).emit('devices:sync', list);
      }
    }
  }

  function broadcastUsers() {
    const users = auth.listUsers();
    for (const [sid, dev] of connectedDevices.entries()) {
      if (dev.userRole === 'primary_admin') {
        io.to(sid).emit('users:sync', users);
      }
    }
  }

  store.setOnStateChange((state, event) => {
    const enrichedEvent = event
      ? {
          ...event,
          actorName: event.actorName || lastActor?.displayName || null,
          actorRole: event.actorRole || lastActor?.role || null,
        }
      : null;
    io.emit('state:sync', { state, event: enrichedEvent });
  });

  function sanitizeStateForRole(fullState, role) {
    if (role === 'primary_admin') return fullState;
    // Do not leak quizmasterAccessCode to presentation or secondary clients
    const { quizmasterAccessCode, ...safeSettings } = fullState.settings || {};
    return {
      ...fullState,
      settings: safeSettings,
    };
  }

  io.on('connection', (socket) => {
    const handshakeAuth = socket.handshake.auth || {};
    const mode = handshakeAuth.mode;
    const ip = socket.handshake.address || '';

    let deviceEntry = null;
    let sessionToken = null;

    if (mode === 'presentation') {
      deviceEntry = {
        socketId: socket.id,
        deviceName: String(handshakeAuth.deviceName || 'Projector Display').slice(0, 60),
        userName: 'Presentation Screen',
        userRole: 'presentation',
        ipAddress: ip,
        status: 'connected',
        lastActivity: Date.now(),
        connectedAt: Date.now(),
        sessionToken: null,
      };
    } else {
      const token = handshakeAuth.token;
      const session = auth.verifySessionToken(token);
      if (!session) {
        socket.emit('auth:error', { message: 'Authentication required or session expired.' });
        socket.disconnect(true);
        return;
      }
      sessionToken = session.token;
      deviceEntry = {
        socketId: socket.id,
        deviceName: session.deviceName || 'Control Device',
        userName: session.user.displayName,
        userRole: session.user.role,
        userId: session.user.id,
        ipAddress: ip,
        status: 'connected',
        lastActivity: Date.now(),
        connectedAt: Date.now(),
        sessionToken,
      };
    }

    connectedDevices.set(socket.id, deviceEntry);
    socket.emit('state:sync', {
      state: sanitizeStateForRole(store.getFullState(), deviceEntry.userRole),
      event: { type: 'connected' },
    });

    if (deviceEntry.userRole !== 'presentation') {
      socket.emit('devices:sync', getDevicesList());
    }
    if (deviceEntry.userRole === 'primary_admin') {
      socket.emit('users:sync', auth.listUsers());
    }

    broadcastDevices();
    io.emit('device:notice', {
      type: 'joined',
      deviceName: deviceEntry.deviceName,
      userName: deviceEntry.userName,
      userRole: deviceEntry.userRole,
      timestamp: Date.now(),
    });

    socket.on('state:get', () => {
      socket.emit('state:sync', {
        state: sanitizeStateForRole(store.getFullState(), deviceEntry.userRole),
        event: { type: 'sync' },
      });
    });

    function authorize(action, handler) {
      return (payload = {}) => {
        if (deviceEntry.userRole === 'presentation') {
          socket.emit('action:error', { action, message: 'Presentation mode is read-only.' });
          return;
        }
        const session = auth.verifySessionToken(sessionToken);
        if (!session) {
          socket.emit('auth:error', { message: 'Your session has been disconnected or expired.' });
          socket.disconnect(true);
          return;
        }
        if (!auth.hasPermission(session.user, action)) {
          socket.emit('action:error', {
            action,
            message: `Permission denied: "${action}" requires higher privileges.`,
          });
          return;
        }

        // Deduplicate retries using unique eventId
        if (payload?.eventId && action !== 'score:adjust') {
          if (recentEventIds.has(payload.eventId)) return;
          recentEventIds.add(payload.eventId);
          if (recentEventIds.size > 500) {
            const first = recentEventIds.values().next().value;
            recentEventIds.delete(first);
          }
        }

        deviceEntry.lastActivity = Date.now();
        lastActor = session.user;
        try {
          handler(payload, session.user);
        } finally {
          lastActor = null;
          broadcastDevices();
        }
      };
    }

    // --- Competition & Scoring ---
    socket.on('competition:update', authorize('competition:update', (p) => store.updateCompetition(p)));
    socket.on('competition:reset', authorize('competition:reset', (p) => store.resetCompetition(p)));
    socket.on('competition:finish', authorize('competition:finish', () => store.finishCompetition()));
    socket.on('competition:resume', authorize('competition:resume', () => store.resumeFromOverlay()));

    socket.on('team:add', authorize('team:add', (p) => store.addTeam(p)));
    socket.on('team:update', authorize('team:update', (p) => p?.id && store.updateTeam(p.id, p)));
    socket.on('team:delete', authorize('team:delete', (p) => p?.id && store.deleteTeam(p.id)));

    socket.on(
      'score:adjust',
      authorize('score:adjust', (p, user) => {
        if (p?.teamId && p?.delta !== undefined) {
          store.adjustScore(p.teamId, p.delta, p.note || '', {
            eventId: p.eventId || null,
            actor: user,
          });
        }
      })
    );
    socket.on('score:undo', authorize('score:undo', () => store.undoScore()));
    socket.on('score:redo', authorize('score:redo', () => store.redoScore()));

    // --- Rounds ---
    socket.on('round:add', authorize('round:add', (p) => store.addRound(p)));
    socket.on('round:update', authorize('round:update', (p) => p?.id && store.updateRound(p.id, p)));
    socket.on('round:delete', authorize('round:delete', (p) => p?.id && store.deleteRound(p.id)));
    socket.on('round:select', authorize('round:select', (p) => p?.id && store.selectRound(p.id)));
    socket.on('round:complete', authorize('round:complete', () => store.completeCurrentRound()));
    socket.on('round:next', authorize('round:next', () => store.nextRound()));

    // --- Timer ---
    socket.on('timer:start', authorize('timer:start', () => store.startTimer()));
    socket.on('timer:pause', authorize('timer:pause', () => store.pauseTimer()));
    socket.on('timer:resume', authorize('timer:resume', () => store.resumeTimer()));
    socket.on('timer:reset', authorize('timer:reset', (p) => store.resetTimer(p?.durationSeconds)));
    socket.on('timer:adjust', authorize('timer:adjust', (p) => p?.deltaSeconds !== undefined && store.adjustTimer(p.deltaSeconds)));

    // --- Settings ---
    socket.on('settings:update', authorize('settings:update', (p) => store.updateSettings(p)));

    // --- Admin User & Device Management ---
    socket.on(
      'user:create',
      authorize('user:create', (p) => {
        const res = auth.createSecondaryUser(p);
        if (res.error) socket.emit('action:error', { action: 'user:create', message: res.error });
        else broadcastUsers();
      })
    );
    socket.on(
      'user:update',
      authorize('user:update', (p) => {
        const res = auth.updateSecondaryUser(p.id, p);
        if (res.error) socket.emit('action:error', { action: 'user:update', message: res.error });
        else {
          broadcastUsers();
          // If deactivated, disconnect their active sockets
          if (p.active === false) {
            for (const [sid, dev] of connectedDevices.entries()) {
              if (dev.userId === p.id) {
                io.to(sid).emit('auth:error', { message: 'Your account was disabled by Primary Admin.' });
                io.sockets.sockets.get(sid)?.disconnect(true);
              }
            }
          }
        }
      })
    );
    socket.on(
      'user:delete',
      authorize('user:delete', (p) => {
        const res = auth.deleteSecondaryUser(p.id);
        if (res.error) socket.emit('action:error', { action: 'user:delete', message: res.error });
        else {
          for (const [sid, dev] of connectedDevices.entries()) {
            if (dev.userId === p.id) {
              io.to(sid).emit('auth:error', { message: 'Your account was removed by Primary Admin.' });
              io.sockets.sockets.get(sid)?.disconnect(true);
            }
          }
          broadcastUsers();
        }
      })
    );
    socket.on(
      'user:admin_passcode',
      authorize('user:admin_passcode', (p) => {
        const res = auth.updatePrimaryAdminPasscode(p.newPasscode);
        if (res.error) socket.emit('action:error', { action: 'user:admin_passcode', message: res.error });
      })
    );

    socket.on(
      'device:disconnect',
      authorize('device:disconnect', (p) => {
        const targetSid = p?.socketId;
        if (!targetSid || targetSid === socket.id) return;
        const target = connectedDevices.get(targetSid);
        if (target?.sessionToken) {
          auth.revokeSession(target.sessionToken);
        }
        io.to(targetSid).emit('auth:error', { message: 'Disconnected by Primary Quizmaster.' });
        io.sockets.sockets.get(targetSid)?.disconnect(true);
        connectedDevices.delete(targetSid);
        broadcastDevices();
      })
    );

    socket.on('disconnect', () => {
      const removed = connectedDevices.get(socket.id);
      connectedDevices.delete(socket.id);
      if (removed) {
        broadcastDevices();
        io.emit('device:notice', {
          type: 'left',
          deviceName: removed.deviceName,
          userName: removed.userName,
          userRole: removed.userRole,
          timestamp: Date.now(),
        });
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`Quiz Scoreboard Server running on http://localhost:${port}`);
      resolve({ server, io, port });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
