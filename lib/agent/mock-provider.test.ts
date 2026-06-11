import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from '../scene/commit';
import { parseIntent } from './intent';
import { mockAgentProvider } from './mock-provider';

describe('parseIntent', () => {
  it('recolours walls with a named colour', () => {
    const i = parseIntent('paint the lounge walls sage green');
    expect(i.action).toBe('recolor');
    expect(i.surface).toBe('walls');
    expect(i.color).toBe('#9caf88');
  });
  it('re-materials a floor', () => {
    const i = parseIntent('make the kitchen floor walnut');
    expect(i.action).toBe('material');
    expect(i.surface).toBe('floor');
    expect(i.materialId).toBe('mat-floor-walnut');
  });
  it('prefers the most specific material (grey marble > marble)', () => {
    expect(parseIntent('grey marble flooring').materialId).toBe('mat-floor-marble-grey');
  });
  it('applies a style pack to the whole home', () => {
    const i = parseIntent('give the whole home a japandi style');
    expect(i.action).toBe('style');
    expect(i.stylePackId).toBe('fusion-japandi');
    expect(i.wholeHome).toBe(true);
  });
  it('recognises revert and unknown', () => {
    expect(parseIntent('undo that').action).toBe('revert');
    expect(parseIntent('what is the meaning of life').action).toBe('unknown');
  });
  it('parses a variants request with an explicit count', () => {
    const i = parseIntent('show me 4 variants of the master bedroom');
    expect(i.action).toBe('variants');
    expect(i.count).toBe(4);
  });
  it('defaults variants to 3 when no number is given', () => {
    expect(parseIntent('give me options for the kitchen').count).toBe(3);
  });
  it('does not mistake "look" for a variants request', () => {
    expect(parseIntent('make the kitchen floor look walnut').action).toBe('material');
  });
  it('parses an add-furniture request', () => {
    const i = parseIntent('add a sofa to the living room');
    expect(i.action).toBe('furniture');
    expect(i.furnitureKey).toBe('sofa');
  });
  it('prefers the specific piece (coffee table > table)', () => {
    expect(parseIntent('place a coffee table in the lounge').furnitureKey).toBe('coffeeTable');
  });
  it('does not treat a material edit as furniture', () => {
    expect(parseIntent('make the kitchen floor walnut').action).toBe('material');
  });
});

describe('mockAgentProvider', () => {
  it('turns a style request for the living room into a committable proposal', async () => {
    const scene = buildSampleHome();
    const ps = await mockAgentProvider.proposeEdits('Make the living room Fusion Japandi please', { scene });
    expect(ps).toHaveLength(1);
    expect(ps[0]!.target).toBe('Living Room');
    expect(ps[0]!.patch.origin).toBe('agent');
    expect(commit(scene, ps[0]!.patch).ok).toBe(true);
  });

  it('proposes a wall recolour for a named room, committing cleanly', async () => {
    const scene = buildSampleHome();
    const room = scene.floors[0]!.rooms[0]!;
    const ps = await mockAgentProvider.proposeEdits(`paint the ${room.name} walls navy`, { scene });
    expect(ps).toHaveLength(1);
    expect(ps[0]!.summary).toContain('walls');
    expect(commit(scene, ps[0]!.patch).ok).toBe(true);
  });

  it('applies a whole-home style pack', async () => {
    const scene = buildSampleHome();
    const ps = await mockAgentProvider.proposeEdits('Apply Warm Minimal to the whole home', { scene });
    expect(ps[0]!.target).toBe('the whole home');
    expect(commit(scene, ps[0]!.patch).ok).toBe(true);
  });

  it('returns nothing for an unparseable message', async () => {
    expect(await mockAgentProvider.proposeEdits('hello there friend', { scene: buildSampleHome() })).toEqual([]);
  });

  it('generates N distinct, committable variants for a named room', async () => {
    const scene = buildSampleHome();
    const room = scene.floors[0]!.rooms[0]!;
    const ps = await mockAgentProvider.generateVariants!(`3 variants of the ${room.name}`, { scene }, 3);
    expect(ps).toHaveLength(3);
    // distinct style packs => distinct patch ids and descriptions
    expect(new Set(ps.map((p) => p.patch.id)).size).toBe(3);
    expect(new Set(ps.map((p) => p.summary)).size).toBe(3);
    for (const p of ps) {
      expect(p.target).toBe(room.name);
      expect(p.patch.origin).toBe('agent');
      expect(commit(scene, p.patch).ok).toBe(true);
    }
  });

  it('needs a room (or whole-home) to generate variants', async () => {
    const scene = buildSampleHome();
    expect(await mockAgentProvider.generateVariants!('give me some options', { scene }, 3)).toEqual([]);
  });

  it('proposes a collision-aware furniture placement that commits', async () => {
    const scene = buildSampleHome();
    // largest room by bounding box -> guaranteed space for a small piece
    const bbox = (r: { boundary: { outer: { x: number; y: number }[] } }) => {
      const xs = r.boundary.outer.map((p) => p.x);
      const ys = r.boundary.outer.map((p) => p.y);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    };
    const room = scene.floors.flatMap((f) => f.rooms).sort((a, b) => bbox(b) - bbox(a))[0]!;
    const ps = await mockAgentProvider.proposeEdits(`add a plant to the ${room.name}`, { scene });
    expect(ps).toHaveLength(1);
    expect(ps[0]!.patch.ops[0]!.type).toBe('place_furniture');
    expect(commit(scene, ps[0]!.patch).ok).toBe(true);
  });
});
