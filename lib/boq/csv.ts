import type { HomeScene } from '../scene/schemas';
import { sceneQuantities, type SceneQuantities } from './quantities';

/**
 * BOQ → CSV, openable in Excel/Sheets. Three sections: material totals (with an
 * empty editable Rate column — pricing is the designer's judgment, not ours),
 * per-room breakdown, and the furniture schedule.
 */

const esc = (v: string | number): string => {
  const s = typeof v === 'number' ? v.toFixed(2) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: (string | number)[]) => cells.map(esc).join(',');

export function quantitiesToCsv(scene: HomeScene, q: SceneQuantities = sceneQuantities(scene)): string {
  const lines: string[] = [];
  lines.push(row(`Bill of quantities — ${scene.name}`));
  lines.push(row('Areas derived from the 3D scene; verify on site. Rates and wastage are yours to fill.'));
  lines.push('');

  lines.push(row('MATERIAL TOTALS'));
  lines.push(row('Material', 'Surface', 'Area (m2)', 'Rate (per m2)', 'Amount'));
  for (const t of q.totals) {
    lines.push(row(t.materialName, t.surface, t.areaM2, '', ''));
  }
  lines.push('');

  lines.push(row('PER-ROOM BREAKDOWN'));
  lines.push(row('Room', 'Surface', 'Material', 'Area (m2)'));
  for (const r of q.rooms) {
    const matName = (id: string) => scene.materials.find((m) => m.id === id)?.name ?? id;
    lines.push(row(r.roomName, 'floor', matName(r.floorMaterialId), r.floorAreaM2));
    for (const [materialId, area] of Object.entries(r.wallAreaByMaterialM2)) {
      lines.push(row(r.roomName, 'wall', matName(materialId), area));
    }
    if (r.ceilingAreaM2 !== null && r.ceilingMaterialId) {
      lines.push(row(r.roomName, 'ceiling', matName(r.ceilingMaterialId), r.ceilingAreaM2));
    }
  }
  lines.push('');

  lines.push(row('FURNITURE SCHEDULE'));
  lines.push(row('Room', 'Item', 'Qty', 'Unit price', 'Amount'));
  for (const r of q.rooms) {
    for (const [item, count] of Object.entries(r.furniture)) {
      lines.push(row(r.roomName, item, count, '', ''));
    }
  }
  return lines.join('\n');
}
