import { GAME, WEAPONS, ENEMIES, BOSSES, FORMATIONS, MOTION, PICKUPS } from '../data/game.js';
import { planWave, PLAN_STRIDE } from './wave-plan.js';
import { planAttacks, hasAttack } from './attack-plan.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const overlaps = (a, b, scale = 1) => Math.abs(a.x - b.x) * 2 < a.w * scale + b.w &&
  Math.abs(a.y - b.y) * 2 < a.h * scale + b.h;
const TAU = Math.PI * 2;

export class Game {
  constructor({ random = Math.random, onEvent = () => {}, planWave: prepareWave = planWave,
    planAttacks: prepareAttacks = null } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.planWave = prepareWave;
    this.wavePlan = null;
    this.prepareAttacks = prepareAttacks;
    this.attackTargets = new Map();
    this.stepEpoch = 0;
    this.pendingUpdate = null;
    this.state = 'menu';
    this.time = 0;
    this.wave = 0;
    this.score = 0;
    this.combo = 0;
    this.kills = 0;
    this.player = this._newPlayer();
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.pickups = [];
    this.obstacles = [];
    this.warnings = [];
    this.boss = null;
    this.waveBanner = 0;
    this.slowMotion = 0;
    this.waveTime = 0;
    this.waveGap = 0;
    this.nextSpawn = 0;
    this.spawned = 0;
    this.spawnCount = 0;
    this.nextObstacle = Infinity;
    this.obstaclesScheduled = 0;
    this.waveDrop = null;
    this.firstDrop = false;
    this.earlyDamage = 0;
    this.bonusLives = 0;
    this.nextId = 1;
    this.fireClock = 0;
    this.homingClock = 0;
    this.deathTimer = 0;
    this.deathReason = null;
    this.lifeLostThisStep = false;
  }

  _newPlayer() {
    const p = GAME.player;
    return { x: p.x, y: p.y, w: p.w, h: p.h, hp: p.hp, lives: p.lives,
      level: 1, shield: false, homing: false, invulnerable: 0, slow: 0, bank: 0, active: true };
  }

