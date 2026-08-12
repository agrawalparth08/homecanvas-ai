import type { FurnitureObject } from '../scene/schemas';

/**
 * Parametric decomposition of a furniture object into box/cylinder pieces
 * (local meters, y-up). PURE data — shared by the React renderer, the
 * instancing partitioner, the Blender exporter, and the standalone client
 * viewer, so every consumer draws identical furniture.
 */

const MM = 0.001;

export interface Piece {
  kind: 'box' | 'cylinder';
  /** center position in local meters */
  pos: [number, number, number];
  /** box: [w,h,d]; cylinder: [radius, height] */
  size: [number, number, number];
  /** material slot: index into obj.materialIds; -1 = dark accent, -2 = foliage */
  mat: number;
}

/** Decompose a furniture object into parametric box/cylinder pieces (local meters). */
export function proceduralPieces(obj: FurnitureObject): Piece[] {
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
