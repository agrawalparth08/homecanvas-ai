/**
 * GeometryCorrectionProposal flow (Phase 6). Deterministic: turn the issues an
 * ExtractionReview found into concrete correction proposals, and turn an
 * APPROVED proposal into a ScenePatch. The patch goes through the commit
 * pipeline (preview → approve → commit) like every other edit — raw proposals
 * are never trusted, and a proposal targeting a locked entity is rejected by the
 * lock gate, not silently applied.
 */
import { DEFAULT_PARTITION_WALL_MM } from '../geometry/constants';
import { makePatch, type ScenePatch } from '../scene/patching';
import type { ExtractionReview, GeometryCorrectionProposal } from '../scene/schemas';

/** Translate an approved proposal into primitive ops. Validated again by commit. */
export function proposalToPatch(proposal: GeometryCorrectionProposal): ScenePatch {
  if (proposal.kind === 'resizeWall') {
    const thickness = proposal.params.thickness;
    if (!thickness || thickness <= 0) throw new Error('resizeWall requires a positive params.thickness');
    return makePatch(
      `Resize wall ${proposal.targetEntityId} to ${Math.round(thickness)}mm`,
      [{ type: 'update_wall', wallId: proposal.targetEntityId, patch: { thickness } }],
      'agent',
    );
  }
  // deleteWall
  return makePatch(
    `Delete sliver wall ${proposal.targetEntityId}`,
    [{ type: 'remove_wall', wallId: proposal.targetEntityId }],
    'agent',
  );
}

/** Map review issues to concrete, deterministic correction proposals. */
export function correctionsFromReview(review: ExtractionReview): GeometryCorrectionProposal[] {
  const out: GeometryCorrectionProposal[] = [];
  for (const issue of review.issues) {
    if (!issue.entityId) continue;
    if (issue.id.startsWith('rev-thickness-')) {
      out.push({
        id: `fix-${issue.id}`,
        targetEntityId: issue.entityId,
        kind: 'resizeWall',
        params: { thickness: DEFAULT_PARTITION_WALL_MM },
        rationale: issue.message,
        confidence: 0.7,
      });
    } else if (issue.id.startsWith('rev-shortwall-')) {
      out.push({
        id: `fix-${issue.id}`,
        targetEntityId: issue.entityId,
        kind: 'deleteWall',
        params: {},
        rationale: issue.message,
        confidence: 0.6,
      });
    }
  }
  return out;
}
