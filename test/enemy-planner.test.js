import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as ThreadWorker } from 'node:worker_threads';
import { EnemyPlanner } from '../src/core/enemy-planner.js';
import { planWave } from '../src/core/wave-plan.js';
import { planAttacks } from '../src/core/attack-plan.js';
import { GAME } from '../src/data/game.js';
import { Game } from '../src/core/game.js';

class ControlledWorker {
  static instances = [];
  constructor(url, options) {
    this.jobs = [];
    this.terminated = false;
    ControlledWorker.instances.push(this);
  }
  postMessage(job) { this.jobs.push(job); }
  terminate() { this.terminated = true; }
  complete() {
    const job = this.jobs.shift();
    if (job.kind === 'wave') {
      const { id, wave, kind } = job;
      this.onmessage({ data: { kind, id, wave, buffer: planWave(wave).buffer } });
    } else {
      const { id, kind, batch } = job;
      this.onmessage({ data: { kind, id, results: planAttacks(batch) } });
    }
  }
}

const create = (hardwareConcurrency) => {
  ControlledWorker.instances = [];
  return new EnemyPlanner({ hardwareConcurrency, WorkerClass: ControlledWorker });
};

const attacker = id => ({ id, boss: false, behavior: 'scatter', x: 100 + id * 30, y: 140,
  w: 42, h: 36, damage: 10, age: 5, phase: 0, shotTimer: 3, actionTimer: 1,
  summonTimer: 0, burst: 0, diving: false, invisible: false });

test('reserves a core, caps workers, and does not construct workers for invalid budgets', () => {
  for (const [cores, count] of [[null, 0], [NaN, 0], [Infinity, 0], [1.5, 0],
    [0, 0], [1, 0], [2, 1], [3, 2], [12, GAME.spawnPlanning.maxWorkers]]) {
    const planner = create(cores);
    assert.equal(planner.workerCount, count, `reported cores: ${cores}`);
    assert.equal(ControlledWorker.instances.length, count);
    assert.equal(planner.get(1), null);
    if (!count) assert.equal(planner.attack({ wave: 1, player: { x: 0, y: 0 }, enemies: [] }), null);
    planner.dispose();
    assert.equal(planner.get(1), null);
    assert.equal(planner.workerCount, 0);
    assert.equal(ControlledWorker.instances.every(worker => worker.terminated), true);
  }
  assert.equal(new EnemyPlanner({ hardwareConcurrency: 4, WorkerClass: null }).workerCount, 0);
});

test('repeated reads reuse completed plans, skip bosses, and prune stale windows', () => {
  const planner = create(3);
  try {
    const [first, second] = ControlledWorker.instances;
    assert.deepEqual(first.jobs.map(job => job.wave), [1]);
    assert.deepEqual(second.jobs.map(job => job.wave), [2]);
    assert.equal(planner.get(1), null);
    assert.deepEqual(first.jobs.map(job => job.wave), [1]);
    second.complete(); // Later wave finishes before wave 1.
    assert.equal(planner.ready.has(2), true);
    first.complete();
    const ready = planner.get(1);
    assert.deepEqual(ready, planWave(1));
    assert.equal(planner.get(1), ready);

    assert.equal(planner.get(21), null);
    assert.equal(planner.get(10), null);
    assert.equal(planner.queue.some(wave => wave === 10), false);
    second.complete(); // Wave 3 completed after leaving its planning window.
    assert.equal(planner.ready.has(3), false);
    assert.equal(planner.ready.has(1), false);
    assert.ok(planner.queue.length <= GAME.spawnPlanning.lookahead);
    assert.ok(planner.ready.size <= GAME.spawnPlanning.lookahead);
  } finally { planner.dispose(); }
});

test('rapid jumps discard obsolete completions and prioritize the latest window', () => {
  const planner = create(2);
  try {
    const [worker] = ControlledWorker.instances;
    planner.get(21);
    planner.get(101);
    worker.complete(); // Old wave 1 cannot appear in a new window.
    assert.equal(planner.ready.size, 0);
    assert.equal(worker.jobs[0].wave, 101);
    planner.get(201);
    worker.complete(); // Old wave 101 cannot appear in a newer window.
    assert.equal(planner.ready.size, 0);
    assert.equal(worker.jobs[0].wave, 201);
    worker.complete();
    assert.deepEqual(planner.get(201), planWave(201));
    assert.ok(planner.ready.size <= GAME.spawnPlanning.lookahead);
    assert.ok(planner.queue.length <= GAME.spawnPlanning.lookahead);
    planner.get(1);
    assert.equal(planner.get(201), null);
  } finally { planner.dispose(); }
});

test('attack batches take priority over lookahead work and keep original enemy order', async () => {
  const planner = create(3);
  try {
    const [first, second] = ControlledWorker.instances;
    const batch = { wave: 21, player: { x: 480, y: 488 },
      enemies: Array.from({ length: 17 }, (_, id) => attacker(id)) };
    const result = planner.attack(batch);
    assert.ok(result instanceof Promise);
    assert.equal(planner.attack(batch), null, 'a second batch falls back instead of queueing');
    first.complete();
    assert.equal(first.jobs[0].kind, 'attacks');
    assert.equal(first.jobs[0].batch.enemies.length, 9);
    second.complete();
    assert.equal(second.jobs[0].kind, 'attacks');
    assert.equal(second.jobs[0].batch.enemies.length, 8);
    second.complete(); // Second chunk finishes first.
    first.complete();
    assert.deepEqual((await result).map(entry => entry.id), batch.enemies.map(entry => entry.id));
  } finally { planner.dispose(); }
});

