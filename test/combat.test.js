import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { GAME, WEAPONS } from '../src/data/game.js';
import { planAttacks } from '../src/core/attack-plan.js';

const makeGame = () => {
  const game = new Game({ random: () => 0.99 });
  game.start();
  return game;
};

const advance = (game, seconds) => {
  for (let n = 0; n < Math.ceil(seconds / GAME.step); n++) game.update(GAME.step);
};

test('paused simulation freezes movement, time, timers, bullets, and damage', () => {
  const game = makeGame();
  game.slowMotion = 1;
  game.update(GAME.step);
  const before = { time: game.time, waveTime: game.waveTime, banner: game.waveBanner,
    slow: game.slowMotion, x: game.player.x, bullets: game.bullets.map(b => ({ x: b.x, y: b.y })) };
  game.pause();
  for (let n = 0; n < 60; n++) game.update(GAME.step, { axis: 1 });
  game.damagePlayer(100, { obstacle: true });
  assert.deepEqual({ time: game.time, waveTime: game.waveTime, banner: game.waveBanner,
    slow: game.slowMotion, x: game.player.x, bullets: game.bullets.map(b => ({ x: b.x, y: b.y })) }, before);
  assert.equal(game.player.lives, GAME.player.lives);
  game.resume();
  game.update(GAME.step, { axis: 1 });
  assert.ok(game.time > before.time);
  assert.ok(game.player.x > before.x);
});

test('surviving aircraft hits identify their target without turning shield or lethal hits into survivor effects', () => {
  const game = makeGame();
  const events = [];
  game.onEvent = event => events.push(event);
  const enemy = game._spawnEnemy('E1', 180, 120);
  enemy.hp = 3;
  enemy.shield = 1;
  const strike = damage => {
    game._bullet(false, enemy.x, enemy.y, 0, 0, damage);
    game._resolveCollisions();
  };
  strike(2);
  assert.equal(enemy.hp, 3);
  assert.equal(enemy.shield, 0);
  assert.equal(events.at(-1).type, 'shield');
  assert.equal(events.at(-1).target, enemy);
  assert.equal(events.at(-1).survived, true);
  strike(2);
  assert.equal(enemy.hp, 1);
  assert.equal(enemy.active, true);
  assert.equal(events.at(-1).type, 'hit');
  assert.equal(events.at(-1).survived, true);
  strike(2);
  assert.equal(enemy.active, false);
  assert.equal(events.filter(event => event.type === 'explosion').length, 1);
  assert.equal(events.filter(event => event.type === 'hit').at(-1).survived, false);

  game.wave = 4;
  game.player.invulnerable = 0;
  game.damagePlayer(10);
  assert.equal(events.at(-1).target, game.player);
  assert.equal(events.at(-1).survived, true);
  const before = events.length;
  game.damagePlayer(10);
  assert.equal(events.length, before, 'invulnerability must not trigger another impact');
  game.player.invulnerable = 0;
  game.damagePlayer(100);
  assert.equal(game.state, 'dying');
  assert.equal(events.filter(event => event.type === 'hit').at(-1).survived, false);
});

test('two simultaneous obstacles cost exactly one life despite shield, HP and invulnerability', () => {
  const game = makeGame();
  game.fireClock = 0;
  game.player.shield = true;
  game.player.hp = 75;
  game.player.invulnerable = 2;
  for (let n = 0; n < 2; n++) game.obstacles.push({ x: game.player.x, y: game.player.y,
    w: GAME.obstacleSize, h: GAME.obstacleSize, hp: 3, active: true });
  game.update(GAME.step);
  assert.equal(game.player.lives, 2);
  assert.equal(game.state, 'dying');
  assert.equal(game.player.hp, 0);
  assert.equal(game.player.shield, false);
  assert.equal(game.obstacles.filter(o => o.active).length, 0);
  advance(game, GAME.player.deathDuration + GAME.step);
  assert.equal(game.state, 'death');
  assert.equal(game.continueChallenge(), true);
  assert.equal(game.player.hp, GAME.player.hp);
  game.obstacles.push({ x: game.player.x, y: game.player.y,
    w: GAME.obstacleSize, h: GAME.obstacleSize, hp: 3, active: true });
  game.update(GAME.step);
  assert.equal(game.player.lives, 1, 'a later collision still bypasses respawn invulnerability');
});

