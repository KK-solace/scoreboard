import { db, DEFAULT_SETTINGS, seedDefaultData } from './db.js';

let timerTimeout = null;
let countdownTimeout = null;
let onStateChangeCallback = null;

export function setOnStateChange(cb) {
  onStateChangeCallback = cb;
}

function notifyChange(event = null) {
  if (onStateChangeCallback) {
    onStateChangeCallback(getFullState(), event);
  }
}

export function getSettings() {
  const row = db.prepare('SELECT json FROM settings WHERE id = 1').get();
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.json);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      soundCategories: {
        ...DEFAULT_SETTINGS.soundCategories,
        ...(parsed.soundCategories || {}),
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(patch) {
  const current = getSettings();
  const next = {
    ...current,
    ...patch,
    soundCategories: {
      ...current.soundCategories,
      ...(patch.soundCategories || {}),
    },
  };
  db.prepare('INSERT OR REPLACE INTO settings (id, json) VALUES (1, ?)').run(JSON.stringify(next));
  notifyChange({ type: 'settings' });
  return next;
}

export function computeLeaderboard(teams) {
  const sorted = [...teams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.orderIndex - b.orderIndex;
  });

  let currentRank = 1;
  return sorted.map((team, idx) => {
    if (idx > 0 && team.score < sorted[idx - 1].score) {
      currentRank = idx + 1;
    }
    return {
      ...team,
      rank: currentRank,
    };
  });
}

export function getFullState() {
  const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC, id ASC').all().map((r) => ({
    id: r.id,
    name: r.name,
    orderIndex: r.order_index,
    durationSeconds: r.duration_seconds,
    questionCount: r.question_count,
    status: r.status,
  }));

  const teams = db.prepare('SELECT * FROM teams ORDER BY order_index ASC, id ASC').all().map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    score: t.score,
    correctCount: t.correct_count,
    incorrectCount: t.incorrect_count,
    orderIndex: t.order_index,
  }));

  const roundScores = db.prepare('SELECT * FROM round_scores').all().map((rs) => ({
    roundId: rs.round_id,
    teamId: rs.team_id,
    score: rs.score,
    correctCount: rs.correct_count,
    incorrectCount: rs.incorrect_count,
  }));

  const history = db
    .prepare('SELECT * FROM score_history WHERE undone = 0 ORDER BY id DESC LIMIT 100')
    .all()
    .map((h) => ({
      id: h.id,
      teamId: h.team_id,
      teamName: h.team_name,
      roundId: h.round_id,
      roundName: h.round_name,
      questionNumber: h.question_number,
      delta: h.delta,
      previousScore: h.previous_score,
      newScore: h.new_score,
      note: h.note,
      actorName: h.actor_name || 'Quizmaster',
      eventId: h.event_id || null,
      timestamp: h.timestamp,
    }));

  const undoCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM score_history WHERE undone = 0').get();
  const redoCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM score_history WHERE undone = 1').get();

  const timerRow = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  const timer = timerRow
    ? {
        phase: timerRow.phase,
        durationMs: timerRow.duration_ms,
        remainingMs:
          timerRow.phase === 'running' && timerRow.end_timestamp
            ? Math.max(0, timerRow.end_timestamp - Date.now())
            : timerRow.remaining_ms,
        endTimestamp: timerRow.end_timestamp,
        countdownDurationMs: timerRow.countdown_duration_ms,
        countdownEndTimestamp: timerRow.countdown_end_timestamp,
      }
    : {
        phase: 'idle',
        durationMs: 60000,
        remainingMs: 60000,
        endTimestamp: null,
        countdownDurationMs: 3000,
        countdownEndTimestamp: null,
      };

  const leaderboard = computeLeaderboard(teams);

  return {
    competition: comp
      ? {
          id: comp.id,
          title: comp.title,
          status: comp.status,
          currentRoundId: comp.current_round_id,
          currentQuestionNumber: comp.current_question_number,
          updatedAt: comp.updated_at,
        }
      : null,
    rounds,
    teams,
    leaderboard,
    roundScores,
    history,
    canUndo: (undoCountRow?.cnt || 0) > 0,
    canRedo: (redoCountRow?.cnt || 0) > 0,
    settings: getSettings(),
    timer,
    serverTime: Date.now(),
  };
}

