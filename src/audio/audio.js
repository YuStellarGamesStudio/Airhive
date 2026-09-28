import { OPM } from '../vendor/opm/dist/api/index.js';
import { AUDIO } from '../data/audio.js';
import { DEFAULT_SETTINGS } from '../data/settings.js';
import { ASSET_URLS } from '../data/assets.js';


export class AudioManager {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.ready = false;
    this.currentTrack = null;
    this.onError = null;
    this.error = null;
    this.bgm = null;
    this.effects = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.timer = null;
    this.startPromise = null;
    this.generation = 0;
    this.queue = [];
    this.lastIndex = -1;
    this.lastEffect = Object.create(null);
    this.nextScore = null;
    this.score = null;
    this.step = 0;
    this.bar = 0;
    this.section = 0;
    this.nextTime = 0;
  }

  // Call synchronously from a click handler; OPM.start creates and resumes its
  // AudioContext inside this call, before any fetch or other awaited work.
  unlock() {
    if (this.startPromise) return this.startPromise;
    if (this.ready) {
      const resumed = Promise.all([this.bgm.context.resume(), this.effects.context.resume()]);
      if (!this.error) return resumed.then(() => undefined);
      const generation = this.generation;
      this.startPromise = resumed.then(() => this.startMusic(generation))
        .catch((error) => { this.fail(error, generation); throw error; })
        .finally(() => { if (generation === this.generation) this.startPromise = null; });
      return this.startPromise;
    }
    const generation = ++this.generation;
    this.error = null;
    clearInterval(this.timer);
    this.bgm?.close();
    this.effects?.close();
    this.nextScore = null;
    this.score = null;
    this.step = this.bar = this.section = 0;
    this.lastEffect = Object.create(null);
    this.bgm = new OPM();
    this.effects = new OPM();
    const bgm = this.bgm;
    const effects = this.effects;
    for (const [name, voice] of Object.entries(AUDIO.voices)) {
      this.bgm.loadVoice(name, voice);
      this.effects.loadVoice(name, voice);
    }
    const bgmStart = this.bgm.start();
    const effectsStart = this.effects.start();
    this.startPromise = (async () => {
      try {
        await Promise.all([bgmStart, effectsStart]);
        if (generation !== this.generation) {
          await Promise.allSettled([bgm.close(), effects.close()]);
          return;
        }
        this.bgmGain = this.bgm.context.createGain();
        this.sfxGain = this.effects.context.createGain();
        this.bgm.node.disconnect();
        this.effects.node.disconnect();
        this.bgm.node.connect(this.bgmGain);
        this.effects.node.connect(this.sfxGain);
        this.bgmGain.connect(this.bgm.context.destination);
        this.sfxGain.connect(this.effects.context.destination);
        this.setSettings(this.settings);
        this.ready = true;
        await this.startMusic(generation);
      } catch (error) {
        if (this.ready && generation === this.generation) {
          this.fail(error, generation);
          throw error;
        }
        await Promise.allSettled([bgmStart, effectsStart]);
        await Promise.allSettled([bgm.close(), effects.close()]);
        if (generation === this.generation) {
          this.error = error;
          this.ready = false;
          this.bgm = null;
          this.effects = null;
        }
        throw error;
      } finally {
        if (generation === this.generation) this.startPromise = null;
      }
    })();
    return this.startPromise;
  }

  async startMusic(generation) {
    const first = await this.loadScore(this.takeTrack());
    if (generation !== this.generation) return;
    this.error = null;
    this.nextScore = null;
    this.score = first;
    this.step = this.bar = this.section = 0;
    this.currentTrack = { id: first.id, title: first.title };
    this.nextTime = this.bgm.context.currentTime + AUDIO.startDelay;
    this.setSettings(this.settings);
    this.timer = setInterval(() => this.schedule(), AUDIO.tickMs);
    this.schedule();
  }

  setSettings(settings = {}) {
    this.settings = { ...this.settings, ...settings };
    for (const [name, gain, context, master] of [
      ['bgm', this.bgmGain, this.bgm?.context, AUDIO.masterBgm],
      ['sfx', this.sfxGain, this.effects?.context, AUDIO.masterSfx]
    ]) {
      if (!gain || !context) continue;
      const value = Number(this.settings[`${name}Volume`]);
      const level = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;
      const target = this.settings[`${name}Enabled`] ? master * level : 0;
      gain.gain.setTargetAtTime(target, context.currentTime, AUDIO.gainRamp);
    }
  }

  sfx(eventType) {
    if (!this.ready || !this.settings.sfxEnabled || !AUDIO.sfx[eventType]) return;
    const now = this.effects.context.currentTime;
    if (now - (this.lastEffect[eventType] ?? -Infinity) < AUDIO.sfxCooldown[eventType]) return;
    this.lastEffect[eventType] = now;
    for (const [note, time, duration, voice] of AUDIO.sfx[eventType]) {
      this.effects.playNote({ voice, note, time, duration });
    }
  }

  takeTrack() {
    if (!this.queue.length) {
      this.queue = AUDIO.tracks.map((_, index) => index);
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
      if (this.queue[0] === this.lastIndex) {
        [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
      }
    }
    this.lastIndex = this.queue.shift();
    return this.lastIndex;
  }

  async loadScore(index) {
    const url = new URL(`../../${ASSET_URLS[`assets/audios/${AUDIO.tracks[index]}`]}`, import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Music asset ${url.pathname}: HTTP ${response.status}`);
    const score = await response.json();
    if (!score || score.id !== AUDIO.tracks[index].replace('.json', '') ||
        !Number.isFinite(score.bpm) || score.bpm <= 0 ||
        !Number.isInteger(score.tonic) || !Array.isArray(score.sections) || !score.sections.length) {
      throw new Error(`Invalid music score: ${url.pathname}`);
    }
    return score;
  }

  // A worklet note's time is a delay from *now*, not an AudioContext timestamp.
  play(voice, note, time, duration) {
    if (Number.isInteger(note) && note >= 0 && note <= 127) {
      this.bgm.playNote({ voice, note, time: Math.max(0, time - this.bgm.context.currentTime), duration });
    }
  }

  schedule() {
    if (!this.ready || !this.score) return;
    try {
      const horizon = this.bgm.context.currentTime + AUDIO.lookahead;
      // Hidden tabs throttle timers. Resume the phrase instead of queuing stale notes.
      if (this.nextTime < this.bgm.context.currentTime - AUDIO.lookahead)
        this.nextTime = this.bgm.context.currentTime + AUDIO.startDelay;
      while (this.nextTime < horizon) {
        const section = this.score.sections[this.section];
        const beat = 60 / this.score.bpm;
        const sixteenth = beat / 4;
        const root = this.score.tonic + section.harmony[this.bar % section.harmony.length];
        const lead = section.melody[this.step];
        if (lead >= 0) this.play('lead', this.score.tonic + lead, this.nextTime, sixteenth * 0.78);
        if (this.step === 0) {
          this.play('chord', root + 12, this.nextTime, beat * 3.55);
          this.play('chord', root + (this.score.mode === 'major' ? 16 : 15), this.nextTime, beat * 3.55);
        }
        if (this.step % 2 === 0) {
          const bass = section.bass[this.step / 2];
          if (bass >= 0) this.play('bass', root - 12 + bass, this.nextTime, beat * 0.39);
        }
        const drums = section.percussion;
        if (drums.kick.includes(this.step)) this.play('kick', 38, this.nextTime, 0.09);
        if (drums.snare.includes(this.step)) this.play('snare', 56, this.nextTime, 0.07);
        if (drums.hat.includes(this.step)) this.play('hat', 88, this.nextTime, 0.035);
        this.nextTime += sixteenth;
        this.step++;
        if (this.step === 16) {
          this.step = 0;
          this.bar++;
          if (this.bar === section.bars) {
            this.bar = 0;
            this.section++;
            if (this.section === this.score.sections.length) {
              this.section = 0;
              this.score = null;
              this.nextScore ??= this.loadScore(this.takeTrack());
              const generation = this.generation;
              this.nextScore.then(score => {
                if (generation !== this.generation) return;
                this.nextScore = null;
                this.score = score;
                this.currentTrack = { id: score.id, title: score.title };
                this.schedule();
              }).catch(error => this.fail(error, generation));
              break;
            }
          }
        }
      }
    } catch (error) {
      this.fail(error, this.generation);
    }
  }

  fail(error, generation) {
    if (generation !== this.generation) return;
    this.error = error;
    this.score = null;
    this.nextScore = null;
    this.currentTrack = null;
    clearInterval(this.timer);
    this.timer = null;
    this.bgmGain?.gain.setTargetAtTime(0, this.bgm.context.currentTime, AUDIO.gainRamp);
    if (typeof this.onError === 'function') this.onError(error);
  }

  destroy() {
    ++this.generation;
    clearInterval(this.timer);
    this.timer = null;
    this.ready = false;
    this.currentTrack = null;
    this.score = null;
    this.nextScore = null;
    const pending = this.startPromise;
    this.startPromise = null;
    const bgm = this.bgm;
    const effects = this.effects;
    this.bgm = null;
    this.effects = null;
    this.bgmGain = null;
    this.sfxGain = null;
    return Promise.allSettled([pending, bgm?.close(), effects?.close()]);
  }
}
