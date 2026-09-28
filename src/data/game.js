// Logical units are pixels and seconds. Only the caller owns the fixed-step accumulator.
const BULLET_SPEED = 900;
const pattern = (offsets, angles = []) => Object.freeze(offsets.map((offset, i) => Object.freeze({
  offset, vx: Math.sin(angles[i] ?? 0) * BULLET_SPEED,
  vy: -Math.cos(angles[i] ?? 0) * BULLET_SPEED,
})));
const single = pattern([0]);
const twin = pattern([-12, 12]);
const triple = pattern([-17, 0, 17]);
const spread = pattern([-25, -12, 0, 12, 25], [-0.34, -0.17, 0, 0.17, 0.34]);
const nova = pattern([-36, -24, -12, 0, 12, 24, 36], [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42]);

export const WEAPONS = Object.freeze([
  { id: 'single', shots: single, interval: 0.125, damage: 1, kind: 'shot' },
  { id: 'twin', shots: twin, interval: 0.125, damage: 1, kind: 'shot' },
  { id: 'triple', shots: triple, interval: 0.125, damage: 1, kind: 'shot' },
  { id: 'spread', shots: spread, interval: 0.125, damage: 1, kind: 'shot' },
  { id: 'rapid', shots: spread, interval: 0.09, damage: 1, kind: 'rapid' },
  { id: 'pierce', shots: spread, interval: 0.09, damage: 1, kind: 'pierce', pierce: 2 },
  { id: 'guided', shots: spread, interval: 0.09, damage: 1, kind: 'pierce', pierce: 2,
    missiles: 2, missileInterval: 0.6 },
  { id: 'plasma', shots: spread, interval: 0.125, damage: 2, kind: 'plasma', pierce: 2,
    missiles: 2, missileInterval: 0.55, splashRadius: 44, splashDamage: 1 },
  { id: 'rail', shots: spread, interval: 0.1, damage: 2, kind: 'rail', pierce: 4,
    missiles: 2, missileInterval: 0.5, splashRadius: 44, splashDamage: 1 },
  { id: 'nova', shots: nova, interval: 0.09, damage: 2, kind: 'nova', pierce: 4,
    missiles: 3, missileInterval: 0.4, splashRadius: 60, splashDamage: 2 },
].map((weapon) => Object.freeze(weapon)));

export const GAME = Object.freeze({
  width: 960, height: 540, step: 1 / 60, maxStepsPerUpdate: 8,
  player: { x: 480, y: 488, w: 54, h: 44, hp: 100, lives: 3, speed: 320, hitScale: 0.5,
    bulletSpeed: BULLET_SPEED, homingInterval: 0.45, homingSpacing: 18,
    homingSpeed: 610, homingTurn: 4.5, slowFactor: 0.55, slowDuration: 2,
    invulnerability: 1.6, reviveInvulnerability: 2.5, deathDuration: 1.2,
    maxLevel: WEAPONS.length, bulletCap: 64 },
  enemyBulletCap: 60, enemyCap: 90, pickupCap: 16, obstacleCap: 3,
  spawnPlanning: { maxWorkers: 4, lookahead: 8, jobTimeout: 1000 },
  enemyBulletSpeed: 250, enemyBulletSize: 10, enemyBulletLifetime: 5,
  enemyShotInterval: 3.2, enemyShotStagger: 0.85, enemyFireFloor: 1.25,
  enemySize: { w: 42, h: 36 }, bossSize: { w: 138, h: 92 },
  enemyHpGrowth: 0.075, enemyHpCap: 6, enemySpeedGrowth: 0.03, enemySpeedCap: 1.8,
  enemyAdvanceLimit: 320, obstacleSize: 50, playerShotSize: 9,
  wave: { minDuration: 13, duration: 26, gap: 2,
    banner: 2.2, spawnInterval: 0.3, initialDelay: 0.35, baseCount: 8, density: 2.25,
    growthEvery: 2, countCap: 28, baseY: 70, rowSpacing: 49, columnSpacing: 96,
    drift: 41, driftSpeed: 0.75, advanceSpeed: 5,
    unlockStart: 4, unlockPerWave: 2, earlyWaveEnd: 3,
    earlyCollisionDamageCap: 50, earlyTotalDamageCap: 50,
    firstDropTime: 18, dropChance: { power: 0.25, homing: 0.08, shield: 0.50, bomb: 0.05 },
    healChance: 0.0184, bossEvery: 10, lifeEvery: 10, lifeLowThreshold: 2,
    obstacleStart: 3, obstacleMaxPerWave: 2, obstacleWarning: 1,
    obstacleDelay: 8, obstacleSpacing: 9, obstacleAvoidDiveWindow: 5, obstacleAvoidX: 110,
    obstacleRetry: 1,
    obstacleBaseSpeed: 92, obstacleHP: 3, obstacleScore: 50,
    bossSlowMotion: 0.6, bossSlowFactor: 0.35 },
  comboCap: 99, bonusLifeScore: 250000, bonusLifeCap: 5, clearScore: 500,
  bombScoreFactor: 0.5, shotDensityEvery: 5,
  pickupSpeed: 92, pickupSize: 30, healAmount: 30,
  missileTurn: 2.4, missileSpeed: 205, mineLifetime: 6, mineSize: 21,
  bombBlastY: 508, bombBlastRadius: 70,
  formationOffsets: { v: 26, arc: 8, stagger: 30, wings: 19, zigzag: 25 },
  obstacleLaneMargin: 55, obstacleLaneStart: 0.15, obstacleLaneSpan: 0.7,
  enemyTypeCount: 16, earlyTypeCount: 2, cycleBossCount: 8,
  pickupDropY: 220,
  boss: { hpPerCycle: 64, hoverY: 112, hoverRange: 245,
    hoverSpeed: 0.9, fireInterval: 1.05, spawnInterval: 5,
    dashInterval: 5, dashSpeed: 270,
    cloakInterval: 3.4, cloakDuration: 0.95,
    shieldHP: 5, shieldRegen: 6, phaseInterval: 7,
    laserTelegraph: 0.85, laserWidth: 21, laserSpeed: 760,
    patterns: {
      hive: { count: 5, spread: 0.3 },
      crossfire: { count: 3, spread: 0.17, turretOffset: 0.35, lead: 65 },
      fortress: { count: 7, spread: 0.22, laserEvery: 2 },
      assassin: { count: 5, spread: 0.13, speedFactor: 1.25 },
      minefield: { count: 3, interval: 1.55 },
      missiles: { count: 6, spacing: 22, spread: 24 },
      plasma: { count: 8, damage: 18 },
      abyss: { barrage: 7, barrageSpread: 0.18, escort: 3, escortSpread: 0.28, spiral: 6 },
    } },
});

