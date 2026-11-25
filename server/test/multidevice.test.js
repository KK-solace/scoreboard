import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { io as ioc } from 'socket.io-client';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-multi-'));
process.env.SCOREBOARD_DATA_DIR = tmpDir;

const { startServer } = await import('../index.js');

function waitForEvent(socket, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (data) => {
      clearTimeout(to);
      resolve(data);
    });
  });
}

describe('Multi-User & Multi-Device Scenarios', () => {
  let server;
  let io;
  let baseUrl;
  let adminToken;
  let qm2Token;

  before(async () => {
    const started = await startServer({ port: 3911 });
    server = started.server;
    io = started.io;
    baseUrl = `http://localhost:${started.port}`;

    // Login Primary Admin
    const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', passcode: 'admin123', deviceName: 'Host Laptop' }),
    }).then((r) => r.json());
    adminToken = adminRes.token;
    assert.ok(adminToken);

    // Join Secondary Quizmaster via Access Code
    const qmRes = await fetch(`${baseUrl}/api/auth/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'QM Two', accessCode: 'QUIZ2026', deviceName: 'iPad QM2' }),
    }).then((r) => r.json());
    qm2Token = qmRes.token;
    assert.ok(qm2Token);
  });

  after(() => {
    io?.close();
    server?.closeAllConnections?.();
    server?.close();
  });

  it('rejects unauthenticated control sockets and blocks presentation mutations', async () => {
    const unauth = ioc(baseUrl, { auth: { mode: 'control', token: 'bad-token' }, reconnection: false });
    const err = await waitForEvent(unauth, 'auth:error');
    assert.match(err.message, /Authentication|expired/i);
    unauth.disconnect();

    const pres = ioc(baseUrl, { auth: { mode: 'presentation', deviceName: 'Projector' } });
    await waitForEvent(pres, 'state:sync');
    pres.emit('score:adjust', { teamId: 1, delta: 50 });
    const actionErr = await waitForEvent(pres, 'action:error');
    assert.match(actionErr.message, /read-only/i);
    pres.disconnect();
  });

  it('Scenario 1-4: Simultaneous updates (different & same team), timer pause/resume, and presentation sync', async () => {
    const admin = ioc(baseUrl, { auth: { mode: 'control', token: adminToken, deviceName: 'Host' } });
    const qm2 = ioc(baseUrl, { auth: { mode: 'control', token: qm2Token, deviceName: 'iPad QM2' } });
    const pres = ioc(baseUrl, { auth: { mode: 'presentation', deviceName: 'Projector' } });

    const [initAdmin] = await Promise.all([
      waitForEvent(admin, 'state:sync'),
      waitForEvent(qm2, 'state:sync'),
      waitForEvent(pres, 'state:sync'),
    ]);

    const t1 = initAdmin.state.teams[0].id;
    const t2 = initAdmin.state.teams[1].id;

    // Simultaneous updates on different teams
    admin.emit('score:adjust', { teamId: t1, delta: 10, eventId: 'ev-diff-1' });
    qm2.emit('score:adjust', { teamId: t2, delta: 15, eventId: 'ev-diff-2' });

    await new Promise((r) => setTimeout(r, 150));

    // Simultaneous updates on the SAME team (atomic serialization!)
    admin.emit('score:adjust', { teamId: t1, delta: 10, eventId: 'ev-same-1' });
    qm2.emit('score:adjust', { teamId: t1, delta: 10, eventId: 'ev-same-2' });
    // Duplicate retry with same eventId should be ignored
    qm2.emit('score:adjust', { teamId: t1, delta: 10, eventId: 'ev-same-2' });

    await new Promise((r) => setTimeout(r, 200));

    pres.emit('state:get');
    const finalPres = await waitForEvent(pres, 'state:sync');
    const team1 = finalPres.state.teams.find((t) => t.id === t1);
    const team2 = finalPres.state.teams.find((t) => t.id === t2);

    assert.equal(team1.score, 30); // 10 + 10 + 10 (no lost update, no duplicate!)
    assert.equal(team2.score, 15);

    // Secondary QM cannot reset competition (RBAC)
    qm2.emit('competition:reset', {});
    const rbacErr = await waitForEvent(qm2, 'action:error');
    assert.match(rbacErr.message, /Permission denied/i);

    // Timer pause/resume conflict test
    admin.emit('settings:update', { startingCountdownDuration: 0 });
    await new Promise((r) => setTimeout(r, 50));
    admin.emit('timer:start');
    await new Promise((r) => setTimeout(r, 60));
    admin.emit('timer:pause');
    await new Promise((r) => setTimeout(r, 60));

    pres.emit('state:get');
    const pausedState = await waitForEvent(pres, 'state:sync');
    assert.equal(pausedState.state.timer.phase, 'paused');

    admin.emit('timer:resume');
    await new Promise((r) => setTimeout(r, 60));
    pres.emit('state:get');
    const resumedState = await waitForEvent(pres, 'state:sync');
    assert.equal(resumedState.state.timer.phase, 'running');

    admin.emit('timer:reset', {});
    admin.disconnect();
    qm2.disconnect();
    pres.disconnect();
  });

  it('Scenario 5-8: Disconnect/reconnect, admin force-disconnect, and state preservation', async () => {
    const admin = ioc(baseUrl, { auth: { mode: 'control', token: adminToken, deviceName: 'Host' } });
    const pres = ioc(baseUrl, { auth: { mode: 'presentation', deviceName: 'Projector' } });
    await Promise.all([waitForEvent(admin, 'state:sync'), waitForEvent(pres, 'state:sync')]);

    // Presentation disconnects and reconnects without losing scores
    pres.disconnect();
    const pres2 = ioc(baseUrl, { auth: { mode: 'presentation', deviceName: 'Projector' } });
    const synced = await waitForEvent(pres2, 'state:sync');
    assert.equal(synced.state.teams[0].score, 30);

    // Admin force-disconnects another control session
    const devicesPromise = new Promise((resolve) => {
      admin.on('devices:sync', (list) => {
        if (list.some((d) => d.deviceName === 'iPad QM2')) resolve(list);
      });
    });
    const qm2 = ioc(baseUrl, { auth: { mode: 'control', token: qm2Token, deviceName: 'iPad QM2' } });
    await waitForEvent(qm2, 'state:sync');
    const devicesList = await devicesPromise;
    const target = devicesList.find((d) => d.deviceName === 'iPad QM2');
    assert.ok(target);

    const kickedPromise = waitForEvent(qm2, 'auth:error');
    admin.emit('device:disconnect', { socketId: target.socketId });
    const kicked = await kickedPromise;
    assert.match(kicked.message, /Disconnected by Primary Quizmaster/i);

    admin.disconnect();
    pres2.disconnect();
    qm2.disconnect();
  });
});
