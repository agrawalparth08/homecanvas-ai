import { useState } from 'react';
import { makePatch, type ScenePatch } from '@lib/scene/patching';
import type { Material, Stair } from '@lib/scene/schemas';
import { Icon } from '../ui/Icon';

const TWO_PI = Math.PI * 2;
const norm = (r: number) => ((r % TWO_PI) + TWO_PI) % TWO_PI;
const toDeg = (r: number) => Math.round((norm(r) * 180) / Math.PI);

const MOVE_STEPS = [50, 100, 250, 500];

/**
 * Move / reorient / reshape a staircase. Shared by the 3D Inspector and the 2D
 * tracing page (both pass their own undo-tracked `onPatch`). Every control emits
 * one `update_stair` patch. Plan axes: +Y is "up" on the 2D plan, +X is "right".
 */
export function StairControls({
  stair,
  materials,
  onPatch,
}: {
  stair: Stair;
  materials: Material[];
  onPatch: (patch: ScenePatch) => void;
}) {
  const [step, setStep] = useState(100);

  const patch = (label: string, p: Parameters<typeof updateStairOp>[1]) => onPatch(makePatch(label, [updateStairOp(stair.id, p)]));
  const move = (dx: number, dy: number) =>
    patch('Move stair', { position: { x: stair.position.x + dx, y: stair.position.y + dy } });
  const rotateBy = (deltaDeg: number) =>
    patch('Rotate stair', { rotation: norm(stair.rotation + (deltaDeg * Math.PI) / 180) });

  const nudgeBtn =
    'flex h-8 w-8 items-center justify-center rounded-md border border-panel-border bg-panel text-[16px] text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 active:scale-95';
  const rotBtn =
    'inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-panel-border bg-panel px-2 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 active:scale-95';

  return (
    <div className="flex flex-col gap-3">
      {/* MOVE */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Move</span>
          <select
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className="rounded border border-panel-border bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-200"
            title="Step size"
          >
            {MOVE_STEPS.map((s) => (
              <option key={s} value={s}>
                {s} mm
              </option>
            ))}
          </select>
        </div>
        <div className="grid w-[100px] grid-cols-3 grid-rows-3 gap-1.5">
          <span />
          <button className={nudgeBtn} onClick={() => move(0, step)} title="Move up" aria-label="Move up"><Icon name="chevronUp" /></button>
          <span />
          <button className={nudgeBtn} onClick={() => move(-step, 0)} title="Move left" aria-label="Move left"><Icon name="chevronLeft" /></button>
          <span className="flex items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-neutral-700" /></span>
          <button className={nudgeBtn} onClick={() => move(step, 0)} title="Move right" aria-label="Move right"><Icon name="chevronRight" /></button>
          <span />
          <button className={nudgeBtn} onClick={() => move(0, -step)} title="Move down" aria-label="Move down"><Icon name="chevronDown" /></button>
          <span />
        </div>
      </div>

      {/* ROTATE */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Direction</span>
          <span className="font-mono text-[11px] text-neutral-400">{toDeg(stair.rotation)}°</span>
        </div>
        <div className="flex gap-1.5">
          <button className={rotBtn} onClick={() => rotateBy(-90)} title="Rotate 90° counter-clockwise"><Icon name="rotateCcw" />90°</button>
          <button className={rotBtn} onClick={() => rotateBy(-15)} title="Rotate 15° counter-clockwise"><Icon name="rotateCcw" />15°</button>
          <button className={rotBtn} onClick={() => rotateBy(15)} title="Rotate 15° clockwise"><Icon name="rotateCw" />15°</button>
          <button className={rotBtn} onClick={() => rotateBy(90)} title="Rotate 90° clockwise"><Icon name="rotateCw" />90°</button>
        </div>
      </div>

      {/* TURN (L/U only) */}
      {(stair.kind === 'L' || stair.kind === 'U') && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Turn</div>
          <div className="flex gap-1.5">
            {(['left', 'right'] as const).map((t) => (
              <button
                key={t}
                onClick={() => patch('Stair turn', { turn: t })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                  (stair.turn ?? 'left') === t
                    ? 'bg-accent text-white'
                    : 'border border-panel-border bg-panel text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SHAPE */}
      <label className="block text-xs text-neutral-400">
        Shape
        <select
          value={stair.kind}
          onChange={(e) => patch('Stair shape', { kind: e.target.value as Stair['kind'] })}
          className="mt-1 w-full rounded-lg border border-panel-border bg-panel px-2.5 py-2 text-sm text-neutral-100 focus:border-accent focus:outline-none"
        >
          <option value="straight">Straight</option>
          <option value="L">L-shaped</option>
          <option value="U">U-shaped</option>
        </select>
      </label>

      {/* STEP MATERIAL */}
      <label className="block text-xs text-neutral-400">
        Step material
        <select
          value={stair.materialId}
          onChange={(e) => patch('Stair material', { materialId: e.target.value })}
          className="mt-1 w-full rounded-lg border border-panel-border bg-panel px-2.5 py-2 text-sm text-neutral-100 focus:border-accent focus:outline-none"
        >
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Build a single update_stair op (kept here so both call sites stay in sync). */
function updateStairOp(
  stairId: string,
  patch: {
    position?: { x: number; y: number };
    rotation?: number;
    kind?: Stair['kind'];
    turn?: 'left' | 'right';
    materialId?: string;
  },
) {
  return { type: 'update_stair' as const, stairId, patch };
}