// A numeric unlock wave prevents a later wave introducing more than two new types.
export const ENEMIES = Object.freeze({
  E1: { hp: 1, score: 100, damage: 10, unlock: 1, behavior: 'formation' },
  E2: { hp: 1, score: 200, damage: 15, unlock: 1, behavior: 'dive' },
  E3: { hp: 2, score: 300, damage: 12, unlock: 4, behavior: 'scatter' },
  E4: { hp: 1, score: 150, damage: 25, unlock: 4, behavior: 'ram' },
  E5: { hp: 1, score: 120, damage: 10, unlock: 5, behavior: 'serpent' },
  E6: { hp: 6, score: 400, damage: 20, unlock: 5, behavior: 'bomber' },
  E7: { hp: 3, score: 350, damage: 15, unlock: 6, behavior: 'tracker' },
  E8: { hp: 2, score: 400, damage: 18, unlock: 6, behavior: 'cloak' },
  E9: { hp: 3, score: 300, damage: 8, unlock: 7, behavior: 'jammer' },
  E10: { hp: 2, score: 250, damage: 0, unlock: 7, behavior: 'repair' },
  E11: { hp: 4, score: 350, damage: 12, unlock: 8, behavior: 'shield' },
  E12: { hp: 2, score: 300, damage: 20, unlock: 8, behavior: 'minelayer' },
  E13: { hp: 2, score: 350, damage: 12, unlock: 9, behavior: 'intercept' },
  E14: { hp: 3, score: 450, damage: 10, unlock: 9, behavior: 'spiral' },
  E15: { hp: 2, score: 200, damage: 15, unlock: 10, behavior: 'revive' },
  E16: { hp: 8, score: 500, damage: 0, unlock: 10, behavior: 'carrier' },
});

export const BOSSES = Object.freeze({
  B1: { score: 3000, damage: 11, behavior: 'hive', hp: 128 },
  B2: { score: 3500, damage: 14, behavior: 'crossfire', hp: 140 },
  B3: { score: 4000, damage: 18, behavior: 'fortress', hp: 156 },
  B4: { score: 4500, damage: 14, behavior: 'assassin', hp: 132 },
  B5: { score: 4500, damage: 20, behavior: 'minefield', hp: 160 },
  B6: { score: 5000, damage: 15, behavior: 'missiles', hp: 160 },
  B7: { score: 5500, damage: 25, behavior: 'plasma', hp: 176 },
  B8: { score: 8000, damage: 22, behavior: 'abyss', hp: 210 },
});

export const PICKUPS = Object.freeze(['power', 'homing', 'shield', 'bomb', 'life', 'heal']);
// Offset profiles for six formations; cycling by wave number ensures a five-wave non-repeat.
export const FORMATIONS = Object.freeze([
  { columns: 6, shape: 'rows' }, { columns: 5, shape: 'v' },
  { columns: 7, shape: 'arc' }, { columns: 5, shape: 'stagger' },
  { columns: 6, shape: 'wings' }, { columns: 7, shape: 'zigzag' },
]);

export const MOTION = Object.freeze({
  dive: { speed: 265, cooldown: 2.65, start: 1.7, shotAt: 0.25 },
  ram: { speed: 185, acceleration: 125, start: 1.7, steer: 0.35 },
  serpent: { speed: 87, amplitude: 82, frequency: 5.5 },
  bomber: { advance: 17, wander: 38, frequency: 0.9 },
  tracker: { hover: 152, wander: 72, frequency: 1.2 },
  cloak: { period: 4.2, hidden: 1.3, dashSpeed: 185 },
  jammer: { hover: 112, wander: 115, frequency: 1.5 },
  repair: { orbitRadius: 54, orbitSpeed: 1.8, heal: 0.45, healInterval: 1.8 },
  shield: { advance: 15, shieldHp: 2 },
  minelayer: { speed: 120, sway: 58, period: 1.4 },
  intercept: { speed: 305, cooldown: 2.9, start: 2.2 },
  spiral: { radius: 60, speed: 1.9 },
  revive: { delay: 1.3, speed: 105 },
  carrier: { hover: 100, summonInterval: 3.5, wander: 58 },
  attack: { scatter: 1.55, scatterCount: 3, bomber: 1.75, tracker: 2.25, trackerBurst: 2,
    cloak: 1.85, jammer: 1.6, mine: 1.9, intercept: 0.07, interceptBurst: 3, spiral: 1.45,
    enemyBullet: 245, scatterAngle: 0.27, spiralCount: 7,
    mineSpeed: 78, bombSpeed: 150, trackingGap: 0.2 },
});
