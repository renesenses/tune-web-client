// @vitest-environment jsdom
//
// Recette de Bertrand sur la .18, 14/11/2026 (rc12), écran Playlists :
//   1. la fiche de « Ecoutes récentes Bertrand » (22 titres, locaux + Qobuz)
//      montrait le pictogramme orange dans son EN-TÊTE, alors que la grille des
//      Playlists affichait la mosaïque de la même playlist ;
//   2. vue pochettes de la fiche : le nom d'album sous une vignette doit ouvrir
//      l'album complet, jamais lancer la lecture de la vignette ;
//   3. (point 102) sous 640 px de FICHE, la pochette passe au-dessus du titre.
// Le point « Bandcamp ne propose pas de playlists » est gardé par
// `refus501Explique1148.test.ts`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { pochettesDePlaylist } from '../mosaique';

vi.setConfig({ testTimeout: 60_000 });

/** La forme mesurée sur la .18 (`GET /playlists/30/tracks`, profil 2). */
const PISTES = [
  { id: 138675, title: 'Un', album_id: 12394, album_title: '2+', cover_path: '0b51f37e', source: 'local', duration_ms: 1000 },
  { id: null, title: 'Caipirinha', source: 'qobuz', source_id: '90601421', album_id: 'obxtaattzzowa', album_title: 'Caipirinha',
    cover_path: 'https://static.qobuz.com/images/covers/wa/zo/obxtaattzzowa_600.jpg', duration_ms: 1000 },
  { id: 132512, title: 'Deux', album_id: 11871, album_title: 'Kiwanuka', cover_path: 'af375b94', source: 'local', duration_ms: 1000 },
  { id: 132506, title: 'Trois', album_id: 11871, album_title: 'Kiwanuka', cover_path: 'af375b94', source: 'local', duration_ms: 1000 },
  { id: 121255, title: 'Quatre', album_id: 10922, album_title: 'Dirty Edits Vol. 1', cover_path: '70098487', source: 'local', duration_ms: 1000 },
  { id: 121248, title: 'Cinq', album_id: 10923, album_title: 'Autre', cover_path: 'ffff0000', source: 'local', duration_ms: 1000 },
];
let reponse: unknown[] = PISTES;
let appels: { url: string; method: string }[] = [];

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  reponse = PISTES;
  appels = [];
  currentZoneId.set(1);
  activeView.set('playlists');
  pendingLibraryAlbum.set(null);
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    appels.push({ url: u, method: (init?.method ?? 'GET').toUpperCase() });
    const c = /\/playlists\/\d+\/tracks/.test(u) ? reponse : [];
    return {
      ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  gestesNavigationService.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(n = 8) { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } }
async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'local', pl: { id: 30, name: 'Ecoutes récentes Bertrand', track_count: PISTES.length } }, onClose: () => {} } as any,
  });
  flushSync();
  await tourner();
  return hote;
}
const lectures = () => appels.filter((a) => a.method !== 'GET' && /play|queue|zones/.test(a.url));

describe('1 — en-tête de la fiche : la mosaïque de la grille', () => {
  it('la règle partagée : quatre pochettes distinctes, dans l’ordre de la playlist', () => {
    expect(pochettesDePlaylist(PISTES)).toEqual([
      '0b51f37e', 'https://static.qobuz.com/images/covers/wa/zo/obxtaattzzowa_600.jpg', 'af375b94', '70098487',
    ]);
    expect(pochettesDePlaylist([{ cover_path: null }, {}])).toEqual([]);
  });

  it('🔴 une playlist locale dont les titres ont des pochettes montre la mosaïque, pas le pictogramme', async () => {
    const h = await monter();
    const art = h.querySelector('[data-entete-pochette]');
    expect(art, 'en-tête absent').not.toBeNull();
    expect(art!.querySelector('.mos'), 'l’en-tête montre encore le pictogramme générique').not.toBeNull();
    expect(art!.querySelectorAll('.case').length).toBe(4);
    expect(art!.querySelector(':scope > svg')).toBeNull();
  });

  it('CONTRE-ÉPREUVE : aucune pochette → le pictogramme générique', async () => {
    reponse = PISTES.map((p) => ({ ...p, cover_path: null }));
    const h = await monter();
    const art = h.querySelector('[data-entete-pochette]')!;
    expect(art.querySelector('.mos')).toBeNull();
    expect(art.querySelector(':scope > svg')).not.toBeNull();
  });
});

