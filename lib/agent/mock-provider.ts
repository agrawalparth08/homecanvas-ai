/**
 * MockAgentProvider (Phase 4) — deterministic, fully offline.
 *
 * Parses the message to one intent, resolves the room target against the scene,
 * and emits an AgentEditProposal whose patch flows through the SAME validated
 * commit pipeline only after the user approves. Never mutates the scene.
 */
import { makePatch, type PatchOp, type ScenePatch, type SurfaceRef } from '../scene/patching';
import type { HomeScene, Room } from '../scene/schemas';
import { findWall } from '../scene/selectors';
import { buildStylePackApplication, wallSideFacingRoom } from '../styles/apply';
import { getStylePack, STYLE_PACKS } from '../styles/style-packs';
import { CATALOG, isCatalogKey, placeFurnitureInRoom, uniqueFurnitureId } from '../furniture/catalog';
import { correctionsFromReview } from './correction';
import { reviewExtraction } from '../extraction/review';
import { buildPaletteOps, type PaletteInput } from './palette-apply';
import { COLORS, MATERIALS, resolveRoom } from './vocab';
import { parseIntent, type ParsedIntent, type SurfaceTarget } from './intent';
import type { AgentEditProposal, AgentProvider, AgentRequestContext } from './provider';

const allRooms = (scene: HomeScene): Room[] => scene.floors.flatMap((f) => f.rooms);
const nameFor = (id: string, table: Record<string, string>) => Object.entries(table).find(([, v]) => v === id)?.[0] ?? id;

function surfacesFor(surface: SurfaceTarget, action: ParsedIntent['action']) {
  return {
    floor: surface === 'floor' || (surface === 'all' && action === 'material'),
    walls: surface === 'walls' || (surface === 'all' && action === 'recolor'),
    ceiling: surface === 'ceiling',
  };
}

function editOps(rooms: Room[], scene: HomeScene, intent: ParsedIntent): PatchOp[] {
  const want = surfacesFor(intent.surface, intent.action);
  const opFor = (surface: SurfaceRef): PatchOp =>
    intent.action === 'recolor'
      ? { type: 'set_surface_color', surface, color: intent.color! }
      : { type: 'assign_material_to_surface', surface, materialId: intent.materialId! };
  const ops: PatchOp[] = [];
  for (const room of rooms) {
    if (want.floor) ops.push(opFor({ kind: 'roomFloor', roomId: room.id }));
    if (want.ceiling && room.ceilingSurface) ops.push(opFor({ kind: 'roomCeiling', roomId: room.id }));
    if (want.walls) {
      for (const wallId of room.wallIds) {
        const found = findWall(scene, wallId);
        if (found) ops.push(opFor({ kind: 'wallSide', wallId, side: wallSideFacingRoom(found.wall, room) }));
      }
    }
  }
  return ops;
}

function targetRooms(message: string, scene: HomeScene, ctx: AgentRequestContext, wholeHome: boolean): Room[] {
  if (wholeHome) return allRooms(scene);
  const named = resolveRoom(message, scene);
  if (named) return [named];
  if (ctx.selectedEntityId) {
    const sel = allRooms(scene).find((r) => r.id === ctx.selectedEntityId);
    if (sel) return [sel];
  }
  return [];
}

/**
 * Recolour a room (or the whole home) from a reference image's palette — the
 * offline, deterministic path for "match this photo / use these colours". The
 * image is reduced to a PaletteInput client-side (lib/extraction/palette);
 * here we resolve the target and build the recolour proposal.
 */
export async function proposePaletteEdit(
  message: string,
  ctx: AgentRequestContext,
  input: PaletteInput,
): Promise<AgentEditProposal[]> {
  const intent = parseIntent(message);
  const named = targetRooms(message, ctx.scene, ctx, intent.wholeHome);
  const targets = intent.wholeHome ? allRooms(ctx.scene) : named.slice(0, 1);
  if (targets.length === 0) return [];

  const raw = targets.flatMap((r) => buildPaletteOps(ctx.scene, r, input, intent.surface));
  const seen = new Set<string>(); // one borrowed floor material across rooms
  const ops = raw.filter((op) => {
    if (op.type !== 'add_material') return true;
    if (seen.has(op.material.id)) return false;
    seen.add(op.material.id);
    return true;
  });
  if (ops.length === 0) return [];

  const where = intent.wholeHome ? 'the whole home' : targets[0]!.name;
  const summary = `Apply the reference palette to ${where}`;
  const patch = makePatch(summary, ops, 'agent');
  const palette = input.swatches.slice(0, 5).map((s) => s.hex).join('  ');
  return [{
    id: patch.id,
    summary,
    target: where,
    patch,
    rationale: `Extracted ${input.swatches.length} colour(s): ${palette}. Walls take the lightest tone; the floor takes the nearest library material.`,
    confidence: 0.7,
    skippedLocked: [],
  }];
}

