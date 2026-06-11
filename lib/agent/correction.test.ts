import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from '../scene/commit';
import { GeometryCorrectionProposalSchema, type ExtractionReview, type HomeScene } from '../scene/schemas';
import { correctionsFromReview, proposalToPatch } from './correction';
import { mockAgentProvider } from './mock-provider';

const review = (issues: ExtractionReview['issues']): ExtractionReview => ({ issues, coverage: 1, summary: '' });

describe('proposalToPatch', () => {
  it('resizeWall → a schema-valid update_wall patch', () => {
    const patch = proposalToPatch({
      id: 'p1',
      targetEntityId: 'w1',
      kind: 'resizeWall',
      params: { thickness: 115 },
      rationale: 'too thin',
      confidence: 0.7,
    });
    expect(patch.ops[0]!.type).toBe('update_wall');
    expect(patch.origin).toBe('agent');
  });

  it('throws on a resizeWall with no thickness', () => {
    expect(() =>
      proposalToPatch({ id: 'p', targetEntityId: 'w', kind: 'resizeWall', params: {}, rationale: '', confidence: 0.5 }),
    ).toThrow();
  });

  it('deleteWall → a remove_wall patch on that wall', () => {
    const patch = proposalToPatch({ id: 'p', targetEntityId: 'w2', kind: 'deleteWall', params: {}, rationale: '', confidence: 0.6 });
    expect(patch.ops[0]!.type).toBe('remove_wall');
    expect((patch.ops[0] as { wallId: string }).wallId).toBe('w2');
    expect(patch.origin).toBe('agent');
  });
});

describe('correctionsFromReview', () => {
  it('maps thin-wall → resizeWall and sliver-wall → deleteWall', () => {
    const props = correctionsFromReview(
      review([
        { id: 'rev-thickness-w1', entityId: 'w1', severity: 'warning', kind: 'suspicious-dimension', message: 'thin' },
        { id: 'rev-shortwall-w2', entityId: 'w2', severity: 'warning', kind: 'suspicious-dimension', message: 'short' },
      ]),
    );
    expect(props.map((p) => [p.targetEntityId, p.kind])).toEqual([
      ['w1', 'resizeWall'],
      ['w2', 'deleteWall'],
    ]);
    for (const p of props) expect(GeometryCorrectionProposalSchema.safeParse(p).success).toBe(true);
  });
});

describe('mockAgentProvider.proposeCorrections', () => {
  it('derives a resizeWall correction for a too-thin extracted wall', async () => {
    const thinScene = {
      floors: [
        {
          rooms: [
            {
              id: 'r1',
              name: 'R',
              boundary: { outer: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 4000 }, { x: 0, y: 4000 }], holes: [] },
              source: { kind: 'extracted', confidence: 1 },
            },
          ],
          walls: [{ id: 'w1', thickness: 5, path: { pts: [{ x: 0, y: 0 }, { x: 4000, y: 0 }] }, source: { kind: 'extracted', confidence: 1 } }],
          objects: [],
        },
      ],
    } as unknown as HomeScene;
    const props = await mockAgentProvider.proposeCorrections!({ scene: thinScene });
    expect(props.some((p) => p.kind === 'resizeWall' && p.targetEntityId === 'w1')).toBe(true);
  });
});

describe('correction safety', () => {
  it('a correction targeting a locked wall is rejected by commit', () => {
    const base = buildSampleHome();
    const wallId = base.floors[0]!.walls[0]!.id;
    const oldScene = { ...base, locks: [{ id: 'lk', entityIds: [wallId], createdAt: '2026-06-11T00:00:00.000Z' }] };
    const patch = proposalToPatch({ id: 'p', targetEntityId: wallId, kind: 'resizeWall', params: { thickness: 200 }, rationale: '', confidence: 0.7 });
    expect(commit(oldScene, patch).ok).toBe(false);
  });
});
