// @vitest-environment jsdom
// Yves (Sevy Tabroc), réunion du 17/09/2026 : « Écran métadata, ajouter
// boutons et traitements : retrouver les covers manquantes, les genres
// manquants, les années manquantes ».
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { avancementMusicBrainz, avancementPochettes } from '../manquantsMetadonnees';
import ManquantsV2 from '../../components/v2/ManquantsV2.svelte';

describe('lecture des états de passe', () => {
  it('pochettes : rien avant la première passe, en cours, puis terminée', () => {
    expect(avancementPochettes({ result: null })).toBeNull();
    expect(avancementPochettes({ result: { status: 'running', total: 57, enriched: 3, searched: 10 } }))
      .toEqual({ enCours: true, trouves: 3, total: 57, recherches: 10 });
    // Forme mesurée sur le .18 après une passe : plus de `status`.
    expect(avancementPochettes({ result: { enriched: 7, failed: 50, searched: 57, total: 57 } }))
      .toEqual({ enCours: false, trouves: 7, total: 57, recherches: 57 });
  });

  it('MusicBrainz : idle sans total = rien ; running ; done', () => {
    expect(avancementMusicBrainz({ status: 'idle', enriched: 0, total: 0 })).toBeNull();
    expect(avancementMusicBrainz({ status: 'running', enriched: 12, total: 400 }))
      .toEqual({ enCours: true, trouves: 12, total: 400, recherches: null });
    expect(avancementMusicBrainz({ status: 'done', enriched: 380, total: 400 })?.enCours).toBe(false);
  });
});

describe('l’onglet monté', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    hote?.remove();
    monte = null; hote = null;
    vi.unstubAllGlobals();
  });

  it('affiche les trois compteurs mesurés et lance la passe des pochettes', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      let corps: unknown = {};
      if (/stats\/completeness/.test(url)) corps = { total_albums: 4306, albums_without_cover: 69, albums_without_genre: 1225, albums_without_year: 1260 };
      else if (/artwork\/enrich\/status/.test(url)) corps = { result: null, albums_without_cover: 69 };
      else if (/enrich-all\/status/.test(url)) corps = { status: 'idle', enriched: 0, total: 0 };
      else if (/artwork\/enrich$/.test(url)) corps = { status: 'accepted', albums_to_process: 69 };
      return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    }));
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ManquantsV2, { target: hote });
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    flushSync();

    const txt = hote.textContent ?? '';
    for (const n of ['69', '1', '225', '260']) expect(txt, `compteur ${n}`).toContain(n);

    const bouton = Array.from(hote.querySelectorAll('button')).find((b) => b.textContent?.includes('pochettes') || b.textContent?.includes('covers'));
    expect(bouton, 'bouton des pochettes absent').toBeTruthy();
    bouton!.click();
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(appels.some((a) => /^POST .*\/library\/artwork\/enrich$/.test(a)), appels.join(' | ')).toBe(true);
  });
});
