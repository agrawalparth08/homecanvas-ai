import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { RoomBoardSchema, type HomeScene } from '../scene/schemas';
import { buildRoomBoards } from './room-boards';

describe('buildRoomBoards', () => {
  const scene = buildSampleHome();
  const boards = buildRoomBoards(scene);
  const totalRooms = scene.floors.flatMap((f) => f.rooms).length;

  it('returns one schema-valid board per room, in floor order', () => {
    expect(boards).toHaveLength(totalRooms);
    for (const b of boards) {
      expect(RoomBoardSchema.safeParse(b).success).toBe(true);
      expect(b.name.length).toBeGreaterThan(0);
    }
  });

  it('palette is deduped (no repeated hex)', () => {
    for (const b of boards) expect(new Set(b.palette).size).toBe(b.palette.length);
  });

  it("furniture matches the floor's objects for that room", () => {
    for (const floor of scene.floors) {
      for (const room of floor.rooms) {
        const board = boards.find((b) => b.roomId === room.id)!;
        const expected = floor.objects.filter((o) => o.roomId === room.id).map((o) => o.id).sort();
        expect(board.furniture.map((f) => f.id).sort()).toEqual(expected);
      }
    }
  });

  it('is deterministic', () => {
    expect(buildRoomBoards(buildSampleHome())).toEqual(boards);
  });

  it("scopes each room's palette to its OWN materials (no cross-room leak)", () => {
    const synthetic = {
      materials: [
        { id: 'mA', name: 'Red', baseColor: '#aa0000' },
        { id: 'mB', name: 'Blue', baseColor: '#0000bb' },
      ],
      floors: [
        {
          rooms: [
            { id: 'rA', name: 'A', kind: 'living', floorSurface: { materialId: 'mA' }, wallIds: [], styleTags: [] },
            { id: 'rB', name: 'B', kind: 'bedroom', floorSurface: { materialId: 'mB' }, wallIds: [], styleTags: [] },
          ],
          walls: [],
          objects: [],
        },
      ],
    } as unknown as HomeScene;
    const out = buildRoomBoards(synthetic);
    const a = out.find((b) => b.roomId === 'rA')!;
    const b = out.find((b) => b.roomId === 'rB')!;
    expect(a.palette).toContain('#aa0000');
    expect(a.palette).not.toContain('#0000bb');
    expect(b.palette).toContain('#0000bb');
    expect(b.palette).not.toContain('#aa0000');
  });
});
