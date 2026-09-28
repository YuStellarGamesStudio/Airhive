import { GAME } from '../data/game.js';
import { planAttacks } from './attack-plan.js';
import { PLAN_STRIDE, waveLayout } from './wave-plan.js';
import { WAVE_SHADER, ATTACK_SHADER } from './webgpu-shaders.js';

// Kernel shape IDs are independent of the formation rotation order.
const SHAPES = ['rows', 'v', 'arc', 'stagger', 'wings', 'zigzag'];
const WORKGROUP_SIZE = 64;
const BUFFER_USAGE = globalThis.GPUBufferUsage ?? { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, STORAGE: 128 };
const MAP_MODE = globalThis.GPUMapMode?.READ ?? 1;
const maxFan = Math.max(GAME.boss.patterns.plasma.count, GAME.boss.patterns.fortress.count,
  GAME.boss.patterns.crossfire.count * 2, GAME.boss.patterns.abyss.barrage,
  GAME.boss.patterns.abyss.spiral, GAME.boss.patterns.hive.count);
const MAX_GEOMETRY = GAME.enemyCap * Math.max(maxFan, GAME.boss.patterns.assassin.count,
  GAME.boss.patterns.abyss.escort, GAME.boss.patterns.missiles.count);
const INPUT_BYTES = Math.max(64 + GAME.enemyCap * 4, 16 + MAX_GEOMETRY * 16);
const OUTPUT_BYTES = Math.max(GAME.enemyCap * 16, MAX_GEOMETRY * 8);

export class WebGPUPlanner {
  constructor({ gpu = globalThis.navigator?.gpu, onUnavailable = () => {} } = {}) {
    this.available = false;
    this.disposed = false;
    this._failed = false;
    this._device = null;
    this._buffers = [];
    this._mapped = false;
    this._pending = null;
    this._onUnavailable = onUnavailable;
    this._initCancelled = new Promise(resolve => { this._cancelInit = resolve; });
    this.ready = this._initialize(gpu);
  }

  async _guard(promise) {
    const value = await Promise.race([promise, this._initCancelled.then(() => {
      throw new Error('WebGPU initialization interrupted');
    })]);
    if (this.disposed || this._failed) throw new Error('WebGPU initialization interrupted');
    return value;
  }