test('boss remains until killed; bomb kills boss for half points and always drops heal', () => {
  const game = makeGame();
  game.startWave(10);
  game.boss.hp = 1_000_000; // Keep the fight alive while exercising the deadline.
  game.player.invulnerable = Infinity;
  advance(game, 49);
  assert.equal(game.wave, 10);
  assert.equal(game.boss?.type, 'B1');
  assert.equal(game.boss.active, true);
  assert.equal(game.obstacles.some(o => o.active), false);
  for (const escort of game.enemies) if (!escort.boss) escort.active = false;
  game.score = 0;
  game.combo = 0;
  game.collect('bomb');
  assert.equal(game.boss, null);
  assert.equal(game.score, 1500);
  assert.equal(game.pickups.some(p => p.active && p.type === 'heal'), true);
  assert.ok(game.slowMotion > 0);
  const time = game.time;
  game.update(GAME.step);
  assert.ok(Math.abs(game.time - time - GAME.step * GAME.wave.bossSlowFactor) < 1e-8);
  advance(game, 16);
  assert.equal(game.wave, 11);
});

test('bomb kills all regular enemies with capped combo and half score', () => {
  const game = makeGame();
  game.startWave(4);
  game.combo = 98;
  for (let n = 0; n < 3; n++) game.enemies.push({ id: 100 + n, type: 'E1', active: true,
    x: 100 + 60 * n, y: 100, score: 100, boss: false });
  game.collect('bomb');
  assert.equal(game.combo, 99);
  assert.equal(game.kills, 3);
  assert.equal(game.score, 3 * 100 * 99 / 2);
  assert.equal(game.enemies.some(e => e.active), false);
});

test('first drop cannot be missed by a player who never fires into the formation', () => {
  const game = makeGame();
  game.player.x = GAME.player.w / 2;
  game.fireClock = -GAME.wave.firstDropTime;
  advance(game, GAME.wave.firstDropTime + GAME.step);
  assert.equal(game.wave, 1);
  assert.equal(game.pickups.some(p => p.active && p.type === 'power'), true);
});

test('eight boss types rotate after wave 80 without starting obstacles', () => {
  const game = makeGame();
  for (let n = 1; n <= 9; n++) {
    game.startWave(n * GAME.wave.bossEvery);
    assert.equal(game.boss.type, `B${(n - 1) % GAME.cycleBossCount + 1}`);
    assert.equal(game.obstacles.length, 0);
    assert.equal(game.warnings.length, 0);
  }
});

test('population reduction rounds from the previous whole-aircraft counts and keeps boss waves', () => {
  const game = makeGame();
  for (const [wave, previous] of [[1, 18], [3, 20], [11, 29], [21, 41], [41, 63]]) {
    game.startWave(wave);
    assert.equal(game.spawnCount, Math.round(previous * 0.67), `wave ${wave}`);
  }
  game.startWave(10);
  assert.equal(game.spawnCount, 0);
  assert.equal(game.enemies.filter(enemy => enemy.active && enemy.boss).length, 1);
});

test('player and enemy projectile pools remain bounded during maximum firepower', () => {
  const game = makeGame();
  game.startWave(20);
  game.boss.hp = 1_000_000;
  game.player.level = GAME.player.maxLevel;
  game.player.invulnerable = Infinity;
  for (let n = 0; n < 6 / GAME.step; n++) {
    game.update(GAME.step);
    assert.ok(game.bullets.length <= GAME.player.bulletCap);
    assert.ok(game.enemyBullets.length <= GAME.enemyBulletCap);
  }
});

