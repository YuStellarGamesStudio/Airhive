// CPU wave layout and attack decisions supply these kernels with their data-defined parameters.
export const WAVE_SHADER = `
struct WaveInput {
  count: u32, columns: u32, shape: u32, unlocked: u32,
  waveResidue: u32, useResidues: u32, introType: u32, introActive: u32,
  center: f32, spacing: f32, density: f32, baseY: f32,
  rowSpacing: f32, columnsOffset: f32, shapeOffset: f32, profileHalf: f32,
  residues: array<u32>,
};
@group(0) @binding(0) var<storage, read> input: WaveInput;
@group(0) @binding(1) var<storage, read_write> output: array<vec4<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let slot = id.x;
  if (slot >= input.count) { return; }
  let column = slot % input.columns;
  let row = slot / input.columns;
  let relative = (f32(column) - input.columnsOffset) / input.density;
  var offset = 0.0;
  switch (input.shape) {
    case 1u: { offset = abs(relative) * input.shapeOffset; }
    case 2u: { offset = relative * relative * input.shapeOffset; }
    case 3u: { offset = f32(column % 2u) * input.shapeOffset; }
    case 4u: { offset = (input.profileHalf - abs(relative)) * input.shapeOffset; }
    case 5u: {
      if (column % 2u == 0u) { offset = input.shapeOffset; }
      else { offset = -input.shapeOffset; }
    }
    default: {}
  }
  var residue = (slot + input.waveResidue) % input.unlocked;
  if (input.useResidues != 0u) { residue = input.residues[slot]; }
  var enemyType = 1u + residue;
  if (slot % 3u == 0u) { enemyType = 1u; }
  if (input.introActive != 0u && (slot == 1u || slot == 2u)) {
    enemyType = min(input.unlocked, input.introType + slot);
  }
  output[slot] = vec4<f32>(f32(enemyType), input.center + relative * input.density * input.spacing,
    input.baseY + f32(row) * input.rowSpacing + offset, 0.0);
}
`;

export const ATTACK_SHADER = `
struct AttackInput {
  count: u32, _pad0: u32, _pad1: u32, _pad2: u32,
  jobs: array<vec4<f32>>,
};
@group(0) @binding(0) var<storage, read> input: AttackInput;
@group(0) @binding(1) var<storage, read_write> output: array<vec2<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= input.count) { return; }
  let job = input.jobs[index];
  var velocity: vec2<f32>;
  if (job.x == 0.0) {
    let direction = vec2<f32>(job.y, job.z);
    let distance = length(direction);
    velocity = vec2<f32>(0.0, 0.0);
    if (distance != 0.0) { velocity = direction / distance * job.w; }
  } else {
    velocity = vec2<f32>(sin(job.y), cos(job.y)) * job.w;
  }
  output[index] = velocity;
}
`;
