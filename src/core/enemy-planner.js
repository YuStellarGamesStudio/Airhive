import { GAME } from '../data/game.js';
import { WebGPUPlanner } from './webgpu-planner.js';

export class EnemyPlanner {
  constructor({ hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
    WorkerClass = globalThis.Worker, gpu = globalThis.navigator?.gpu,
    GPUPlannerClass = WebGPUPlanner } = {}) {
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
    this.gpu = null;
    this.gpuSlot = { job: null, timeout: null };
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
    this.gpuReady = this._initGPU(gpu, GPUPlannerClass);
  }

  get workerCount() { return this.workers.length; }

  get mode() { return this.gpu?.available ? 'webgpu' : this.workerCount ? 'cpu-workers' : 'cpu'; }

  async _initGPU(gpu, GPUPlannerClass) {
    try {
      const backend = new GPUPlannerClass({ gpu, onUnavailable: () => this._gpuFailed() });
      this.gpu = backend;
      const ready = await backend.ready;
      if (this.disposed || this.gpu !== backend) { backend.dispose(); return false; }
      if (!ready || !backend.available) { this._gpuFailed(); return false; }
      this._window(this.windowStart || 1);
      return true;
    } catch {
      this._gpuFailed();
      return false;
    }
  }

  get(wave) {
    if (this.disposed || !Number.isSafeInteger(wave) || wave < 1) return null;
    if (wave !== this.windowStart) this._window(wave);
    return this.ready.get(wave) ?? null;
  }

  attack(batch) {
    if (this.disposed || (!this.workerCount && !this.gpu?.available) ||
      this.attackPending || !Array.isArray(batch?.enemies)) return null;
    if (!batch.enemies.length) return Promise.resolve([]);
    const count = this.gpu?.available ? 1 :
      Math.min(this.workerCount, Math.max(1, Math.floor(batch.enemies.length / 8)));
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
    if (!this.workerCount && !this.gpu?.available) return;
    for (let n = wave; n <= this.windowEnd; n++) {
      if (n % GAME.wave.bossEvery && !this.ready.has(n) && !this.inflight.has(n)) this.queue.push(n);
    }
    this._drain();
  }

  _takeJob(slot) {
    const job = this.attackQueue.shift() ??
      (this.queue.length ? { kind: 'wave', wave: this.queue.shift() } : null);
    if (!job) return null;
    job.id = ++this.nextId;
    slot.job = job;
    if (job.kind === 'wave') this.inflight.add(job.wave);
    slot.timeout = setTimeout(() => {
      if (slot === this.gpuSlot) this._gpuFailed();
      else this._fail();
    }, GAME.spawnPlanning.jobTimeout);
    return job;
  }

  _drain() {
    if (this.disposed) return;
    if (this.gpu?.available) {
      const slot = this.gpuSlot;
      if (slot.job) return;
      const job = this._takeJob(slot);
      if (!job) return;
      const backend = this.gpu;
      try {
        const calculation = job.kind === 'wave' ? backend.planWave(job.wave) : backend.planAttacks(job.batch);
        Promise.resolve(calculation).then(result => {
          if (this.gpu !== backend || slot.job !== job) return;
          this._receive(slot, job.kind === 'wave'
            ? { kind: job.kind, id: job.id, wave: job.wave, buffer: result.buffer }
            : { kind: job.kind, id: job.id, results: result });
        }).catch(() => {
          if (this.gpu === backend && slot.job === job) this._gpuFailed();
        });
      } catch { this._gpuFailed(); }
      return;
    }
    for (const slot of this.workers) {
      if (slot.job) continue;
      const job = this._takeJob(slot);
      if (!job) continue;
      try {
        slot.worker.postMessage(job.kind === 'wave'
          ? { kind: job.kind, id: job.id, wave: job.wave }
          : { kind: job.kind, id: job.id, batch: job.batch });
      } catch { this._fail(); return; }
    }
  }

  _receive(slot, data) {
    if (this.disposed || !slot.job) return;
    const job = slot.job;
    const fail = () => slot === this.gpuSlot ? this._gpuFailed() : this._fail();
    if (!data || data.id !== job.id || data.kind !== job.kind) { fail(); return; }
    if (job.kind === 'wave') {
      if (data.wave !== job.wave || !(data.buffer instanceof ArrayBuffer) ||
        data.buffer.byteLength % (Float64Array.BYTES_PER_ELEMENT * 3)) {
        fail(); return;
      }
      if (job.wave >= this.windowStart && job.wave <= this.windowEnd)
        this.ready.set(job.wave, new Float64Array(data.buffer));
      this.inflight.delete(job.wave);
    } else {
      if (!Array.isArray(data.results)) { fail(); return; }
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

  _requeue(job) {
    if (!job) return;
    if (job.kind === 'attacks') {
      if (this.attackPending) this.attackQueue.unshift(job);
    } else {
      this.inflight.delete(job.wave);
      if (job.wave >= this.windowStart && job.wave <= this.windowEnd && !this.ready.has(job.wave))
        this.queue.unshift(job.wave);
    }
  }

  _gpuFailed() {
    const backend = this.gpu;
    this.gpu = null;
    const slot = this.gpuSlot, job = slot.job;
    clearTimeout(slot.timeout);
    slot.timeout = slot.job = null;
    try { backend?.dispose(); } catch { /* CPU fallback must survive GPU cleanup failure. */ }
    if (this.disposed) return;
    // Replay the same snapshot, not a new game step; late GPU completions are ignored.
    this._requeue(job);
    if (this.workerCount) this._drain();
    else this._fail();
  }

  _fail() {
    for (const slot of this.workers) {
      clearTimeout(slot.timeout);
      this._requeue(slot.job);
      slot.timeout = slot.job = null;
      try { slot.worker.terminate(); } catch { /* Termination must not prevent fallback. */ }
    }
    this.workers.length = 0;
    if (!this.disposed && this.gpu?.available) { this._drain(); return; }
    const pending = this.attackPending;
    this.attackPending = null;
    this.attackQueue.length = 0;
    this.queue.length = 0;
    this.inflight.clear();
    this.ready.clear();
    pending?.resolve(null);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._gpuFailed();
    this._fail();
  }
}
