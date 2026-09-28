import { GAME, FORMATIONS } from '../data/game.js';

export const PLAN_STRIDE = 3;

// Layout decisions stay in JS doubles; the GPU only evaluates per-slot geometry and selection.
export function waveLayout(wave) {
  if (wave % GAME.wave.bossEvery === 0) return null;
  const count = Math.min(GAME.enemyCap, Math.round(GAME.wave.density * Math.min(GAME.wave.countCap,
    GAME.wave.baseCount + Math.floor((wave - 1) / GAME.wave.growthEvery))));
  const profile = FORMATIONS[(wave - 1) % FORMATIONS.length];
  const columns = Math.round(profile.columns * GAME.wave.density);
  const spacing = Math.min(GAME.wave.columnSpacing,
    (GAME.width - GAME.enemySize.w - GAME.wave.drift * 2) / (columns - 1));
  const unlocked = Math.min(GAME.enemyTypeCount, GAME.earlyTypeCount +
    Math.max(0, wave - GAME.wave.unlockStart + 1) * GAME.wave.unlockPerWave);
  const introduction = wave === GAME.wave.lifeEvery + 1 ? GAME.wave.lifeEvery : wave;
  const newly = GAME.earlyTypeCount + (introduction - GAME.wave.unlockStart) * GAME.wave.unlockPerWave;
  return { count, profile, columns, spacing, unlocked, introduction, newly };
}

// Plans contain only wave-dependent data; random rolls stay on the simulation thread.
export function planWave(wave) {
  const layout = waveLayout(wave);
  if (!layout) return new Float64Array(0);
  const { count, profile, columns, spacing, unlocked, introduction, newly } = layout;
  const plan = new Float64Array(count * PLAN_STRIDE);
  for (let slot = 0; slot < count; slot++) {
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const relative = (column - (columns - 1) / 2) / GAME.wave.density;
    let offset = 0;
    switch (profile.shape) {
      case 'v': offset = Math.abs(relative) * GAME.formationOffsets.v; break;
      case 'arc': offset = relative * relative * GAME.formationOffsets.arc; break;
      case 'stagger': offset = column % 2 * GAME.formationOffsets.stagger; break;
      case 'wings': offset = (profile.columns / 2 - Math.abs(relative)) * GAME.formationOffsets.wings; break;
      case 'zigzag': offset = column % 2 ? -GAME.formationOffsets.zigzag : GAME.formationOffsets.zigzag; break;
      default: break;
    }
    const index = slot * PLAN_STRIDE;
    plan[index] = introduction >= GAME.wave.unlockStart && (slot === 1 || slot === 2) ?
      Math.min(unlocked, newly + slot) : slot % 3 === 0 ? 1 : 1 + ((slot + wave * 3) % unlocked);
    plan[index + 1] = GAME.width / 2 + relative * GAME.wave.density * spacing;
    plan[index + 2] = GAME.wave.baseY + row * GAME.wave.rowSpacing + offset;
  }
  return plan;
}
