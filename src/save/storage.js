import { SAVE, DEFAULT_SETTINGS, UI } from '../data/settings.js';

export class SaveError extends Error {
  constructor(code) { super(code); this.name = 'SaveError'; this.code = code; }
}
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const counter = (value) => Number.isSafeInteger(value) && value >= 0 && value <= SAVE.maxCounter;
const isoDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function newSave() {
  return {
    version: SAVE.version, updatedAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS },
    scores: [], stats: { runs: 0, bestWave: 0, totalKills: 0, totalScore: 0, totalTime: 0 },
  };
}

export function validateSave(value) {
  const invalid = () => { throw new SaveError('invalidSave'); };
  if (!object(value) || value.version !== SAVE.version || !isoDate(value.updatedAt)) invalid();
  const s = value.settings;
  if (!object(s) || !UI.languages.includes(s.language)
    || typeof s.bgmEnabled !== 'boolean' || typeof s.sfxEnabled !== 'boolean'
    || ![s.bgmVolume, s.sfxVolume].every((v) => Number.isFinite(v) && v >= UI.volumeMin && v <= UI.volumeMax)) invalid();
  if (!object(value.stats) || !['runs', 'bestWave', 'totalKills', 'totalScore', 'totalTime'].every((key) => counter(value.stats[key]))) invalid();
  if (!Array.isArray(value.scores) || value.scores.length > SAVE.maxScores) invalid();
  const scores = value.scores.map((entry) => {
    if (!object(entry) || typeof entry.name !== 'string' || !/^[A-Z0-9]{3}$/.test(entry.name)
      || !['score', 'wave', 'kills', 'time'].every((key) => counter(entry[key])) || !isoDate(entry.date)) invalid();
    return { name: entry.name, score: entry.score, wave: entry.wave, kills: entry.kills, time: entry.time, date: entry.date };
  }).sort((a, b) => b.score - a.score || b.wave - a.wave);
  return {
    version: SAVE.version, updatedAt: value.updatedAt,
    settings: { language: s.language, bgmEnabled: s.bgmEnabled, sfxEnabled: s.sfxEnabled, bgmVolume: s.bgmVolume, sfxVolume: s.sfxVolume },
    scores, stats: Object.fromEntries(['runs', 'bestWave', 'totalKills', 'totalScore', 'totalTime'].map((key) => [key, value.stats[key]])),
  };
}

export function parseSave(text) {
  if (typeof text !== 'string' || text.length > SAVE.maxBytes || !text.trim()) throw new SaveError('invalidSave');
  try {
    const trimmed = text.trim();
    const json = trimmed.startsWith('{') ? trimmed : new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0)));
    if (json.length > SAVE.maxBytes) throw new Error();
    return validateSave(JSON.parse(json));
  } catch { throw new SaveError('invalidSave'); }
}

export function encodeSave(save) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateSave(save)));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

export class SaveStore {
  constructor(storage) {
    this.storage = storage; this.data = newSave(); this.error = null; this.loaded = false;
    try {
      const raw = storage.getItem(SAVE.key);
      if (raw !== null) { this.data = parseSave(raw); this.loaded = true; }
    } catch (error) { this.error = error instanceof SaveError ? error.code : 'storageUnavailable'; }
  }
  persist() {
    const next = validateSave({ ...this.data, updatedAt: new Date().toISOString() });
    try { this.storage.setItem(SAVE.key, JSON.stringify(next)); }
    catch { throw new SaveError('storageUnavailable'); }
    this.data = next; this.error = null;
  }
  import(save) {
    const next = validateSave(save);
    try {
      const current = this.storage.getItem(SAVE.key);
      this.storage.setItem(SAVE.backupKey, current ?? JSON.stringify(this.data));
      this.storage.setItem(SAVE.key, JSON.stringify(next));
    } catch { throw new SaveError('storageUnavailable'); }
    this.data = next; this.error = null;
  }
  recordRun(result, name = SAVE.defaultName) {
    const safeName = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, SAVE.callsignLength).padEnd(SAVE.callsignLength, 'X');
    const entry = { name: safeName, score: Math.floor(result.score), wave: result.wave, kills: result.kills, time: Math.floor(result.time), date: new Date().toISOString() };
    const { stats } = this.data;
    this.data.stats = {
      runs: stats.runs + 1, bestWave: Math.max(stats.bestWave, entry.wave),
      totalKills: stats.totalKills + entry.kills, totalScore: stats.totalScore + entry.score, totalTime: stats.totalTime + entry.time,
    };
    this.data.scores = [...this.data.scores, entry].sort((a, b) => b.score - a.score || b.wave - a.wave).slice(0, SAVE.maxScores);
    return entry;
  }
}
