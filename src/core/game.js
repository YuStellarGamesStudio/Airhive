import { GAME, ENEMIES, BOSSES, FORMATIONS, MOTION, PICKUPS } from '../data/game.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const overlaps = (a, b, scale = 1) => Math.abs(a.x - b.x) * 2 < a.w * scale + b.w &&
  Math.abs(a.y - b.y) * 2 < a.h * scale + b.h;
const TAU = Math.PI * 2;

export class Game {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
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
    this.fireClock = GAME.player.fireInterval;
    this.homingClock = 0;
    this.slowMotion = 0;
    this.firstDrop = false;
    this.startWave(1);
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  togglePause() { if (this.state === 'paused') this.resume(); else this.pause(); }

  startWave(number) {
    if (this.state !== 'playing' || !Number.isInteger(number) || number < 1) return;
    this.wave = number;
    this.waveTime = 0;
    this.waveGap = 0;
    this.spawned = 0;
    this.nextSpawn = GAME.wave.initialDelay;
    this.spawnCount = Math.min(GAME.enemyCap, Math.min(GAME.wave.countCap,
      GAME.wave.baseCount + Math.floor((number - 1) / GAME.wave.growthEvery)));
    this.pattern = (number - 1) % FORMATIONS.length;
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
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // A caller normally passes GAME.step; a long frame cannot skip collisions or timers.
    let remaining = Math.min(dt, GAME.step * GAME.maxStepsPerUpdate);
    while (remaining > 0 && this.state === 'playing') {
      const slice = Math.min(remaining, GAME.step);
      this._step(slice * (this.slowMotion > 0 ? GAME.wave.bossSlowFactor : 1), input);
      this.slowMotion = Math.max(0, this.slowMotion - slice);
      remaining -= slice;
    }
  }

  _step(dt, input) {
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
    this._moveBullets(dt);
    if (this.state !== 'playing') return;
    this._moveObstacles(dt);
    this._movePickups(dt);
    this._resolveCollisions();
    if (this.state === 'playing') this._advanceWave(dt);
  }