  async _initialize(gpu) {
    if (!gpu?.requestAdapter) return false;
    const timeout = setTimeout(() => this._invalidate(new Error('WebGPU initialization timed out')),
      GAME.spawnPlanning.gpuInitTimeout);
    try {
      const adapter = await this._guard(gpu.requestAdapter());
      if (!adapter) return false;
      const requested = Promise.resolve().then(() => adapter.requestDevice());
      // Adopt immediately on resolution: disposal can race the continuation of _guard.
      requested.then(device => {
        if (this.disposed || this._failed) device.destroy();
        else this._device = device;
      }, () => {});
      const device = await this._guard(requested);
      device.lost.then(info => {
        if (!this.disposed && !this._failed)
          this._invalidate(new Error(`WebGPU device lost: ${info?.message || info?.reason || 'unknown'}`));
      }, error => this._invalidate(error));
      device.onuncapturederror = event => this._invalidate(event.error || new Error('WebGPU uncaptured error'));
      device.pushErrorScope?.('out-of-memory');
      device.pushErrorScope?.('validation');
      const wave = device.createShaderModule({ code: WAVE_SHADER });
      const attack = device.createShaderModule({ code: ATTACK_SHADER });
      for (const module of [wave, attack]) {
        if (!module.getCompilationInfo) continue;
        const info = await this._guard(module.getCompilationInfo());
        const error = info.messages.find(message => message.type === 'error');
        if (error) throw new Error(`WebGPU shader: ${error.message}`);
      }
      const makePipeline = async module => this._guard(device.createComputePipelineAsync
        ? device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } })
        : device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } }));
      this._wavePipeline = await makePipeline(wave);
      this._attackPipeline = await makePipeline(attack);
      const input = device.createBuffer({ size: INPUT_BYTES, usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST });
      this._buffers.push(input);
      const output = device.createBuffer({ size: OUTPUT_BYTES, usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC });
      this._buffers.push(output);
      const readback = device.createBuffer({ size: OUTPUT_BYTES, usage: BUFFER_USAGE.COPY_DST | BUFFER_USAGE.MAP_READ });
      this._buffers.push(readback);
      this._input = input;
      this._output = output;
      this._readback = readback;
      const entries = [{ binding: 0, resource: { buffer: input } },
        { binding: 1, resource: { buffer: output } }];
      this._waveBindGroup = device.createBindGroup({ layout: this._wavePipeline.getBindGroupLayout(0), entries });
      this._attackBindGroup = device.createBindGroup({ layout: this._attackPipeline.getBindGroupLayout(0), entries });
      await this._checkErrors(true);
      if (this.disposed || this._failed) return false;
      this.available = true;
      return true;
    } catch (error) {
      if (!this.disposed && !this._failed) this._invalidate(error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _checkErrors(initializing = false) {
    const device = this._device;
    if (!device?.popErrorScope) return;
    const validation = device.popErrorScope();
    const validationError = initializing ? await this._guard(validation) : await validation;
    if (validationError) throw validationError;
    const memory = device.popErrorScope();
    const memoryError = initializing ? await this._guard(memory) : await memory;
    if (memoryError) throw memoryError;
  }

  _invalidate(error, notify = true) {
    if (this.disposed || this._failed) return;
    this._failed = true;
    this.available = false;
    this._cancelInit();
    this._pending?.reject(error);
    this._pending = null;
    this._release();
    if (notify) {
      try { this._onUnavailable(error); } catch { /* The caller's callback must not strand ready. */ }
    }
  }

  _release() {
    if (this._mapped) {
      try { this._readback.unmap(); } catch { /* The device may already be lost. */ }
      this._mapped = false;
    }
    for (const buffer of this._buffers) {
      try { buffer.destroy(); } catch { /* Already invalidated. */ }
    }
    this._buffers.length = 0;
    if (this._device) {
      try { this._device.destroy(); } catch { /* Already lost. */ }
      this._device = null;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.available = false;
    this._cancelInit();
    this._pending?.reject(new Error('WebGPU planner disposed'));
    this._pending = null;
    this._release();
  }

  _operation(run) {
    if (!this.available || this.disposed || this._pending) throw new Error('WebGPU planner unavailable or busy');
    return new Promise((resolve, reject) => {
      const pending = { resolve, reject };
      this._pending = pending;
      Promise.resolve().then(run).then(value => {
        if (this._pending !== pending) return;
        this._pending = null;
        resolve(value);
      }, error => this._invalidate(error));
    });
  }

  async _dispatch(input, count, outputBytes, pipeline, bindGroup, consume) {
    if (this.disposed || this._failed) throw new Error('WebGPU planner unavailable');
    const device = this._device;
    device.pushErrorScope?.('out-of-memory');
    device.pushErrorScope?.('validation');
    device.queue.writeBuffer(this._input, 0, input);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(count / WORKGROUP_SIZE));
    pass.end();
    encoder.copyBufferToBuffer(this._output, 0, this._readback, 0, outputBytes);
    device.queue.submit([encoder.finish()]);
    await this._readback.mapAsync(MAP_MODE, 0, outputBytes);
    if (this.disposed || this._failed) throw new Error('WebGPU planner unavailable');
    this._mapped = true;
    try {
      consume(new Float32Array(this._readback.getMappedRange(0, outputBytes)));
    } finally {
      if (this._mapped) {
        this._readback.unmap();
        this._mapped = false;
      }
    }
    await this._checkErrors();
    if (this.disposed || this._failed) throw new Error('WebGPU planner unavailable');
  }

  async planWave(wave) {
    if (!await this.ready || !this.available) throw new Error('WebGPU planner unavailable');
    const layout = waveLayout(wave);
    if (!layout) return new Float64Array(0);
    return this._operation(async () => {
      const { count, profile, columns, spacing, unlocked, introduction, newly } = layout;
      const data = new ArrayBuffer(64 + count * 4);
      const ints = new Uint32Array(data);
      const floats = new Float32Array(data);
      const shape = SHAPES.indexOf(profile.shape);
      ints[0] = count; ints[1] = columns; ints[2] = shape; ints[3] = unlocked;
      // Float32 cannot retain a high wave number, while JS's original slot + wave*3
      // may round differently for each slot: preserve that expression per slot there.
      const useResidues = wave * 3 + count > 0xffffff;
      ints[4] = useResidues ? 0 : (wave * 3) % unlocked;
      ints[5] = useResidues ? 1 : 0;
      ints[6] = Math.min(unlocked, newly);
      ints[7] = introduction >= GAME.wave.unlockStart ? 1 : 0;
      floats[8] = GAME.width / 2;
      floats[9] = spacing;
      floats[10] = GAME.wave.density;
      floats[11] = GAME.wave.baseY;
      floats[12] = GAME.wave.rowSpacing;
      floats[13] = (columns - 1) / 2;
      floats[14] = GAME.formationOffsets[profile.shape] ?? 0;
      floats[15] = profile.columns / 2;
      if (useResidues) for (let slot = 0; slot < count; slot++)
        ints[16 + slot] = (slot + wave * 3) % unlocked;
      const plan = new Float64Array(count * PLAN_STRIDE);
      await this._dispatch(new Uint8Array(data), count, count * 16, this._wavePipeline,
        this._waveBindGroup, values => {
          for (let slot = 0; slot < count; slot++) {
            const src = slot * 4, dst = slot * PLAN_STRIDE;
            plan[dst] = values[src];
            plan[dst + 1] = values[src + 1];
            plan[dst + 2] = values[src + 2];
          }
        });
      return plan;
    });
  }

  async planAttacks(batch) {
    if (!await this.ready || !this.available) throw new Error('WebGPU planner unavailable');
    return this._operation(async () => {
      const jobs = [];
      const geometry = {
        aim(result, enemy, player, speed, extra = null) {
          const command = { type: 'bullet', x: enemy.x, y: enemy.y + enemy.h / 2,
            vx: 0, vy: 0, damage: enemy.damage, extra };
          result.commands.push(command);
          jobs.push({ command, mode: 0, a: player.x - enemy.x, b: player.y - enemy.y, speed });
        },
        fan(result, enemy, player, count, spread, speed, damage = enemy.damage,
          angle = Math.atan2(player.x - enemy.x, player.y - enemy.y), originOffset = 0) {
          for (let i = 0; i < count; i++) {
            const command = { type: 'bullet', x: enemy.x + originOffset, y: enemy.y + enemy.h / 2,
              vx: 0, vy: 0, damage, extra: null };
            result.commands.push(command);
            // Ages can grow indefinitely; bound the angle before Float32 conversion.
            jobs.push({ command, mode: 1, a: (angle + (i - (count - 1) / 2) * spread) % (Math.PI * 2),
              b: 0, speed });
          }
        },
      };
      const results = planAttacks(batch, geometry);
      for (let offset = 0; offset < jobs.length; offset += MAX_GEOMETRY) {
        const size = Math.min(MAX_GEOMETRY, jobs.length - offset);
        const input = new Float32Array(4 + size * 4);
        new Uint32Array(input.buffer)[0] = size;
        for (let i = 0; i < size; i++) {
          const job = jobs[offset + i], index = 4 + i * 4;
          input[index] = job.mode;
          input[index + 1] = job.a;
          input[index + 2] = job.b;
          input[index + 3] = job.speed;
        }
        await this._dispatch(input, size, size * 8, this._attackPipeline,
          this._attackBindGroup, values => {
            for (let i = 0; i < size; i++) {
              const command = jobs[offset + i].command;
              command.vx = values[i * 2];
              command.vy = values[i * 2 + 1];
            }
          });
      }
      return results;
    });
  }
}
