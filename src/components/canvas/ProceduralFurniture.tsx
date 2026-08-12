import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { FurnitureObject } from '@lib/scene/schemas';
import { proceduralPieces, type Piece } from '@lib/furniture/pieces';
import { pick } from './materials';

/**
 * Parametric placeholder furniture. The pure piece decomposition lives in
 * @lib/furniture/pieces (shared with the instancer, Blender export, and the
 * standalone client viewer); this file is only the React/three renderer.
 * Local space: x = width, z = depth, y = up (m).
 */

// Re-exported so existing consumers (InstancedFurniture) keep one import site.
export { proceduralPieces, type Piece };

const DARK = new THREE.MeshStandardMaterial({ color: '#26241f', roughness: 0.6 });
const FOLIAGE = new THREE.MeshStandardMaterial({ color: '#3f6b3f', roughness: 0.9 });

/** Resolve a piece's material slot to a THREE material (shared by the instanced renderer). */
export function proceduralMaterial(
  idx: number,
  obj: FurnitureObject,
  materials: Map<string, THREE.MeshStandardMaterial>,
): THREE.Material {
  if (idx === -1) return DARK;
  if (idx === -2) return FOLIAGE;
  return pick(materials, obj.materialIds[idx] ?? obj.materialIds[0]);
}

export function ProceduralFurniture({
  object,
  materials,
  selected,
}: {
  object: FurnitureObject;
  materials: Map<string, THREE.MeshStandardMaterial>;
  selected: boolean;
}) {
  const parts = useMemo(() => proceduralPieces(object), [object]);

  return (
    <>
      {parts.map((piece, i) => (
        <mesh key={i} position={piece.pos} material={proceduralMaterial(piece.mat, object, materials)} castShadow receiveShadow>
          {piece.kind === 'box' ? (
            <boxGeometry args={piece.size} />
          ) : (
            <cylinderGeometry args={[piece.size[0], piece.size[0], piece.size[1], 20]} />
          )}
          {selected && <Edges scale={1.02} color="#d8a25a" lineWidth={2} />}
        </mesh>
      ))}
    </>
  );
}
