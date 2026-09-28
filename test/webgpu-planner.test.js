import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyPlanner } from '../src/core/enemy-planner.js';
import { WebGPUPlanner } from '../src/core/webgpu-planner.js';
import { planWave } from '../src/core/wave-plan.js';
import { planAttacks } from '../src/core/attack-plan.js';
import { GAME } from '../src/data/game.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class ControlledGPU {
  static instances = [];
  constructor({ onUnavailable }) {
    this.onUnavailable = onUnavailable;
    this.initialization = deferred();
    this.ready = this.initialization.promise;
    this.available = false;
    this.jobs = [];
    this.disposed = false;
    ControlledGPU.instances.push(this);
  }
  initialize(available = true) {
    this.available = available;
    this.initialization.resolve(available);
  }
  rejectInitialization() { this.initialization.reject(Error('adapter unavailable')); }
  planWave(wave) {
    const completion = deferred();
    this.jobs.push({ kind: 'wave', wave, completion });
    return completion.promise;
  }
  planAttacks(batch) {
    const completion = deferred();
    this.jobs.push({ kind: 'attacks', batch, completion });
    return completion.promise;
  }
  finish(result) {
    const job = this.jobs.shift();
    assert.ok(job, 'GPU has a queued computation');
    job.completion.resolve(result ?? (job.kind === 'wave' ? planWave(job.wave) : planAttacks(job.batch)));
    return job;
  }
  lose() {
    this.available = false;
    this.onUnavailable(Error('device lost'));
  }
  dispose() { this.disposed = true; }
}

class ControlledWorker {
  static instances = [];
  constructor() {
    this.jobs = [];
    this.terminated = false;
    ControlledWorker.instances.push(this);
  }
  postMessage(job) { this.jobs.push(job); }
  terminate() { this.terminated = true; }
  complete() {
    const job = this.jobs.shift();
    assert.ok(job, 'CPU worker has a queued computation');
    if (job.kind === 'wave') {
      this.onmessage({ data: { kind: job.kind, id: job.id, wave: job.wave,
        buffer: planWave(job.wave).buffer } });
    } else {
      this.onmessage({ data: { kind: job.kind, id: job.id, results: planAttacks(job.batch) } });
    }
    return job;
  }
}

const attacker = id => ({ id, boss: false, behavior: 'scatter', x: 90 + id * 23, y: 140,
  w: 42, h: 36, damage: 10, age: 5, phase: 0, shotTimer: 3, actionTimer: 1,
  summonTimer: 0, burst: 0, diving: false, invisible: false });
const batch = (ids = [7, 2, 9]) => ({ wave: 21, player: { x: 480, y: 488 },
  enemies: ids.map(attacker) });

function create({ workers = 1, gpu = {} } = {}) {
  ControlledGPU.instances = [];
  ControlledWorker.instances = [];
  const planner = new EnemyPlanner({ hardwareConcurrency: workers + 1,
    WorkerClass: workers ? ControlledWorker : null, gpu, GPUPlannerClass: ControlledGPU });
  return { planner, gpuPlanner: ControlledGPU.instances[0], worker: ControlledWorker.instances[0] };
}

async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function completeUntilAttack(worker) {
  for (let i = 0; i < GAME.spawnPlanning.lookahead + 3; i++) {
    if (worker.jobs[0]?.kind === 'attacks') return worker.complete();
    worker.complete();
  }
  assert.fail('pending attack did not reach the CPU worker');
}

test('CPU workers produce playable wave and attack results before GPU initialization resolves', async () => {
  const { planner, gpuPlanner, worker } = create();
  try {
    assert.equal(planner.mode, 'cpu-workers');
    assert.equal(planner.workerCount, 1);
    assert.equal(planner.get(1), null);
    worker.complete();
    assert.deepEqual(planner.get(1), planWave(1));
    const input = batch();
    const pending = planner.attack(input);
    assert.ok(pending instanceof Promise);
    completeUntilAttack(worker);
    assert.deepEqual(await pending, planAttacks(input));
    assert.equal(gpuPlanner.jobs.length, 0);
    gpuPlanner.initialize();
    assert.equal(await planner.gpuReady, true);
    assert.equal(planner.mode, 'webgpu');
  } finally { planner.dispose(); }
});

