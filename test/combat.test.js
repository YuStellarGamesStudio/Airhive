import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { GAME, WEAPONS } from '../src/data/game.js';

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
  assert.equal(game.player.hp, GAME.player.hp);
  assert.equal(game.player.shield, false);
  assert.equal(game.obstacles.filter(o => o.active).length, 0);
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