// --- Competition ---
export function updateCompetition(patch) {
  const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
  if (!comp) return;
  const title = patch.title !== undefined ? String(patch.title).trim() || comp.title : comp.title;
  const status = patch.status !== undefined ? patch.status : comp.status;
  const currentQuestionNumber =
    patch.currentQuestionNumber !== undefined
      ? Math.max(1, Number(patch.currentQuestionNumber) || 1)
      : comp.current_question_number;
  db.prepare(
    'UPDATE competition SET title = ?, status = ?, current_question_number = ?, updated_at = ? WHERE id = 1'
  ).run(title, status, currentQuestionNumber, Date.now());
  notifyChange({ type: 'competition' });
}

export function resetCompetition({ resetToDefaults = false } = {}) {
  clearTimerTimeouts();
  if (resetToDefaults) {
    seedDefaultData();
  } else {
    const now = Date.now();
    db.exec('DELETE FROM score_history; DELETE FROM round_scores;');
    db.exec('UPDATE teams SET score = 0, correct_count = 0, incorrect_count = 0;');
    const rounds = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC, id ASC').all();
    rounds.forEach((r, idx) => {
      db.prepare('UPDATE rounds SET status = ? WHERE id = ?').run(idx === 0 ? 'active' : 'pending', r.id);
    });
    const firstRound = rounds[0];
    const durationMs = (firstRound ? firstRound.duration_seconds : getSettings().defaultTimerDuration) * 1000;
    db.prepare(
      'UPDATE competition SET status = ?, current_round_id = ?, current_question_number = 1, updated_at = ? WHERE id = 1'
    ).run('active', firstRound ? firstRound.id : null, now);
    const settings = getSettings();
    db.prepare(
      'UPDATE timer_state SET phase = ?, duration_ms = ?, remaining_ms = ?, end_timestamp = NULL, countdown_duration_ms = ?, countdown_end_timestamp = NULL, updated_at = ? WHERE id = 1'
    ).run('idle', durationMs, durationMs, settings.startingCountdownDuration * 1000, now);
  }
  notifyChange({ type: 'reset' });
}

