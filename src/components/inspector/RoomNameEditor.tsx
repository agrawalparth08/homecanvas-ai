import { useEffect, useState } from 'react';
import { makePatch, type ScenePatch } from '@lib/scene/patching';
import type { Room } from '@lib/scene/schemas';

/**
 * Rename a room. Commits a `rename_entity` patch on blur/Enter. Shared by the 3D
 * Inspector and the 2D tracing page (each passes its own undo-tracked `onPatch`).
 * Empty names are rejected (the schema requires min length 1) — the field
 * reverts to the current name.
 */
export function RoomNameEditor({ room, onPatch }: { room: Room; onPatch: (patch: ScenePatch) => void }) {
  const [name, setName] = useState(room.name);
  useEffect(() => setName(room.name), [room.id, room.name]);

  const commit = () => {
    const next = name.trim();
    if (!next) {
      setName(room.name); // empty not allowed — revert
      return;
    }
    if (next !== room.name) onPatch(makePatch(`Rename ${room.name}`, [{ type: 'rename_entity', entityId: room.id, name: next }]));
  };

  return (
    <label className="block text-xs text-neutral-400">
      Room name
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setName(room.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="mt-1 w-full rounded border border-panel-border bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        placeholder="Room name"
      />
    </label>
  );
}