describe('2 — vue pochettes : le nom d’album ouvre l’album', () => {
  async function enPochettes() {
    const h = await monter();
    (h.querySelector('[data-vue="pochettes"]') as HTMLElement).click();
    flushSync();
    return h;
  }

  it('🔴 album LOCAL : le clic ouvre la fiche, ne lance rien, et ne remonte pas à la vignette', async () => {
    const h = await enPochettes();
    const cartes = [...h.querySelectorAll('[data-pgrille] .pcarte')];
    const lien = cartes[0].querySelector<HTMLButtonElement>('[data-palbum]');
    expect(lien, 'le nom d’album n’est pas un lien').not.toBeNull();
    expect(lien!.tagName).toBe('BUTTON');
    expect(lien!.closest('.pvig'), 'le lien ne doit pas être dans la vignette de lecture').toBeNull();
    // Un écouteur AU-DESSUS de l'écran (les gestes de Svelte sont délégués à la
    // racine du montage) : le clic du nom d'album ne doit pas aller plus haut.
    let remonte = 0;
    const compter = () => { remonte += 1; };
    document.body.addEventListener('click', compter);
    lien!.click(); flushSync(); await tourner(2);
    document.body.removeEventListener('click', compter);
    expect(remonte, 'le clic du nom d’album continue sa route').toBe(0);
    expect(get(activeView)).toBe('library');
    expect(get(pendingLibraryAlbum)).toBe(12394);
    expect(lectures(), 'le nom d’album a lancé une lecture').toEqual([]);
  });

  it('album QOBUZ d’une playlist locale : la fiche du service', async () => {
    const ouvrirAlbum = vi.fn();
    gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste: vi.fn() } as any);
    const h = await enPochettes();
    const lien = h.querySelectorAll<HTMLButtonElement>('[data-pgrille] .pcarte')[1].querySelector<HTMLButtonElement>('[data-palbum]');
    expect(lien!.textContent).toBe('Caipirinha');
    lien!.click(); flushSync(); await tourner(2);
    expect(ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: 'obxtaattzzowa' }));
    expect(lectures()).toEqual([]);
  });

  it('au clavier : un vrai bouton, atteignable par Tab', async () => {
    const h = await enPochettes();
    const lien = h.querySelector<HTMLButtonElement>('[data-pgrille] [data-palbum]')!;
    expect(lien.getAttribute('type')).toBe('button');
    expect(lien.tabIndex).toBe(0);
    expect(lien.disabled).toBe(false);
  });

  it('CONTRE-ÉPREUVE : la vignette, elle, lance toujours la lecture', async () => {
    const h = await enPochettes();
    (h.querySelector('[data-pgrille] .pvig') as HTMLElement).click();
    flushSync(); await tourner(2);
    expect(lectures().length, 'la vignette ne lance plus la lecture').toBeGreaterThan(0);
    expect(get(activeView)).toBe('playlists');
  });
});

describe('3 — fiche étroite : la pochette au-dessus du titre (point 102)', () => {
  const brut = readFileSync(resolve(process.cwd(), 'src/components/v2/PlaylistDetailV2.svelte'), 'utf-8');
  const css = (brut.split('<style>')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  /** Le contenu d'un bloc `@…{ … }` à accolades équilibrées. */
  function bloc(entete: string): string | null {
    const i = css.indexOf(entete);
    if (i < 0) return null;
    let n = 0;
    for (let j = i + entete.length - 1; j < css.length; j++) {
      if (css[j] === '{') n += 1;
      else if (css[j] === '}') { n -= 1; if (n === 0) return css.slice(i + entete.length, j); }
    }
    return null;
  }

  it('🔴 la fiche est un conteneur, et la règle étroite se mesure sur ELLE, pas sur la fenêtre', () => {
    expect(css).toMatch(/\.v2-pldetail\{[^}]*container-type:inline-size; container-name:pldetail\}/);
    const etroit = bloc('@container pldetail (max-width:640px){');
    expect(etroit, 'aucune requête de conteneur pour la fiche étroite').not.toBeNull();
    expect(etroit).toContain('.head:not(.compact){flex-direction:column; gap:18px}');
    expect(etroit).toContain('.head:not(.compact) .art{width:min(240px, 100%); height:auto; aspect-ratio:1 / 1}');
    // La requête de FENÊTRE ne porte plus la mise en colonne : une fiche de
    // 600 px dans une fenêtre de 900 px y échappait.
    const fenetre = bloc('@media (max-width:640px){') ?? '';
    expect(fenetre).not.toContain('flex-direction:column');
  });

  it('aucune règle plus spécifique hors requête ne remet l’en-tête en ligne', () => {
    // Hors des blocs @, seules `.head{display:flex…}` et `.head.compact…`
    // touchent l'en-tête : aucune ne pose `flex-direction:row`.
    const horsBlocs = css.replace(/@(media|container)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(horsBlocs).not.toMatch(/\.head[^{]*\{[^}]*flex-direction:row/);
    const mini = readFileSync(resolve(process.cwd(), 'src/styles/vue-mini.css'), 'utf-8');
    expect(mini).not.toMatch(/\.head\b|v2-pldetail/);
  });
});
