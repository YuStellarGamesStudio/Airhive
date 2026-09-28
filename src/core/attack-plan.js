import { GAME, MOTION } from '../data/game.js';

const TAU = Math.PI * 2;
const attacking = new Set(['dive', 'scatter', 'bomber', 'tracker', 'cloak', 'jammer',
  'minelayer', 'intercept', 'spiral', 'carrier']);

export const hasAttack = enemy => enemy.boss || attacking.has(enemy.behavior);

function bullet(result, x, y, vx, vy, damage, extra = null) {
  result.commands.push({ type: 'bullet', x, y, vx, vy, damage, extra });
}
function aim(result, enemy, player, speed, extra = null) {
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  bullet(result, enemy.x, enemy.y + enemy.h / 2,
    dx / distance * speed, dy / distance * speed, enemy.damage, extra);
}
function fan(result, enemy, player, count, spread, speed, damage = enemy.damage,
  angle = Math.atan2(player.x - enemy.x, player.y - enemy.y), originOffset = 0) {
  for (let i = 0; i < count; i++) {
    const theta = angle + (i - (count - 1) / 2) * spread;
    bullet(result, enemy.x + originOffset, enemy.y + enemy.h / 2,
      Math.sin(theta) * speed, Math.cos(theta) * speed, damage);
  }
}
function mine(result, x, y, damage) {
  bullet(result, x, y, 0, MOTION.attack.mineSpeed, damage,
    { kind: 'mine', w: GAME.mineSize, h: GAME.mineSize });
}
function summon(result, enemyType, x, y) {
  result.commands.push({ type: 'spawn', enemyType, x, y });
}

function regularAttack(result, enemy, player, cadence) {
  const attack = MOTION.attack;
  switch (enemy.behavior) {
    case 'dive':
      if (enemy.diving && enemy.actionTimer >= MOTION.dive.shotAt && !result.burst) {
        aim(result, enemy, player, attack.enemyBullet); result.burst = 1;
      }
      break;
    case 'intercept':
      if (enemy.diving && result.burst && result.shotTimer > attack.intercept) {
        aim(result, enemy, player, attack.enemyBullet); result.shotTimer = 0; result.burst--;
      }
      break;
    case 'scatter': if (result.shotTimer >= (attack.scatter + enemy.phase / TAU) * cadence) {
      fan(result, enemy, player, attack.scatterCount, attack.scatterAngle, attack.enemyBullet);
      result.shotTimer = 0;
    } break;
    case 'bomber': if (result.shotTimer >= attack.bomber * cadence) {
      bullet(result, enemy.x, enemy.y + enemy.h / 2, 0, attack.bombSpeed, enemy.damage,
        { kind: 'bomb', w: GAME.mineSize, h: GAME.mineSize }); result.shotTimer = 0;
    } break;
    case 'tracker':
      if (!result.burst && result.shotTimer >= attack.tracker * cadence) {
        result.burst = attack.trackerBurst; result.shotTimer = 0;
      }
      if (result.burst && result.shotTimer >= attack.trackingGap) {
        aim(result, enemy, player, GAME.missileSpeed, { kind: 'missile', homing: true });
        result.shotTimer = 0; result.burst--;
      }
      break;
    case 'cloak': if (!enemy.invisible && result.shotTimer >= attack.cloak * cadence) {
      aim(result, enemy, player, attack.enemyBullet); result.shotTimer = 0;
    } break;
    case 'jammer': if (result.shotTimer >= attack.jammer * cadence) {
      aim(result, enemy, player, attack.enemyBullet, { slow: true }); result.shotTimer = 0;
    } break;
    case 'minelayer': if (result.shotTimer >= attack.mine * cadence) {
      mine(result, enemy.x, enemy.y, enemy.damage); result.shotTimer = 0;
    } break;
    case 'spiral': if (result.shotTimer >= attack.spiral * cadence) {
      fan(result, enemy, player, attack.spiralCount, TAU / attack.spiralCount,
        attack.enemyBullet, enemy.damage, enemy.age); result.shotTimer = 0;
    } break;
    case 'carrier': if (result.shotTimer >= MOTION.carrier.summonInterval * cadence) {
      summon(result, 'E1', enemy.x, enemy.y + enemy.h); result.shotTimer = 0;
    } break;
    default: break;
  }
}

