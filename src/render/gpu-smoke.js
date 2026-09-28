import { VISUALS as V } from '../data/visuals.js';
import { SMOKE_COMPUTE_SHADER, SMOKE_RENDER_SHADER } from './smoke-shaders.js';

const USAGE = globalThis.GPUBufferUsage ?? { COPY_DST: 8, UNIFORM: 64, STORAGE: 128 };
const FLOATS_PER_PARTICLE = 12;
const PARTICLE_BYTES = FLOATS_PER_PARTICLE * Float32Array.BYTES_PER_ELEMENT;
const TAU = Math.PI * 2;

export class GPUSmoke {
  constructor(device) {
    this.device = device;
    this.capacity = V.smokeCapacity;
    this.cursor = 0;
    this.clock = 0;
    this.activeUntil = 0;
    this.pendingCount = 0;
    this.emissions = new Float32Array(this.capacity * FLOATS_PER_PARTICLE);
    this.dirty = new Uint8Array(this.capacity);
    this.empty = new Uint8Array(this.capacity * PARTICLE_BYTES);
    this.step = new Float32Array(4);
    this.disposed = false;
    try {
      const computeModule = device.createShaderModule({ code: SMOKE_COMPUTE_SHADER });
      const renderModule = device.createShaderModule({ code: SMOKE_RENDER_SHADER });
      this.modules = [computeModule, renderModule];
      this.computePipeline = device.createComputePipeline({
        layout: 'auto', compute: { module: computeModule, entryPoint: 'main' }
      });
      this.renderPipeline = device.createRenderPipeline({
        layout: 'auto', vertex: { module: renderModule, entryPoint: 'vertex' },
        fragment: {
          module: renderModule, entryPoint: 'fragment',
          targets: [{ format: 'rgba16float', blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          } }]
        },
        primitive: { topology: 'triangle-list' }
      });
      this.particles = device.createBuffer({
        size: this.empty.byteLength, usage: USAGE.STORAGE | USAGE.COPY_DST
      });
      this.frame = device.createBuffer({ size: 16, usage: USAGE.UNIFORM | USAGE.COPY_DST });
      this.computeGroup = device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.particles } },
          { binding: 1, resource: { buffer: this.frame } }
        ]
      });
      this.renderGroup = device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.particles } }]
      });
      this.reset();
    } catch (error) {
      this.particles?.destroy();
      this.frame?.destroy();
      throw error;
    }
  }

  emit(event, reducedMotion = false) {
    if (this.disposed || !event) return;
    const { type, boss = false } = event;
    const spark = type === 'hit' || type === 'shield';
    if (spark) {
      if (event.target == null || event.survived !== true) return;
    } else if (type !== 'explosion' && type !== 'bomb' && type !== 'death') return;
    const x = Number.isFinite(event.x) ? event.x : V.width / 2;
    const y = Number.isFinite(event.y) ? event.y : V.height / 2;
    const base = spark ? V.impactParticles
      : type === 'death' ? V.smokeDeath : boss ? V.smokeBoss : V.smokeExplosion;
    const count = Math.min(this.capacity, reducedMotion
      ? Math.max(1, Math.ceil(base / (spark ? 2 : 3))) : base);
    const spread = spark ? 7 : type === 'bomb' ? 38 : boss ? 48 : type === 'death' ? 27 : 16;
    const drift = reducedMotion ? 0.22 : 1;
    const data = this.emissions;
    for (let i = 0; i < count; i++) {
      const slot = this.cursor;
      this.cursor = (slot + 1) % this.capacity;
      if (!this.dirty[slot]) {
        this.dirty[slot] = 1;
        this.pendingCount++;
      }
      const angle = spark
        ? (Number.isFinite(event.target.lives) ? Math.PI / 2 : -Math.PI / 2)
          + (Math.random() - 0.5) * 2.3
        : Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * spread;
      const speed = spark ? (75 + Math.random() * 80) * (reducedMotion ? 0.45 : 1)
        : (12 + Math.random() * 24) * drift;
      const offset = slot * FLOATS_PER_PARTICLE;
      data[offset] = x + Math.cos(angle) * radius;
      data[offset + 1] = y + Math.sin(angle) * radius;
      data[offset + 2] = Math.cos(angle) * speed;
      data[offset + 3] = Math.sin(angle) * speed - (spark ? 0 : 11 * drift);
      data[offset + 4] = 0;
      const life = spark ? V.impactLife * (0.68 + Math.random() * 0.45)
        : V.gpuSmokeLife * (0.68 + Math.random() * 0.32);
      data[offset + 5] = life;
      data[offset + 6] = spark ? 5 + Math.random() * 5
        : 8 + Math.random() * (boss ? 8 : 6);
      data[offset + 7] = spark ? 0.84 + Math.random() * 0.16
        : 0.58 + Math.random() * 0.42;
      data[offset + 8] = Math.random();
      data[offset + 9] = spark ? (type === 'shield' ? 2 : 1) : 0;
      data[offset + 10] = data[offset + 11] = 0;
      this.activeUntil = Math.max(this.activeUntil, this.clock + life);
    }
  }

  reset() {
    if (this.disposed) return;
    this.device.queue.writeBuffer(this.particles, 0, this.empty);
    this.dirty.fill(0);
    this.pendingCount = 0;
    this.cursor = 0;
    this.clock = this.activeUntil = 0;
  }

  encode(encoder, dt, elapsed, reducedMotion, targetView) {
    if (this.disposed) return;
    const wasActive = this.clock < this.activeUntil;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, V.maxFrameDelta)) : 0;
    this.clock += step;
    if (this.pendingCount) {
      for (let index = 0; index < this.capacity;) {
        if (!this.dirty[index]) { index++; continue; }
        const start = index;
        do { this.dirty[index++] = 0; } while (index < this.capacity && this.dirty[index]);
        this.device.queue.writeBuffer(this.particles, start * PARTICLE_BYTES,
          this.emissions.buffer, start * PARTICLE_BYTES, (index - start) * PARTICLE_BYTES);
      }
      this.pendingCount = 0;
    }
    if (!wasActive) return;
    if (step > 0) {
      this.step[0] = step;
      this.step[1] = reducedMotion ? 0.22 : 1;
      this.device.queue.writeBuffer(this.frame, 0, this.step);
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, this.computeGroup);
      pass.dispatchWorkgroups(Math.ceil(this.capacity / 64));
      pass.end();
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: targetView, loadOp: 'load', storeOp: 'store' }]
    });
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderGroup);
    pass.draw(6, this.capacity);
    pass.end();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingCount = 0;
    this.dirty.fill(0);
    this.particles.destroy();
    this.frame.destroy();
  }
}