test('a lethal bomb blast makes score and lives terminal before later shot collisions', () => {
  const game = makeGame();
  game.startWave(5);
  game.player.lives = 1; game.player.hp = 20; game.score = GAME.bonusLifeScore - 50;
  game.fireClock = 0;
  const enemy = game._spawnEnemy('E1', game.player.x, 200);
  enemy.hp = 1; enemy.phase = 0;
  game._bullet(false, enemy.x, enemy.y + GAME.player.bulletSpeed * GAME.step, 0, -GAME.player.bulletSpeed, 1);
  game._bullet(true, game.player.x + 50, GAME.bombBlastY - 1, 0, 150, 20, { kind: 'bomb' });
  let result;
  game.onEvent = (event) => { if (event.type === 'gameover') result = event; };
  game.update(GAME.step);
  assert.equal(game.state, 'dying');
  assert.equal(game.score, GAME.bonusLifeScore - 50);
  assert.equal(game.kills, 0);
  assert.equal(result, undefined);
  advance(game, GAME.player.deathDuration + GAME.step);
  assert.equal(game.state, 'gameover');
  assert.equal(game.player.lives, 0);
  assert.equal(game.score, result.score);
  assert.equal(game.kills, result.kills);
});

test('an untimed summoning boss retains only a bounded enemy collection', () => {
  const game = makeGame();
  game.startWave(80);
  game.player.x = GAME.player.w / 2;
  game.player.invulnerable = Infinity;
  advance(game, 1800);
  assert.equal(game.wave, 80);
  assert.ok(game.enemies.length <= GAME.enemyCap);
});

test('a full player projectile pool cannot suppress an enemy volley, or vice versa', () => {
  const game = makeGame();
  game.startWave(21);
  game.nextSpawn = Infinity;
  for (let n = 0; n < GAME.player.bulletCap; n++) game._bullet(false, 40, 400, 0, 0, 1);
  const enemy = game._spawnEnemy('E3', 480, 120);
  enemy.shotTimer = 10;
  game.update(GAME.step);
  assert.equal(game.enemyBullets.filter(b => b.active).length, 3);
  while (game.enemyBullets.length < GAME.enemyBulletCap) game._bullet(true, 900, 100, 0, 0, 1);
  assert.equal(game._bullet(true, 900, 100, 0, 0, 1), null);
  game.bullets[0].active = false;
  game.fireClock = 0;
  game.update(WEAPONS[0].interval);
  assert.equal(game.bullets.filter(b => b.active).length, GAME.player.bulletCap);
});

test('expanded formations finish spawning inside the battlefield before the wave deadline', () => {
  const game = makeGame();
  for (const wave of [1, 21, 41, 42, 43, 44, 45, 46]) {
    game.startWave(wave);
    game.nextObstacle = Infinity;
    while (game.spawned < game.spawnCount && game.waveTime < GAME.wave.duration) {
      game.waveTime += GAME.step;
      game._waveTick(GAME.step);
    }
    assert.equal(game.enemies.length, game.spawnCount);
    for (const enemy of game.enemies) {
      assert.ok(enemy.x - enemy.w / 2 >= 0 && enemy.x + enemy.w / 2 <= GAME.width);
      assert.ok(enemy.y >= 0 && enemy.y + enemy.h / 2 < game.player.y - game.player.h / 2);
    }
  }
});

test('penetrating shots hit each target once and lose penetration when a pooled slot is reused', () => {
  const game = makeGame();
  game.startWave(4);
  const enemies = [180, 120, 60].map(y => game._spawnEnemy('E1', 480, y));
  for (const enemy of enemies) enemy.hp = 10;
  game.player.level = 6;
  game.fireClock = 0;
  game._playerFire(WEAPONS[5].interval);
  const shot = game.bullets.find(b => b.vx === 0);
  for (const bullet of game.bullets) if (bullet !== shot) bullet.active = false;
  shot.y = 180;
  game._resolveCollisions();
  game._resolveCollisions();
  assert.equal(enemies[0].hp, 9);
  shot.y = 120;
  game._resolveCollisions();
  shot.y = 60;
  game._resolveCollisions();
  assert.deepEqual(enemies.map(e => e.hp), [9, 9, 9]);
  assert.equal(shot.active, false);
  for (const enemy of enemies) enemy.y = 180;
  game._bullet(false, 480, 180, 0, 0, 1);
  game._resolveCollisions();
  assert.deepEqual(enemies.map(e => e.hp), [8, 9, 9]);
});

