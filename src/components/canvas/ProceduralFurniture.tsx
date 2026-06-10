import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { FurnitureObject } from '@lib/scene/schemas';
import { pick } from './materials';

/**
 * Parametric placeholder furniture. Each piece is composed from primitives
 * sized off the object's real dimensions, so swaps to glTF assets later (P5)
 * won't change footprints. Local space: x = width, z = depth, y = up (m).
 */

const MM = 0.001;

interface Piece {
  kind: 'box' | 'cylinder';
  /** center position in local meters */
  pos: [number, number, number];
  /** box: [w,h,d]; cylinder: [radius, height] */
  size: [number, number, number];
  mat: number;
}

const DARK = new THREE.MeshStandardMaterial({ color: '#26241f', roughness: 0.6 });
const FOLIAGE = new THREE.MeshStandardMaterial({ color: '#3f6b3f', roughness: 0.9 });

function pieces(obj: FurnitureObject): Piece[] {
  const w = obj.dimensions.w * MM;
  const d = obj.dimensions.d * MM;
  const h = obj.dimensions.h * MM;
  const kind = obj.procedural?.kind ?? obj.category;

  switch (kind) {
    case 'sofa': {
      const seatH = h * 0.5;
      const armW = w * 0.1;
      return [
        { kind: 'box', pos: [0, seatH / 2, 0], size: [w - 2 * armW, seatH, d], mat: 0 },
        { kind: 'box', pos: [0, h * 0.55, -d * 0.38], size: [w - 2 * armW, h * 0.9 - seatH, d * 0.24], mat: 0 },
        { kind: 'box', pos: [-(w / 2 - armW / 2), h * 0.35, 0], size: [armW, h * 0.7, d], mat: 1 },
        { kind: 'box', pos: [w / 2 - armW / 2, h * 0.35, 0], size: [armW, h * 0.7, d], mat: 1 },
      ];
    }
    case 'bed': {
      const baseH = h * 0.45;
      return [
        { kind: 'box', pos: [0, baseH / 2, 0], size: [w, baseH, d], mat: 1 },
        { kind: 'box', pos: [0, baseH + h * 0.12, 0], size: [w * 0.96, h * 0.24, d * 0.96], mat: 0 },
        { kind: 'box', pos: [0, h * 0.75, -d / 2 + 0.04], size: [w, h * 1.5 - baseH, 0.08], mat: 1 },
      ];
    }
    case 'table':
    case 'diningTable': {
      const legR = 0.035;
      const topT = 0.05;
      const lx = w / 2 - 0.08;
      const lz = d / 2 - 0.08;
      return [
        { kind: 'box', pos: [0, h - topT / 2, 0], size: [w, topT, d], mat: 0 },
        { kind: 'cylinder', pos: [-lx, (h - topT) / 2, -lz], size: [legR, h - topT, 0], mat: 0 },
        { kind: 'cylinder', pos: [lx, (h - topT) / 2, -lz], size: [legR, h - topT, 0], mat: 0 },
        { kind: 'cylinder', pos: [-lx, (h - topT) / 2, lz], size: [legR, h - topT, 0], mat: 0 },
        { kind: 'cylinder', pos: [lx, (h - topT) / 2, lz], size: [legR, h - topT, 0], mat: 0 },
      ];
    }
    case 'counter':
      return [
        { kind: 'box', pos: [0, (h - 0.04) / 2, 0], size: [w, h - 0.04, d], mat: 1 },
        { kind: 'box', pos: [0, h - 0.02, 0], size: [w * 1.01, 0.04, d * 1.05], mat: 0 },
      ];
    case 'wardrobe':
      return [
        { kind: 'box', pos: [0, h / 2, 0], size: [w, h, d], mat: 0 },
        { kind: 'box', pos: [0, h * 0.55, d / 2 + 0.005], size: [0.02, h * 0.25, 0.015], mat: 1 },
      ];
    case 'rug':
      return [{ kind: 'box', pos: [0, h / 2, 0], size: [w, h, d], mat: 0 }];
    case 'tvUnit':
      return [
        { kind: 'box', pos: [0, h / 2, 0], size: [w, h, d], mat: 0 },
        { kind: 'box', pos: [0, h + 0.45, 0], size: [w * 0.62, 0.7, 0.04], mat: -1 },
      ];
    case 'plant':
      return [
        { kind: 'cylinder', pos: [0, h * 0.15, 0], size: [w * 0.4, h * 0.3, 0], mat: 0 },
        { kind: 'cylinder', pos: [0, h * 0.6, 0], size: [w * 0.55, h * 0.6, 0], mat: -2 },
      ];
    case 'chair':
      return [
        { kind: 'box', pos: [0, h * 0.3, 0], size: [w, h * 0.12, d], mat: 0 },
        { kind: 'box', pos: [0, h * 0.62, -d * 0.4], size: [w, h * 0.65, d * 0.16], mat: 0 },
      ];
    default:
      return [{ kind: 'box', pos: [0, h / 2, 0], size: [w, h, d], mat: 0 }];
  }
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
  const parts = useMemo(() => pieces(object), [object]);
  const materialFor = (idx: number): THREE.Material => {
    if (idx === -1) return DARK;
    if (idx === -2) return FOLIAGE;
    return pick(materials, object.materialIds[idx] ?? object.materialIds[0]);
  };

  return (
    <>
      {parts.map((piece, i) => (
        <mesh key={i} position={piece.pos} material={materialFor(piece.mat)} castShadow receiveShadow>
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
