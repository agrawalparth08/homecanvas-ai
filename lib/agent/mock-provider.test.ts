import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { commit } from '../scene/commit';
import { mockAgentProvider } from './mock-provider';

describe('mock agent provider (P1 slice)', () => {
  it('turns "make the living room japandi" into a committable proposal', async () => {
    const scene = buildSampleHome();
    const proposals = await mockAgentProvider.proposeEdits('Make the living room Fusion Japandi please', {
      scene,
    });
    expect(proposals).toHaveLength(1);
    const proposal = proposals[0]!;
    expect(proposal.target).toBe('Living Room');
    expect(proposal.confidence).toBeGreaterThan(0.8);

    const result = commit(scene, proposal.patch);
    expect(result.ok).toBe(true);
  });

  it('returns nothing for messages it does not understand', async () => {
    const proposals = await mockAgentProvider.proposeEdits('What is the meaning of life?', {
      scene: buildSampleHome(),
    });
    expect(proposals).toEqual([]);
  });

  it('respects whole-home scope', async () => {
    const scene = buildSampleHome();
    const proposals = await mockAgentProvider.proposeEdits('Apply Warm Minimal to the whole home', { scene });
    expect(proposals[0]!.target).toBe('Whole home');
  });
});