test('unavailable or rejected GPU startup keeps CPU workers usable', async () => {
  for (const reject of [false, true]) {
    const { planner, gpuPlanner, worker } = create();
    try {
      if (reject) gpuPlanner.rejectInitialization();
      else gpuPlanner.initialize(false);
      assert.equal(await planner.gpuReady, false);
      assert.equal(planner.mode, 'cpu-workers');
      const input = batch([4, 1]);
      const pending = planner.attack(input);
      completeUntilAttack(worker);
      assert.deepEqual(await pending, planAttacks(input));
      assert.equal(planner.workerCount, 1);
      assert.deepEqual(planner.get(1), planWave(1));
    } finally { planner.dispose(); }
  }
});

test('GPU device loss replays the in-flight attack once on CPU and drops late GPU output', async () => {
  const { planner, gpuPlanner, worker } = create();
  try {
    gpuPlanner.initialize();
    assert.equal(await planner.gpuReady, true);
    const input = batch([8, 3, 11, 2]);
    const pending = planner.attack(input);
    assert.ok(pending instanceof Promise);
    // A lookahead wave may already own the GPU. It must not starve the attack.
    if (gpuPlanner.jobs[0]?.kind === 'wave') { gpuPlanner.finish(); await flush(); }
    assert.equal(gpuPlanner.jobs[0]?.kind, 'attacks');
    const obsolete = gpuPlanner.jobs[0];
    gpuPlanner.lose();
    assert.equal(planner.mode, 'cpu-workers');
    completeUntilAttack(worker);
    assert.deepEqual(await pending, planAttacks(input));
    assert.equal(planner.workerCount, 1);
    obsolete.completion.resolve([{ id: -1, commands: [{ type: 'spawn', enemyType: 'E1' }] }]);
    await flush();
    const next = batch([12, 5]);
    const subsequent = planner.attack(next);
    completeUntilAttack(worker);
    assert.deepEqual(await subsequent, planAttacks(next));
    assert.equal(planner.mode, 'cpu-workers');
  } finally { planner.dispose(); }
});

test('obsolete GPU wave results stay outside the current planning window', async () => {
  const { planner, gpuPlanner, worker } = create();
  try {
    gpuPlanner.initialize();
    assert.equal(await planner.gpuReady, true);
    assert.equal(planner.get(1), null);
    assert.equal(gpuPlanner.jobs[0]?.kind, 'wave');
    const obsoleteWave = gpuPlanner.jobs[0].wave;
    planner.get(101);
    gpuPlanner.lose();
    gpuPlanner.finish(); // A stale completion must not restore an obsolete wave.
    await flush();
    assert.equal(planner.get(101), null);
    assert.equal(planner.ready.has(obsoleteWave), false);
    for (let i = 0; i < GAME.spawnPlanning.lookahead + 3 && !planner.get(101); i++) worker.complete();
    assert.deepEqual(planner.get(101), planWave(101));
    assert.equal(planner.ready.has(obsoleteWave), false);
  } finally { planner.dispose(); }
});

test('GPU wave failure requeues an in-window wave on the CPU pool', async () => {
  const { planner, gpuPlanner, worker } = create();
  try {
    gpuPlanner.initialize();
    assert.equal(await planner.gpuReady, true);
    const missingWave = gpuPlanner.jobs[0]?.wave;
    gpuPlanner.jobs[0].completion.reject(Error('GPU computation failed'));
    await flush();
    assert.equal(planner.mode, 'cpu-workers');
    worker.complete();
    assert.equal(worker.jobs[0]?.wave, missingWave);
    worker.complete();
    assert.deepEqual(planner.get(missingWave), planWave(missingWave));
  } finally { planner.dispose(); }
});

test('GPU prioritizes an attack over wave lookahead and preserves combat result order', async () => {
  const { planner, gpuPlanner } = create({ workers: 0 });
  try {
    gpuPlanner.initialize();
    assert.equal(await planner.gpuReady, true);
    assert.equal(planner.mode, 'webgpu');
    assert.equal(planner.get(21), null);
    assert.equal(gpuPlanner.jobs[0]?.kind, 'wave');
    const input = batch([17, 3, 13, 1, 9, 4, 12, 6, 5, 2]);
    const pending = planner.attack(input);
    assert.ok(pending instanceof Promise);
    gpuPlanner.finish();
    await flush();
    assert.equal(gpuPlanner.jobs[0]?.kind, 'attacks');
    gpuPlanner.finish();
    assert.deepEqual(await pending, planAttacks(input));
    assert.equal(gpuPlanner.jobs[0]?.kind, 'wave');
    assert.equal(gpuPlanner.finish().wave, 21);
    await flush();
    assert.deepEqual(planner.get(21), planWave(21));
  } finally { planner.dispose(); }
});