  _waveTick(dt) {
    if (this.wave === 1 && this.waveTime >= GAME.wave.firstDropTime && !this.firstDrop) {
      this._drop('power', this.player.x, GAME.pickupDropY);
      this.firstDrop = true;
      this.waveDrop = null;
    }
    if (!this.boss && this.spawned < this.spawnCount && this.waveTime >= this.nextSpawn) {
      const slot = this.spawned++;
      const profile = FORMATIONS[this.pattern];
      const column = slot % profile.columns;
      const row = Math.floor(slot / profile.columns);
      const relative = column - (profile.columns - 1) / 2;
      let offset = 0;
      switch (profile.shape) {
        case 'v': offset = Math.abs(relative) * GAME.formationOffsets.v; break;
        case 'arc': offset = relative * relative * GAME.formationOffsets.arc; break;
        case 'stagger': offset = column % 2 * GAME.formationOffsets.stagger; break;
        case 'wings': offset = (profile.columns / 2 - Math.abs(relative)) * GAME.formationOffsets.wings; break;
        case 'zigzag': offset = column % 2 ? -GAME.formationOffsets.zigzag : GAME.formationOffsets.zigzag; break;
        default: break;
      }
      const unlocked = Math.min(GAME.enemyTypeCount, GAME.earlyTypeCount +
        Math.max(0, this.wave - GAME.wave.unlockStart + 1) * GAME.wave.unlockPerWave);
      const introduction = this.wave === GAME.wave.lifeEvery + 1 ? GAME.wave.lifeEvery : this.wave;
      const newly = GAME.earlyTypeCount + (introduction - GAME.wave.unlockStart) * GAME.wave.unlockPerWave;
      const kind = introduction >= GAME.wave.unlockStart && (slot === 1 || slot === 2) ?
        Math.min(unlocked, newly + slot) : slot % 3 === 0 ? 1 : 1 + ((slot + this.wave * 3) % unlocked);
      this._spawnEnemy(`E${kind}`, GAME.width / 2 + relative * GAME.wave.columnSpacing,
        GAME.wave.baseY + row * GAME.wave.rowSpacing + offset);
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
    this.fireClock += dt;
    while (this.fireClock >= GAME.player.fireInterval) {
      this.fireClock -= GAME.player.fireInterval;
      const p = this.player;
      const offsets = p.level === GAME.player.maxLevel ? GAME.shotOffsets : GAME.player.volleyOffsets[p.level - 1];
      let fired = false;
      for (let i = 0; i < offsets.length; i++) {
        const angle = p.level === GAME.player.maxLevel ? GAME.shotFan[i] : 0;
        if (this._bullet(false, p.x + offsets[i], p.y - p.h / 2,
          Math.sin(angle) * GAME.player.bulletSpeed,
          -Math.cos(angle) * GAME.player.bulletSpeed, GAME.player.bulletDamage)) fired = true;
      }
      if (fired) this.onEvent({ type: 'shot', x: p.x, y: p.y });
    }
    if (!this.player.homing) return;
    this.homingClock += dt;
    if (this.homingClock >= GAME.player.homingInterval) {
      this.homingClock -= GAME.player.homingInterval;
      const target = this._nearestEnemy(this.player.x, this.player.y);
      if (target) this._bullet(false, this.player.x, this.player.y - this.player.h / 2,
        0, -GAME.player.homingSpeed, GAME.player.bulletDamage, { homing: true });
    }
  }

  _bullet(enemy, x, y, vx, vy, damage, extra = null) {
    const pool = enemy ? this.enemyBullets : this.bullets;
    const other = enemy ? this.bullets : this.enemyBullets;
    let active = 0, playerActive = 0;
    for (const candidate of this.bullets) if (candidate.active) { active++; playerActive++; }
    for (const candidate of this.enemyBullets) if (candidate.active) active++;
    if (active >= GAME.projectileCap || (!enemy && playerActive >= GAME.player.bulletCap)) return null;
    let bullet = null;
    for (const candidate of pool) if (!candidate.active) { bullet = candidate; break; }
    if (!bullet) {
      for (let i = 0; i < other.length; i++) if (!other[i].active) {
        bullet = other[i];
        other[i] = other[other.length - 1];
        other.pop();
        pool.push(bullet);
        break;
      }
    }
    if (!bullet) {
      if (pool.length + other.length >= GAME.projectileCap) return null;
      bullet = {};
      pool.push(bullet);
    }
    bullet.x = x; bullet.y = y; bullet.vx = vx; bullet.vy = vy;
    bullet.w = bullet.h = enemy ? GAME.enemyBulletSize : GAME.playerShotSize;
    bullet.damage = damage; bullet.homing = false; bullet.slow = false;
    bullet.kind = 'shot'; bullet.delay = 0; bullet.active = true; bullet.age = 0; bullet.enemy = enemy;
    if (extra) Object.assign(bullet, extra);
    return bullet;
  }

  _aim(e, speed, damage = e.damage, extras = null) {
    const dx = this.player.x - e.x, dy = this.player.y - e.y;
    const distance = Math.hypot(dx, dy) || 1;
    return this._bullet(true, e.x, e.y + e.h / 2, dx / distance * speed, dy / distance * speed, damage, extras);
  }

  _fan(e, count, spread, speed, damage = e.damage,
    angle = Math.atan2(this.player.x - e.x, this.player.y - e.y), originOffset = 0) {
    for (let i = 0; i < count; i++) {
      const theta = angle + (i - (count - 1) / 2) * spread;
      this._bullet(true, e.x + originOffset, e.y + e.h / 2,
        Math.sin(theta) * speed, Math.cos(theta) * speed, damage);
    }
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
            if (e.actionTimer >= MOTION.dive.shotAt && !e.burst) {
              this._aim(e, MOTION.attack.enemyBullet); e.burst = 1;
            }
            if (e.y > GAME.height + e.h) { e.y = e.homeY; e.diving = false; e.burst = 0; }
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
        case 'tracker':
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
            if (e.burst && e.shotTimer > MOTION.attack.intercept) {
              this._aim(e, MOTION.attack.enemyBullet); e.shotTimer = 0; e.burst--;
            }
            if (e.y > GAME.height + e.h) { e.y = e.homeY; e.diving = false; }
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
      if (e.y > GAME.height + e.h) { e.active = false; continue; }
      this._enemyAttack(e);
    }
  }

