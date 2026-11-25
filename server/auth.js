import crypto from 'node:crypto';
import {
  db,
  hashPasscode,
  verifyPasscode,
  DEFAULT_SECONDARY_PERMISSIONS,
  FULL_ADMIN_PERMISSIONS,
} from './db.js';
import { getSettings } from './store.js';

function sanitizeUser(row) {
  if (!row) return null;
  let permissions = { ...DEFAULT_SECONDARY_PERMISSIONS };
  try {
    permissions = { ...permissions, ...JSON.parse(row.permissions_json) };
  } catch {
    // fallback
  }
  if (row.role === 'primary_admin') {
    permissions = { ...FULL_ADMIN_PERMISSIONS };
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    permissions,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

export function createSession(userId, deviceName = 'Browser Device', ipAddress = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token, user_id, device_name, ip_address, created_at, last_active_at, revoked) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(token, userId, String(deviceName).slice(0, 80) || 'Browser Device', ipAddress, now, now);
  return token;
}

export function loginWithCredentials({ username, passcode, deviceName, ipAddress }) {
  const uname = String(username || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(uname);
  if (!row || !row.active) {
    return { error: 'Invalid username or inactive account.' };
  }
  if (!verifyPasscode(String(passcode || ''), row.passcode_hash)) {
    return { error: 'Incorrect passcode.' };
  }
  const token = createSession(row.id, deviceName, ipAddress);
  return { token, user: sanitizeUser(row) };
}

export function joinWithAccessCode({ displayName, accessCode, deviceName, ipAddress }) {
  const settings = getSettings();
  const expectedCode = String(settings.quizmasterAccessCode || '').trim();
  if (!expectedCode || String(accessCode || '').trim() !== expectedCode) {
    return { error: 'Invalid Quizmaster Access Code.' };
  }

  const name = String(displayName || '').trim();
  if (!name) {
    return { error: 'Please enter your name.' };
  }

  const slug =
    'qm_' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 24);

  let row = db.prepare('SELECT * FROM users WHERE username = ?').get(slug);
  if (!row) {
    const res = db
      .prepare(
        'INSERT INTO users (username, display_name, role, passcode_hash, permissions_json, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
      )
      .run(
        slug,
        name,
        'secondary_quizmaster',
        hashPasscode(expectedCode),
        JSON.stringify(DEFAULT_SECONDARY_PERMISSIONS),
        Date.now()
      );
    row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(res.lastInsertRowid));
  } else if (!row.active) {
    return { error: 'This quizmaster account has been disabled by the Primary Admin.' };
  }

  const token = createSession(row.id, deviceName, ipAddress);
  return { token, user: sanitizeUser(row) };
}

export function verifySessionToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.token, s.device_name, s.ip_address, s.created_at AS session_created_at, s.last_active_at, s.revoked,
              u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.revoked = 0 AND u.active = 1`
    )
    .get(String(token));

  if (!row) return null;
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE token = ?').run(Date.now(), token);
  return {
    token: row.token,
    deviceName: row.device_name,
    ipAddress: row.ip_address,
    lastActiveAt: row.last_active_at,
    user: sanitizeUser(row),
  };
}

export function revokeSession(token) {
  if (!token) return;
  db.prepare('UPDATE sessions SET revoked = 1 WHERE token = ?').run(String(token));
}

export function listUsers() {
  return db.prepare('SELECT * FROM users ORDER BY role ASC, id ASC').all().map(sanitizeUser);
}

export function createSecondaryUser({ username, displayName, passcode, permissions }) {
  const uname = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');
  if (!uname || !displayName || !passcode) {
    return { error: 'Username, display name, and passcode are required.' };
  }
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(uname);
  if (existing) {
    return { error: 'Username already exists.' };
  }
  const perms = { ...DEFAULT_SECONDARY_PERMISSIONS, ...(permissions || {}) };
  const res = db
    .prepare(
      'INSERT INTO users (username, display_name, role, passcode_hash, permissions_json, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
    )
    .run(uname, String(displayName).trim(), 'secondary_quizmaster', hashPasscode(passcode), JSON.stringify(perms), Date.now());
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(res.lastInsertRowid));
  return { user: sanitizeUser(row) };
}

export function updateSecondaryUser(id, { displayName, permissions, active, passcode }) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return { error: 'User not found.' };
  if (row.role === 'primary_admin') {
    return { error: 'Primary Admin account cannot be modified here.' };
  }

  const nextName = displayName !== undefined ? String(displayName).trim() || row.display_name : row.display_name;
  const nextActive = active !== undefined ? (active ? 1 : 0) : row.active;
  let currentPerms = { ...DEFAULT_SECONDARY_PERMISSIONS };
  try {
    currentPerms = { ...currentPerms, ...JSON.parse(row.permissions_json) };
  } catch {
    // ignore
  }
  const nextPerms = permissions ? { ...currentPerms, ...permissions } : currentPerms;
  const nextHash = passcode ? hashPasscode(passcode) : row.passcode_hash;

  db.prepare('UPDATE users SET display_name = ?, permissions_json = ?, active = ?, passcode_hash = ? WHERE id = ?').run(
    nextName,
    JSON.stringify(nextPerms),
    nextActive,
    nextHash,
    id
  );

  if (!nextActive) {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(id);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return { user: sanitizeUser(updated) };
}

export function deleteSecondaryUser(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return { error: 'User not found.' };
  if (row.role === 'primary_admin') {
    return { error: 'Primary Admin account is protected and cannot be deleted.' };
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true };
}

export function updatePrimaryAdminPasscode(newPasscode) {
  if (!newPasscode || String(newPasscode).length < 4) {
    return { error: 'Passcode must be at least 4 characters.' };
  }
  db.prepare("UPDATE users SET passcode_hash = ? WHERE role = 'primary_admin'").run(hashPasscode(newPasscode));
  return { ok: true };
}

export function hasPermission(user, action) {
  if (!user || !user.active) return false;
  if (user.role === 'primary_admin') return true;

  const perms = user.permissions || {};
  switch (action) {
    case 'score:adjust':
      return Boolean(perms.canScore);
    case 'score:undo':
    case 'score:redo':
      return Boolean(perms.canUndo);
    case 'timer:start':
    case 'timer:pause':
    case 'timer:resume':
    case 'timer:reset':
    case 'timer:adjust':
      return Boolean(perms.canControlTimer);
    case 'round:add':
    case 'round:update':
    case 'round:delete':
    case 'round:select':
    case 'round:complete':
    case 'round:next':
    case 'competition:update':
      return Boolean(perms.canManageRounds);
    default:
      return false;
  }
}