// --- Teams ---
const TEAM_PALETTE = ['#2563EB', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#4F46E5'];

export function addTeam({ name, color } = {}) {
  const countRow = db.prepare('SELECT COUNT(*) AS cnt, MAX(order_index) AS maxIdx FROM teams').get();
  const nextIndex = (countRow?.maxIdx ?? -1) + 1;
  const teamName = (name && String(name).trim()) || `Team ${nextIndex + 1}`;
  const teamColor = color || TEAM_PALETTE[nextIndex % TEAM_PALETTE.length];
  const res = db
    .prepare('INSERT INTO teams (name, color, score, correct_count, incorrect_count, order_index) VALUES (?, ?, 0, 0, 0, ?)')
    .run(teamName, teamColor, nextIndex);
  notifyChange({ type: 'team_added', teamId: Number(res.lastInsertRowid) });
}

export function updateTeam(id, { name, color }) {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  if (!team) return;
  const nextName = name !== undefined ? String(name).trim() || team.name : team.name;
  const nextColor = color !== undefined ? color : team.color;
  db.prepare('UPDATE teams SET name = ?, color = ? WHERE id = ?').run(nextName, nextColor, id);
  db.prepare('UPDATE score_history SET team_name = ? WHERE team_id = ?').run(nextName, id);
  notifyChange({ type: 'team_updated', teamId: id });
}

export function deleteTeam(id) {
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  notifyChange({ type: 'team_deleted', teamId: id });
}

// --- Scoring ---
function upsertRoundScore(roundId, teamId, scoreDelta, correctDelta, incorrectDelta) {
  if (!roundId) return;
  const existing = db.prepare('SELECT * FROM round_scores WHERE round_id = ? AND team_id = ?').get(roundId, teamId);
  if (existing) {
    db.prepare(
      'UPDATE round_scores SET score = score + ?, correct_count = MAX(0, correct_count + ?), incorrect_count = MAX(0, incorrect_count + ?) WHERE round_id = ? AND team_id = ?'
    ).run(scoreDelta, correctDelta, incorrectDelta, roundId, teamId);
  } else {
    db.prepare(
      'INSERT INTO round_scores (round_id, team_id, score, correct_count, incorrect_count) VALUES (?, ?, ?, ?, ?)'
    ).run(roundId, teamId, scoreDelta, Math.max(0, correctDelta), Math.max(0, incorrectDelta));
  }
}

export function adjustScore(teamId, rawDelta, note = '', { eventId = null, actor = null } = {}) {
  const delta = Math.trunc(Number(rawDelta));
  if (!Number.isFinite(delta) || delta === 0) return null;

  if (eventId) {
    const dup = db.prepare('SELECT id FROM score_history WHERE event_id = ?').get(String(eventId));
    if (dup) return null;
  }

  db.exec('BEGIN IMMEDIATE;');
  let event = null;
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) {
      db.exec('ROLLBACK;');
      return null;
    }

    const settings = getSettings();
    const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
    const round = comp?.current_round_id
      ? db.prepare('SELECT * FROM rounds WHERE id = ?').get(comp.current_round_id)
      : null;

    const prevTeams = db.prepare('SELECT * FROM teams ORDER BY order_index ASC, id ASC').all().map((t) => ({
      id: t.id,
      score: t.score,
      correctCount: t.correct_count,
      orderIndex: t.order_index,
    }));
    const prevLeader = computeLeaderboard(prevTeams)[0]?.id;

    const previousScore = team.score;
    let newScore = previousScore + delta;
    if (!settings.allowNegativeScores && newScore < 0) {
      newScore = 0;
    }
    const actualDelta = newScore - previousScore;
    if (actualDelta === 0 && delta < 0 && !settings.allowNegativeScores) {
      db.exec('ROLLBACK;');
      return null;
    }

    const correctDelta = delta > 0 ? 1 : 0;
    const incorrectDelta = delta < 0 ? 1 : 0;

    // Clear redo stack on new scoring action
    db.exec('DELETE FROM score_history WHERE undone = 1');

    db.prepare(
      'UPDATE teams SET score = ?, correct_count = correct_count + ?, incorrect_count = incorrect_count + ? WHERE id = ?'
    ).run(newScore, correctDelta, incorrectDelta, teamId);

    upsertRoundScore(comp?.current_round_id, teamId, actualDelta, correctDelta, incorrectDelta);

    const actorName = actor?.displayName || 'Quizmaster';
    const actorUserId = actor?.id || null;

    db.prepare(
      'INSERT INTO score_history (team_id, team_name, round_id, round_name, question_number, delta, previous_score, new_score, note, undone, timestamp, event_id, actor_user_id, actor_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
    ).run(
      teamId,
      team.name,
      comp?.current_round_id || null,
      round?.name || '',
      comp?.current_question_number || 1,
      actualDelta,
      previousScore,
      newScore,
      note,
      Date.now(),
      eventId ? String(eventId) : null,
      actorUserId,
      actorName
    );

    db.exec('COMMIT;');

    const nextState = getFullState();
    const newLeader = nextState.leaderboard[0]?.id;
    const overtaken = prevLeader && newLeader && prevLeader !== newLeader;

    event = {
      type: 'score',
      eventId,
      teamId,
      teamName: team.name,
      delta: actualDelta,
      previousScore,
      newScore,
      overtaken,
      newLeaderId: newLeader,
      actorUserId,
      actorName,
      timestamp: Date.now(),
    };

    if (onStateChangeCallback) {
      onStateChangeCallback(nextState, event);
    }
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback error
    }
    throw err;
  }

  return event;
}

export function undoScore() {
  const entry = db.prepare('SELECT * FROM score_history WHERE undone = 0 ORDER BY id DESC LIMIT 1').get();
  if (!entry) return false;

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(entry.team_id);
  if (team) {
    const correctDelta = entry.delta > 0 ? -1 : 0;
    const incorrectDelta = entry.delta < 0 ? -1 : 0;
    db.prepare(
      'UPDATE teams SET score = ?, correct_count = MAX(0, correct_count + ?), incorrect_count = MAX(0, incorrect_count + ?) WHERE id = ?'
    ).run(entry.previous_score, correctDelta, incorrectDelta, entry.team_id);

    upsertRoundScore(entry.round_id, entry.team_id, -entry.delta, correctDelta, incorrectDelta);
  }

  db.prepare('UPDATE score_history SET undone = 1 WHERE id = ?').run(entry.id);
  notifyChange({ type: 'undo', teamId: entry.team_id, delta: -entry.delta });
  return true;
}