  start() {
    this.state = 'playing';
    this.time = this.score = this.combo = this.kills = this.earlyDamage = this.bonusLives = 0;
    this.player = this._newPlayer();
    this.enemies.length = this.pickups.length = this.obstacles.length = this.warnings.length = 0;
    for (const pool of [this.bullets, this.enemyBullets]) for (const bullet of pool) bullet.active = false;
    this.nextId = 1;
    this.fireClock = WEAPONS[0].interval;
    this.homingClock = 0;
    this.slowMotion = 0;
    this.firstDrop = false;
    this.deathTimer = 0;
    this.deathReason = null;
    this.lifeLostThisStep = false;
    this.onEvent({ type: 'start' });
    this.startWave(1);
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.stepEpoch++; } }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  togglePause() { if (this.state === 'paused') this.resume(); else this.pause(); }

  continueChallenge() {
    if (this.state !== 'death' || this.player.lives <= 0) return false;
    this.stepEpoch++;
    this.player.hp = GAME.player.hp;
    this.player.active = true;
    this.player.invulnerable = GAME.player.reviveInvulnerability;
    this.lifeLostThisStep = false;
    this.fireClock = 0;
    this.homingClock = 0;
    this.deathReason = null;
    this.state = 'playing';
    this.onEvent({ type: 'continue' });
    return true;
  }

  startWave(number) {
    if (this.state !== 'playing' || !Number.isInteger(number) || number < 1) return;
    this.stepEpoch++;
    this.wave = number;
    this.waveTime = 0;
    this.waveGap = 0;
    this.spawned = 0;
    this.nextSpawn = GAME.wave.initialDelay;
    this.wavePlan = this.planWave(number) ?? planWave(number);
    this.spawnCount = this.wavePlan.length / PLAN_STRIDE;
    this.waveBanner = GAME.wave.banner;
    this.enemies.length = this.obstacles.length = this.warnings.length = 0;
    // Retain in-flight drops without accumulating spent pickups across waves.
    let kept = 0;
    for (const pickup of this.pickups) if (pickup.active) this.pickups[kept++] = pickup;
    this.pickups.length = kept;
    for (const bullet of this.enemyBullets) bullet.active = false;
    this.boss = null;
    this.obstaclesScheduled = 0;
    this.nextObstacle = number >= GAME.wave.obstacleStart && number % GAME.wave.bossEvery !== 0
      ? GAME.wave.obstacleDelay : Infinity;
    const roll = this.random();
    let accumulated = 0;
    this.waveDrop = null;
    for (const [type, chance] of Object.entries(GAME.wave.dropChance)) {
      accumulated += chance;
      if (roll < accumulated) { this.waveDrop = type; break; }
    }
    if (!this.firstDrop && number <= GAME.wave.earlyWaveEnd) this.waveDrop = 'power';
    if (number % GAME.wave.lifeEvery === 0 && this.player.lives <= GAME.wave.lifeLowThreshold)
      this._drop('life', this.player.x, GAME.wave.baseY, true);
    if (number % GAME.wave.bossEvery === 0) {
      this.nextObstacle = Infinity;
      this.spawned = this.spawnCount;
      const index = (Math.floor(number / GAME.wave.bossEvery) - 1) % GAME.cycleBossCount + 1;
      this.boss = this._spawnEnemy(`B${index}`, GAME.width / 2, GAME.boss.hoverY, true);
    }
    this.onEvent({ type: 'wave', wave: this.wave, boss: this.boss?.type ?? null });
  }

  update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.pendingUpdate) return this.pendingUpdate;
    // A caller normally passes GAME.step; a long frame cannot skip collisions or timers.
    let remaining = Math.min(dt, GAME.step * GAME.maxStepsPerUpdate);
    if (this.state === 'dying') {
      this.deathTimer = Math.max(0, this.deathTimer - remaining);
      if (this.deathTimer === 0) {
        this.state = this.player.lives > 0 ? 'death' : 'gameover';
        this.onEvent({ type: this.state === 'death' ? 'deathmenu' : 'gameover',
          lives: this.player.lives, reason: this.deathReason,
          score: this.score, wave: this.wave, kills: this.kills, time: this.time });
      }
      return;
    }
    if (this.state !== 'playing') return;
    if (this.prepareAttacks) {
      this.pendingUpdate = this._updatePlanned(remaining, input).finally(() => { this.pendingUpdate = null; });
      return this.pendingUpdate;
    }
    while (remaining > 0 && this.state === 'playing') {
      const slice = Math.min(remaining, GAME.step);
      this._step(slice * (this.slowMotion > 0 ? GAME.wave.bossSlowFactor : 1), input);
      this.slowMotion = Math.max(0, this.slowMotion - slice);
      remaining -= slice;
    }
  }

  _step(dt, input) {
    this._beginStep(dt, input);
    this._finishStep(dt, planAttacks(this._attackBatch()));
  }

  async _updatePlanned(remaining, input) {
    while (remaining > 0 && this.state === 'playing') {
      const epoch = this.stepEpoch;
      const slice = Math.min(remaining, GAME.step);
      const dt = slice * (this.slowMotion > 0 ? GAME.wave.bossSlowFactor : 1);
      this._beginStep(dt, input);
      const batch = this._attackBatch();
      const pending = batch.enemies.length ? this.prepareAttacks(batch) : null;
      const attacks = pending ? await pending : null;
      // UI events may pause, restart, or destroy the aircraft while a worker is computing.
      if (epoch !== this.stepEpoch || this.state !== 'playing') return;
      this._finishStep(dt, attacks ?? planAttacks(batch));
      this.slowMotion = Math.max(0, this.slowMotion - slice);
      remaining -= slice;
    }
  }

  _beginStep(dt, input) {
    this.lifeLostThisStep = false;
    this.time += dt;
    this.waveTime += dt;
    this.waveBanner = Math.max(0, this.waveBanner - dt);
    // slowMotion counts wall-clock update time; all world timers use scaled dt.
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.slow = Math.max(0, p.slow - dt);
    const targetX = input.targetX;
    const speed = GAME.player.speed * (p.slow > 0 ? GAME.player.slowFactor : 1);
    if (typeof targetX === 'number' && Number.isFinite(targetX))
      p.x += clamp(targetX - p.x, -speed * dt, speed * dt);
    else p.x += clamp(Number(input.axis) || 0, -1, 1) * speed * dt;
    p.x = clamp(p.x, p.w / 2, GAME.width - p.w / 2);
    this._playerFire(dt);
    this._waveTick(dt);
    this._moveEnemies(dt);
  }

  _finishStep(dt, attacks) {
    this._applyAttacks(attacks);
    this._moveBullets(dt);
    if (this.state !== 'playing') return;
    this._moveObstacles(dt);
    this._movePickups(dt);
    this._resolveCollisions();
    if (this.state === 'playing') this._advanceWave(dt);
  }

  _attackBatch() {
    this.attackTargets.clear();
    const enemies = [];
    for (const e of this.enemies) {
      if (!e.active || e.reviveAt || !hasAttack(e)) continue;
      this.attackTargets.set(e.id, e);
      enemies.push({ id: e.id, boss: e.boss, behavior: e.behavior,
        x: e.x, y: e.y, w: e.w, h: e.h, damage: e.damage, age: e.age, phase: e.phase,
        shotTimer: e.shotTimer, actionTimer: e.actionTimer, summonTimer: e.summonTimer,
        burst: e.burst, diving: e.diving, invisible: e.invisible, phaseIndex: e.phaseIndex });
    }
    return { wave: this.wave, player: { x: this.player.x, y: this.player.y }, enemies };
  }

  _applyAttacks(attacks) {
    for (const attack of attacks) {
      const enemy = this.attackTargets.get(attack.id);
      if (!enemy?.active || enemy.reviveAt) continue;
      enemy.shotTimer = attack.shotTimer;
      enemy.burst = attack.burst;
      enemy.summonTimer = attack.summonTimer;
      for (const command of attack.commands) {
        if (command.type === 'spawn') this._spawnEnemy(command.enemyType, command.x, command.y);
        else this._bullet(true, command.x, command.y, command.vx, command.vy, command.damage, command.extra);
      }
    }
    // Diving shots originate before wraparound; the aircraft returns before collisions.
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.boss || !enemy.diving || enemy.y <= GAME.height + enemy.h) continue;
      if (enemy.behavior === 'dive' || enemy.behavior === 'intercept') {
        enemy.y = enemy.homeY; enemy.diving = false;
        if (enemy.behavior === 'dive') enemy.burst = 0;
      }
    }
  }

  _waveTick(dt) {
    if (this.wave === 1 && this.waveTime >= GAME.wave.firstDropTime && !this.firstDrop) {
      this._drop('power', this.player.x, GAME.pickupDropY);
      this.firstDrop = true;
      this.waveDrop = null;
    }
    if (!this.boss && this.spawned < this.spawnCount && this.waveTime >= this.nextSpawn) {
      const index = this.spawned++ * PLAN_STRIDE;
      this._spawnEnemy(`E${this.wavePlan[index]}`, this.wavePlan[index + 1], this.wavePlan[index + 2]);
      this.nextSpawn += GAME.wave.spawnInterval;
    }
    if (this.waveTime >= this.nextObstacle && this.obstaclesScheduled < GAME.wave.obstacleMaxPerWave && !this.boss) {
      let x = GAME.width * (GAME.obstacleLaneStart + this.random() * GAME.obstacleLaneSpan);
      let lane = null;
      for (let n = 0; n < FORMATIONS.length; n++) {
        x = clamp(x + (n ? GAME.wave.obstacleAvoidX * 2 : 0),
          GAME.obstacleLaneMargin, GAME.width - GAME.obstacleLaneMargin);
        if (!this._laneHasDive(x)) { lane = x; break; }
        if (x === GAME.width - GAME.obstacleLaneMargin) x = GAME.obstacleLaneMargin;
      }
      if (lane !== null) {
        this.obstaclesScheduled++;
        this.warnings.push({ x: lane, y: 0, time: GAME.wave.obstacleWarning, active: true });
        this.nextObstacle += GAME.wave.obstacleSpacing;
      } else this.nextObstacle += GAME.wave.obstacleRetry;
    }
  }

  _laneHasDive(x) {
    for (const enemy of this.enemies) if (enemy.active && enemy.diving &&
      this.time - enemy.lastDive < GAME.wave.obstacleAvoidDiveWindow &&
      x >= Math.min(enemy.x, enemy.targetX ?? GAME.width / 2) - GAME.wave.obstacleAvoidX &&
      x <= Math.max(enemy.x, enemy.targetX ?? GAME.width / 2) + GAME.wave.obstacleAvoidX) return true;
    return false;
  }

  _laneReserved(from, to) {
    const left = Math.min(from, to) - GAME.wave.obstacleAvoidX;
    const right = Math.max(from, to) + GAME.wave.obstacleAvoidX;
    for (const warning of this.warnings) if (warning.active &&
      warning.x >= left && warning.x <= right) return true;
    for (const obstacle of this.obstacles) if (obstacle.active &&
      obstacle.x >= left && obstacle.x <= right) return true;
    return false;
  }

  _spawnEnemy(type, x, y, boss = false) {
    let active = 0, free = -1;
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].active) active++;
      else if (free < 0) free = i;
    }
    if (active >= GAME.enemyCap) return null;
    const info = boss ? BOSSES[type] : ENEMIES[type];
    const hpFactor = Math.min(GAME.enemyHpCap, 1 + (this.wave - 1) * GAME.enemyHpGrowth);
    const hp = Math.ceil(info.hp * hpFactor + (boss ?
      Math.floor((this.wave - 1) / (GAME.wave.bossEvery * GAME.cycleBossCount)) * GAME.boss.hpPerCycle : 0));
    const size = boss ? GAME.bossSize : GAME.enemySize;
    const e = { id: this.nextId++, type, x, y, homeX: x, homeY: y, w: size.w, h: size.h,
      hp, maxHp: hp, active: true, age: 0, phase: this.random() * TAU, shotTimer: 0,
      actionTimer: 0, summonTimer: 0, burst: 0, diving: false, lastDive: -Infinity, invisible: false,
      shield: type === 'E11' ? MOTION.shield.shieldHp : type === 'B5' ? GAME.boss.shieldHP : 0,
      revived: false, boss, damage: info.damage, score: info.score, behavior: info.behavior };
    if (free < 0) this.enemies.push(e);
    else this.enemies[free] = e;
    return e;
  }

  _playerFire(dt) {
    const p = this.player;
    const weapon = WEAPONS[p.level - 1];
    const missiles = (weapon.missiles ?? 0) + Number(p.homing);
    if (missiles) {
      this.homingClock += dt;
      const interval = p.homing ? Math.min(GAME.player.homingInterval,
        weapon.missileInterval ?? GAME.player.homingInterval) : weapon.missileInterval;
      if (this.homingClock >= interval) {
        this.homingClock -= interval;
        if (this._nearestEnemy(p.x, p.y)) {
          for (let i = 0; i < missiles; i++) {
            const offset = (i - (missiles - 1) / 2) * GAME.player.homingSpacing;
            this._bullet(false, p.x + offset, p.y - p.h / 2,
              0, -GAME.player.homingSpeed, weapon.damage, { homing: true, kind: 'missile' });
          }
        }
      }
    } else this.homingClock = 0;
    this.fireClock += dt;
    while (this.fireClock >= weapon.interval) {
      this.fireClock -= weapon.interval;
      let fired = false;
      for (const shot of weapon.shots) {
        const bullet = this._bullet(false, p.x + shot.offset, p.y - p.h / 2,
          shot.vx, shot.vy, weapon.damage);
        if (!bullet) continue;
        bullet.kind = weapon.kind;
        bullet.pierce = weapon.pierce ?? 0;
        bullet.splashRadius = weapon.splashRadius ?? 0;
        bullet.splashDamage = weapon.splashDamage ?? 0;
        fired = true;
      }
      if (fired) this.onEvent({ type: 'shot', x: p.x, y: p.y });
    }
  }

  _bullet(enemy, x, y, vx, vy, damage, extra = null) {
    const pool = enemy ? this.enemyBullets : this.bullets;
    const cap = enemy ? GAME.enemyBulletCap : GAME.player.bulletCap;
    let active = 0, bullet = null;
    for (const candidate of pool) {
      if (candidate.active) active++;
      else if (!bullet) bullet = candidate;
    }
    if (active >= cap) return null;
    if (!bullet) {
      if (pool.length >= cap) return null;
      bullet = enemy ? {} : { hitIds: [] };
      pool.push(bullet);
    }
    bullet.x = x; bullet.y = y; bullet.vx = vx; bullet.vy = vy;
    bullet.w = bullet.h = enemy ? GAME.enemyBulletSize : GAME.playerShotSize;
    bullet.damage = damage; bullet.homing = false; bullet.slow = false;
    bullet.kind = 'shot'; bullet.delay = 0; bullet.active = true; bullet.age = 0; bullet.enemy = enemy;
    bullet.pierce = 0; bullet.splashRadius = 0; bullet.splashDamage = 0;
    if (!enemy) bullet.hitIds.length = 0;
    if (extra) Object.assign(bullet, extra);
    return bullet;
  }

  _nearestEnemy(x, y) {
    let nearest = null, best = Infinity;
    for (const e of this.enemies) {
      if (!e.active || e.invisible) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < best) { nearest = e; best = d; }
    }
    return nearest;
  }

  _moveEnemies(dt) {
    const speedFactor = Math.min(GAME.enemySpeedCap, 1 + (this.wave - 1) * GAME.enemySpeedGrowth);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      e.age += dt;
      e.shotTimer += dt;
      e.actionTimer += dt;
      if (e.boss) { this._moveBoss(e, dt, speedFactor); continue; }
      if (e.reviveAt) {
        if (this.time < e.reviveAt) continue;
        e.reviveAt = 0;
        e.invisible = false;
        e.y = e.homeY;
      }
      const t = e.age + e.phase;
      const formationX = e.homeX + Math.sin(t * GAME.wave.driftSpeed) * GAME.wave.drift;
      const formationY = Math.min(e.homeY + e.age * GAME.wave.advanceSpeed, GAME.enemyAdvanceLimit);
      switch (e.behavior) {
        case 'dive':
          if (this.wave > GAME.wave.earlyWaveEnd && e.age > MOTION.dive.start &&
            e.actionTimer >= MOTION.dive.cooldown && !e.diving &&
            !this._laneReserved(e.x, this.player.x)) {
            e.diving = true; e.actionTimer = 0; e.lastDive = this.time; e.targetX = this.player.x;
          }
          if (e.diving) {
            e.y += MOTION.dive.speed * speedFactor * dt;
            e.x += clamp(e.targetX - e.x, -MOTION.dive.speed * dt, MOTION.dive.speed * dt);
          } else { e.x = formationX; e.y = formationY; }
          break;
        case 'ram':
          if (e.age > MOTION.ram.start) {
            e.y += (MOTION.ram.speed + e.actionTimer * MOTION.ram.acceleration) * speedFactor * dt;
            e.x += Math.sign(this.player.x - e.x) * MOTION.ram.speed * dt * MOTION.ram.steer;
          } else { e.x = formationX; e.y = formationY; }
          break;
        case 'serpent':
          e.y += MOTION.serpent.speed * speedFactor * dt;
          e.x = e.homeX + Math.sin(t * MOTION.serpent.frequency) * MOTION.serpent.amplitude;
          break;
        case 'bomber':
          e.y = Math.min(e.y + MOTION.bomber.advance * speedFactor * dt, GAME.enemyAdvanceLimit);
          e.x = e.homeX + Math.sin(t * MOTION.bomber.frequency) * MOTION.bomber.wander;
          break;
        case 'launcher':
        case 'jammer': {
          const setting = MOTION[e.behavior];
          e.y += (setting.hover - e.y) * dt;
          e.x = e.homeX + Math.sin(t * setting.frequency) * setting.wander;
          break;
        }
        case 'cloak':
          e.invisible = (e.age % MOTION.cloak.period) < MOTION.cloak.hidden;
          e.x = e.invisible ? clamp(e.x + Math.sign(this.player.x - e.x) * MOTION.cloak.dashSpeed * dt,
            e.w / 2, GAME.width - e.w / 2) : formationX;
          e.y = formationY;
          break;
        case 'repair': {
          let ally = null;
          for (const candidate of this.enemies) if (candidate !== e && candidate.active && !candidate.boss && candidate.hp < candidate.maxHp) {
            ally = candidate; break;
          }
          e.x = (ally?.x ?? e.homeX) + Math.cos(t * MOTION.repair.orbitSpeed) * MOTION.repair.orbitRadius;
          e.y = (ally?.y ?? e.homeY) + Math.sin(t * MOTION.repair.orbitSpeed) * MOTION.repair.orbitRadius;
          if (ally && e.actionTimer >= MOTION.repair.healInterval) {
            e.actionTimer = 0;
            ally.hp = Math.min(ally.maxHp, ally.hp + Math.ceil(ally.maxHp * MOTION.repair.heal));
          }
          break;
        }
        case 'shield': e.x = formationX; e.y = Math.min(e.y + MOTION.shield.advance * dt, GAME.enemyAdvanceLimit); break;
        case 'minelayer':
          e.y += MOTION.minelayer.speed * speedFactor * dt;
          e.x = e.homeX + Math.sin(t * MOTION.minelayer.period) * MOTION.minelayer.sway;
          break;
        case 'intercept':
          if (e.age > MOTION.intercept.start && e.actionTimer > MOTION.intercept.cooldown &&
            !e.diving && !this._laneReserved(e.x, GAME.width / 2)) {
            e.diving = true; e.actionTimer = 0; e.lastDive = this.time; e.burst = MOTION.attack.interceptBurst;
          }
          if (e.diving) {
            e.y += MOTION.intercept.speed * speedFactor * dt;
            e.x += Math.sign(GAME.width / 2 - e.x) * MOTION.intercept.speed * dt;
          } else { e.x = formationX; e.y = formationY; }
          break;
        case 'spiral':
          e.x = e.homeX + Math.cos(t * MOTION.spiral.speed) * MOTION.spiral.radius;
          e.y = e.homeY + Math.sin(t * MOTION.spiral.speed) * MOTION.spiral.radius;
          break;
        case 'carrier':
          e.x = e.homeX + Math.sin(t) * MOTION.carrier.wander;
          e.y += (MOTION.carrier.hover - e.y) * dt;
          break;
        case 'revive':
          e.x = formationX;
          e.y += e.revived ? MOTION.revive.speed * dt : (formationY - e.y) * dt;
          break;
        default: e.x = formationX; e.y = formationY;
      }
      if (e.y > GAME.height + e.h && !e.diving) e.active = false;
    }
  }

  _moveBoss(e, dt, speedFactor) {
    const b = GAME.boss;
    e.x = GAME.width / 2 + Math.sin(e.age * b.hoverSpeed + e.phase) * b.hoverRange;
    if (e.behavior === 'assassin') {
      e.invisible = e.actionTimer % b.cloakInterval < b.cloakDuration;
      if (e.invisible) e.x = clamp(this.player.x + Math.sin(e.phase) * b.hoverRange / 2,
        e.w / 2, GAME.width - e.w / 2);
    }
    if (e.behavior === 'abyss') e.phaseIndex = Math.floor(e.age / b.phaseInterval) % 3;
    if (e.behavior === 'plasma' || (e.behavior === 'abyss' && e.phaseIndex === 2)) {
      if (e.actionTimer >= b.dashInterval && !e.diving) { e.diving = true; e.actionTimer = 0; }
      if (e.diving) {
        e.y += b.dashSpeed * speedFactor * dt;
        if (e.y > GAME.height + e.h) { e.y = b.hoverY; e.diving = false; }
      }
    }
    if (e.behavior === 'minefield' && e.actionTimer >= b.shieldRegen && !e.shield) {
      e.shield = b.shieldHP; e.actionTimer = 0;
    }
  }

  _moveBullets(dt) {
    this._moveBulletPool(this.bullets, dt);
    this._moveBulletPool(this.enemyBullets, dt);
  }

  _moveBulletPool(pool, dt) {
    for (const bullet of pool) {
      if (!bullet.active) continue;
      bullet.age += dt;
      if (bullet.delay > 0) { bullet.delay -= dt; continue; }
      if (!bullet.enemy && bullet.homing) {
        const target = this._nearestEnemy(bullet.x, bullet.y);
        if (target) {
          const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
          const current = Math.atan2(bullet.vy, bullet.vx);
          const delta = Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
          const turn = clamp(delta, -GAME.player.homingTurn * dt, GAME.player.homingTurn * dt);
          bullet.vx = Math.cos(current + turn) * GAME.player.homingSpeed;
          bullet.vy = Math.sin(current + turn) * GAME.player.homingSpeed;
        }
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.kind === 'bomb' && bullet.y >= GAME.bombBlastY) {
        bullet.active = false;
        this.onEvent({ type: 'explosion', x: bullet.x, y: bullet.y });
        if (Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y) < GAME.bombBlastRadius)
          this.damagePlayer(bullet.damage);
        continue;
      }
      if (bullet.age >= (bullet.kind === 'mine' ? GAME.mineLifetime : GAME.enemyBulletLifetime) ||
        bullet.x < -bullet.w || bullet.x > GAME.width + bullet.w ||
        bullet.y < -bullet.h || bullet.y > GAME.height + bullet.h) bullet.active = false;
    }
  }

  _moveObstacles(dt) {
    for (const warning of this.warnings) {
      if (!warning.active) continue;
      warning.time -= dt;
      if (warning.time <= 0) {
        warning.active = false;
        let visible = 0;
        for (const obstacle of this.obstacles) if (obstacle.active) visible++;
        if (!this.boss && visible < GAME.obstacleCap)
          this.obstacles.push({ x: warning.x, y: -GAME.obstacleSize / 2,
            w: GAME.obstacleSize, h: GAME.obstacleSize, hp: GAME.wave.obstacleHP, active: true });
      }
    }
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) continue;
      obstacle.y += GAME.wave.obstacleBaseSpeed * dt;
      if (obstacle.y > GAME.height + obstacle.h) obstacle.active = false;
    }
  }

  _movePickups(dt) {
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      pickup.y += GAME.pickupSpeed * dt;
      if (pickup.y > GAME.height + pickup.h) pickup.active = false;
    }
  }

  _resolveCollisions() {
    const p = this.player;
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      for (const obstacle of this.obstacles) {
        if (obstacle.active && overlaps(bullet, obstacle)) {
          bullet.active = false;
          obstacle.hp -= bullet.damage;
          if (obstacle.hp <= 0) {
            obstacle.active = false; this._award(GAME.wave.obstacleScore);
            this.onEvent({ type: 'explosion', x: obstacle.x, y: obstacle.y });
          }
          break;
        }
      }
      if (!bullet.active) continue;
      for (const e of this.enemies) {
        if (!e.active || e.invisible || bullet.hitIds.includes(e.id) || !overlaps(bullet, e)) continue;
        bullet.hitIds.push(e.id);
        const penetrated = this._damageEnemy(e, bullet.damage);
        if (penetrated && bullet.splashRadius) {
          this.onEvent({ type: 'plasma', x: e.x, y: e.y });
          const radiusSquared = bullet.splashRadius ** 2;
          for (const nearby of this.enemies) {
            if (!nearby.active || nearby.invisible || bullet.hitIds.includes(nearby.id) ||
              (nearby.x - e.x) ** 2 + (nearby.y - e.y) ** 2 > radiusSquared) continue;
            bullet.hitIds.push(nearby.id);
            this._damageEnemy(nearby, bullet.splashDamage);
          }
        }
        if (!penetrated || bullet.pierce === 0) { bullet.active = false; break; }
        bullet.pierce--;
      }
    }
    for (const obstacle of this.obstacles) if (obstacle.active && overlaps(p, obstacle, GAME.player.hitScale)) {
      obstacle.active = false;
      this.damagePlayer(0, { obstacle: true });
      if (this.state !== 'playing') return;
    }
    for (const bullet of this.enemyBullets) if (bullet.active && bullet.delay <= 0 &&
      overlaps(p, bullet, GAME.player.hitScale)) {
      bullet.active = false;
      const damaged = this.damagePlayer(bullet.damage);
      if (damaged && bullet.slow && this.state === 'playing') p.slow = GAME.player.slowDuration;
      if (this.state !== 'playing') return;
    }
    for (const e of this.enemies) if (e.active && overlaps(p, e, GAME.player.hitScale)) {
      this.damagePlayer(e.damage);
      if (!e.boss) e.active = false;
      if (this.state !== 'playing') return;
    }
    for (const pickup of this.pickups) if (pickup.active && overlaps(p, pickup, GAME.player.hitScale)) {
      pickup.active = false;
      this.collect(pickup.type);
    }
  }

  _damageEnemy(enemy, damage) {
    if (enemy.shield > 0) {
      enemy.shield--;
      this.onEvent({ type: 'shield', x: enemy.x, y: enemy.y, target: enemy, survived: true });
      return false;
    }
    enemy.hp -= damage;
    this.onEvent({ type: 'hit', x: enemy.x, y: enemy.y, target: enemy, survived: enemy.hp > 0 });
    if (enemy.hp <= 0) this._kill(enemy);
    return true;
  }

  damagePlayer(amount, { obstacle = false } = {}) {
    if (this.state !== 'playing') return false;
    const p = this.player;
    if (obstacle) {
      if (this.lifeLostThisStep) return false;
      this.combo = 0;
      this._loseLife('obstacle');
      return true;
    }
    if (!Number.isFinite(amount) || amount <= 0 || p.invulnerable > 0) return false;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = GAME.player.invulnerability;
      this.onEvent({ type: 'shield', x: p.x, y: p.y, target: p, survived: true });
      return false;
    }
    if (this.wave <= GAME.wave.earlyWaveEnd) {
      amount = Math.min(amount, GAME.wave.earlyCollisionDamageCap,
        Math.max(0, GAME.wave.earlyTotalDamageCap - this.earlyDamage));
      this.earlyDamage += amount;
    }
    if (amount <= 0) return false;
    p.hp -= amount;
    this.combo = 0;
    this.onEvent({ type: 'hit', x: p.x, y: p.y, target: p, survived: p.hp > 0 });
    if (p.hp <= 0) this._loseLife();
    else p.invulnerable = GAME.player.invulnerability;
    return true;
  }

  _loseLife(reason = 'damage') {
    if (this.lifeLostThisStep) return;
    this.stepEpoch++;
    this.lifeLostThisStep = true;
    const p = this.player;
    p.lives--;
    p.hp = 0;
    p.active = false;
    p.level = Math.max(1, p.level - 1);
    p.homing = false;
    p.shield = false;
    p.slow = 0;
    p.invulnerable = 0;
    this.slowMotion = 0;
    this.state = 'dying';
    this.deathTimer = GAME.player.deathDuration;
    this.deathReason = reason;
    for (const pickup of this.pickups) pickup.active = false;
    for (const pool of [this.bullets, this.enemyBullets]) for (const bullet of pool) bullet.active = false;
    // Remove only wreckage already touching the lost aircraft, not the rest of the battlefield.
    for (const obstacle of this.obstacles)
      if (obstacle.active && overlaps(p, obstacle, GAME.player.hitScale)) obstacle.active = false;
    this.onEvent({ type: 'death', x: p.x, y: p.y, lives: p.lives, reason });
  }

  _kill(e, bomb = false) {
    if (!e.active) return;
    if (e.type === 'E15' && !e.revived && !bomb) {
      e.revived = true;
      e.hp = e.maxHp;
      e.invisible = true;
      this.onEvent({ type: 'explosion', x: e.x, y: e.y });
      e.reviveAt = this.time + MOTION.revive.delay;
      return;
    }
    e.active = false;
    this.combo = Math.min(GAME.comboCap, this.combo + 1);
    this.kills++;
    this._award(Math.floor(e.score * this.combo * (bomb ? GAME.bombScoreFactor : 1)));
    this.onEvent({ type: 'explosion', x: e.x, y: e.y, boss: e.boss });
    if (e.boss) {
      this.boss = null;
      this.slowMotion = GAME.wave.bossSlowMotion;
      this._drop('heal', e.x, e.y, true);
      for (const ally of this.enemies) if (ally !== e) ally.active = false;
      for (const bullet of this.enemyBullets) bullet.active = false;
    } else {
      if (this.waveDrop) {
        this._drop(this.waveDrop, e.x, e.y);
        this.waveDrop = null;
        this.firstDrop = true;
      }
      if (this.random() < GAME.wave.healChance) this._drop('heal', e.x, e.y);
    }
  }

  _drop(type, x, y, guaranteed = false) {
    let active = 0;
    for (const pickup of this.pickups) if (pickup.active) active++;
    if (active >= GAME.pickupCap && !guaranteed) return;
    let drop = null;
    for (const pickup of this.pickups) if (!pickup.active) { drop = pickup; break; }
    if (!drop && active >= GAME.pickupCap) {
      for (const pickup of this.pickups) if (pickup.type !== 'life') { drop = pickup; break; }
      drop ??= this.pickups[0];
    }
    if (!drop) {
      drop = { w: GAME.pickupSize, h: GAME.pickupSize };
      this.pickups.push(drop);
    }
    drop.type = type; drop.x = clamp(x, GAME.pickupSize, GAME.width - GAME.pickupSize);
    drop.y = y; drop.active = true;
  }

  collect(type) {
    if (this.state !== 'playing' || !PICKUPS.includes(type)) return false;
    const p = this.player;
    switch (type) {
      case 'power': p.level = Math.min(GAME.player.maxLevel, p.level + 1);
        this.onEvent({ type: 'upgrade', x: p.x, y: p.y }); break;
      case 'homing': p.homing = true; break;
      case 'shield': p.shield = true; break;
      case 'bomb':
        this.onEvent({ type: 'bomb', x: p.x, y: p.y });
        for (const e of this.enemies) if (e.active && !e.boss) this._kill(e, true);
        if (this.boss?.active) this._kill(this.boss, true);
        for (const bullet of this.enemyBullets) bullet.active = false;
        break;
      case 'life': p.lives++; p.hp = GAME.player.hp;
        this.onEvent({ type: 'life', x: p.x, y: p.y }); break;
      case 'heal': p.hp = Math.min(GAME.player.hp, p.hp + GAME.healAmount); break;
      default: break;
    }
    this.onEvent({ type: 'pickup', pickup: type, x: p.x, y: p.y });
    return true;
  }

  _award(points) {
    const before = Math.floor(this.score / GAME.bonusLifeScore);
    this.score += points;
    const after = Math.floor(this.score / GAME.bonusLifeScore);
    const awards = Math.min(GAME.bonusLifeCap - this.bonusLives, after - before);
    for (let i = 0; i < awards; i++) {
      this.bonusLives++;
      this.player.lives++;
      this.onEvent({ type: 'life', x: this.player.x, y: this.player.y });
    }
    this.player.bank = this.score % GAME.bonusLifeScore;
  }

  _advanceWave(dt) {
    const bossWave = this.wave % GAME.wave.bossEvery === 0;
    const allSpawned = this.spawned >= this.spawnCount;
    let alive = false;
    for (const enemy of this.enemies) if (enemy.active) { alive = true; break; }
    const cleared = allSpawned && !alive && this.waveTime >= GAME.wave.minDuration;
    const timeout = !bossWave && this.waveTime >= GAME.wave.duration;
    if (!cleared && !timeout) return;
    if (this.waveGap === 0) {
      if (cleared && !bossWave) this._award(this.wave * GAME.clearScore);
      this.waveGap = GAME.wave.gap;
      if (timeout) for (const e of this.enemies) e.active = false;
    }
    this.waveGap -= dt;
    if (this.waveGap <= 0) this.startWave(this.wave + 1);
  }
}