test('disposing during GPU initialization or computation settles attacks without reviving workers', async () => {
  for (const inflight of [false, true]) {
    const { planner, gpuPlanner, worker } = create();
    const input = batch();
    let pending;
    if (inflight) {
      gpuPlanner.initialize();
      assert.equal(await planner.gpuReady, true);
      pending = planner.attack(input);
      if (gpuPlanner.jobs[0]?.kind === 'wave') { gpuPlanner.finish(); await flush(); }
      assert.equal(gpuPlanner.jobs[0]?.kind, 'attacks');
    } else {
      pending = planner.attack(input);
    }
    assert.ok(pending instanceof Promise);
    planner.dispose();
    assert.equal(await pending, null);
    assert.equal(planner.workerCount, 0);
    assert.equal(worker.terminated, true);
    assert.equal(gpuPlanner.disposed, true);
    gpuPlanner.initialize();
    for (const job of gpuPlanner.jobs) job.completion.resolve(
      job.kind === 'wave' ? planWave(job.wave) : planAttacks(job.batch));
    if (worker.jobs.length) worker.complete();
    await flush();
    assert.equal(await planner.gpuReady, inflight);
    assert.equal(planner.get(1), null);
    assert.equal(planner.attack(input), null);
    assert.equal(planner.workerCount, 0);
  }
});

test('when both backends are unavailable the caller can use synchronous planning', async () => {
  const fallback = create({ workers: 0 });
  try {
    fallback.gpuPlanner.initialize(false);
    assert.equal(await fallback.planner.gpuReady, false);
    assert.equal(fallback.planner.mode, 'cpu');
    assert.equal(fallback.planner.get(21), null);
    const input = batch([2, 6]);
    assert.equal(fallback.planner.attack(input), null);
    const results = planAttacks(input);
    assert.deepEqual(results.map(result => [result.id, result.commands.length]), [[2, 3], [6, 3]]);
    assert.ok(results.every(result => result.commands.every(command =>
      command.vy > 0 && command.extra === null)), 'scatter fire remains straight after launch');
  } finally { fallback.planner.dispose(); }
});

test('a silent GPU times out without losing its attack or the healthy CPU pool', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { planner, gpuPlanner, worker } = create();
  try {
    gpuPlanner.initialize();
    await planner.gpuReady;
    worker.complete();
    const input = batch([9, 4]);
    const pending = planner.attack(input);
    gpuPlanner.finish();
    await flush();
    t.mock.timers.tick(GAME.spawnPlanning.jobTimeout);
    assert.equal(planner.mode, 'cpu-workers');
    completeUntilAttack(worker);
    assert.deepEqual(await pending, planAttacks(input));
    assert.equal(worker.terminated, false);
  } finally { planner.dispose(); }
});

test('disposing during device acquisition releases a device delivered after cancellation', async () => {
  const requested = deferred(), deviceResult = deferred();
  let released = false;
  const backend = new WebGPUPlanner({ gpu: { requestAdapter: async () => ({
    requestDevice() { requested.resolve(); return deviceResult.promise; },
  }) } });
  await requested.promise;
  backend.dispose();
  assert.equal(await backend.ready, false);
  deviceResult.resolve({ destroy() { released = true; } });
  await flush();
  assert.equal(released, true);
  assert.equal(backend.available, false);
});

test('disposing during stalled pipeline validation releases buffers and settles readiness', async () => {
  const validating = deferred(), validation = deferred();
  const buffers = new Set();
  let released = false;
  const device = {
    lost: new Promise(() => {}),
    pushErrorScope() {},
    popErrorScope() { validating.resolve(); return validation.promise; },
    createShaderModule() { return { getCompilationInfo: async () => ({ messages: [] }) }; },
    async createComputePipelineAsync() { return { getBindGroupLayout: () => ({}) }; },
    createBindGroup() { return {}; },
    createBuffer() {
      const buffer = { destroy() { buffers.delete(buffer); } };
      buffers.add(buffer);
      return buffer;
    },
    destroy() { released = true; },
  };
  const backend = new WebGPUPlanner({ gpu: { requestAdapter: async () => ({
    requestDevice: async () => device,
  }) } });
  await validating.promise;
  backend.dispose();
  assert.equal(await backend.ready, false);
  assert.equal(buffers.size, 0);
  assert.equal(released, true);
});