export function redoScore() {
  const entry = db.prepare('SELECT * FROM score_history WHERE undone = 1 ORDER BY id ASC LIMIT 1').get();
  if (!entry) return false;

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(entry.team_id);
  if (team) {
    const correctDelta = entry.delta > 0 ? 1 : 0;
    const incorrectDelta = entry.delta < 0 ? 1 : 0;
    db.prepare(
      'UPDATE teams SET score = ?, correct_count = correct_count + ?, incorrect_count = incorrect_count + ? WHERE id = ?'
    ).run(entry.new_score, correctDelta, incorrectDelta, entry.team_id);

    upsertRoundScore(entry.round_id, entry.team_id, entry.delta, correctDelta, incorrectDelta);
  }

  db.prepare('UPDATE score_history SET undone = 0 WHERE id = ?').run(entry.id);
  notifyChange({ type: 'redo', teamId: entry.team_id, delta: entry.delta });
  return true;
}

// --- Rounds ---
export function addRound({ name, durationSeconds = 60, questionCount = 10 } = {}) {
  const maxRow = db.prepare('SELECT MAX(order_index) AS maxIdx FROM rounds').get();
  const nextIdx = (maxRow?.maxIdx ?? -1) + 1;
  const roundName = (name && String(name).trim()) || `Round ${nextIdx + 1}`;
  const res = db
    .prepare('INSERT INTO rounds (name, order_index, duration_seconds, question_count, status) VALUES (?, ?, ?, ?, ?)')
    .run(roundName, nextIdx, Math.max(5, Number(durationSeconds) || 60), Math.max(1, Number(questionCount) || 10), 'pending');
  notifyChange({ type: 'round_added', roundId: Number(res.lastInsertRowid) });
}

export function updateRound(id, patch) {
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id);
  if (!r) return;
  const name = patch.name !== undefined ? String(patch.name).trim() || r.name : r.name;
  const durationSeconds =
    patch.durationSeconds !== undefined ? Math.max(5, Number(patch.durationSeconds) || r.duration_seconds) : r.duration_seconds;
  const questionCount =
    patch.questionCount !== undefined ? Math.max(1, Number(patch.questionCount) || r.question_count) : r.question_count;
  db.prepare('UPDATE rounds SET name = ?, duration_seconds = ?, question_count = ? WHERE id = ?').run(
    name,
    durationSeconds,
    questionCount,
    id
  );
  db.prepare('UPDATE score_history SET round_name = ? WHERE round_id = ?').run(name, id);
  notifyChange({ type: 'round_updated', roundId: id });
}

export function deleteRound(id) {
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC, id ASC').all();
  if (rounds.length <= 1) return;
  const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
  db.prepare('DELETE FROM rounds WHERE id = ?').run(id);
  if (comp?.current_round_id === id) {
    const remaining = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC, id ASC').all();
    if (remaining[0]) {
      db.prepare('UPDATE competition SET current_round_id = ?, current_question_number = 1 WHERE id = 1').run(
        remaining[0].id
      );
      db.prepare('UPDATE rounds SET status = ? WHERE id = ?').run('active', remaining[0].id);
    }
  }
  notifyChange({ type: 'round_deleted', roundId: id });
}

export function selectRound(id) {
  const r = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id);
  if (!r) return;
  db.prepare("UPDATE rounds SET status = 'pending' WHERE status = 'active'").run();
  db.prepare("UPDATE rounds SET status = 'active' WHERE id = ?").run(id);
  db.prepare('UPDATE competition SET current_round_id = ?, current_question_number = 1, status = ?, updated_at = ? WHERE id = 1').run(
    id,
    'active',
    Date.now()
  );
  resetTimer(r.duration_seconds);
}

export function completeCurrentRound() {
  const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
  if (comp?.current_round_id) {
    db.prepare("UPDATE rounds SET status = 'completed' WHERE id = ?").run(comp.current_round_id);
  }
  db.prepare("UPDATE competition SET status = 'round_complete', updated_at = ? WHERE id = 1").run(Date.now());
  notifyChange({ type: 'round_complete', roundId: comp?.current_round_id });
}

