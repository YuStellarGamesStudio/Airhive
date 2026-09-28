export const SAVE = Object.freeze({
  key: 'airhive-save-v1', backupKey: 'airhive-save-backup', version: 1,
  maxBytes: 131072, maxScores: 10, callsignLength: 3, maxCounter: Number.MAX_SAFE_INTEGER,
  defaultName: 'ACE',
});
export const DEFAULT_SETTINGS = Object.freeze({
  language: 'en', bgmEnabled: true, sfxEnabled: true, bgmVolume: 60, sfxVolume: 70,
});
export const UI = Object.freeze({
  languages: ['en', 'zh', 'ja'], maxFrame: 0.1, hudInterval: 0.08,
  volumeMin: 0, volumeMax: 100, previewScores: 3, pickupNotice: 2.4,
  tapStep: 42, tapDuration: 0.18,
});
