import { GAME } from '../data/game.js';

export class EnemyPlanner {
  constructor({ hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
    WorkerClass = globalThis.Worker } = {}) {
    this.workers = [];
    this.ready = new Map();
    this.inflight = new Set();
    this.queue = [];
    this.attackQueue = [];
    this.attackPending = null;
    this.windowStart = 0;
    this.windowEnd = 0;
    this.nextId = 0;
    this.disposed = false;
    const count = Number.isInteger(hardwareConcurrency) && hardwareConcurrency > 1 && WorkerClass
      ? Math.min(GAME.spawnPlanning.maxWorkers, hardwareConcurrency - 1) : 0;
    try {
      for (let n = 0; n < count; n++) {
        const worker = new WorkerClass(new URL('./enemy-worker.js', import.meta.url), { type: 'module' });
        const slot = { worker, job: null, timeout: null };
        this.workers.push(slot);
        worker.onmessage = (event) => this._receive(slot, event.data);
        worker.onerror = () => this._fail();
        worker.onmessageerror = () => this._fail();
      }
      this._window(1);
    } catch {
      this._fail();
    }
  }

  get workerCount() { return this.workers.length; }

  get(wave) {
    if (this.disposed || !Number.isSafeInteger(wave) || wave < 1) return null;
    if (wave !== this.windowStart) this._window(wave);
    return this.ready.get(wave) ?? null;
  }

  attack(batch) {
    if (this.disposed || !this.workerCount || this.attackPending || !Array.isArray(batch?.enemies)) return null;
    if (!batch.enemies.length) return Promise.resolve([]);
    const count = Math.min(this.workerCount, Math.max(1, Math.floor(batch.enemies.length / 8)));
    const size = Math.ceil(batch.enemies.length / count);
    const parts = Math.ceil(batch.enemies.length / size);
    const promise = new Promise(resolve => {
      this.attackPending = { resolve, remaining: parts, parts: new Array(parts) };
    });
    for (let offset = 0; offset < batch.enemies.length; offset += size) {
      this.attackQueue.push({ kind: 'attacks', index: offset / size, batch: { wave: batch.wave,
        player: batch.player, enemies: batch.enemies.slice(offset, offset + size) } });
    }
    this._drain();
    return promise;
  }

  _window(wave) {
    this.windowStart = wave;
    this.windowEnd = Math.min(Number.MAX_SAFE_INTEGER, wave + GAME.spawnPlanning.lookahead - 1);
    for (const key of this.ready.keys()) if (key < wave || key > this.windowEnd) this.ready.delete(key);
    this.queue.length = 0;
    if (!this.workerCount) return;
    for (let n = wave; n <= this.windowEnd; n++) {
      if (n % GAME.wave.bossEvery && !this.ready.has(n) && !this.inflight.has(n)) this.queue.push(n);
    }
    this._drain();
  }

  _drain() {
    for (const slot of this.workers) {
      if (slot.job) continue;
      const job = this.attackQueue.shift() ??
        (this.queue.length ? { kind: 'wave', wave: this.queue.shift() } : null);
      if (!job) continue;
      job.id = ++this.nextId;
      slot.job = job;
      if (job.kind === 'wave') this.inflight.add(job.wave);
      slot.timeout = setTimeout(() => this._fail(), GAME.spawnPlanning.jobTimeout);
      try {
        slot.worker.postMessage(job.kind === 'wave'
          ? { kind: job.kind, id: job.id, wave: job.wave }
          : { kind: job.kind, id: job.id, batch: job.batch });
      } catch { this._fail(); return; }
    }
  }

  _receive(slot, data) {
    if (this.disposed || !this.workerCount || !slot.job) return;
    const job = slot.job;
    if (!data || data.id !== job.id || data.kind !== job.kind) { this._fail(); return; }
    if (job.kind === 'wave') {
      if (data.wave !== job.wave || !(data.buffer instanceof ArrayBuffer) ||
        data.buffer.byteLength % (Float64Array.BYTES_PER_ELEMENT * 3)) {
        this._fail(); return;
      }
      if (job.wave >= this.windowStart && job.wave <= this.windowEnd)
        this.ready.set(job.wave, new Float64Array(data.buffer));
      this.inflight.delete(job.wave);
    } else {
      if (!Array.isArray(data.results)) { this._fail(); return; }
      const pending = this.attackPending;
      pending.parts[job.index] = data.results;
      if (!--pending.remaining) {
        this.attackPending = null;
        pending.resolve(pending.parts.flat());
      }
    }
    clearTimeout(slot.timeout);
    slot.timeout = null;
    slot.job = null;
    this._drain();
  }

  _fail() {
    const pending = this.attackPending;
    this.attackPending = null;
    this.attackQueue.length = 0;
    for (const slot of this.workers) {
      clearTimeout(slot.timeout);
      slot.timeout = null;
      slot.job = null;
      try { slot.worker.terminate(); } catch { /* Termination must not prevent synchronous fallback. */ }
    }
    this.workers.length = 0;
    this.queue.length = 0;
    this.inflight.clear();
    this.ready.clear();
    pending?.resolve(null);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._fail();
  }
}