export function nextRound() {
  const comp = db.prepare('SELECT * FROM competition WHERE id = 1').get();
  const rounds = db.prepare('SELECT * FROM rounds ORDER BY order_index ASC, id ASC').all();
  const currentIdx = rounds.findIndex((r) => r.id === comp?.current_round_id);
  if (currentIdx >= 0 && rounds[currentIdx]) {
    db.prepare("UPDATE rounds SET status = 'completed' WHERE id = ?").run(rounds[currentIdx].id);
  }
  const next = rounds[currentIdx + 1];
  if (next) {
    db.prepare("UPDATE rounds SET status = 'active' WHERE id = ?").run(next.id);
    db.prepare(
      "UPDATE competition SET current_round_id = ?, current_question_number = 1, status = 'active', updated_at = ? WHERE id = 1"
    ).run(next.id, Date.now());
    resetTimer(next.duration_seconds);
    notifyChange({ type: 'next_round', roundId: next.id });
  } else {
    finishCompetition();
  }
}

export function finishCompetition() {
  clearTimerTimeouts();
  db.prepare("UPDATE rounds SET status = 'completed' WHERE status = 'active'").run();
  db.prepare("UPDATE competition SET status = 'finished', updated_at = ? WHERE id = 1").run(Date.now());
  notifyChange({ type: 'winner_announcement' });
}

export function resumeFromOverlay() {
  db.prepare("UPDATE competition SET status = 'active', updated_at = ? WHERE id = 1").run(Date.now());
  notifyChange({ type: 'competition' });
}

// --- Timestamp-based Timer ---
function clearTimerTimeouts() {
  if (timerTimeout) {
    clearTimeout(timerTimeout);
    timerTimeout = null;
  }
  if (countdownTimeout) {
    clearTimeout(countdownTimeout);
    countdownTimeout = null;
  }
}

function scheduleRunningCompletion(remainingMs) {
  clearTimerTimeouts();
  timerTimeout = setTimeout(() => {
    const now = Date.now();
    db.prepare(
      "UPDATE timer_state SET phase = 'time_up', remaining_ms = 0, end_timestamp = NULL, updated_at = ? WHERE id = 1"
    ).run(now);
    notifyChange({ type: 'time_up' });
  }, Math.max(0, remainingMs));
}

export function startTimer() {
  const timer = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  if (!timer) return;
  const settings = getSettings();
  const now = Date.now();

  if (timer.phase === 'running') return;

  const remainingMs = timer.phase === 'time_up' || timer.remaining_ms <= 0 ? timer.duration_ms : timer.remaining_ms;
  const countdownMs = Math.max(0, Number(settings.startingCountdownDuration) || 0) * 1000;

  if (timer.phase === 'idle' && countdownMs > 0) {
    clearTimerTimeouts();
    const countdownEnd = now + countdownMs;
    db.prepare(
      "UPDATE timer_state SET phase = 'starting_countdown', remaining_ms = ?, end_timestamp = NULL, countdown_duration_ms = ?, countdown_end_timestamp = ?, updated_at = ? WHERE id = 1"
    ).run(remainingMs, countdownMs, countdownEnd, now);
    notifyChange({ type: 'countdown_start' });

    // + 600ms to briefly show "GO!" before running
    countdownTimeout = setTimeout(() => {
      const goTime = Date.now();
      const endTs = goTime + remainingMs;
      db.prepare(
        "UPDATE timer_state SET phase = 'running', remaining_ms = ?, end_timestamp = ?, countdown_end_timestamp = NULL, updated_at = ? WHERE id = 1"
      ).run(remainingMs, endTs, goTime);
      scheduleRunningCompletion(remainingMs);
      notifyChange({ type: 'timer_go' });
    }, countdownMs + 600);
  } else {
    const endTs = now + remainingMs;
    db.prepare(
      "UPDATE timer_state SET phase = 'running', remaining_ms = ?, end_timestamp = ?, countdown_end_timestamp = NULL, updated_at = ? WHERE id = 1"
    ).run(remainingMs, endTs, now);
    scheduleRunningCompletion(remainingMs);
    notifyChange({ type: 'timer_start' });
  }
}

export function pauseTimer() {
  const timer = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  if (!timer) return;
  clearTimerTimeouts();
  const now = Date.now();
  if (timer.phase === 'running' && timer.end_timestamp) {
    const remainingMs = Math.max(0, timer.end_timestamp - now);
    db.prepare(
      "UPDATE timer_state SET phase = 'paused', remaining_ms = ?, end_timestamp = NULL, updated_at = ? WHERE id = 1"
    ).run(remainingMs, now);
    notifyChange({ type: 'timer_pause' });
  } else if (timer.phase === 'starting_countdown') {
    db.prepare(
      "UPDATE timer_state SET phase = 'idle', end_timestamp = NULL, countdown_end_timestamp = NULL, updated_at = ? WHERE id = 1"
    ).run(now);
    notifyChange({ type: 'timer_reset' });
  }
}