test('disposal and worker failure resolve pending attacks for synchronous fallback', async () => {
  const batch = { wave: 21, player: { x: 480, y: 488 }, enemies: [attacker(1)] };
  const planner = create(2);
  const [worker] = ControlledWorker.instances;
  const result = planner.attack(batch);
  worker.complete(); // Attack job is now in-flight on the shared worker.
  planner.dispose();
  assert.equal(await result, null);
  worker.complete(); // Late worker result cannot repopulate the disposed pool.
  assert.equal(planner.attack(batch), null);

  const failed = create(2);
  const [broken] = ControlledWorker.instances;
  const pending = failed.attack(batch);
  broken.complete();
  broken.onerror();
  assert.equal(await pending, null);
  assert.equal(failed.workerCount, 0);
  failed.dispose();
});

test('silent workers time out and settle an in-flight attack', async () => {
  const planner = create(2);
  const [worker] = ControlledWorker.instances;
  const batch = { wave: 21, player: { x: 480, y: 488 }, enemies: [attacker(1)] };
  const result = planner.attack(batch);
  worker.complete(); // The attack job now owns the worker; it never replies.
  let deadline;
  try {
    const settled = await Promise.race([result, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(Error('watchdog did not settle the attack')),
        GAME.spawnPlanning.jobTimeout * 2 + 250);
    })]);
    assert.equal(settled, null);
    assert.equal(planner.workerCount, 0);
    assert.equal(worker.terminated, true);
  } finally {
    clearTimeout(deadline);
    planner.dispose();
  }
});

test('startup, posting, and worker errors disable the pool without retrying', () => {
  let attempts = 0;
  class StartupFailure extends ControlledWorker {
    constructor(...args) {
      if (++attempts === 2) throw Error('worker unavailable');
      super(...args);
    }
  }
  ControlledWorker.instances = [];
  const startup = new EnemyPlanner({ hardwareConcurrency: 3, WorkerClass: StartupFailure });
  assert.equal(startup.workerCount, 0);
  assert.equal(ControlledWorker.instances.length, 1);
  assert.equal(ControlledWorker.instances[0].terminated, true);
  assert.equal(startup.get(21), null);

  class PostingFailure extends ControlledWorker {
    postMessage() { throw Error('worker unavailable'); }
  }
  const posting = new EnemyPlanner({ hardwareConcurrency: 2, WorkerClass: PostingFailure });
  assert.equal(ControlledWorker.instances.at(-1).terminated, true);
  assert.equal(posting.workerCount, 0);
  assert.equal(posting.get(21), null);
  const planner = create(2);
  const [worker] = ControlledWorker.instances;
  worker.complete();
  assert.ok(planner.ready.size);
  worker.onmessageerror();
  assert.equal(worker.terminated, true);
  assert.equal(planner.workerCount, 0);
  assert.equal(planner.get(21), null);
  assert.equal(planner.ready.size, 0);
  planner.dispose();
  worker.complete(); // A queued response after disposal is ignored.
  assert.equal(planner.ready.size, 0);
  assert.equal(planner.get(1), null);
  const crashed = create(2);
  const [failed] = ControlledWorker.instances;
  failed.onerror();
  assert.equal(crashed.workerCount, 0);
  assert.equal(crashed.get(21), null);
  crashed.dispose();
});

test('real module workers preserve spawn plans and saturated-bullet combat outcomes', async () => {
  const threads = [];
  class DOMWorker {
    constructor(url, options) {
      this.thread = new ThreadWorker(`
        const { parentPort } = require('node:worker_threads');
        globalThis.self = globalThis;
        globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
        import(${JSON.stringify(url.href)}).then(() => {
          parentPort.on('message', data => globalThis.onmessage({ data }));
        });
      `, { eval: true });
      this.thread.on('message', data => this.onmessage?.({ data }));
      this.thread.on('error', error => this.onerror?.(error));
      this.thread.on('messageerror', error => this.onmessageerror?.(error));
      threads.push(this);
    }
    postMessage(data) { this.thread.postMessage(data); }
    terminate() { this.termination = this.thread.terminate(); return this.termination; }
  }
  const planner = new EnemyPlanner({ hardwareConcurrency: 3, WorkerClass: DOMWorker });
  try {
    assert.equal(planner.workerCount, 2);
    assert.equal(planner.get(21), null);
    const deadline = Date.now() + 4000;
    let result;
    while (!(result = planner.get(21)) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(result instanceof Float64Array, 'worker must deliver a plan before the deadline');
    assert.deepEqual(result, planWave(21));
    const sync = new Game({ random: () => 0.99 });
    const threaded = new Game({ random: () => 0.99, planWave: wave => planner.get(wave),
      planAttacks: batch => planner.attack(batch) });
    for (const game of [sync, threaded]) {
      game.start(); game.startWave(21); game.nextSpawn = Infinity;
      for (let id = 0; id < 25; id++)
        game._spawnEnemy('E3', 40 + id * 35, 80 + id * 2).shotTimer = 10;
    }
    sync.update(GAME.step);
    await threaded.update(GAME.step);
    assert.equal(planner.workerCount, 2);
    assert.equal(threaded.enemyBullets.filter(bullet => bullet.active).length, GAME.enemyBulletCap);
    const combat = game => ({ time: game.time, player: game.player, enemies: game.enemies,
      bullets: game.bullets, enemyBullets: game.enemyBullets, score: game.score });
    assert.deepEqual(combat(threaded), combat(sync));
  } finally {
    planner.dispose();
    await Promise.all(threads.map(thread => thread.termination));
  }
});
