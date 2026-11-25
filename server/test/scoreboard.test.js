import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreboard-test-'));
process.env.SCOREBOARD_DATA_DIR = tmpDir;

const { initDatabase, seedDefaultData } = await import('../db.js');
const store = await import('../store.js');

describe('Quiz Scoreboard Store', () => {
  beforeEach(() => {
    initDatabase();
    seedDefaultData();
  });

  it('initializes with default teams, rounds, and competition', () => {
    const state = store.getFullState();
    assert.equal(state.teams.length, 4);
    assert.equal(state.rounds.length, 3);
    assert.equal(state.competition.currentQuestionNumber, 1);
    assert.equal(state.timer.phase, 'idle');
  });

  it('adjusts scores, prevents accidental negative scores, and supports undo/redo', () => {
    const initial = store.getFullState();
    const t1 = initial.teams[0].id;

    // Negative clamp when allowNegativeScores is false
    const clamped = store.adjustScore(t1, -10);
    assert.equal(clamped, null);
    assert.equal(store.getFullState().teams[0].score, 0);

    // Positive score
    store.adjustScore(t1, 20);
    let s = store.getFullState();
    assert.equal(s.teams[0].score, 20);
    assert.equal(s.teams[0].correctCount, 1);
    assert.equal(s.canUndo, true);

    // Undo
    assert.equal(store.undoScore(), true);
    s = store.getFullState();
    assert.equal(s.teams[0].score, 0);
    assert.equal(s.teams[0].correctCount, 0);
    assert.equal(s.canRedo, true);

    // Redo
    assert.equal(store.redoScore(), true);
    s = store.getFullState();
    assert.equal(s.teams[0].score, 20);
    assert.equal(s.teams[0].correctCount, 1);
  });

  it('computes tied leaderboard rankings accurately', () => {
    const s = store.getFullState();
    const [t1, t2, t3, t4] = s.teams;
    store.adjustScore(t1.id, 30);
    store.adjustScore(t2.id, 50);
    store.adjustScore(t3.id, 50);
    store.adjustScore(t4.id, 10);

    const lb = store.getFullState().leaderboard;
    assert.equal(lb[0].rank, 1);
    assert.equal(lb[1].rank, 1);
    assert.equal(lb[2].rank, 3);
    assert.equal(lb[3].rank, 4);
  });

  it('manages rounds, round-wise scores, and CSV export', () => {
    const s = store.getFullState();
    const t1 = s.teams[0].id;
    store.adjustScore(t1, 25);
    store.completeCurrentRound();
    assert.equal(store.getFullState().competition.status, 'round_complete');

    store.nextRound();
    const afterNext = store.getFullState();
    assert.equal(afterNext.competition.status, 'active');
    assert.equal(afterNext.competition.currentRoundId, afterNext.rounds[1].id);

    const csv = store.generateResultsCsv();
    assert.match(csv, /Rank,Team Name,Total Score/);
    assert.match(csv, /"Team Alpha",25/);
  });

  it('handles timestamp-based timer start, pause, resume, adjust, and reset', () => {
    store.updateSettings({ startingCountdownDuration: 0 });
    store.resetTimer(30);
    store.startTimer();

    let t = store.getFullState().timer;
    assert.equal(t.phase, 'running');
    assert.ok(t.endTimestamp > Date.now());

    store.pauseTimer();
    t = store.getFullState().timer;
    assert.equal(t.phase, 'paused');
    assert.ok(t.remainingMs > 28000 && t.remainingMs <= 30000);

    store.adjustTimer(10);
    t = store.getFullState().timer;
    assert.ok(t.remainingMs > 38000 && t.remainingMs <= 40000);

    store.resumeTimer();
    t = store.getFullState().timer;
    assert.equal(t.phase, 'running');

    store.resetTimer(60);
    t = store.getFullState().timer;
    assert.equal(t.phase, 'idle');
    assert.equal(t.remainingMs, 60000);
  });
});
