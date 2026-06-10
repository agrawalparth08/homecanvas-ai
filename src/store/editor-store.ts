import { create } from 'zustand';
import { commit, commitPatches, type CommitLogEntry } from '@lib/scene/commit';
import type { ScenePatch } from '@lib/scene/patching';
import { SCHEMA_VERSION, type DesignVariant, type HomeScene } from '@lib/scene/schemas';
import type { ValidationIssue } from '@lib/scene/validation';
import { buildSampleHome } from '@lib/fixtures/sample-home';
import { fetchScene, fetchVariant, persistScene, saveVariantRemote, type ProjectId } from '../api';

export type SelectionType = 'room' | 'wall' | 'furniture' | 'stair' | 'opening';
export interface Selection {
  type: SelectionType;
  id: string;
}

export type ViewMode = 'orbit' | 'top' | 'walk';

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
  undoStack: CommitLogEntry[];
  redoStack: CommitLogEntry[];
  lastErrors: ValidationIssue[];
  activeVariantId: string | null;

  loadProject: (projectId: ProjectId) => Promise<void>;
  startFromSample: () => void;
  applyPatch: (patch: ScenePatch) => boolean;
  undo: () => void;
  redo: () => void;
  select: (selection: Selection | null) => void;
  setActiveFloor: (floorId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setShowBefore: (show: boolean) => void;
  saveVariant: (name: string) => Promise<boolean>;
  loadVariant: (variantId: string) => Promise<void>;
  clearErrors: () => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
// The pending write's (project, scene) so a context switch can flush it.
let pendingPersist: { projectId: ProjectId; scene: HomeScene } | null = null;

function schedulePersist(projectId: ProjectId, scene: HomeScene): void {
  if (persistTimer) clearTimeout(persistTimer);
  pendingPersist = { projectId, scene };
  persistTimer = setTimeout(() => {
    void persistScene(projectId, scene);
    persistTimer = null;
    pendingPersist = null;
  }, 800);
}

/** Write any pending debounced edit immediately — call before switching project/variant. */
function flushPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  if (pendingPersist) void persistScene(pendingPersist.projectId, pendingPersist.scene);
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
  undoStack: [],
  redoStack: [],
  lastErrors: [],
  activeVariantId: null,

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

  applyPatch: (patch) => {
    const { scene, projectId, undoStack } = get();
    if (!scene) return false;
    const result = commit(scene, patch);
    if (!result.ok) {
      set({ lastErrors: result.errors });
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
  setActiveFloor: (floorId) => set({ activeFloorId: floorId, selection: null }),
  setViewMode: (viewMode) => set({ viewMode }),
  setShowBefore: (showBefore) => set({ showBefore }),

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
