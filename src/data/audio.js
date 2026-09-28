// All musical timing, dynamics and four-operator voice parameters live here or in each score JSON.
export const AUDIO = Object.freeze({
  tracks: Array.from({ length: 24 }, (_, i) => `track-${String(i + 1).padStart(2, '0')}.json`),
  lookahead: 0.48,
  tickMs: 90,
  startDelay: 0.11,
  maxVoices: 8,
  masterBgm: 0.52,
  masterSfx: 0.30,
  gainRamp: 0.035,
  sfxCooldown: { shot: 0.075, hit: 0.06, explosion: 0.11, pickup: 0.08, shield: 0.14, bomb: 0.25, life: 0.25, upgrade: 0.16, gameover: 0.7 },
  // Velocity is part of each voice; OPM's real-time playNote API has no velocity parameter.
  voices: {
    lead: { version: 1, name: 'lead', algorithm: 4, feedback: 3, modIndex: 3.6, lfo: { rate: 5.2, amDepth: 0.07, pmDepth: 6 }, ops: [
      { ratio: 1, level: 0.55, detune: 0, adsr: { a: 0.008, d: 0.12, s: 0.68, r: 0.11 } },
      { ratio: 2, level: 0.33, detune: 2, adsr: { a: 0.006, d: 0.12, s: 0.38, r: 0.10 } },
      { ratio: 1, level: 0.31, detune: -4, adsr: { a: 0.013, d: 0.19, s: 0.53, r: 0.12 } },
      { ratio: 3, level: 0.23, detune: 0, adsr: { a: 0.005, d: 0.09, s: 0.25, r: 0.08 } }
    ] },
    chord: { version: 1, name: 'chord', algorithm: 5, feedback: 1, modIndex: 2.8, lfo: { rate: 3.4, amDepth: 0.09, pmDepth: 3 }, ops: [
      { ratio: 1, level: 0.27, detune: -3, adsr: { a: 0.025, d: 0.36, s: 0.43, r: 0.20 } },
      { ratio: 2, level: 0.24, detune: 1, adsr: { a: 0.028, d: 0.24, s: 0.33, r: 0.18 } },
      { ratio: 1, level: 0.26, detune: 4, adsr: { a: 0.033, d: 0.34, s: 0.40, r: 0.19 } },
      { ratio: 3, level: 0.17, detune: 0, adsr: { a: 0.021, d: 0.20, s: 0.22, r: 0.14 } }
    ] },
    bass: { version: 1, name: 'bass', algorithm: 2, feedback: 4, modIndex: 4.3, lfo: { rate: 0, amDepth: 0, pmDepth: 0 }, ops: [
      { ratio: 1, level: 0.50, detune: 0, adsr: { a: 0.005, d: 0.14, s: 0.39, r: 0.09 } },
      { ratio: 2, level: 0.35, detune: 0, adsr: { a: 0.004, d: 0.09, s: 0.20, r: 0.08 } },
      { ratio: 0.5, level: 0.31, detune: -2, adsr: { a: 0.004, d: 0.16, s: 0.31, r: 0.09 } },
      { ratio: 4, level: 0.17, detune: 1, adsr: { a: 0.003, d: 0.06, s: 0.12, r: 0.05 } }
    ] },
    kick: { version: 1, name: 'kick', algorithm: 3, feedback: 3, modIndex: 4.8, ops: [
      { ratio: 1, level: 0.58, detune: 0, adsr: { a: 0.001, d: 0.095, s: 0, r: 0.04 } },
      { ratio: 4, level: 0.36, detune: -16, adsr: { a: 0.001, d: 0.028, s: 0, r: 0.02 } },
      { ratio: 0.5, level: 0.28, detune: 0, adsr: { a: 0.001, d: 0.09, s: 0, r: 0.04 } },
      { ratio: 8, level: 0.14, detune: 9, adsr: { a: 0.001, d: 0.02, s: 0, r: 0.01 } }
    ] },
    snare: { version: 1, name: 'snare', algorithm: 7, feedback: 6, modIndex: 9, ops: [
      { ratio: 1, level: 0.20, detune: 0, adsr: { a: 0.001, d: 0.08, s: 0, r: 0.02 } },
      { ratio: 7.19, level: 0.22, detune: 7, adsr: { a: 0.001, d: 0.065, s: 0, r: 0.02 } },
      { ratio: 12.63, level: 0.20, detune: -13, adsr: { a: 0.001, d: 0.05, s: 0, r: 0.02 } },
      { ratio: 4.71, level: 0.13, detune: 6, adsr: { a: 0.001, d: 0.045, s: 0, r: 0.02 } }
    ] },
    hat: { version: 1, name: 'hat', algorithm: 7, feedback: 5, modIndex: 7, ops: [
      { ratio: 9.7, level: 0.10, detune: 7, adsr: { a: 0.001, d: 0.025, s: 0, r: 0.015 } },
      { ratio: 13.3, level: 0.10, detune: -8, adsr: { a: 0.001, d: 0.022, s: 0, r: 0.015 } },
      { ratio: 17.1, level: 0.10, detune: 5, adsr: { a: 0.001, d: 0.02, s: 0, r: 0.015 } },
      { ratio: 21.7, level: 0.08, detune: -7, adsr: { a: 0.001, d: 0.018, s: 0, r: 0.015 } }
    ] },
    fx: { version: 1, name: 'fx', algorithm: 1, feedback: 5, modIndex: 6, lfo: { rate: 9, amDepth: 0.08, pmDepth: 18 }, ops: [
      { ratio: 1, level: 0.47, detune: 0, adsr: { a: 0.002, d: 0.16, s: 0.16, r: 0.08 } },
      { ratio: 3, level: 0.37, detune: 5, adsr: { a: 0.002, d: 0.10, s: 0.11, r: 0.08 } },
      { ratio: 5.07, level: 0.28, detune: -4, adsr: { a: 0.001, d: 0.11, s: 0.08, r: 0.07 } },
      { ratio: 8.13, level: 0.20, detune: 12, adsr: { a: 0.001, d: 0.07, s: 0.03, r: 0.05 } }
    ] }
  },
  sfx: {
    shot: [[84, 0, 0.045, 'fx']],
    hit: [[47, 0, 0.12, 'snare'], [35, 0.035, 0.10, 'kick']],
    explosion: [[36, 0, 0.19, 'kick'], [40, 0.07, 0.17, 'fx'], [31, 0.12, 0.20, 'snare']],
    pickup: [[72, 0, 0.10, 'lead'], [79, 0.09, 0.12, 'lead']],
    shield: [[82, 0, 0.15, 'fx'], [58, 0.07, 0.20, 'snare']],
    bomb: [[40, 0, 0.22, 'kick'], [33, 0.09, 0.33, 'fx'], [29, 0.19, 0.25, 'snare']],
    life: [[67, 0, 0.15, 'lead'], [72, 0.14, 0.15, 'lead'], [79, 0.28, 0.28, 'lead']],
    upgrade: [[64, 0, 0.11, 'fx'], [71, 0.08, 0.12, 'lead'], [76, 0.18, 0.20, 'lead']],
    gameover: [[65, 0, 0.24, 'lead'], [62, 0.23, 0.25, 'lead'], [57, 0.46, 0.28, 'lead'], [45, 0.74, 0.40, 'bass']]
  }
});