export function resumeTimer() {
  const timer = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  if (!timer || timer.phase !== 'paused') return;
  const now = Date.now();
  const endTs = now + timer.remaining_ms;
  db.prepare(
    "UPDATE timer_state SET phase = 'running', end_timestamp = ?, updated_at = ? WHERE id = 1"
  ).run(endTs, now);
  scheduleRunningCompletion(timer.remaining_ms);
  notifyChange({ type: 'timer_resume' });
}

export function resetTimer(customDurationSeconds = null) {
  clearTimerTimeouts();
  const timer = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  const settings = getSettings();
  const durationMs =
    customDurationSeconds !== null && customDurationSeconds !== undefined
      ? Math.max(1000, Math.round(Number(customDurationSeconds) * 1000))
      : timer?.duration_ms || settings.defaultTimerDuration * 1000;
  const now = Date.now();
  db.prepare(
    "UPDATE timer_state SET phase = 'idle', duration_ms = ?, remaining_ms = ?, end_timestamp = NULL, countdown_duration_ms = ?, countdown_end_timestamp = NULL, updated_at = ? WHERE id = 1"
  ).run(durationMs, durationMs, settings.startingCountdownDuration * 1000, now);
  notifyChange({ type: 'timer_reset' });
}

export function adjustTimer(deltaSeconds) {
  const timer = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  if (!timer) return;
  const deltaMs = Math.round(Number(deltaSeconds) * 1000);
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return;

  const now = Date.now();
  if (timer.phase === 'running' && timer.end_timestamp) {
    const currentRem = Math.max(0, timer.end_timestamp - now);
    const nextRem = Math.max(1000, currentRem + deltaMs);
    const nextEnd = now + nextRem;
    db.prepare('UPDATE timer_state SET remaining_ms = ?, end_timestamp = ?, updated_at = ? WHERE id = 1').run(
      nextRem,
      nextEnd,
      now
    );
    scheduleRunningCompletion(nextRem);
  } else {
    const nextRem = Math.max(1000, timer.remaining_ms + deltaMs);
    const nextDur = timer.phase === 'idle' ? nextRem : Math.max(timer.duration_ms, nextRem);
    db.prepare('UPDATE timer_state SET duration_ms = ?, remaining_ms = ?, updated_at = ? WHERE id = 1').run(
      nextDur,
      nextRem,
      now
    );
  }
  notifyChange({ type: 'timer_adjust' });
}

export function recoverTimer() {
  const timer = db.prepare('SELECT * FROM timer_state WHERE id = 1').get();
  if (!timer) return;
  const now = Date.now();
  if (timer.phase === 'running' && timer.end_timestamp) {
    const remaining = timer.end_timestamp - now;
    if (remaining <= 0) {
      db.prepare(
        "UPDATE timer_state SET phase = 'time_up', remaining_ms = 0, end_timestamp = NULL, updated_at = ? WHERE id = 1"
      ).run(now);
    } else {
      scheduleRunningCompletion(remaining);
    }
  } else if (timer.phase === 'starting_countdown') {
    db.prepare(
      "UPDATE timer_state SET phase = 'idle', end_timestamp = NULL, countdown_end_timestamp = NULL, updated_at = ? WHERE id = 1"
    ).run(now);
  }
}

export function generateResultsCsv() {
  const state = getFullState();
  const roundHeaders = state.rounds.map((r) => `"${r.name.replace(/"/g, '""')} Score"`);
  const headers = ['Rank', 'Team Name', 'Total Score', 'Correct', 'Incorrect', ...roundHeaders];

  const rows = state.leaderboard.map((team) => {
    const rScores = state.rounds.map((r) => {
      const found = state.roundScores.find((rs) => rs.roundId === r.id && rs.teamId === team.id);
      return found ? found.score : 0;
    });
    return [
      team.rank,
      `"${team.name.replace(/"/g, '""')}"`,
      team.score,
      team.correctCount,
      team.incorrectCount,
      ...rScores,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
