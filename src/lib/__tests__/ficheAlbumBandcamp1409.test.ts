// @vitest-environment jsdom
//
// renesenses/tune-web-client#1409 — la clé d'ONGLET `__bandcamp__` fuyait là
// où le serveur attend la clé du SERVICE `bandcamp`, sur la FICHE d'un album
// Bandcamp :
//
//   1. l'étiquette posée depuis la fiche partait sous `source=__bandcamp__`
//      (le serveur ne valide que l'`item_type`, la source est une chaîne
//      libre) et n'était jamais relue sous `bandcamp` ;
//   2. la fiche n'avait AUCUN cœur, alors que sa vignette en a un depuis #1400.
//
// 🔴 Le décor est celui que `StreamingV2.ouvrirFiche` monte RÉELLEMENT :
// `source: BANDCAMP_EXT` (`'__bandcamp__'`), `source_id: <url>`, `url: <url>`,
// et la propriété `bandcamp` = l'URL. Le témoin voisin de #1357 montait la
// fiche avec `source: 'bandcamp'` — la forme que le commentaire promettait,
// pas celle que l'écran fabrique — et restait donc vert sur le défaut.
//
// La fiche est MONTÉE, `fetch` bouchonné au plus bas niveau, et on lit la
// requête réellement partie.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { Album } from '../types';
import { BANDCAMP_EXT, BANDCAMP_SVC } from '../ongletsStreaming';
import { favKeyOf, refFavoriDeFiche, refFavoriDeVignette } from '../streamingFavorites';
import { cibleDeService } from '../cibleEtiquette';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
// Le panneau est monté par un `{#await import(...)}` : l'importer à la
// COLLECTE, comme le banc de #1357 (garde #1333).
import '../../components/v2/EtiquettesPanneau.svelte';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;
const ETIQUETTES = fr['v2.cover.tags'];

const URL_BC = 'https://sodablonde.bandcamp.com/album/dream-big';

/** La fiche telle que `StreamingV2.ouvrirFiche` la construit (l. ~720). */
const FICHE_BC = {
  id: null, title: 'Dream Big', artist_name: 'Soda Blonde', cover_path: null,
  url: URL_BC, source: BANDCAMP_EXT, source_id: URL_BC,
} as unknown as Album;

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}
async function attendreQue(condition: () => boolean, limiteMs = 20_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    let charge: unknown = [];
    if (url.includes('/ext/bandcamp/album')) charge = { tracks: [] };
    else if (/\/profiles(\?|$)/.test(url)) charge = [{ id: 1, name: 'Default', avatar_color: '#6366f1' }];
    else if (/\/profiles\/\d+\/favorites\/streaming\/(add|remove)/.test(url)) charge = {};
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  favoriteStreamingKeys.set(new Set());
  currentProfileId.set(null);
  vi.unstubAllGlobals();
});

function monterFiche(album: Album, props: Record<string, unknown>) {
  monte = mount(AlbumDetailV2, { target: hote!, props: { album, onClose: () => {}, ...props } });
}
const coeur = () => hote!.querySelector('button.coeur') as HTMLButtonElement | null;
const boutonEtiquettes = () => [...hote!.querySelectorAll('button')].find(
  (b) => b.textContent?.trim() === ETIQUETTES,
) as HTMLButtonElement | undefined;