  _enemyAttack(e) {
    const attack = MOTION.attack;
    const cadence = Math.max(GAME.enemyFireFloor,
      GAME.enemyShotInterval - Math.floor((this.wave - 1) / GAME.shotDensityEvery) *
        GAME.enemyShotStagger) / GAME.enemyShotInterval;
    switch (e.behavior) {
      case 'scatter': if (e.shotTimer >= (attack.scatter + e.phase / TAU) * cadence) {
        this._fan(e, attack.scatterCount, attack.scatterAngle, attack.enemyBullet); e.shotTimer = 0;
      } break;
      case 'bomber': if (e.shotTimer >= attack.bomber * cadence) {
        this._bullet(true, e.x, e.y + e.h / 2, 0, attack.bombSpeed, e.damage,
          { kind: 'bomb', w: GAME.mineSize, h: GAME.mineSize }); e.shotTimer = 0;
      } break;
      case 'tracker': if (!e.burst && e.shotTimer >= attack.tracker * cadence) {
        e.burst = attack.trackerBurst; e.shotTimer = 0;
      }
        if (e.burst && e.shotTimer >= attack.trackingGap) {
          this._aim(e, GAME.missileSpeed, e.damage, { kind: 'missile', homing: true });
          e.shotTimer = 0; e.burst--;
        } break;
      case 'cloak': if (!e.invisible && e.shotTimer >= attack.cloak * cadence) {
        this._aim(e, attack.enemyBullet); e.shotTimer = 0;
      } break;
      case 'jammer': if (e.shotTimer >= attack.jammer * cadence) {
        this._aim(e, attack.enemyBullet, e.damage, { slow: true }); e.shotTimer = 0;
      } break;
      case 'minelayer': if (e.shotTimer >= attack.mine * cadence) { this._mine(e.x, e.y, e.damage); e.shotTimer = 0; } break;
      case 'spiral': if (e.shotTimer >= attack.spiral * cadence) {
        this._fan(e, attack.spiralCount, TAU / attack.spiralCount, attack.enemyBullet, e.damage, e.age);
        e.shotTimer = 0;
      } break;
      case 'carrier': if (e.shotTimer >= MOTION.carrier.summonInterval * cadence) {
        this._spawnEnemy('E1', e.x, e.y + e.h); e.shotTimer = 0;
      } break;
      default: break;
    }
  }

  _mine(x, y, damage) {
    this._bullet(true, x, y, 0, MOTION.attack.mineSpeed, damage,
      { kind: 'mine', w: GAME.mineSize, h: GAME.mineSize });
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
    this._bossAttack(e);
  }

  _bossAttack(e) {
    const b = GAME.boss;
    const patterns = b.patterns;
    const interval = e.behavior === 'minefield' ? patterns.minefield.interval : b.fireInterval;
    if (e.shotTimer < interval || (e.behavior === 'assassin' && e.invisible)) return;
    e.shotTimer = 0;
    const speed = GAME.enemyBulletSpeed;
    switch (e.behavior) {
      case 'hive':
        this._fan(e, patterns.hive.count, patterns.hive.spread, speed);
        e.summonTimer += interval;
        if (e.summonTimer >= b.spawnInterval) {
          e.summonTimer = 0;
          this._spawnEnemy(e.age % (b.spawnInterval * 2) < b.spawnInterval ? 'E1' : 'E5',
            e.x, e.y + e.h / 2);
        }
        break;
      case 'crossfire':
        for (let side = -1; side <= 1; side += 2) {
          const turretX = side * e.w * patterns.crossfire.turretOffset;
          this._fan(e, patterns.crossfire.count, patterns.crossfire.spread, speed, e.damage,
            Math.atan2(this.player.x - e.x - turretX - side * patterns.crossfire.lead,
              this.player.y - e.y), turretX);
        }
        break;
      case 'fortress':
        this._fan(e, patterns.fortress.count, patterns.fortress.spread, speed);
        if (Math.floor(e.age / interval) % patterns.fortress.laserEvery === 0) this._laser(e);
        break;
      case 'assassin':
        this._fan(e, patterns.assassin.count, patterns.assassin.spread,
          speed * patterns.assassin.speedFactor);
        break;
      case 'minefield':
        for (let i = 0; i < patterns.minefield.count; i++)
          this._mine(e.x + (i - (patterns.minefield.count - 1) / 2) * e.w / patterns.minefield.count,
            e.y, e.damage);
        break;
      case 'missiles':
        for (let i = 0; i < patterns.missiles.count; i++) {
          const offset = i - (patterns.missiles.count - 1) / 2;
          this._bullet(true, e.x + offset * patterns.missiles.spacing, e.y + e.h / 2,
            offset * patterns.missiles.spread, GAME.missileSpeed, e.damage,
            { kind: 'missile', homing: true });
        }
        e.summonTimer += interval;
        if (e.summonTimer >= b.spawnInterval) {
          e.summonTimer = 0;
          this._spawnEnemy('E7', e.x, e.y + e.h / 2);
        }
        break;
      case 'plasma':
        this._fan(e, patterns.plasma.count, TAU / patterns.plasma.count,
          speed, patterns.plasma.damage, e.age);
        break;
      case 'abyss':
        if (e.phaseIndex === 0)
          this._fan(e, patterns.abyss.barrage, patterns.abyss.barrageSpread, speed);
        else if (e.phaseIndex === 1) {
          e.summonTimer += interval;
          if (e.summonTimer >= b.spawnInterval) {
            e.summonTimer = 0;
            this._spawnEnemy('E5', e.x, e.y + e.h / 2);
          }
          this._fan(e, patterns.abyss.escort, patterns.abyss.escortSpread, speed);
        } else this._fan(e, patterns.abyss.spiral, TAU / patterns.abyss.spiral,
          speed, e.damage, e.age);
        break;
      default: break;
    }
  }

