import type { Vec2 } from './vec';
import type { GeoPrism, WallSolid } from './walls';

/**
 * Prisms -> render-ready buffers (plain typed arrays; no three.js import so
 * this stays unit-testable in Node).
 *
 * Plan-to-world mapping: plan (x, y) -> world (x, -y) on the XZ plane,
 * elevation -> +Y. Callers add the floor's base elevation via mesh position.
 *
 * UVs: walls use (s along centerline, z) in meters so textures run
 * continuously across opening splits — no seams.
 */

export interface MeshBufferData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** three.js geometry groups: materialIndex 0 = sideA, 1 = sideB, 2 = trim. */
  groups: { start: number; count: number; materialIndex: number }[];
}

const MM = 0.001; // world units are meters

class BufferBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  /** Quad from 4 world-space corners (CCW seen from outside), flat normal. */
  quad(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    uv: [number, number][],
  ): void {
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p3[0] - p0[0];
    const by = p3[1] - p0[1];
    const bz = p3[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = this.positions.length / 3;
    for (const [i, p] of [p0, p1, p2, p3].entries()) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.uvs.push(uv[i]![0], uv[i]![1]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  get indexCount(): number {
    return this.indices.length;
  }
}

const W = (p: Vec2, z: number): [number, number, number] => [p.x * MM, z * MM, -p.y * MM];

function emitPrism(b: BufferBuilder, prism: GeoPrism, faces: 'sideA' | 'sideB' | 'trim'): void {
  const [a0, a1, b1, b0] = prism.corners;
  const { zMin, zMax, sStart, sEnd } = prism;
  const u0 = sStart * MM;
  const u1 = sEnd * MM;
  const v0 = zMin * MM;
  const v1 = zMax * MM;

  if (faces === 'sideA') {
    // sideA = left of dir; outward normal faces left. Corner order chosen CCW from outside.
    b.quad(W(a1, zMin), W(a0, zMin), W(a0, zMax), W(a1, zMax), [
      [u1, v0],
      [u0, v0],
      [u0, v1],
      [u1, v1],
    ]);
  } else if (faces === 'sideB') {
    b.quad(W(b0, zMin), W(b1, zMin), W(b1, zMax), W(b0, zMax), [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ]);
  } else {
    const t = prism.corners; // top face
    b.quad(W(t[0], zMax), W(t[1], zMax), W(t[2], zMax), W(t[3], zMax), [
      [u0, 0],
      [u1, 0],
      [u1, 0.3],
      [u0, 0.3],
    ]);
    if (zMin > 0.5) {
      // bottom face (lintels above openings)
      b.quad(W(t[3], zMin), W(t[2], zMin), W(t[1], zMin), W(t[0], zMin), [
        [u0, 0],
        [u1, 0],
        [u1, 0.3],
        [u0, 0.3],
      ]);
    }
    // end caps / jambs
    b.quad(W(t[3], zMin), W(t[0], zMin), W(t[0], zMax), W(t[3], zMax), [
      [0, v0],
      [0.3, v0],
      [0.3, v1],
      [0, v1],
    ]);
    b.quad(W(t[1], zMin), W(t[2], zMin), W(t[2], zMax), W(t[1], zMax), [
      [0, v0],
      [0.3, v0],
      [0.3, v1],
      [0, v1],
    ]);
  }
}

/** One buffer per wall, with material groups: [sideA, sideB, trim]. */
export function wallSolidToBuffers(solid: WallSolid): MeshBufferData {
  const b = new BufferBuilder();
  const groups: MeshBufferData['groups'] = [];

  let start = 0;
  for (const prism of solid.prisms) emitPrism(b, prism, 'sideA');
  groups.push({ start, count: b.indexCount - start, materialIndex: 0 });

  start = b.indexCount;
  for (const prism of solid.prisms) emitPrism(b, prism, 'sideB');
  groups.push({ start, count: b.indexCount - start, materialIndex: 1 });

  start = b.indexCount;
  for (const prism of solid.prisms) emitPrism(b, prism, 'trim');
  groups.push({ start, count: b.indexCount - start, materialIndex: 2 });

  return {
    positions: new Float32Array(b.positions),
    normals: new Float32Array(b.normals),
    uvs: new Float32Array(b.uvs),
    indices: new Uint32Array(b.indices),
    groups,
  };
}

/** Generic prism list (stairs, slabs) -> single-material buffers. */
export function prismsToBuffers(prisms: GeoPrism[]): MeshBufferData {
  const b = new BufferBuilder();
  for (const prism of prisms) {
    emitPrism(b, prism, 'sideA');
    emitPrism(b, prism, 'sideB');
    emitPrism(b, prism, 'trim');
  }
  return {
    positions: new Float32Array(b.positions),
    normals: new Float32Array(b.normals),
    uvs: new Float32Array(b.uvs),
    indices: new Uint32Array(b.indices),
    groups: [{ start: 0, count: b.indices.length, materialIndex: 0 }],
  };
}