describe('#1409 — fiche d’un album Bandcamp : la clé du SERVEUR, pas celle de l’onglet', () => {
  it('🔴 les étiquettes sont demandées sous `bandcamp`, jamais sous `__bandcamp__`', async () => {
    monterFiche(FICHE_BC, { bandcamp: URL_BC });
    await souffler();
    const b = boutonEtiquettes();
    expect(b, 'la fiche Bandcamp n’a pas de bouton Étiquettes : décor faux').toBeTruthy();
    b!.click();
    await attendreQue(() => requetes.some((r) => r.url.includes('/tags/for-streaming')));
    const lecture = requetes.find((r) => r.url.includes('/tags/for-streaming'));
    expect(lecture, 'le panneau n’a rien demandé').toBeDefined();
    const q = new URL(lecture!.url, 'http://x').searchParams;
    expect(q.get('source')).toBe(BANDCAMP_SVC);
    expect(q.get('source_id')).toBe(URL_BC);
    expect(requetes.some((r) => r.url.includes(BANDCAMP_EXT)), 'la clé d’onglet est partie sur le réseau').toBe(false);
  });

  it('🔴 la fiche PORTE un cœur — elle n’en avait aucun', async () => {
    monterFiche(FICHE_BC, { bandcamp: URL_BC });
    await souffler();
    expect(coeur(), 'la fiche d’un album Bandcamp n’a pas de cœur').not.toBeNull();
  });

  it('🔴 le clic range le favori sous `bandcamp` + l’URL de la page', async () => {
    currentProfileId.set(1);
    await souffler();
    monterFiche(FICHE_BC, { bandcamp: URL_BC });
    await souffler();
    requetes = [];
    coeur()!.click();
    await attendreQue(() => requetes.some((r) => /favorites\/streaming\/add$/.test(r.url)));
    const ajout = requetes.find((r) => /\/profiles\/1\/favorites\/streaming\/add$/.test(r.url));
    expect(ajout, `aucun ajout — vu : ${requetes.map((r) => r.url).join(', ')}`).toBeDefined();
    expect(ajout!.body).toMatchObject({ item_type: 'album', service: BANDCAMP_SVC, service_id: URL_BC });
    expect(JSON.stringify(ajout!.body)).not.toContain(BANDCAMP_EXT);
  });

  it('🔴 la fiche et la vignette montrent le MÊME état (même clé)', async () => {
    // La vignette de `StreamingV2` : article de `/ext/bandcamp/…`, `url` seule,
    // onglet `__bandcamp__` — sa clé est celle que #1400 range.
    const cleVignette = favKeyOf(refFavoriDeVignette('album', { url: URL_BC }, BANDCAMP_EXT));
    expect(cleVignette).toBe(streamingFavKey('album', BANDCAMP_SVC, URL_BC));
    expect(favKeyOf(refFavoriDeFiche(FICHE_BC as any, null, URL_BC))).toBe(cleVignette);

    favoriteStreamingKeys.set(new Set([cleVignette!]));
    monterFiche(FICHE_BC, { bandcamp: URL_BC });
    await souffler();
    expect(coeur()!.getAttribute('aria-pressed'), 'favori rangé par la vignette, fiche éteinte').toBe('true');
  });

  it('CONTRE-ÉPREUVE — un autre album Bandcamp reste éteint', async () => {
    favoriteStreamingKeys.set(new Set([streamingFavKey('album', BANDCAMP_SVC, 'https://x.bandcamp.com/album/autre')]));
    monterFiche(FICHE_BC, { bandcamp: URL_BC });
    await souffler();
    expect(coeur()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('CONTRE-ÉPREUVE — un album Qobuz garde exactement sa référence d’avant', async () => {
    const qobuz = { id: null, title: 'Menagerie', source: 'qobuz', source_id: 'kxend2k5wdg06' } as unknown as Album;
    expect(refFavoriDeFiche(qobuz as any, 'qobuz', null)).toEqual({
      itemType: 'album', service: 'qobuz', serviceId: 'kxend2k5wdg06',
    });
    expect(cibleDeService('album', qobuz)?.source).toBe('qobuz');
    favoriteStreamingKeys.set(new Set([streamingFavKey('album', 'qobuz', 'kxend2k5wdg06')]));
    monterFiche(qobuz, { service: 'qobuz' });
    await souffler();
    expect(coeur()!.getAttribute('aria-pressed')).toBe('true');
  });

  it('CONTRE-ÉPREUVE — un album local n’a pas de référence de service ; un objet sans identité, pas de cœur', async () => {
    expect(refFavoriDeFiche({ id: 42 } as any, null, null)).toBeNull();
    expect(refFavoriDeFiche({ id: null, title: 'x' } as any, null, null)).toBeNull();
    monterFiche({ id: null, title: 'Rien' } as unknown as Album, {});
    await souffler();
    expect(coeur()).toBeNull();
  });
});
