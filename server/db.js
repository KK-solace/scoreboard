import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.SCOREBOARD_DATA_DIR || path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'scoreboard.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function hashPasscode(passcode, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(passcode), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscode(passcode, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expected] = storedHash.split(':');
  const derived = crypto.scryptSync(String(passcode), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS competition (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      title TEXT NOT NULL DEFAULT 'Classroom Quiz Competition',
      status TEXT NOT NULL DEFAULT 'active',
      current_round_id INTEGER,
      current_question_number INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 60,
      question_count INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS round_scores (
      round_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (round_id, team_id),
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      round_id INTEGER,
      round_name TEXT,
      question_number INTEGER NOT NULL DEFAULT 1,
      delta INTEGER NOT NULL,
      previous_score INTEGER NOT NULL,
      new_score INTEGER NOT NULL,
      note TEXT DEFAULT '',
      undone INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      event_id TEXT,
      actor_user_id INTEGER,
      actor_name TEXT DEFAULT 'Quizmaster'
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timer_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phase TEXT NOT NULL DEFAULT 'idle',
      duration_ms INTEGER NOT NULL DEFAULT 60000,
      remaining_ms INTEGER NOT NULL DEFAULT 60000,
      end_timestamp INTEGER,
      countdown_duration_ms INTEGER NOT NULL DEFAULT 3000,
      countdown_end_timestamp INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('primary_admin', 'secondary_quizmaster')),
      passcode_hash TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      ip_address TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Safe migrations for existing databases
  ensureColumn('score_history', 'event_id', 'TEXT');
  ensureColumn('score_history', 'actor_user_id', 'INTEGER');
  ensureColumn('score_history', 'actor_name', "TEXT DEFAULT 'Quizmaster'");

  const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
  if (!comp) {
    seedDefaultData();
  }

  ensureDefaultUsers();
}

export const DEFAULT_SECONDARY_PERMISSIONS = {
  canScore: true,
  canControlTimer: false,
  canManageRounds: false,
  canUndo: false,
};

export const FULL_ADMIN_PERMISSIONS = {
  canScore: true,
  canControlTimer: true,
  canManageRounds: true,
  canUndo: true,
};

export function ensureDefaultUsers() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'primary_admin'").get();
  if (!admin) {
    db.prepare(
      'INSERT INTO users (username, display_name, role, passcode_hash, permissions_json, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
    ).run(
      'admin',
      'Primary Quizmaster',
      'primary_admin',
      hashPasscode('admin123'),
      JSON.stringify(FULL_ADMIN_PERMISSIONS),
      Date.now()
    );
  }
}

export const DEFAULT_SETTINGS = {
  defaultTimerDuration: 60,
  startingCountdownDuration: 3,
  warningAmberSeconds: 30,
  warningRedSeconds: 10,
  lockOnTimeUp: false,
  allowNegativeScores: false,
  animationsEnabled: true,
  soundEnabled: true,
  soundVolume: 0.8,
  soundCategories: {
    countdown: true,
    go: true,
    positive: true,
    negative: true,
    tick: true,
    timeUp: true,
    roundComplete: true,
    winner: true,
  },
  showRoundScoresInPresentation: false,
  quizmasterAccessCode: 'QUIZ2026',
};

export function seedDefaultData() {
  const now = Date.now();
  db.exec('DELETE FROM score_history; DELETE FROM round_scores; DELETE FROM teams; DELETE FROM rounds; DELETE FROM competition; DELETE FROM timer_state;');

  const insertRound = db.prepare(
    'INSERT INTO rounds (name, order_index, duration_seconds, question_count, status) VALUES (?, ?, ?, ?, ?)'
  );
  const r1 = insertRound.run('Round 1: General Knowledge', 0, 60, 10, 'active');
  insertRound.run('Round 2: Science & Discovery', 1, 60, 10, 'pending');
  insertRound.run('Round 3: Rapid Fire', 2, 45, 10, 'pending');

  db.prepare(
    'INSERT INTO competition (id, title, status, current_round_id, current_question_number, updated_at) VALUES (1, ?, ?, ?, ?, ?)'
  ).run('Annual School Quiz Competition', 'active', Number(r1.lastInsertRowid), 1, now);

  const defaultTeams = [
    { name: 'Team Alpha', color: '#2563EB' },
    { name: 'Team Beta', color: '#DC2626' },
    { name: 'Team Gamma', color: '#16A34A' },
    { name: 'Team Delta', color: '#D97706' },
  ];

  const insertTeam = db.prepare(
    'INSERT INTO teams (name, color, score, correct_count, incorrect_count, order_index) VALUES (?, ?, 0, 0, 0, ?)'
  );
  defaultTeams.forEach((t, idx) => {
    insertTeam.run(t.name, t.color, idx);
  });

  const existingSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!existingSettings) {
    db.prepare('INSERT INTO settings (id, json) VALUES (1, ?)').run(JSON.stringify(DEFAULT_SETTINGS));
  }

  db.prepare(
    'INSERT INTO timer_state (id, phase, duration_ms, remaining_ms, end_timestamp, countdown_duration_ms, countdown_end_timestamp, updated_at) VALUES (1, ?, ?, ?, NULL, ?, NULL, ?)'
  ).run('idle', 60000, 60000, 3000, now);
}
