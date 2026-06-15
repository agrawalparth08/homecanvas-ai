import { useEffect, useRef, useState } from 'react';
import { parseIntent } from '@lib/agent/intent';
import { mockAgentProvider, proposePaletteEdit } from '@lib/agent/mock-provider';
import { resolveRoom } from '@lib/agent/vocab';
import { makePatch } from '@lib/scene/patching';
import { checkBridgeEnabled, runBridge, type BridgeRunResult } from '../../agent/claude-bridge-provider';
import { fileToDataUrl, imageToPaletteInput } from '../../agent/image-palette';
import { uploadPrivateFile } from '../../api';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useEditor } from '../../store/editor-store';
import { useChat, type ChatMsg } from '../../store/chat-store';
import { logEvent } from '../../store/log-store';

const SUGGESTIONS = ['Add a sofa to the drawing room', '3 variants of the master bedroom', 'Warm minimal, whole home'];

export function ChatPanel() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const applyPatch = useEditor((s) => s.applyPatch);
  const undo = useEditor((s) => s.undo);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Conversation + engine live in a session store so the history survives tab
  // switches (Inspector / Log) and navigation, instead of resetting on unmount.
  const msgs = useChat((s) => s.msgs);
  const setMsgs = useChat((s) => s.setMsgs);
  const provider = useChat((s) => s.provider);
  const chooseProvider = useChat((s) => s.chooseProvider);
  const [attached, setAttached] = useState<{ dataUrl: string } | null>(null);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void checkBridgeEnabled().then((enabled) => {
      setBridgeAvailable(enabled);
      // When the Claude bridge is live, default to it so suggestions are dynamic
      // (real Claude) out of the box — unless the user has pinned an engine.
      if (enabled) useChat.getState().autoSelectProvider('bridge');
    });
  }, []);
  useEffect(() => {
    // Returning to the Assistant tab: jump to the latest message in the persisted history.
    scrollRef.current?.scrollTo({ top: 1e9 });
  }, []);
  const push = (m: ChatMsg | ChatMsg[]) => setMsgs((cur) => {
    const next = [...cur, ...(Array.isArray(m) ? m : [m])];
    queueMicrotask(() => scrollRef.current?.scrollTo({ top: 1e9 }));
    return next;
  });

  const pushBridge = (r: BridgeRunResult) => {
    if (r.status === 'ready') {
      if (r.note) push({ role: 'agent', text: r.note });
      if (r.proposals.length === 0) push({ role: 'agent', text: 'The bridge returned no changes.' });
      else push(r.proposals.map((p) => ({ role: 'agent' as const, text: p.summary, proposal: p })));
    } else if (r.status === 'disabled') {
      push({ role: 'agent', text: 'Bridge is off. Restart the sidecar with HOMECANVAS_ENABLE_BRIDGE=1.' });
    } else if (r.status === 'pending') {
      push({ role: 'agent', text: 'Timed out waiting. The request is still queued — answer it with `bridge:pending` and resend.' });
    } else {
      push({ role: 'agent', text: `Bridge error: ${r.reason}` });
    }
  };

  async function attachFile(file: Blob | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      push({ role: 'agent', text: 'That isn’t an image — attach a PNG or JPG reference.' });
      return;
    }
    try {
      setAttached({ dataUrl: await fileToDataUrl(file) });
    } catch {
      push({ role: 'agent', text: 'Could not read that image.' });
    }
  }

  /** Persist an uploaded image as a ReferenceImage on the scene (shows in the inspector, survives reload). */
  function addReference(filePath: string, kind: 'palette' | 'sitePhoto', palette: string[] | undefined, roomId: string | undefined) {
    applyPatch(makePatch('Add reference image', [{
      type: 'add_reference_image',
      image: {
        id: `ref-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        kind,
        filePath,
        ...(palette ? { extractedPalette: palette } : {}),
        ...(roomId ? { roomId } : {}),
      },
    }], 'user'));
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    const img = attached;
    if ((!text && !img) || !scene || busy) return;
    setInput('');
    setAttached(null);
    push({ role: 'user', text: text || '(reference image)', ...(img ? { image: img.dataUrl } : {}) });
    logEvent('user', text ? `Asked the assistant: “${text}”` : 'Sent the assistant a reference image');
    setBusy(true);
    try {
      const ctx = selection?.id ? { scene, selectedEntityId: selection.id } : { scene };

      // --- image attached -------------------------------------------------
      if (img) {
        const roomId = resolveRoom(text, scene)?.id ?? (selection?.type === 'room' ? selection.id : undefined);
        const path = await uploadPrivateFile(`chat-ref-${Date.now()}.png`, img.dataUrl);
        if (provider === 'bridge') {
          push({ role: 'agent', text: 'Saved the reference and sent it to your Claude session (it can analyse perspective, placement, palette)…' });
          if (path) addReference(path, 'sitePhoto', undefined, roomId);
          const msg = `${text || 'Use this reference image to guide the edit.'}${path ? `\n\n[Reference image saved at: ${path} — open it to view.]` : ''}`;
          pushBridge(await runBridge(msg, ctx));
          return;
        }
        let pal;
        try {
          pal = await imageToPaletteInput(img.dataUrl);
        } catch {
          push({ role: 'agent', text: 'Could not read that image.' });
          return;
        }
        const hexes = pal.swatches.slice(0, 6).map((s) => s.hex);
        push({ role: 'agent', text: 'Extracted this palette from your image:', palette: hexes });
        if (path) {
          addReference(path, 'palette', hexes, roomId);
          push({ role: 'agent', text: '✓ Saved to References (see the Inspector tab).' });
        }
        const proposals = await proposePaletteEdit(text || 'apply this palette', ctx, pal);
        if (proposals.length === 0) {
          push({ role: 'agent', text: 'Which room? Attach the image and name one (e.g. “the master bedroom”) or select a room — then I’ll recolour it from these tones.' });
        } else {
          push(proposals.map((p) => ({ role: 'agent' as const, text: p.summary, proposal: p })));
        }
        return;
      }

      // --- text only ------------------------------------------------------
      const intent = parseIntent(text);
      if (intent.action === 'revert') {
        undo();
        push({ role: 'agent', text: 'Reverted the last change.' });
        return;
      }
      if (provider === 'bridge') {
        push({ role: 'agent', text: 'Sent to your local Claude — answering… (manual mode: run `npm run bridge:pending`)' });
        pushBridge(await runBridge(text, ctx));
        return;
      }
      if (intent.action === 'variants') {
        const proposals = (await mockAgentProvider.generateVariants?.(text, ctx, intent.count ?? 3)) ?? [];
        if (proposals.length === 0) {
          push({ role: 'agent', text: 'Name a room (e.g. “3 variants of the kitchen”) or select one first.' });
        } else {
          push({ role: 'agent', text: `Here are ${proposals.length} options for ${proposals[0]!.target}. Apply whichever you like — try one, undo, try the next.` });
          push(proposals.map((p) => ({ role: 'agent' as const, text: p.summary, proposal: p })));
        }
        return;
      }
      const proposals = await mockAgentProvider.proposeEdits(text, ctx);
      if (proposals.length === 0) {
        push({ role: 'agent', text: intent.reason ?? 'I couldn’t act on that — name a room, then try a colour, material, or style.' });
      } else {
        push(proposals.map((p) => ({ role: 'agent' as const, text: p.summary, proposal: p })));
      }
    } finally {
      setBusy(false);
    }
  }

  function decide(i: number, accept: boolean) {
    const target = msgs[i];
    if (!target?.proposal) return;
    if (!accept) {
      setMsgs((cur) => cur.map((msg, idx) => (idx === i ? { ...msg, done: 'dismissed' } : msg)));
      return;
    }
    // Apply the patch in the event handler — NEVER inside a setMsgs updater, which
    // React runs during render and would "update a component while rendering another".
    const ok = applyPatch(target.proposal.patch);
    logEvent('user', `${ok ? 'Applied' : 'Rejected'} proposal: ${target.proposal.summary}`, ok ? undefined : { level: 'warn' });
    setMsgs((cur) => cur.map((msg, idx) => (idx === i ? { ...msg, done: ok ? 'applied' : 'rejected' } : msg)));
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void attachFile(e.dataTransfer.files[0]);
      }}
    >
      {bridgeAvailable && (
        <div className="flex items-center gap-2 border-b border-panel-border px-3 py-1.5 text-[11px] text-neutral-500">
          <span>Engine</span>
          <div className="flex overflow-hidden rounded-md border border-panel-border">
            {(['mock', 'bridge'] as const).map((pv) => (
              <button
                key={pv}
                onClick={() => chooseProvider(pv)}
                className={`px-2.5 py-1 font-medium ${provider === pv ? 'bg-accent text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                {pv === 'mock' ? 'Built-in' : 'Claude bridge'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            {m.image && (
              <img src={m.image} alt="reference" className="mb-1 inline-block max-h-28 rounded-lg border border-panel-border object-cover" />
            )}
            <div className={`inline-block max-w-[15rem] rounded-lg px-3 py-1.5 text-[13px] leading-snug ${m.role === 'user' ? 'bg-accent text-white' : 'bg-neutral-800 text-neutral-200'}`}>
              {m.text}
            </div>
            {m.palette && (
              <div className="mt-1 flex gap-1">
                {m.palette.map((c, k) => (
                  <span key={k} className="h-4 w-4 rounded-sm ring-1 ring-black/15" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
            {m.proposal && !m.done && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Button variant="primary" size="sm" icon="check" onClick={() => decide(i, true)}>Apply</Button>
                <Button variant="secondary" size="sm" onClick={() => decide(i, false)}>Dismiss</Button>
                {m.proposal.skippedLocked.length > 0 && <span className="text-[10px] text-amber-600">{m.proposal.skippedLocked.length} locked skipped</span>}
              </div>
            )}
            {m.done && (
              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-neutral-500">
                {m.done === 'applied' && <Icon name="check" className="text-emerald-600" />}
                {m.done === 'applied' ? 'applied' : m.done === 'rejected' ? 'rejected by validator' : 'dismissed'}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="text-[11px] text-neutral-500">thinking…</div>}
        {msgs.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => void send(s)} className="rounded-lg border border-panel-border bg-panel px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:border-accent/50 hover:text-neutral-200">{s}</button>
            ))}
          </div>
        )}
      </div>

      {attached && (
        <div className="flex items-center gap-2 border-t border-panel-border px-2.5 pt-2">
          <img src={attached.dataUrl} alt="attached" className="h-10 w-10 rounded border border-panel-border object-cover" />
          <span className="text-[11px] text-neutral-400">Reference attached — name a room to recolour it from this.</span>
          <button onClick={() => setAttached(null)} className="ml-auto text-neutral-500 hover:text-neutral-300" title="Remove">
            <Icon name="close" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-panel-border p-2.5">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void attachFile(e.target.files?.[0])} />
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach a reference image"
          className={`rounded-lg border border-panel-border px-2 py-2 text-sm ${attached ? 'text-accent' : 'text-neutral-400 hover:text-neutral-200'}`}
        >
          <Icon name="image" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          placeholder={attached ? 'Name a room (e.g. “the bedroom”)…' : 'Describe a change…'}
          className="min-w-0 flex-1 rounded-lg border border-panel-border bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-accent/60"
        />
        <button onClick={() => void send()} disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-40">Send</button>
      </div>
    </div>
  );
}
