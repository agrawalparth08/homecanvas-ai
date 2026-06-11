/**
 * Pure state machine for the verification / tracing wizard. The UI owns the
 * actual scene edits; this just sequences the steps and gates progress so you
 * can't (e.g.) trace before setting scale.
 */

export const WIZARD_STEPS = ['pickFile', 'scale', 'trace', 'rooms', 'review', 'done'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardState {
  step: WizardStep;
  /** Underlay attached to the working floor? */
  hasUnderlay: boolean;
  /** Scale calibrated? */
  calibrated: boolean;
  wallCount: number;
  roomCount: number;
}

export const STEP_TITLES: Record<WizardStep, string> = {
  pickFile: 'Choose a floor plan',
  scale: 'Set the scale',
  trace: 'Trace the walls',
  rooms: 'Mark the rooms',
  review: 'Review',
  done: 'Done',
};

export const STEP_HELP: Record<WizardStep, string> = {
  pickFile: 'Pick one of your uploaded plan pages. It loads as a dimmed underlay to trace over.',
  scale: 'Draw a line over a dimension you know (a wall length, a door), then type its real size.',
  trace: 'Click to drop wall endpoints along the plan. Points snap to the grid and to existing corners.',
  rooms: 'Drag a rectangle inside each set of walls and give the room a name and type.',
  review: 'Check the 3D shell against the plan. Fix anything that looks off, then save.',
  done: 'Saved. Your traced home is ready in the design canvas.',
};

export function initWizard(): WizardState {
  return { step: 'pickFile', hasUnderlay: false, calibrated: false, wallCount: 0, roomCount: 0 };
}

/** Whether the wizard may advance from its current step. */
export function canAdvance(s: WizardState): boolean {
  switch (s.step) {
    case 'pickFile':
      return s.hasUnderlay;
    case 'scale':
      return s.calibrated;
    case 'trace':
      return s.wallCount >= 3; // need at least a partial enclosure
    case 'rooms':
      return s.roomCount >= 1;
    case 'review':
      return true;
    case 'done':
      return false;
  }
}

export function nextStep(s: WizardState): WizardState {
  if (!canAdvance(s)) return s;
  const i = WIZARD_STEPS.indexOf(s.step);
  const next = WIZARD_STEPS[Math.min(i + 1, WIZARD_STEPS.length - 1)]!;
  return { ...s, step: next };
}

export function prevStep(s: WizardState): WizardState {
  const i = WIZARD_STEPS.indexOf(s.step);
  return { ...s, step: WIZARD_STEPS[Math.max(i - 1, 0)]! };
}

export function goToStep(s: WizardState, step: WizardStep): WizardState {
  return { ...s, step };
}
