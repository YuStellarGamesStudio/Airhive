import {VISUALS as V} from '../data/visuals.js';
import {GAME} from '../data/game.js';

const IDS = V.spriteIds.filter(id => id === 'player' || /^[EB]\d+$/.test(id));
const STRIDE = 12;
const CAPACITY = GAME.enemyCap + 2;
const SHADER = `
struct Instance { rect: vec4f, pose: vec4f, uv: vec4f }
@group(0) @binding(0) var sprites: texture_2d_array<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<storage, read> instances: array<Instance>;
struct Vertex {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) layer: u32,
  @location(2) alpha: f32,
  @location(3) flash: vec2f,
}
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> Vertex {
  let corners = array<vec2f, 6>(vec2f(-.5,-.5),vec2f(.5,-.5),vec2f(-.5,.5),
    vec2f(-.5,.5),vec2f(.5,-.5),vec2f(.5,.5));
  let item = instances[index];
  let local = corners[vertex] * item.rect.zw;
  let rotated = vec2f(local.x * item.pose.x - local.y * item.pose.y,
    local.x * item.pose.y + local.y * item.pose.x);
  let position = item.rect.xy + rotated;
  var output: Vertex;
  output.position = vec4f(position.x / ${V.width}.0 * 2.0 - 1.0,
    1.0 - position.y / ${V.height}.0 * 2.0, 0.0, 1.0);
  output.uv = (corners[vertex] + .5) * item.uv.xy;
  output.layer = u32(item.pose.w);
  output.alpha = item.pose.z;
  output.flash = item.uv.zw;
  return output;
}
@fragment fn fragmentMain(input: Vertex) -> @location(0) vec4f {
  let sample = textureSample(sprites, linearSampler, input.uv, i32(input.layer));
  let surface = vec4f(sample.rgb * sample.a, sample.a) * input.alpha;
  let tint = mix(vec3f(2.4, 1.6, .7), vec3f(.6, 2.1, 2.7), input.flash.y);
  return vec4f(surface.rgb + tint * input.flash.x * surface.a, surface.a);
}`;

export class GPUSprites {
  constructor(device) {
    this.device = device;
    this.texture = null;
    this.images = null;
    this.count = 0;
    this.layers = new Map();
    this.clock = 0;
    this.hits = new WeakMap();
    this.data = new Float32Array(CAPACITY * STRIDE);
    this.buffer = device.createBuffer({label: 'aircraft instances', size: this.data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
    const shader = device.createShaderModule({label: 'instanced aircraft', code: SHADER});
    this.modules = [shader];
    this.pipeline = device.createRenderPipeline({label: 'GPU aircraft', layout: 'auto',
      vertex: {module: shader, entryPoint: 'vertexMain'},
      fragment: {module: shader, entryPoint: 'fragmentMain', targets: [{format: 'rgba16float', blend: {
        color: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha'},
        alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha'},
      }}]}, primitive: {topology: 'triangle-list'}});
    this.sampler = device.createSampler({minFilter: 'linear', magFilter: 'linear'});
    this.attachment = {view: null, loadOp: 'load', storeOp: 'store'};
    this.passDescriptor = {label: 'aircraft instances', colorAttachments: [this.attachment]};
  }

  upload(images) {
    if (this.images === images || !images?.has('player')) return;
    let width = 1, height = 1;
    for (const id of IDS) {
      const image = images.get(id);
      if (!image) throw new Error(`Missing GPU aircraft texture: ${id}`);
      width = Math.max(width, image.width); height = Math.max(height, image.height);
    }
    this.texture?.destroy();
    this.texture = this.device.createTexture({label: 'aircraft texture array',
      size: [width, height, IDS.length], format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT});
    for (let layer = 0; layer < IDS.length; layer++) {
      const id = IDS[layer], image = images.get(id);
      this.device.queue.copyExternalImageToTexture({source: image},
        {texture: this.texture, origin: [0, 0, layer], premultipliedAlpha: false}, [image.width, image.height]);
      this.layers.set(id, {layer, u: image.width / width, v: image.height / height});
    }
    this.bindGroup = this.device.createBindGroup({layout: this.pipeline.getBindGroupLayout(0), entries: [
      {binding: 0, resource: this.texture.createView({dimension: '2d-array'})},
      {binding: 1, resource: this.sampler}, {binding: 2, resource: {buffer: this.buffer}},
    ]});
    this.images = images;
  }

  event(event, reducedMotion = false) {
    if ((event.type === 'hit' || event.type === 'shield') && event.survived && event.target) {
      this.hits.set(event.target, {until: this.clock + V.hitFlashLife,
        shield: event.type === 'shield', strength: reducedMotion ? .25 : .65});
    }
  }

  update(dt) { this.clock += Math.max(0, Math.min(V.maxFrameDelta, dt)); }

  reset() { this.clock = 0; this.hits = new WeakMap(); }

  add(id, entity, angle = 0, alpha = 1) {
    if (!entity || entity.active === false || entity.invisible || this.count === CAPACITY) return;
    const sprite = this.layers.get(id);
    if (!sprite) return;
    const offset = this.count++ * STRIDE, data = this.data;
    data[offset] = entity.x; data[offset + 1] = entity.y;
    data[offset + 2] = entity.w; data[offset + 3] = entity.h;
    data[offset + 4] = Math.cos(angle); data[offset + 5] = Math.sin(angle);
    data[offset + 6] = alpha; data[offset + 7] = sprite.layer;
    data[offset + 8] = sprite.u; data[offset + 9] = sprite.v;
    const hit = this.hits.get(entity);
    data[offset + 10] = hit ? Math.max(0, (hit.until - this.clock) / V.hitFlashLife) * hit.strength : 0;
    data[offset + 11] = hit?.shield ? 1 : 0;
  }

  encode(encoder, game, bank, elapsed, targetView) {
    this.count = 0;
    if (!this.texture || !game || game.state === 'menu') return;
    for (const enemy of game.enemies) if (enemy !== game.boss) this.add(enemy.type, enemy);
    this.add(game.boss?.type, game.boss);
    const player = game.player;
    if (player && game.state !== 'dying' && game.state !== 'death' && game.state !== 'gameover') {
      const alpha = player.invulnerable > 0 && Math.sin(elapsed * 29) > .4 ? .52 : 1;
      this.add('player', player, Math.max(-1, Math.min(1, bank)) * V.bankAngle, alpha);
    }
    if (!this.count) return;
    this.device.queue.writeBuffer(this.buffer, 0, this.data, 0, this.count * STRIDE);
    this.attachment.view = targetView;
    const pass = encoder.beginRenderPass(this.passDescriptor);
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, this.count); pass.end();
  }

  dispose() {
    this.texture?.destroy();
    this.buffer.destroy();
    this.texture = this.images = null;
    this.layers.clear();
  }
}
