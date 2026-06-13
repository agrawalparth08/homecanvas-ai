import { create } from 'zustand';
import { commit, commitPatches, type CommitLogEntry } from '@lib/scene/commit';
import type { ScenePatch } from '@lib/scene/patching';
import { SCHEMA_VERSION, type DesignVariant, type HomeScene } from '@lib/scene/schemas';
import type { CompareMode } from '@lib/ui/compare';
import type { ValidationIssue } from '@lib/scene/validation';
import { buildSampleHome } from '@lib/fixtures/sample-home';
import { fetchScene, fetchVariant, persistScene, saveVariantRemote, type ProjectId } from '../api';
import { reportError } from './error-store';

/** Push commit-rejection issues to the on-screen error surface (not just the inline toast). */
function surfaceRejection(errors: ValidationIssue[], context: string): void {
  const first = errors[0];
  if (!first) return;
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
  reportError(`${context}: ${first.message}${more}`, { kind: 'rejected' });
}

export type SelectionType = 'room' | 'wall' | 'furniture' | 'stair' | 'opening';
export interface Selection {
  type: SelectionType;
  id: string;
}

export type ViewMode = 'orbit' | 'top' | 'walk' | 'tour';

interface EditorState {
  projectId: ProjectId;
  scene: HomeScene | null;
  /** Scene as it was when loaded — powers the before/after toggle. */
  baseline: HomeScene | null;
  /** my-home with no scene file yet -> guided empty mode. */
  guidedEmpty: boolean;
  loading: boolean;
  selection: Selection | null;
  activeFloorId: string | null;
  viewMode: ViewMode;
  showBefore: boolean;
  tourIndex: number;
  tourPlaying: boolean;
  undoStack: CommitLogEntry[];
  redoStack: CommitLogEntry[];
  lastErrors: ValidationIssue[];
  activeVariantId: string | null;
  /** True while a furniture piece is being click-dragged; locks the orbit camera. */
  draggingObject: boolean;

