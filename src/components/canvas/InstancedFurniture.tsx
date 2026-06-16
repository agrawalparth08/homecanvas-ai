import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { FurnitureObject } from '@lib/scene/schemas';
import type { InstanceXform } from '@lib/render/instancing';
import { proceduralMaterial, proceduralPieces, type Piece } from './ProceduralFurniture';

const MM = 0.001;

// Reused scratch objects — the render loop is single-threaded, so sharing is safe.
const _m = new THREE.Matrix4();
const _world = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _ident = new THREE.Quaternion();

function InstancedPiece({
  piece,
  instances,
  material,
  onPick,
}: {
  piece: Piece;
  instances: InstanceXform[];
  material: THREE.Material;
  onPick: (entityId: string, e: ThreeEvent<MouseEvent>) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    _local.compose(_v.set(piece.pos[0], piece.pos[1], piece.pos[2]), _ident, _scale);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]!;
      _e.set(0, inst.rotationY, 0);
      _q.setFromEuler(_e);
      _world.compose(_v.set(inst.x * MM, inst.elevation * MM, -inst.y * MM), _q, _scale);
      _m.multiplyMatrices(_world, _local);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [piece, instances]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, instances.length]}
      material={material}
      castShadow
      receiveShadow
      onClick={(ev) => {
        const id = ev.instanceId != null ? instances[ev.instanceId]?.entityId : undefined;
        if (id) onPick(id, ev);
      }}
    >
      {piece.kind === 'box' ? (
        <boxGeometry args={piece.size} />
      ) : (
        <cylinderGeometry args={[piece.size[0], piece.size[0], piece.size[1], 20]} />
      )}
    </instancedMesh>
  );
}

/**
 * Render a batch of IDENTICAL procedural furniture pieces as one InstancedMesh per
 * sub-part, instead of N separate object groups. Every instance in a batch shares
 * kind, dimensions and materials (`rep` supplies all three), and carries its own
 * world transform + entityId — so a click resolves (via the R3F instanceId) back to
 * the exact scene entity for selection. Used only for non-selected, non-glTF pieces
 * with enough repeats to matter; the selected/dragged piece stays an individual mesh.
 */
export function InstancedFurniture({
  rep,
  instances,
  materials,
  onPick,
}: {
  rep: FurnitureObject;
  instances: InstanceXform[];
  materials: Map<string, THREE.MeshStandardMaterial>;
  onPick: (entityId: string, e: ThreeEvent<MouseEvent>) => void;
}) {
  const parts = useMemo(() => proceduralPieces(rep), [rep]);
  return (
    <>
      {parts.map((piece, i) => (
        <InstancedPiece
          key={i}
          piece={piece}
          instances={instances}
          material={proceduralMaterial(piece.mat, rep, materials)}
          onPick={onPick}
        />
      ))}
    </>
  );
}
