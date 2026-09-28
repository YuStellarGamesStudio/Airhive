import {VISUALS as V} from '../data/visuals.js';
import {GPUSmoke} from './gpu-smoke.js';
import {GPUSprites} from './gpu-sprites.js';
import {COMPOSITE_SHADER, OVERLAY_SHADER, BLOOM_SHADER, FINAL_SHADER} from './post-shaders.js';

const TEXTURE = globalThis.GPUTextureUsage ?? {COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 16};
const BUFFER = globalThis.GPUBufferUsage ?? {COPY_DST: 8, UNIFORM: 64};
const SHOCK_CAPACITY = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function boundedSize(width, height) {
  const scale = Math.min(1, V.gpuMaxDimension / width, V.gpuMaxDimension / height,
    Math.sqrt(V.gpuMaxPixels / (width * height)));
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
}

export class WebGPURenderer {
  constructor(canvas, {onUnavailable = () => {}} = {}) {
    this.canvas = canvas;
    this.available = false;
    this.disposed = false;
    this._failed = false;
    this._onUnavailable = onUnavailable;
    this._device = null;
    this._buffers = [];
    this._sizedTextures = [];
    this._shocks = [];
    this._shake = 0;
    this._phase = 0;
    this._effects = new Float32Array(8 + SHOCK_CAPACITY * 8);
    this._effectsCount = new Uint32Array(this._effects.buffer);
    this._filterData = new Float32Array(4);
    this._cancelled = new Promise(resolve => { this._cancel = resolve; });
    this.ready = this._initialize(globalThis.navigator?.gpu);
  }

  async _guard(promise) {
    const value = await Promise.race([promise, this._cancelled]);
    if (this.disposed || this._failed) throw new Error('WebGPU rendering initialization interrupted');
    return value;
  }

