const PARTICLE_LAYOUT = `
struct Particle {
  position: vec2<f32>,
  velocity: vec2<f32>,
  state: vec4<f32>, // age, lifetime, radius, heat
  noise: vec4<f32>, // seed, kind (0 smoke / 1 warm spark / 2 shield spark), reserved
};
`;

export const SMOKE_COMPUTE_SHADER = `${PARTICLE_LAYOUT}
struct Frame { step: vec4<f32> }; // dt, reduced motion, unused, unused
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> frame: Frame;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let slot = id.x;
  if (slot >= arrayLength(&particles) || frame.step.x <= 0.0) { return; }
  var p = particles[slot];
  let age = p.state.x + frame.step.x;
  if (p.state.y <= 0.0 || age >= p.state.y) {
    p.state.y = 0.0;
    particles[slot] = p;
    return;
  }
  if (p.noise.y > 0.5) {
    let drag = exp(-2.8 * frame.step.x);
    p.velocity = (p.velocity + vec2<f32>(0.0, 72.0 * frame.step.y)
      * frame.step.x) * drag;
    p.position += p.velocity * frame.step.x;
    p.state.x = age;
    p.state.z = max(3.0, p.state.z - 7.0 * frame.step.x);
    p.state.w *= exp(-2.0 * frame.step.x);
    particles[slot] = p;
    return;
  }
  let t = age * 1.35 + p.noise.x * 5.0;
  let x = p.position.x * 0.012;
  let y = p.position.y * 0.012;
  // Tangent to a shifting scalar field: a curl-like, largely divergence-free drift.
  let curl = vec2<f32>(cos(y + t) * cos(x - t * 0.6),
    sin(y + t) * sin(x - t * 0.6)) * (10.0 * frame.step.y);
  let drag = exp(-1.05 * frame.step.x);
  p.velocity = (p.velocity + (curl + vec2<f32>(0.0, -15.0 * frame.step.y))
    * frame.step.x) * drag;
  p.position += p.velocity * frame.step.x;
  p.state.x = age;
  p.state.z = min(p.state.z + 4.8 * frame.step.x, 35.0);
  p.state.w *= exp(-3.2 * frame.step.x);
  particles[slot] = p;
}
`;

export const SMOKE_RENDER_SHADER = `${PARTICLE_LAYOUT}
@group(0) @binding(0) var<storage, read> particles: array<Particle>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) age: f32,
  @location(2) life: f32,
  @location(3) heat: f32,
  @location(4) seed: f32,
  @location(5) kind: f32,
};

@vertex
fn vertex(@builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  let p = particles[instanceIndex];
  let local = corners[vertexIndex];
  var out: VertexOutput;
  out.local = local;
  out.age = p.state.x;
  out.life = p.state.y;
  out.heat = p.state.w;
  out.seed = p.noise.x;
  out.kind = p.noise.y;
  if (p.state.y <= 0.0) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  var world = p.position + local * p.state.z;
  if (p.noise.y > 0.5) {
    let direction = normalize(p.velocity + vec2<f32>(0.001, 0.001));
    world = p.position + direction * local.y * p.state.z
      + vec2<f32>(-direction.y, direction.x) * local.x * 1.35;
  }
  out.position = vec4<f32>(world.x / 480.0 - 1.0, 1.0 - world.y / 270.0, 0.0, 1.0);
  return out;
}

fn hash(point: vec2<f32>) -> f32 {
  return fract(sin(dot(point, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn noise(point: vec2<f32>) -> f32 {
  let cell = floor(point);
  let f = fract(point);
  let blend = f * f * (3.0 - 2.0 * f);
  let bottom = mix(hash(cell), hash(cell + vec2<f32>(1.0, 0.0)), blend.x);
  let top = mix(hash(cell + vec2<f32>(0.0, 1.0)), hash(cell + vec2<f32>(1.0, 1.0)), blend.x);
  return mix(bottom, top, blend.y);
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
  if (in.life <= 0.0) { discard; }
  if (in.kind > 0.5) {
    let width = 1.0 - smoothstep(0.25, 0.96, abs(in.local.x));
    let taper = 1.0 - smoothstep(0.48, 1.0, abs(in.local.y));
    let fade = 1.0 - smoothstep(0.12, 0.96, in.age / in.life);
    let alpha = width * taper * fade * 0.83;
    if (alpha <= 0.003) { discard; }
    var color = vec3<f32>(3.1, 1.18, 0.33);
    if (in.kind > 1.5) { color = vec3<f32>(0.45, 2.6, 3.25); }
    return vec4<f32>(color * alpha * in.heat, alpha);
  }
  // Age is simulated rather than wall-clock time, so pause freezes the texture too.
  let offset = vec2<f32>(in.seed * 23.0 + in.age * 0.28,
    in.seed * 41.0 - in.age * 0.17);
  let fine = noise(in.local * 5.2 + offset);
  let broad = noise(in.local * 2.4 - offset * 0.46);
  let distance = length(in.local * vec2<f32>(1.0, 1.06));
  let ragged = distance + (fine - 0.5) * 0.23 + (broad - 0.5) * 0.27;
  let edge = 1.0 - smoothstep(0.34, 0.98, ragged);
  let density = edge * (0.55 + 0.45 * broad);
  let fade = smoothstep(0.0, 0.13, in.age)
    * (1.0 - smoothstep(0.48, 1.0, in.age / in.life));
  let alpha = clamp(density * fade * 0.23, 0.0, 0.42);
  if (alpha <= 0.002) { discard; }
  let core = (1.0 - smoothstep(0.03, 0.48, distance))
    * (1.0 - smoothstep(0.10, 0.50, in.age)) * in.heat;
  let cooled = mix(vec3<f32>(0.14, 0.19, 0.24),
    vec3<f32>(0.31, 0.35, 0.37), clamp(density, 0.0, 1.0));
  let color = cooled + vec3<f32>(1.45, 0.54, 0.16) * core;
  return vec4<f32>(color * alpha, alpha);
}
`;
