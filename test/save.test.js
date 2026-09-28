import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore, newSave, validateSave, parseSave, encodeSave } from '../src/save/storage.js';
import { SAVE } from '../src/data/settings.js';
import { detectLanguage } from '../src/i18n/index.js';

function storage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('save-code roundtrip preserves records and import backs up the replaced file', () => {
  const device = storage(); const store = new SaveStore(device);
  store.recordRun({ score: 12780, wave: 8, kills: 76, time: 253.8 }, 'sky'); store.persist();
  const original = device.getItem(SAVE.key);
  const imported = parseSave(encodeSave(store.data));
  imported.settings.language = 'ja'; imported.settings.bgmVolume = 0;
  store.import(imported);
  assert.equal(device.getItem(SAVE.backupKey), original);
  assert.equal(store.data.scores[0].name, 'SKY');
  assert.equal(store.data.scores[0].time, 253);
  assert.equal(new SaveStore(device).data.settings.bgmVolume, 0);
  assert.deepEqual(JSON.parse(device.getItem(SAVE.key)), imported);
});

test('invalid imports and failed backup writes cannot replace current records', () => {
  const device = storage(); const store = new SaveStore(device); store.persist();
  const original = device.getItem(SAVE.key);
  for (const text of ['', 'not a code', '{"version":99}', 'e30=', 'x'.repeat(SAVE.maxBytes + 1)]) {
    assert.throws(() => store.import(parseSave(text)), /invalidSave/);
    assert.equal(device.getItem(SAVE.key), original);
  }
  const incoming = newSave(); incoming.stats.runs = 9;
  const originalState = store.data;
  device.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => store.import(incoming), /storageUnavailable/);
  assert.equal(device.getItem(SAVE.key), original); assert.equal(store.data, originalState);
});

test('leaderboard keeps the best ten, counts every run once, and stores safe callsigns', () => {
  const store = new SaveStore(storage());
  for (let i = 0; i < 14; i++) store.recordRun({ score: i * 1000, wave: i + 1, kills: 1, time: 30 }, i === 13 ? '<b>' : 'ACE');
  store.persist();
  assert.equal(store.data.scores.length, 10); assert.equal(store.data.scores[0].score, 13000);
  assert.equal(store.data.scores[0].name, 'BXX'); assert.equal(store.data.scores.at(-1).score, 4000);
  assert.equal(store.data.stats.runs, 14); assert.equal(store.data.stats.totalKills, 14);
  assert.equal(store.data.stats.bestWave, 14);
});

test('save schema rejects unsafe numbers and unsupported settings', () => {
  for (const mutate of [
    (s) => { s.stats.runs = -1; }, (s) => { s.stats.totalScore = Number.MAX_SAFE_INTEGER + 1; },
    (s) => { s.settings.bgmVolume = NaN; }, (s) => { s.settings.sfxVolume = 101; },
    (s) => { s.settings.bgmEnabled = 'false'; }, (s) => { s.settings.language = 'xx'; },
    (s) => { s.updatedAt = 'not a date'; },
  ]) { const save = newSave(); mutate(save); assert.throws(() => validateSave(save), /invalidSave/); }
});

test('language selection follows URL, saved preference, browser, then English', () => {
  assert.equal(detectLanguage('ja', 'zh', 'en-US'), 'zh');
  assert.equal(detectLanguage('ja', 'invalid', 'zh-TW'), 'ja');
  assert.equal(detectLanguage(null, null, 'zh-TW'), 'zh');
  assert.equal(detectLanguage(null, null, 'ja-JP'), 'ja');
  assert.equal(detectLanguage(null, null, 'de-DE'), 'en');
});