test('shields stop piercing rounds and plasma respects radius and one hit per target', () => {
  const game = makeGame();
  game.startWave(4);
  const target = game._spawnEnemy('E1', 480, 180);
  const nearby = game._spawnEnemy('E1', 515, 180);
  const outside = game._spawnEnemy('E1', 560, 180);
  const shield = game._spawnEnemy('E11', 480, 145);
  for (const enemy of game.enemies) enemy.hp = 10;
  game.player.level = 8;
  game.fireClock = 0;
  game._playerFire(WEAPONS[7].interval);
  const shot = game.bullets.find(b => b.vx === 0);
  for (const bullet of game.bullets) if (bullet !== shot) bullet.active = false;
  shot.y = 180;
  game._resolveCollisions();
  game._resolveCollisions();
  assert.deepEqual([target.hp, nearby.hp, outside.hp, shield.hp, shield.shield], [8, 9, 10, 10, 1]);
  shot.active = false;
  const piercing = game._bullet(false, shield.x, shield.y, 0, 0, 3, { pierce: 4 });
  game._resolveCollisions();
  assert.equal(piercing.active, false);
  assert.equal(shield.hp, 10);
  assert.equal(shield.shield, 0);
});

test('guided tier reaches off-axis enemies without a pickup and loses that ability below its tier', () => {
  const game = makeGame();
  game.startWave(4);
  game.nextSpawn = game.nextObstacle = Infinity;
  game.player.x = GAME.player.w / 2;
  game.player.level = 7;
  const enemy = game._spawnEnemy('E1', 850, 100);
  enemy.hp = 100;
  advance(game, 4);
  assert.ok(enemy.hp < 100);
  assert.equal(game.player.homing, false);
  game.damagePlayer(0, { obstacle: true });
  advance(game, GAME.player.deathDuration + GAME.step);
  game.continueChallenge();
  assert.equal(game.player.level, 6);
  const hp = enemy.hp;
  advance(game, 3);
  assert.equal(enemy.hp, hp);
});

test('death freezes combat, cannot be bypassed, and continues without resetting progress', () => {
  const game = makeGame();
  const events = [];
  game.onEvent = event => events.push(event.type);
  game.startWave(21);
  game.score = 12345;
  game.player.level = 10;
  game.player.homing = game.player.shield = true;
  const enemy = game._spawnEnemy('E1', 100, 100);
  game.damagePlayer(0, { obstacle: true });
  const before = { time: game.time, waveTime: game.waveTime, x: game.player.x, enemyY: enemy.y };
  assert.equal(game.player.active, false);
  assert.equal(game.player.level, 9);
  assert.equal(game.collect('power'), false);
  assert.equal(game.continueChallenge(), false);
  game.resume(); game.togglePause();
  assert.equal(game.state, 'dying');
  advance(game, GAME.player.deathDuration + GAME.step);
  game.resume(); game.togglePause();
  game.update(GAME.step, { axis: 1 });
  assert.equal(game.state, 'death');
  assert.deepEqual({ time: game.time, waveTime: game.waveTime, x: game.player.x, enemyY: enemy.y }, before);
  assert.equal(game.continueChallenge(), true);
  assert.equal(game.continueChallenge(), false);
  assert.equal(game.state, 'playing');
  assert.equal(game.wave, 21);
  assert.equal(game.score, 12345);
  assert.equal(game.player.lives, 2);
  assert.equal(game.player.hp, GAME.player.hp);
  assert.equal(game.player.shield, false);
  assert.equal(game.player.homing, false);
  assert.deepEqual(events, ['wave', 'death', 'deathmenu', 'continue']);
  game.update(GAME.step);
  assert.ok(game.time > before.time);
});

