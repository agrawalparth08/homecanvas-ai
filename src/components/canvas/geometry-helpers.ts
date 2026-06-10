import * as THREE from 'three';
import type { MeshBufferData } from '@lib/geometry/extrusion';
import { sanitizeBoundary, type RoomBoundary } from '@lib/geometry/rooms';

export function bufferDataToGeometry(data: MeshBufferData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  for (const group of data.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  return geometry;
}

const MM = 0.001;

/**
 * Room boundary (plan mm, +y north) -> flat horizontal geometry in meters.
 * rotateX(-90°) maps shape (x, y) to world (x, 0, -y), matching the
 * extrusion module's convention; normals end up +Y (facing up).
 */
export function boundaryToFloorGeometry(boundary: RoomBoundary): THREE.BufferGeometry {
  const clean = sanitizeBoundary(boundary);
  const shape = new THREE.Shape(clean.outer.map((p) => new THREE.Vector2(p.x * MM, p.y * MM)));
  for (const hole of clean.holes) {
    shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x * MM, p.y * MM))));
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}
