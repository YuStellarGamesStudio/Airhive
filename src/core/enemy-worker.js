import { planWave } from './wave-plan.js';
import { planAttacks } from './attack-plan.js';

self.onmessage = ({ data }) => {
  const { kind, id } = data;
  if (kind === 'wave') {
    const { wave } = data;
    const plan = planWave(wave);
    self.postMessage({ kind, id, wave, buffer: plan.buffer }, [plan.buffer]);
  } else if (kind === 'attacks') {
    self.postMessage({ kind, id, results: planAttacks(data.batch) });
  }
};