export const mockAgentProvider: AgentProvider = {
  id: 'mock',
  capabilities: () => ({ proposeEdits: true, reviewExtraction: true, generateVariants: true, analyzeReference: false, proposeCorrections: true }),

  /** Deterministic corrections derived from the extraction-review heuristics. */
  async proposeCorrections(ctx: AgentRequestContext) {
    return correctionsFromReview(reviewExtraction(ctx.scene));
  },

  /** N distinct style-pack options for one room (or the whole home). */
  async generateVariants(message: string, ctx: AgentRequestContext, count: number): Promise<AgentEditProposal[]> {
    const intent = parseIntent(message);
    const rooms = targetRooms(message, ctx.scene, ctx, intent.wholeHome);
    const room = rooms[0];
    if (!intent.wholeHome && !room) return [];
    const scope = intent.wholeHome ? ('wholeHome' as const) : { roomIds: [room!.id] };
    const where = intent.wholeHome ? 'the whole home' : room!.name;
    const n = Math.min(Math.max(count, 2), STYLE_PACKS.length);

    const proposals: AgentEditProposal[] = [];
    for (const meta of STYLE_PACKS.slice(0, n)) {
      const app = buildStylePackApplication(ctx.scene, getStylePack(meta.id), scope, 'skip');
      if (!app.patch) continue;
      const description = `Variant — ${meta.name} for ${where}`;
      const patch: ScenePatch = { ...app.patch, origin: 'agent', description };
      proposals.push({
        id: patch.id,
        summary: `Option: ${meta.name}`,
        target: where,
        patch,
        rationale: meta.reasoning ?? `${meta.name} palette applied to ${where} (floor / walls / ceiling).`,
        confidence: 0.75,
        skippedLocked: app.skipped,
      });
    }
    return proposals;
  },

  async proposeEdits(message: string, ctx: AgentRequestContext): Promise<AgentEditProposal[]> {
    const intent = parseIntent(message);
    if (intent.action === 'revert' || intent.action === 'unknown') return [];

    if (intent.action === 'furniture') {
      const key = intent.furnitureKey;
      if (!key || !isCatalogKey(key)) return [];
      const rooms = targetRooms(message, ctx.scene, ctx, false);
      const room = rooms[0];
      if (!room) return [];
      const floor = ctx.scene.floors.find((f) => f.rooms.some((r) => r.id === room.id));
      if (!floor) return [];
      const existing = floor.objects.filter((o) => o.roomId === room.id);
      const obj = placeFurnitureInRoom({
        id: uniqueFurnitureId(new Set(floor.objects.map((o) => o.id)), room.id),
        roomId: room.id,
        key,
        roomOuter: room.boundary.outer,
        existing,
      });
      if (!obj) return []; // nothing fits without overlapping
      const summary = `Add ${CATALOG[key].name} to ${room.name}`;
      const patch = makePatch(summary, [{ type: 'place_furniture', object: obj }], 'agent');
      return [{
        id: patch.id,
        summary,
        target: room.name,
        patch,
        rationale: `Placed inside the room boundary, clear of ${existing.length} existing piece(s).`,
        confidence: 0.7,
        skippedLocked: [],
      }];
    }

    if (intent.action === 'style') {
      const rooms = targetRooms(message, ctx.scene, ctx, intent.wholeHome);
      if (!intent.wholeHome && rooms.length === 0) return [];
      const pack = getStylePack(intent.stylePackId!);
      const app = buildStylePackApplication(ctx.scene, pack, intent.wholeHome ? 'wholeHome' : { roomIds: rooms.map((r) => r.id) }, 'skip');
      if (!app.patch) return [];
      const where = intent.wholeHome ? 'the whole home' : rooms.map((r) => r.name).join(', ');
      const patch: ScenePatch = { ...app.patch, origin: 'agent' };
      return [{
        id: patch.id,
        summary: `Apply ${pack.name} to ${where}`,
        target: where,
        patch,
        rationale: pack.reasoning ?? `Style pack "${pack.name}" sets coordinated floor / wall / ceiling materials.`,
        confidence: 0.82,
        skippedLocked: app.skipped,
      }];
    }

    const rooms = targetRooms(message, ctx.scene, ctx, intent.wholeHome);
    if (rooms.length === 0) return [];
    const ops = editOps(rooms, ctx.scene, intent);
    if (ops.length === 0) return [];

    const where = intent.wholeHome ? 'the whole home' : rooms.map((r) => r.name).join(', ');
    const want = surfacesFor(intent.surface, intent.action);
    const parts = [want.floor && 'floor', want.walls && 'walls', want.ceiling && 'ceiling'].filter(Boolean).join(' + ');
    const value = intent.action === 'recolor' ? nameFor(intent.color!, COLORS) : nameFor(intent.materialId!, MATERIALS);
    const summary = `${intent.action === 'recolor' ? 'Paint' : 'Re-material'} ${where} ${parts} → ${value}`;
    const patch = makePatch(summary, ops, 'agent');
    return [{
      id: patch.id,
      summary,
      target: `${where} (${parts})`,
      patch,
      rationale: `${ops.length} surface change${ops.length === 1 ? '' : 's'} across ${rooms.length} room${rooms.length === 1 ? '' : 's'}.`,
      confidence: 0.8,
      skippedLocked: [],
    }];
  },
};