  async _initialize(gpu) {
    const timeout = setTimeout(() => this._invalidate(new Error('WebGPU rendering initialization timed out')),
      V.gpuInitTimeout);
    try {
      if (!gpu?.requestAdapter) throw new Error('WebGPU unavailable');
      const adapter = await this._guard(gpu.requestAdapter());
      if (!adapter) throw new Error('WebGPU adapter unavailable');
      const requested = Promise.resolve().then(() => adapter.requestDevice());
      // Request-device can resolve after a timeout or dispose: immediately release its late device.
      requested.then(device => {
        if (this.disposed || this._failed) {
          try { device.destroy(); } catch { /* Device already lost. */ }
        } else this._device = device;
      }, () => {});
      const device = await this._guard(requested);
      device.lost.then(info => {
        if (!this.disposed && !this._failed)
          this._invalidate(new Error(`WebGPU rendering device lost: ${info?.message || info?.reason || 'unknown'}`));
      }, error => this._invalidate(error));
      device.onuncapturederror = event => this._invalidate(event.error || new Error('WebGPU rendering error'));

      device.pushErrorScope('out-of-memory');
      device.pushErrorScope('validation');
      const shaders = [COMPOSITE_SHADER, OVERLAY_SHADER, BLOOM_SHADER, FINAL_SHADER]
        .map(code => device.createShaderModule({code}));
      for (const module of shaders) {
        const info = await this._guard(module.getCompilationInfo());
        const error = info.messages.find(message => message.type === 'error');
        if (error) throw new Error(`WebGPU post shader: ${error.message}`);
      }
      const [composite, overlay, bloom, final] = shaders;
      const makePipeline = (module, entryPoint, format, blend) => device.createRenderPipeline({
        layout: 'auto', vertex: {module, entryPoint: 'vertex'},
        fragment: {module, entryPoint, targets: [{format, ...(blend ? {blend} : {})}]},
        primitive: {topology: 'triangle-list'}
      });
      this._composite = makePipeline(composite, 'fragment', 'rgba16float');
      this._overlay = makePipeline(overlay, 'fragment', 'rgba16float', {
        color: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
        alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'}
      });
      this._extract = makePipeline(bloom, 'extract', 'rgba16float');
      this._blur = makePipeline(bloom, 'blur', 'rgba16float');
      this._format = gpu.getPreferredCanvasFormat();
      this._final = makePipeline(final, 'fragment', this._format);
      this._sampler = device.createSampler({magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'});
      this._effectsBuffer = this._buffer(this._effects.byteLength);
      this._filterBuffers = Array.from({length: 4}, () => this._buffer(16));
      this._smoke = new GPUSmoke(device);
      this._sprites = new GPUSprites(device);
      for (const module of this._sprites.modules || []) {
        const info = await this._guard(module.getCompilationInfo());
        const error = info.messages.find(message => message.type === 'error');
        if (error) throw new Error(`WebGPU sprite shader: ${error.message}`);
      }
      for (const module of this._smoke.modules || []) {
        const info = await this._guard(module.getCompilationInfo());
        const error = info.messages.find(message => message.type === 'error');
        if (error) throw new Error(`WebGPU smoke shader: ${error.message}`);
      }
      const validation = await this._guard(device.popErrorScope());
      if (validation) throw validation;
      const memory = await this._guard(device.popErrorScope());
      if (memory) throw memory;
      this._context = this.canvas.getContext('webgpu');
      if (!this._context) throw new Error('WebGPU canvas context unavailable');
      this._context.configure({device, format: this._format, alphaMode: 'opaque'});
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

  _buffer(size) {
    const buffer = this._device.createBuffer({size, usage: BUFFER.UNIFORM | BUFFER.COPY_DST});
    this._buffers.push(buffer);
    return buffer;
  }

  _texture(width, height, format, usage) {
    const texture = this._device.createTexture({size: [width, height], format, usage});
    this._sizedTextures.push(texture);
    return texture;
  }

  _releaseSize() {
    for (const texture of this._sizedTextures) {
      try { texture.destroy(); } catch { /* A lost device can invalidate old textures. */ }
    }
    this._sizedTextures.length = 0;
    this._sizeKey = '';
    this._inputs = null;
    this._compositeGroup = this._overlayGroup = this._finalGroup = null;
    this._extractGroups = this._blurGroups = null;
    this._passes = this._overlayPass = this._outputPass = this._hdrView = null;
  }

  _release() {
    this._releaseSize();
    this._staging = null;
    try { this._smoke?.dispose(); } catch { /* Device may already be lost. */ }
    this._smoke = null;
    try { this._sprites?.dispose(); } catch { /* Device may already be lost. */ }
    this._sprites = null;
    for (const buffer of this._buffers) {
      try { buffer.destroy(); } catch { /* Already invalidated. */ }
    }
    this._buffers.length = 0;
    try { this._context?.unconfigure(); } catch { /* Already invalidated. */ }
    if (this._device) {
      try { this._device.destroy(); } catch { /* Already lost. */ }
      this._device = null;
    }
  }

  _invalidate(error) {
    if (this.disposed || this._failed) return;
    this._failed = true;
    this.available = false;
    this._cancel();
    this._release();
    try { this._onUnavailable(error); } catch { /* Never strand ready on caller error. */ }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.available = false;
    this._cancel();
    this._release();
  }

  _bind(pipeline, entries) {
    return this._device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: entries.map((resource, binding) => ({binding, resource}))});
  }

  _resize(sceneCanvas, emissionCanvas, foregroundCanvas) {
    const [sw, sh] = boundedSize(sceneCanvas.width, sceneCanvas.height);
    const [ew, eh] = boundedSize(emissionCanvas.width, emissionCanvas.height);
    const [fw, fh] = boundedSize(foregroundCanvas.width, foregroundCanvas.height);
    const w = sw, h = sh;
    const key = `${sw}:${sh}:${ew}:${eh}:${fw}:${fh}:${w}:${h}`;
    if (key === this._sizeKey) return;
    this._releaseSize();
    this.canvas.width = w;
    this.canvas.height = h;
    this._inputs = [this._texture(sw, sh, 'rgba8unorm-srgb', TEXTURE.COPY_DST | TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT),
      this._texture(ew, eh, 'rgba8unorm-srgb', TEXTURE.COPY_DST | TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT),
      this._texture(fw, fh, 'rgba8unorm-srgb', TEXTURE.COPY_DST | TEXTURE.TEXTURE_BINDING | TEXTURE.RENDER_ATTACHMENT)];
    const hdr = this._texture(w, h, 'rgba16float', TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING);
    const halfWidth = Math.max(1, Math.ceil(w / 2)), halfHeight = Math.max(1, Math.ceil(h / 2));
    const quarterWidth = Math.max(1, Math.ceil(w / 4)), quarterHeight = Math.max(1, Math.ceil(h / 4));
    const half = Array.from({length: 3}, () => this._texture(halfWidth, halfHeight, 'rgba16float', TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING));
    const quarter = Array.from({length: 3}, () => this._texture(quarterWidth, quarterHeight, 'rgba16float', TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING));
    const view = texture => texture.createView();
    const tex = texture => view(texture);
    const sampler = this._sampler;
    this._compositeGroup = this._bind(this._composite, [tex(this._inputs[0]), sampler]);
    this._overlayGroup = this._bind(this._overlay, [tex(this._inputs[2]), tex(this._inputs[1]), sampler]);
    const filter = (pipeline, source, index) => this._bind(pipeline,
      [tex(source), sampler, {buffer: this._filterBuffers[index]}]);
    const extractGroup = this._bind(this._extract, [tex(hdr), sampler]);
    this._extractGroups = [extractGroup, extractGroup];
    this._blurGroups = [filter(this._blur, half[0], 0), filter(this._blur, half[1], 1),
      filter(this._blur, quarter[0], 2), filter(this._blur, quarter[1], 3)];
    this._finalGroup = this._bind(this._final, [tex(hdr), tex(half[2]), tex(quarter[2]), sampler,
      {buffer: this._effectsBuffer}]);
    const target = texture => ({colorAttachments: [{view: view(texture), loadOp: 'clear', storeOp: 'store',
      clearValue: {r: 0, g: 0, b: 0, a: 0}}]});
    this._hdrView = view(hdr);
    this._overlayPass = {colorAttachments: [{view: this._hdrView, loadOp: 'load', storeOp: 'store'}]};
    this._passes = [target(hdr), target(half[0]), target(half[1]), target(half[2]),
      target(quarter[0]), target(quarter[1]), target(quarter[2])];
    this._outputPass = {colorAttachments: [{view: null, loadOp: 'clear', storeOp: 'store',
      clearValue: {r: 0, g: 0, b: 0, a: 1}}]};
    for (const [index, x, y, radius] of [[0, 1 / halfWidth, 0, 1.4], [1, 0, 1 / halfHeight, 1.4],
      [2, 1 / quarterWidth, 0, 2.1], [3, 0, 1 / quarterHeight, 2.1]]) {
      this._filterData[0] = x;
      this._filterData[1] = y;
      this._filterData[2] = radius;
      this._device.queue.writeBuffer(this._filterBuffers[index], 0, this._filterData);
    }
    this._sizeKey = key;
  }

  _draw(encoder, passIndex, pipeline, group) {
    const pass = encoder.beginRenderPass(this._passes[passIndex]);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }

  _updateEffects(dt, shake, reducedMotion) {
    const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    if (step) {
      this._phase += step;
      this._shake = Math.max(0, this._shake - step * V.shakeDecay);
      for (let i = this._shocks.length - 1; i >= 0; i--) {
        const shock = this._shocks[i];
        shock.age += step;
        if (shock.age >= shock.life) this._shocks.splice(i, 1);
      }
    }
    const data = this._effects;
    data[0] = V.width;
    data[1] = V.height;
    const amplitude = reducedMotion ? 0 : Math.min(9, this._shake + clamp(Number.isFinite(shake) ? shake : 0, 0, 9) * 0.35);
    // Deterministic, continuously moving frequencies; dt=0 leaves this phase exactly frozen.
    data[2] = amplitude * Math.sin(this._phase * 22) * Math.sin(this._phase * 13 + 0.8);
    data[3] = amplitude * Math.cos(this._phase * 17 + 0.5) * Math.sin(this._phase * 11);
    data[4] = V.bloomStrength;
    data[5] = reducedMotion ? 0 : V.distortionStrength;
    this._effectsCount[6] = reducedMotion ? 0 : this._shocks.length;
    for (let i = 0; i < this._shocks.length; i++) {
      const shock = this._shocks[i];
      const progress = shock.age / shock.life;
      const offset = 8 + i * 8;
      data[offset] = shock.x;
      data[offset + 1] = shock.y;
      data[offset + 2] = 10 + progress * shock.range;
      data[offset + 3] = 17 + progress * 36;
      data[offset + 4] = shock.power * (1 - progress) * (1 - progress);
      data[offset + 5] = progress;
    }
    this._device.queue.writeBuffer(this._effectsBuffer, 0, data);
  }

  render(sceneCanvas, emissionCanvas, dt, {elapsed = 0, shake = 0, reducedMotion = false,
    game, images, bank = 0, foreground} = {}) {
    if (!this.available || this.disposed || !sceneCanvas?.width || !sceneCanvas?.height ||
        !emissionCanvas?.width || !emissionCanvas?.height || !foreground?.width || !foreground?.height ||
        !game || !images?.has('player')) return false;
    try {
      this._resize(sceneCanvas, emissionCanvas, foreground);
      this._sprites.upload(images);
      for (let i = 0; i < this._inputs.length; i++) {
        let source = i === 0 ? sceneCanvas : i === 1 ? emissionCanvas : foreground;
        const target = this._inputs[i];
        if (source.width !== target.width || source.height !== target.height) {
          if (!this._staging) this._staging = Array.from({length: 3}, () => document.createElement('canvas'));
          const canvas = this._staging[i];
          if (canvas.width !== target.width || canvas.height !== target.height) {
            canvas.width = target.width;
            canvas.height = target.height;
          }
          canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
          source = canvas;
        }
        this._device.queue.copyExternalImageToTexture({source},
          {texture: target, premultipliedAlpha: false}, [target.width, target.height]);
      }
      this._updateEffects(dt, shake, reducedMotion);
      const encoder = this._device.createCommandEncoder();
      this._draw(encoder, 0, this._composite, this._compositeGroup);
      this._sprites.update(dt);
      this._sprites.encode(encoder, game, bank, elapsed, this._hdrView);
      const overlay = encoder.beginRenderPass(this._overlayPass);
      overlay.setPipeline(this._overlay);
      overlay.setBindGroup(0, this._overlayGroup);
      overlay.draw(3);
      overlay.end();
      this._smoke.encode(encoder, dt, elapsed, reducedMotion, this._hdrView);
      this._draw(encoder, 1, this._extract, this._extractGroups[0]);
      this._draw(encoder, 2, this._blur, this._blurGroups[0]);
      this._draw(encoder, 3, this._blur, this._blurGroups[1]);
      this._draw(encoder, 4, this._extract, this._extractGroups[1]);
      this._draw(encoder, 5, this._blur, this._blurGroups[2]);
      this._draw(encoder, 6, this._blur, this._blurGroups[3]);
      this._outputPass.colorAttachments[0].view = this._context.getCurrentTexture().createView();
      const output = encoder.beginRenderPass(this._outputPass);
      output.setPipeline(this._final);
      output.setBindGroup(0, this._finalGroup);
      output.draw(3);
      output.end();
      this._device.queue.submit([encoder.finish()]);
      return this.available;
    } catch (error) {
      this._invalidate(error);
      return false;
    }
  }

  event(event, reducedMotion = false) {
    if (this.disposed || this._failed || !event) return;
    if (event.type === 'start' || event.type === 'continue') { this.reset(); return; }
    if (!['explosion', 'bomb', 'death', 'hit', 'shield'].includes(event.type)) return;
    try {
      this._smoke?.emit(event, reducedMotion);
      this._sprites?.event(event, reducedMotion);
    } catch (error) { this._invalidate(error); return; }
    if (reducedMotion) return;
    const {type, boss} = event;
    const power = type === 'death' ? 1.0 : type === 'bomb' ? 0.85 : boss ? 1.0
      : type === 'explosion' ? 0.45 : 0.15;
    this._shake = Math.max(this._shake, type === 'hit' || type === 'shield' ? 1.6 : boss ? 8 : 4.5);
    if (this._shocks.length === SHOCK_CAPACITY) this._shocks.shift();
    this._shocks.push({x: clamp(Number.isFinite(event.x) ? event.x : V.width / 2, 0, V.width),
      y: clamp(Number.isFinite(event.y) ? event.y : V.height / 2, 0, V.height),
      power, age: 0, life: type === 'death' || boss ? 0.9 : type === 'hit' || type === 'shield' ? 0.34 : 0.63,
      range: type === 'bomb' || boss ? 470 : type === 'death' ? 360 : 230});
  }

  reset() {
    this._shocks.length = 0;
    this._shake = 0;
    this._phase = 0;
    try {
      this._smoke?.reset();
      this._sprites?.reset();
    } catch (error) { this._invalidate(error); }
  }
}
