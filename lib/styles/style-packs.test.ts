import { describe, expect, it } from 'vitest';
import { StylePackSchema } from '../scene/schemas';
import { parseIntent } from '../agent/intent';
import { STYLE_PACKS, getStylePack } from './style-packs';

describe('STYLE_PACKS', () => {
  it('ships the full set of 12 packs with unique ids', () => {
    expect(STYLE_PACKS).toHaveLength(12);
    expect(new Set(STYLE_PACKS.map((p) => p.id)).size).toBe(12);
  });

  it('every pack validates against StylePackSchema', () => {
    for (const pack of STYLE_PACKS) {
      const res = StylePackSchema.safeParse(pack);
      expect(res.success, `${pack.id}: ${res.success ? '' : res.error?.message}`).toBe(true);
    }
  });

  it('getStylePack resolves each id', () => {
    for (const pack of STYLE_PACKS) expect(getStylePack(pack.id).id).toBe(pack.id);
  });

  it('chat intent resolves the new packs by name', () => {
    const cases: [string, string][] = [
      ['give the bedroom a coastal kerala look', 'coastal-kerala'],
      ['apply chettinad heritage to the living room', 'chettinad-heritage'],
      ['make it scandinavian, whole home', 'scandinavian-light'],
      ['mid century modern please', 'mid-century-modern'],
      ['monochrome luxe style', 'monochrome-luxe'],
    ];
    for (const [msg, id] of cases) {
      const intent = parseIntent(msg);
      expect(intent.action, msg).toBe('style');
      expect(intent.stylePackId, msg).toBe(id);
    }
  });
});
