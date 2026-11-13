// @vitest-environment jsdom
//
// tune-server-rust#8625 (fil 2787, Pierre M) — l'écran Statistiques, MONTÉ
// sur un `/library/stats` simulé : il affiche le total des listes
// (`library_totals`), plus le compte des tables, et explique l'écart en
// infobulle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StatsBibliothequeV2 from '../../components/v2/StatsBibliothequeV2.svelte';
import { locale } from '../i18n';

const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]+/g, '');
const DISTRIBUTIONS = { by_codec: [], by_sample_rate: [], by_decade: [], by_credit_role: [] };

let stats: unknown;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(StatsBibliothequeV2, { target: hote, props: {} });
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  return hote;
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#8625 — Statistiques affiche le total des listes', () => {
  it('🔴 155 539 pistes et 9 494 albums (Titres, Albums), pas 156 008 / 10 403', async () => {
    stats = {
      tracks: 156008, albums: 10403, artists: 3000, distributions: DISTRIBUTIONS,
      library_totals: {
        tracks: 155539, albums: 9494, stored_tracks: 156008, stored_albums: 10403,
        hidden_or_duplicate_tracks: 469, hidden_or_duplicate_albums: 909,
      },
    };
    const el = await monter();
    const meta = el.querySelector('[data-totaux-bibliotheque]') as HTMLElement | null;
    expect(meta, 'totaux absents').not.toBeNull();
    const texte = sansEspaces(meta!.textContent);
    expect(texte).toContain('155539');
    expect(texte).toContain('9494');
    expect(texte).not.toContain('156008');
    const titre = sansEspaces(meta!.getAttribute('title'));
    expect(titre).toContain('156008');
    expect(titre).toContain('469');
    expect(titre).toContain('909');
  });

  it('un serveur d’avant #8625 : le compte des tables, sans écart annoncé', async () => {
    stats = { tracks: 12, albums: 3, artists: 2, distributions: DISTRIBUTIONS };
    const el = await monter();
    const meta = el.querySelector('[data-totaux-bibliotheque]') as HTMLElement;
    expect(sansEspaces(meta.textContent)).toContain('12');
    expect(meta.getAttribute('title')).not.toMatch(/\d/);
  });
});
