// @vitest-environment jsdom
// Décision du 13/11/2026 (rc12) — la détection des faux Hi-Res utilisable :
// l'état et l'interrupteur, le filtre « Hi-Res vérifié / douteux ».
import { afterEach, describe, expect, it, vi } from 'vitest';
import { avancementFauxHiRes, entreesHiRes, estCleHiRes, idsParVerdictHiRes, PAGE_VERDICT } from '../filtreHiRes';
import * as api from '../api';

afterEach(() => { vi.unstubAllGlobals(); });

describe('entreesHiRes', () => {
  it("ne propose rien tant que la détection n'a pas servi", () => {
    expect(entreesHiRes(null)).toEqual([]);
    expect(entreesHiRes({ active: false, douteux_visible: false, rangees: 0, restantes: 10 })).toEqual([]);
  });
  it('propose « vérifié » dès que la détection est allumée, « douteux » quand le serveur le montre', () => {
    expect(entreesHiRes({ active: true, douteux_visible: false }).map((x) => x.key)).toEqual(['hires_verifie']);
    expect(entreesHiRes({ active: true, douteux_visible: true }).map((x) => x.key)).toEqual(['hires_verifie', 'hires_douteux']);
  });
  it('garde les entrées après extinction si des mesures sont rangées', () => {
    expect(entreesHiRes({ active: false, douteux_visible: false, rangees: 4 }).map((x) => x.key)).toEqual(['hires_verifie']);
  });
  it('reconnaît ses clés et seulement elles', () => {
    expect(estCleHiRes('hires_verifie')).toBe(true);
    expect(estCleHiRes('hires_douteux')).toBe(true);
    expect(estCleHiRes('hires')).toBe(false);
  });
});

describe('idsParVerdictHiRes', () => {
  it('lit toutes les pages, jusqu\'au total', async () => {
    const pages = vi.fn(async (limite: number, rang: number) => {
      expect(limite).toBe(PAGE_VERDICT);
      const total = PAGE_VERDICT + 2;
      const n = Math.min(limite, total - rang);
      return { items: Array.from({ length: n }, (_, i) => ({ id: rang + i + 1 })), total };
    });
    const ids = await idsParVerdictHiRes(pages);
    expect(ids.size).toBe(PAGE_VERDICT + 2);
    expect(pages).toHaveBeenCalledTimes(2);
  });
  it("s'arrête sur une page vide", async () => {
    const ids = await idsParVerdictHiRes(async () => ({ items: [], total: 99 }));
    expect(ids.size).toBe(0);
  });
});

describe('avancementFauxHiRes', () => {
  it('ne dit rien quand la détection est éteinte', () => {
    expect(avancementFauxHiRes({ active: false, douteux_visible: false, rangees: 3, restantes: 2 })).toBeNull();
  });
  it('en cours, puis terminée', () => {
    expect(avancementFauxHiRes({ active: true, douteux_visible: true, rangees: 3, restantes: 2 }))
      .toEqual({ cle: 'settings.fauxHiResProgress', rangees: 3, restantes: 2 });
    expect(avancementFauxHiRes({ active: true, douteux_visible: true, rangees: 5, restantes: 0 }))
      .toEqual({ cle: 'settings.fauxHiResDone', rangees: 5, restantes: 0 });
  });
});

describe('API', () => {
  it('lit et règle /library/hires-check, filtre par ?hires_verdict=', async () => {
    const appels: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return new Response(JSON.stringify({ active: true, douteux_visible: true, items: [] }));
    }));
    await api.getEtatFauxHiRes();
    await api.setDetectionFauxHiRes(true);
    await api.getAlbumsParVerdictHiRes('douteux', 2000, 0);
    expect(appels[0]).toMatchObject({ url: '/api/v1/library/hires-check', method: 'GET' });
    expect(appels[1]).toMatchObject({ url: '/api/v1/library/hires-check', method: 'POST' });
    expect(JSON.parse(appels[1].body!)).toEqual({ active: true });
    expect(appels[2].url).toBe('/api/v1/library/albums?hires_verdict=douteux&limit=2000&offset=0');
  });
});