function bossAttack(result, enemy, player) {
  const boss = GAME.boss, patterns = boss.patterns;
  const interval = enemy.behavior === 'minefield' ? patterns.minefield.interval : boss.fireInterval;
  if (result.shotTimer < interval || (enemy.behavior === 'assassin' && enemy.invisible)) return;
  result.shotTimer = 0;
  const speed = GAME.enemyBulletSpeed;
  switch (enemy.behavior) {
    case 'hive':
      fan(result, enemy, player, patterns.hive.count, patterns.hive.spread, speed);
      result.summonTimer += interval;
      if (result.summonTimer >= boss.spawnInterval) {
        result.summonTimer = 0;
        summon(result, enemy.age % (boss.spawnInterval * 2) < boss.spawnInterval ? 'E1' : 'E5',
          enemy.x, enemy.y + enemy.h / 2);
      }
      break;
    case 'crossfire':
      for (let side = -1; side <= 1; side += 2) {
        const turretX = side * enemy.w * patterns.crossfire.turretOffset;
        fan(result, enemy, player, patterns.crossfire.count, patterns.crossfire.spread, speed, enemy.damage,
          Math.atan2(player.x - enemy.x - turretX - side * patterns.crossfire.lead,
            player.y - enemy.y), turretX);
      }
      break;
    case 'fortress':
      fan(result, enemy, player, patterns.fortress.count, patterns.fortress.spread, speed);
      if (Math.floor(enemy.age / interval) % patterns.fortress.laserEvery === 0)
        bullet(result, player.x, enemy.y + enemy.h / 2, 0, boss.laserSpeed, enemy.damage,
          { kind: 'laser', w: boss.laserWidth, h: boss.laserWidth, delay: boss.laserTelegraph });
      break;
    case 'assassin':
      fan(result, enemy, player, patterns.assassin.count, patterns.assassin.spread,
        speed * patterns.assassin.speedFactor);
      break;
    case 'minefield':
      for (let i = 0; i < patterns.minefield.count; i++)
        mine(result, enemy.x + (i - (patterns.minefield.count - 1) / 2) * enemy.w / patterns.minefield.count,
          enemy.y, enemy.damage);
      break;
    case 'missiles':
      for (let i = 0; i < patterns.missiles.count; i++) {
        const offset = i - (patterns.missiles.count - 1) / 2;
        bullet(result, enemy.x + offset * patterns.missiles.spacing, enemy.y + enemy.h / 2,
          offset * patterns.missiles.spread, GAME.missileSpeed, enemy.damage,
          { kind: 'missile', homing: true });
      }
      result.summonTimer += interval;
      if (result.summonTimer >= boss.spawnInterval) {
        result.summonTimer = 0;
        summon(result, 'E7', enemy.x, enemy.y + enemy.h / 2);
      }
      break;
    case 'plasma':
      fan(result, enemy, player, patterns.plasma.count, TAU / patterns.plasma.count,
        speed, patterns.plasma.damage, enemy.age);
      break;
    case 'abyss':
      if (enemy.phaseIndex === 0)
        fan(result, enemy, player, patterns.abyss.barrage, patterns.abyss.barrageSpread, speed);
      else if (enemy.phaseIndex === 1) {
        result.summonTimer += interval;
        if (result.summonTimer >= boss.spawnInterval) {
          result.summonTimer = 0;
          summon(result, 'E5', enemy.x, enemy.y + enemy.h / 2);
        }
        fan(result, enemy, player, patterns.abyss.escort, patterns.abyss.escortSpread, speed);
      } else fan(result, enemy, player, patterns.abyss.spiral, TAU / patterns.abyss.spiral,
        speed, enemy.damage, enemy.age);
      break;
    default: break;
  }
}

// Worker and single-thread paths share these decisions; only the caller commits effects.
export function planAttacks({ wave, player, enemies }) {
  const results = [];
  const cadence = Math.max(GAME.enemyFireFloor,
    GAME.enemyShotInterval - Math.floor((wave - 1) / GAME.shotDensityEvery) *
      GAME.enemyShotStagger) / GAME.enemyShotInterval;
  for (const enemy of enemies) {
    if (!hasAttack(enemy)) continue;
    const result = { id: enemy.id, shotTimer: enemy.shotTimer, burst: enemy.burst,
      summonTimer: enemy.summonTimer, commands: [] };
    if (enemy.boss) bossAttack(result, enemy, player);
    else regularAttack(result, enemy, player, cadence);
    if (result.commands.length || result.shotTimer !== enemy.shotTimer ||
      result.burst !== enemy.burst || result.summonTimer !== enemy.summonTimer) results.push(result);
  }
  return results;
}