test('last-life death emits one delayed result, refuses continue, and restart clears progression', () => {
  const game = makeGame();
  const results = [];
  game.onEvent = event => { if (event.type === 'gameover') results.push(event); };
  game.startWave(21);
  for (let n = 0; n < 20; n++) game.collect('power');
  assert.equal(game.player.level, 10);
  game.player.lives = 1;
  game.score = 9876;
  game.damagePlayer(100);
  assert.equal(game.state, 'dying');
  assert.equal(results.length, 0);
  advance(game, GAME.player.deathDuration + GAME.step);
  assert.equal(game.state, 'gameover');
  assert.equal(game.continueChallenge(), false);
  advance(game, 2);
  assert.deepEqual(results.map(r => [r.score, r.wave]), [[9876, 21]]);
  game.start();
  assert.equal(game.state, 'playing');
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.equal(game.player.level, 1);
  assert.equal(game.player.lives, 3);
  assert.equal(game.player.active, true);
  assert.equal(game.deathReason, null);
});

test('score lives require crossing a threshold and a large award respects the lifetime cap', () => {
  const game = makeGame();
  game._award(GAME.bonusLifeScore - 1);
  assert.equal(game.player.lives, 3);
  assert.equal(game.bonusLives, 0);
  game._award(1);
  assert.equal(game.player.lives, 4);
  assert.equal(game.bonusLives, 1);
  assert.equal(game.player.bank, 0);
  game._award(GAME.bonusLifeScore * 10 + 37);
  assert.equal(game.player.lives, 3 + GAME.bonusLifeCap);
  assert.equal(game.bonusLives, GAME.bonusLifeCap);
  assert.equal(game.player.bank, 37);
  game._award(GAME.bonusLifeScore);
  assert.equal(game.player.lives, 3 + GAME.bonusLifeCap);
});

test('late attack results cannot cross a pause/resume or restart boundary', async () => {
  let reply;
  const game = new Game({ random: () => 0.99,
    planAttacks: batch => new Promise(resolve => { reply = () => resolve(planAttacks(batch)); }) });
  game.start(); game.startWave(21); game.nextSpawn = Infinity;
  const enemy = game._spawnEnemy('E3', 100, 100);
  enemy.shotTimer = 10;
  const pending = game.update(GAME.step);
  const time = game.time;
  game.pause(); game.resume();
  reply(); await pending;
  assert.equal(game.state, 'playing');
  assert.equal(game.time, time);
  assert.equal(enemy.shotTimer, 10 + GAME.step);
  assert.equal(game.enemyBullets.some(b => b.active), false);

  const obsolete = game.update(GAME.step);
  game.start();
  reply(); await obsolete;
  assert.equal(game.wave, 1);
  assert.equal(game.time, 0);
  assert.equal(game.player.hp, GAME.player.hp);
  assert.equal(game.enemyBullets.some(b => b.active), false);
});

test('a delayed or unavailable attack planner completes collisions exactly once', async () => {
  for (const unavailable of [false, true]) {
    let reply;
    const game = new Game({ random: () => 0.99,
      planAttacks: batch => new Promise(resolve => {
        reply = () => resolve(unavailable ? null : planAttacks(batch));
      }) });
    game.start(); game.startWave(21); game.nextSpawn = Infinity;
    game._spawnEnemy('E3', 100, 100).shotTimer = 10;
    const incoming = game._bullet(true, game.player.x, game.player.y - 1, 0, 0, 15);
    const pending = game.update(GAME.step);
    assert.equal(game.update(GAME.step), pending);
    assert.equal(game.player.hp, 100);
    assert.equal(incoming.active, true);
    reply(); await pending;
    assert.equal(game.time, GAME.step);
    assert.equal(game.player.hp, 85);
    assert.equal(incoming.active, false);
    assert.equal(game.enemyBullets.filter(b => b.active).length, 3);
  }
});