  _laser(e) {
    this._bullet(true, this.player.x, e.y + e.h / 2, 0, GAME.boss.laserSpeed,
      e.damage, { kind: 'laser', w: GAME.boss.laserWidth, h: GAME.boss.laserWidth,
        delay: GAME.boss.laserTelegraph });
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
      if (bullet.homing) {
        const target = bullet.enemy ? this.player : this._nearestEnemy(bullet.x, bullet.y);
        if (target) {
          const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
          const current = Math.atan2(bullet.vy, bullet.vx);
          const delta = Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
          const turn = clamp(delta, -(bullet.enemy ? GAME.missileTurn : GAME.player.homingTurn) * dt,
            (bullet.enemy ? GAME.missileTurn : GAME.player.homingTurn) * dt);
          const velocity = bullet.enemy ? GAME.missileSpeed : GAME.player.homingSpeed;
          bullet.vx = Math.cos(current + turn) * velocity;
          bullet.vy = Math.sin(current + turn) * velocity;
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
          if (--obstacle.hp <= 0) {
            obstacle.active = false; this._award(GAME.wave.obstacleScore);
            this.onEvent({ type: 'explosion', x: obstacle.x, y: obstacle.y });
          }
          break;
        }
      }
      if (!bullet.active) continue;
      for (const e of this.enemies) {
        if (!e.active || e.invisible || !overlaps(bullet, e)) continue;
        bullet.active = false;
        if (e.shield > 0) { e.shield--; this.onEvent({ type: 'shield', x: e.x, y: e.y }); }
        else {
          e.hp -= bullet.damage;
          this.onEvent({ type: 'hit', x: e.x, y: e.y });
          if (e.hp <= 0) this._kill(e);
        }
        break;
      }
    }
    for (const obstacle of this.obstacles) if (obstacle.active && overlaps(p, obstacle, GAME.player.hitScale)) {
      obstacle.active = false;
      this.damagePlayer(0, { obstacle: true });
    }
    for (const bullet of this.enemyBullets) if (bullet.active && bullet.delay <= 0 &&
      overlaps(p, bullet, GAME.player.hitScale)) {
      bullet.active = false;
      const damaged = this.damagePlayer(bullet.damage);
      if (damaged && bullet.slow && this.state === 'playing') p.slow = GAME.player.slowDuration;
    }
    for (const e of this.enemies) if (e.active && overlaps(p, e, GAME.player.hitScale)) {
      this.damagePlayer(e.damage);
      if (!e.boss) e.active = false;
    }
    for (const pickup of this.pickups) if (pickup.active && overlaps(p, pickup, GAME.player.hitScale)) {
      pickup.active = false;
      this.collect(pickup.type);
    }
  }

  damagePlayer(amount, { obstacle = false } = {}) {
    if (this.state !== 'playing') return false;
    const p = this.player;
    if (obstacle) {
      if (this.lifeLostThisStep) return false;
      this.combo = 0;
      this._loseLife();
      return true;
    }
    if (!Number.isFinite(amount) || amount <= 0 || p.invulnerable > 0) return false;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = GAME.player.invulnerability;
      this.onEvent({ type: 'shield', x: p.x, y: p.y });
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
    this.onEvent({ type: 'hit', x: p.x, y: p.y });
    if (p.hp <= 0) this._loseLife();
    else p.invulnerable = GAME.player.invulnerability;
    return true;
  }

  _loseLife() {
    if (this.lifeLostThisStep) return;
    this.lifeLostThisStep = true;
    const p = this.player;
    p.lives--;
    p.hp = GAME.player.hp;
    p.level = Math.max(1, p.level - 1);
    p.homing = false;
    p.shield = false;
    p.slow = 0;
    p.invulnerable = GAME.player.reviveInvulnerability;
    for (const pickup of this.pickups) pickup.active = false;
    for (const bullet of this.enemyBullets) bullet.active = false;
    this.onEvent({ type: 'explosion', x: p.x, y: p.y });
    if (p.lives <= 0) {
      p.hp = 0;
      this.state = 'gameover';
      this.onEvent({ type: 'gameover', score: this.score, wave: this.wave, kills: this.kills, time: this.time });
    }
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