  loadProject: (projectId: ProjectId) => Promise<void>;
  startFromSample: () => void;
  /** Inject a scene directly (e.g. a freshly traced home) and persist it. */
  loadSceneObject: (projectId: ProjectId, scene: HomeScene) => void;
  applyPatch: (patch: ScenePatch) => boolean;
  undo: () => void;
  redo: () => void;
  select: (selection: Selection | null) => void;
  setActiveFloor: (floorId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setDraggingObject: (dragging: boolean) => void;
  setShowBefore: (show: boolean) => void;
  /** Spatial before/after wipe: 'off' = normal single view, 'slider' = clipped dual render. */
  compareMode: CompareMode;
  /** Handle x-position 0..1: left of it shows the baseline (Before), right shows current edits (After). */
  sliderPos: number;
  setCompareMode: (mode: CompareMode) => void;
  setSliderPos: (pos: number) => void;
  /** Registered by the in-Canvas PhotoCapture bridge; null until the canvas mounts. */
  capturePhoto: (() => Promise<void>) | null;
  setCapturePhoto: (fn: (() => Promise<void>) | null) => void;
  /** Photoreal (path-traced) Photo Mode overlay open. */
  photoMode: boolean;
  setPhotoMode: (open: boolean) => void;
  startTour: () => void;
  exitTour: () => void;
  tourNext: () => void;
  tourPrev: () => void;
  setTourIndex: (i: number) => void;
  toggleTourPlay: () => void;
  /** Autoplay advance — keeps playing (unlike setTourIndex which pauses). */
  tourAdvance: (i: number) => void;
  tourStopPlaying: () => void;
  saveVariant: (name: string) => Promise<boolean>;
  loadVariant: (variantId: string) => Promise<void>;
  clearErrors: () => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
// The pending write's (project, scene) so a context switch can flush it.
let pendingPersist: { projectId: ProjectId; scene: HomeScene } | null = null;

/** Persist, and surface a visible warning if the local sidecar write fails (silent data loss otherwise). */
function persistAndReport(projectId: ProjectId, scene: HomeScene): void {
  void persistScene(projectId, scene).then((ok) => {
    if (!ok) reportError("Couldn't save your edits to disk — is the local server running?", { kind: 'network' });
  });
}

function schedulePersist(projectId: ProjectId, scene: HomeScene): void {
  if (persistTimer) clearTimeout(persistTimer);
  pendingPersist = { projectId, scene };
  persistTimer = setTimeout(() => {
    persistAndReport(projectId, scene);
    persistTimer = null;
    pendingPersist = null;
  }, 800);
}

/** Write any pending debounced edit immediately — call before switching project/variant. */
function flushPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  if (pendingPersist) persistAndReport(pendingPersist.projectId, pendingPersist.scene);
  persistTimer = null;
  pendingPersist = null;
}

export const useEditor = create<EditorState>((set, get) => ({
  projectId: 'sample-home',
  scene: null,
  baseline: null,
  guidedEmpty: false,
  loading: false,
  selection: null,
  activeFloorId: null,
  viewMode: 'orbit',
  showBefore: false,
  tourIndex: 0,
  tourPlaying: false,
  undoStack: [],
  redoStack: [],
  lastErrors: [],
  activeVariantId: null,
  draggingObject: false,
  compareMode: 'off',
  sliderPos: 0.5,
  capturePhoto: null,
  photoMode: false,

  loadProject: async (projectId) => {
    flushPersist(); // never drop the previous project's last <800ms of edits
    set({ loading: true, projectId, selection: null, undoStack: [], redoStack: [], showBefore: false, activeVariantId: null });
    let scene = await fetchScene(projectId);
    let guidedEmpty = false;
    if (!scene) {
      if (projectId === 'sample-home') {
        scene = buildSampleHome();
        void persistScene(projectId, scene);
      } else {
        guidedEmpty = true;
      }
    }
    set({
      scene,
      baseline: scene,
      guidedEmpty,
      loading: false,
      activeFloorId: scene?.floors[0]?.id ?? null,
    });
  },

  startFromSample: () => {
    const { projectId } = get();
    const scene = { ...buildSampleHome(), id: projectId, name: 'My Home (started from sample)' };
    set({ scene, baseline: scene, guidedEmpty: false, activeFloorId: scene.floors[0]!.id });
    void persistScene(projectId, scene);
  },

  loadSceneObject: (projectId, scene) => {
    flushPersist();
    set({
      projectId,
      scene,
      baseline: scene,
      guidedEmpty: false,
      loading: false,
      selection: null,
      undoStack: [],
      redoStack: [],
      activeVariantId: null,
      activeFloorId: scene.floors[0]?.id ?? null,
    });
    void persistScene(projectId, scene);
  },

  applyPatch: (patch) => {
    const { scene, projectId, undoStack } = get();
    if (!scene) return false;
    const result = commit(scene, patch);
    if (!result.ok) {
      set({ lastErrors: result.errors });
      surfaceRejection(result.errors, 'Edit rejected');
      return false;
    }
    set({
      scene: result.scene,
      undoStack: [...undoStack, result.entry],
      redoStack: [],
      lastErrors: [],
    });
    schedulePersist(projectId, result.scene);
    return true;
  },

  undo: () => {
    const { scene, projectId, undoStack, redoStack } = get();
    if (!scene || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1]!;
    const result = commitPatches(scene, entry.undo);
    if (!result.ok) {
      set({ lastErrors: result.errors });
      surfaceRejection(result.errors, 'Undo failed');
      return;
    }
    set({
      scene: result.scene,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
      lastErrors: [],
    });
    schedulePersist(projectId, result.scene);
  },

  redo: () => {
    const { scene, projectId, undoStack, redoStack } = get();
    if (!scene || redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1]!;
    const result = commitPatches(scene, entry.redo);
    if (!result.ok) {
      set({ lastErrors: result.errors });
      surfaceRejection(result.errors, 'Redo failed');
      return;
    }
    set({
      scene: result.scene,
      undoStack: [...undoStack, entry],
      redoStack: redoStack.slice(0, -1),
      lastErrors: [],
    });
    schedulePersist(projectId, result.scene);
  },

  select: (selection) => set({ selection }),
  setActiveFloor: (floorId) => set({ activeFloorId: floorId, selection: null, tourIndex: 0 }),
  setViewMode: (viewMode) => set({ viewMode }),
  setDraggingObject: (draggingObject) => set({ draggingObject }),
  setShowBefore: (showBefore) => set({ showBefore }),
  setCompareMode: (compareMode) => set({ compareMode }),
  setSliderPos: (sliderPos) => set({ sliderPos: sliderPos < 0 ? 0 : sliderPos > 1 ? 1 : sliderPos }),
  setCapturePhoto: (capturePhoto) => set({ capturePhoto }),
  setPhotoMode: (photoMode) => set({ photoMode }),

  startTour: () => set({ viewMode: 'tour', tourIndex: 0, tourPlaying: true, selection: null }),
  exitTour: () => set({ viewMode: 'orbit', tourPlaying: false }),
  tourNext: () => {
    const { scene, activeFloorId, tourIndex } = get();
    const count = scene?.floors.find((f) => f.id === activeFloorId)?.rooms.length ?? 0;
    set({ tourIndex: Math.min(tourIndex + 1, Math.max(0, count - 1)), tourPlaying: false });
  },
  tourPrev: () => set({ tourIndex: Math.max(0, get().tourIndex - 1), tourPlaying: false }),
  setTourIndex: (i) => set({ tourIndex: Math.max(0, i), tourPlaying: false }),
  toggleTourPlay: () => set({ tourPlaying: !get().tourPlaying }),
  tourAdvance: (i) => set({ tourIndex: Math.max(0, i) }),
  tourStopPlaying: () => set({ tourPlaying: false }),

  saveVariant: async (name) => {
    const { scene, projectId, activeVariantId } = get();
    if (!scene) return false;
    const variant: DesignVariant = {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        id: `variant-${Date.now().toString(36)}`,
        projectId,
        name,
        ...(activeVariantId ? { baseVariantId: activeVariantId } : {}),
        styleTags: [...new Set(scene.floors.flatMap((f) => f.rooms.flatMap((r) => r.styleTags)))],
        createdAt: new Date().toISOString(),
      },
      scene,
    };
    const ok = await saveVariantRemote(projectId, variant);
    if (ok) set({ activeVariantId: variant.meta.id });
    return ok;
  },

  loadVariant: async (variantId) => {
    flushPersist();
    const { projectId } = get();
    const variant = await fetchVariant(projectId, variantId);
    if (!variant) return;
    // Switching variants resets the undo stack (documented semantics).
    set({
      scene: variant.scene,
      baseline: variant.scene,
      undoStack: [],
      redoStack: [],
      selection: null,
      activeVariantId: variant.meta.id,
      activeFloorId: variant.scene.floors[0]?.id ?? null,
    });
  },

  clearErrors: () => set({ lastErrors: [] }),
}));
