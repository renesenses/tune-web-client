// @vitest-environment jsdom
//
// tune-server-rust#6167 (Tades, fil 2231, Tune OS, 4 emplacements) : « Le scan
// est à 54 % de progression mais de quelle bibliothèque parmi les 4 ? »
//
// Le serveur ajoute à `library.scan.progress` la portée (`scope`), le nombre
// d'emplacements (`locations_total`) et l'emplacement en cours
// (`location_index`, `location`, `location_files`). L'écran des Réglages les
// affiche sous la barre : « Toute la bibliothèque (4 emplacements) »,
// « Emplacement 2/4 : Classique (12 000 fichiers) ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: true })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { avancementAnalyse, fusionnerAvancement, lignesPortee } from '../analyseBibliotheque';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const tr = (k: string) => fr[k] ?? k;

/** Une annonce de la phase `files`, telle que le serveur l'émet après #6167. */
const ANNONCE = {
  phase: 'files', scanned: 218_000, total: 405_281, inserted: 0, updated: 0, skipped: 218_000,
  current_dir: '/mnt/disque2/Classique/Bach',
  scope: 'library', locations_total: 4, location_index: 2,
  location: '/mnt/disque2/Classique', location_files: 120_000,
};

describe('#6167 — la portée du scan, dans l’état partagé', () => {
  it('la fusion lit portée, emplacements et emplacement en cours', () => {
    const a = fusionnerAvancement(null, ANNONCE);
    expect(a.portee).toBe('library');
    expect(a.emplacements).toBe(4);
    expect(a.emplacementRang).toBe(2);
    expect(a.emplacement).toBe('/mnt/disque2/Classique');
    expect(a.emplacementFichiers).toBe(120_000);
    // Une annonce sans emplacement (fin de phase) ne l'efface pas.
    const b = fusionnerAvancement(a, { phase: 'prune', pruned: 3 });
    expect(b.emplacementRang).toBe(2);
    expect(b.portee).toBe('library');
  });

  it('les lignes : « Toute la bibliothèque (4 emplacements) » et « Emplacement 2/4 : Classique »', () => {
    const l = lignesPortee(fusionnerAvancement(null, ANNONCE), tr)!;
    expect(l.portee).toBe(fr['v2.scan.scopeLibrary'].replace('{n}', '4'));
    expect(l.emplacement).toBe(fr['v2.scan.scopeLocationFiles']
      .replace('{f}', '120000').replace('{k}', '2').replace('{n}', '4').replace('{d}', 'Classique'));
    expect(l.emplacementComplet).toBe('/mnt/disque2/Classique');
  });

  it('un seul emplacement : « Toute la bibliothèque », sans rang', () => {
    const l = lignesPortee(fusionnerAvancement(null, { ...ANNONCE, locations_total: 1, location_index: 1 }), tr)!;
    expect(l.portee).toBe(fr['v2.scan.scopeLibraryOne']);
    expect(l.emplacement).toBeNull();
  });

  it('CONTRE-ÉPREUVE : serveur antérieur (sans `scope`) ou scan ciblé : aucune ligne inventée', () => {
    const { scope: _s, locations_total: _n, location_index: _k, location: _l, location_files: _f, ...ancien } = ANNONCE;
    expect(lignesPortee(fusionnerAvancement(null, ancien), tr)).toBeNull();
    expect(lignesPortee(fusionnerAvancement(null, { ...ANNONCE, scope: 'folder' }), tr)).toBeNull();
  });
  // Les onze langues : tenues par `scripts/check-i18n.mjs` (11 langues à 100 %).
});

// ── L'écran réel ────────────────────────────────────────────────────────────

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;
const attendre = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const chemin = String(typeof url === 'string' ? url : (url?.url ?? '')).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (chemin.endsWith('/system/config')) return json({ music_dirs: ['/mnt/disque1', '/mnt/disque2', '/mnt/disque3', '/mnt/disque4'] });
    if (chemin.includes('/system/scan/status')) return json({ scanning: true });
    if (VIDE.test(chemin)) return json([]);
    return json({});
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  avancementAnalyse.set(null);
  vi.unstubAllGlobals();
});

async function ongletBibliotheque(annonce: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === fr['settings.tabLibrary']);
  expect(onglet, 'onglet Bibliothèque introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  avancementAnalyse.set(fusionnerAvancement(null, annonce));
  await attendre();
  return hote;
}

describe('#6167 — sous la barre des Réglages', () => {
  it('🔴 le pourcentage est étiqueté « toute la bibliothèque », et l’emplacement en cours est nommé', async () => {
    const el = await ongletBibliotheque(ANNONCE);
    const portee = el.querySelector('[data-portee-scan]');
    expect(portee, 'rien ne dit ce que couvre le pourcentage').not.toBeNull();
    expect(portee!.textContent).toContain(fr['v2.scan.scopeLibrary'].replace('{n}', '4'));
    const emplacement = el.querySelector('[data-emplacement-scan]');
    expect(emplacement, 'l’emplacement en cours n’est pas nommé').not.toBeNull();
    expect(emplacement!.textContent).toMatch(/2\/4/);
    expect(emplacement!.textContent).toContain('Classique');
  });
});
