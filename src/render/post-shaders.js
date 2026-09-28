// Full-screen triangle UVs use a top-left origin, matching Canvas and texture coordinates.
const FULL_SCREEN = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};
@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
  var output: VertexOutput;
  let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  output.position = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  output.uv = uv;
  return output;
}
`;

export const COMPOSITE_SHADER = /* wgsl */ `
${FULL_SCREEN}
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(textureSample(scene, linearSampler, input.uv).rgb, 1.0);
}
`;

export const OVERLAY_SHADER = /* wgsl */ `
${FULL_SCREEN}
@group(0) @binding(0) var foreground: texture_2d<f32>;
@group(0) @binding(1) var emission: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let front = textureSample(foreground, linearSampler, input.uv);
  let glow = textureSample(emission, linearSampler, input.uv);
  // Premultiplied foreground occludes sprites, while light adds on top without erasing them.
  return vec4f(front.rgb * front.a + glow.rgb * glow.a * 2.2, front.a);
}
`;

export const BLOOM_SHADER = /* wgsl */ `
${FULL_SCREEN}
struct Filter {
  texel: vec2f,
  radius: f32,
  unused: f32,
};
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> kernel: Filter;

@fragment fn extract(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(source, linearSampler, input.uv).rgb;
  let peak = max(max(color.r, color.g), color.b);
  // A soft chromatic threshold keeps projectile hues while rejecting ordinary sky light.
  let weight = smoothstep(0.65, 1.4, peak);
  return vec4f(max(color - vec3f(0.62), vec3f(0.0)) * weight, 1.0);
}

@fragment fn blur(input: VertexOutput) -> @location(0) vec4f {
  let stride = kernel.texel * kernel.radius;
  var result = textureSample(source, linearSampler, input.uv).rgb * 0.227027;
  for (var i = 1; i <= 4; i++) {
    let offset = stride * f32(i);
    let weights = array<f32, 4>(0.1945946, 0.1216216, 0.054054, 0.016216);
    result += (textureSample(source, linearSampler, input.uv + offset).rgb
      + textureSample(source, linearSampler, input.uv - offset).rgb) * weights[i - 1];
  }
  return vec4f(result, 1.0);
}
`;

export const FINAL_SHADER = /* wgsl */ `
${FULL_SCREEN}
struct Shock {
  center: vec2f,
  radius: f32,
  width: f32,
  strength: f32,
  age: f32,
  padding: vec2f,
};
struct Effects {
  world: vec2f,
  shake: vec2f,
  bloomStrength: f32,
  distortionStrength: f32,
  shockCount: u32,
  padding: f32,
  shocks: array<Shock, 8>,
};
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var nearBloom: texture_2d<f32>;
@group(0) @binding(2) var farBloom: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<uniform> effects: Effects;

fn srgb(linear: vec3f) -> vec3f {
  let lo = linear * 12.92;
  let hi = 1.055 * pow(max(linear, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, linear <= vec3f(0.0031308));
}

@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  let overscan = 1.0 + min(length(effects.shake) / 200.0, 0.045);
  var uv = (input.uv - vec2f(0.5)) / overscan + vec2f(0.5) + effects.shake / effects.world;
  let position = uv * effects.world;
  var displacement = vec2f(0.0);
  for (var i = 0u; i < effects.shockCount; i++) {
    let shock = effects.shocks[i];
    let delta = position - shock.center;
    let distance = length(delta);
    let ring = (distance - shock.radius) / shock.width;
    let envelope = exp(-ring * ring * 2.0);
    displacement += (delta / max(distance, 1.0)) * envelope * shock.strength;
  }
  uv = clamp(uv + displacement * effects.distortionStrength / effects.world, vec2f(0.0), vec2f(1.0));
  let base = textureSample(scene, linearSampler, uv).rgb;
  let nearLight = textureSample(nearBloom, linearSampler, uv).rgb;
  let farLight = textureSample(farBloom, linearSampler, uv).rgb;
  let light = base + effects.bloomStrength * (nearLight * 0.7 + farLight * 0.48);
  // Leave shadows and midtones untouched; roll highlights into display white.
  let excess = max(light - vec3f(0.82), vec3f(0.0));
  let mapped = min(light, vec3f(0.82)) + vec3f(0.18) * (vec3f(1.0) - exp(-excess / 0.18));
  return vec4f(srgb(clamp(mapped, vec3f(0.0), vec3f(1.0))), 1.0);
}
`;
