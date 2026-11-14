// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// tune-server-rust#7857 (PR #7897) — le spectrogramme d'une piste, en image,
// atteignable depuis le menu « … » d'une piste de la bibliothèque.
//
// Cette garde MONTE `PisteActions` (l'entrée de menu) et `SpectrogrammePanneau`
// (l'appel, l'attente, l'image, les refus) contre des réponses simulées de la
// route. Une entrée écrite mais pas branchée, ou un appel retiré, y est rouge.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import SpectrogrammePanneau from '../../components/v2/SpectrogrammePanneau.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { chargerSpectrogramme, ErreurSpectrogramme, genreDeRefus } from '../spectrogramme';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

const BIBLIO = {
  id: 2450, source: 'local', title: 'The Meaning of Flowers', artist_name: 'Agnes Obel',
  artist_id: 125, album_id: 259, album_title: 'Myopia', duration_ms: 234000,
};
const TIDAL = {
  id: null, source: 'tidal', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: '441078580', duration_ms: 360000,
};

interface Requete { url: string; entetes: Record<string, string> }
let requetes: Requete[] = [];
/** Ce que la route répond : statut + corps texte (ou PNG simulé). */
let reponse: { statut: number; corps: string } = { statut: 200, corps: 'PNG' };
let liberateur: (() => void) | null = null;
let retarde = false;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(condition: () => boolean, limiteMs = 10_000) {
  const fin = Date.now() + limiteMs;
  while (!condition() && Date.now() < fin) { await respirer(); flushSync(); }
  flushSync();
  return condition();
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}
function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
}
const entree = (items: HTMLButtonElement[]) =>
  items.find((b) => (b.textContent ?? '').trim() === fr['spectro.menu']);
const panneau = () => document.querySelector<HTMLElement>('[role="dialog"]');
const texte = () => panneau()?.textContent ?? '';
const bouton = (libelle: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button.bouton')]
    .find((b) => (b.textContent ?? '').trim() === libelle);

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  requetes = [];
  reponse = { statut: 200, corps: 'PNG' };
  retarde = false;
  liberateur = null;
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:spectro-test'),
    revokeObjectURL: vi.fn(),
  }));
  vi.stubGlobal('fetch', vi.fn(async (e: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof e === 'string' ? e : e.toString();
    requetes.push({ url, entetes: (init?.headers ?? {}) as Record<string, string> });
    if (retarde) await new Promise<void>((r) => { liberateur = r; });
    const r = reponse;
    return {
      ok: r.statut < 400, status: r.statut, statusText: '',
      headers: new Headers(),
      blob: async () => new Blob([r.corps], { type: 'image/png' }),
      text: async () => r.corps,
      json: async () => ({}),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('#7857 — l’appel à la route', () => {
  it('demande le PNG de la piste, à la taille par défaut, et rend un Blob', async () => {
    const blob = await chargerSpectrogramme(2450);
    expect(requetes[0].url).toContain('/library/tracks/2450/spectrogramme.png?largeur=1200&hauteur=400');
    expect(requetes[0].entetes.Accept).toBe('image/png');
    expect(blob).toBeInstanceOf(Blob);
  });
  it('classe les refus du serveur', async () => {
    expect(genreDeRefus(422, 'track has no local file')).toBe('non-locale');
    expect(genreDeRefus(422, 'track file not found')).toBe('non-locale');
    expect(genreDeRefus(422, 'spectrogram failed: decode')).toBe('impossible');
    // #2945 : la piste inconnue n'est pas une fonction absente.
    expect(genreDeRefus(404, 'track not found')).toBe('introuvable');
    expect(genreDeRefus(404, '')).toBe('indisponible');
    expect(genreDeRefus(401, '')).toBe('session');
    expect(genreDeRefus(500, 'boom')).toBe('reseau');
    reponse = { statut: 422, corps: 'track has no local file' };
    await expect(chargerSpectrogramme(1)).rejects.toMatchObject({ genre: 'non-locale' });
    expect(new ErreurSpectrogramme('reseau')).toBeInstanceOf(Error);
  });
});

describe('#7857 — l’entrée du menu', () => {
  it('présente pour une piste de la bibliothèque', () => {
    expect(entree(menuV2(BIBLIO))).toBeTruthy();
  });
  it('ABSENTE pour un titre de service', () => {
    expect(entree(menuV2(TIDAL))).toBeUndefined();
  });
  it('client actuel : présente pour une piste de la bibliothèque, absente pour un titre de service', () => {
    const ouvrirV1 = (piste: Record<string, unknown>) => {
      const el = poser(MenuPisteV1, { piste });
      el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
      flushSync();
      const r = Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item'));
      return r.find((b) => (b.textContent ?? '').trim() === fr['spectro.menu']);
    };
    expect(ouvrirV1(BIBLIO)).toBeTruthy();
    if (monte) unmount(monte); monte = null; hote?.remove(); document.body.innerHTML = '';
    expect(ouvrirV1(TIDAL)).toBeUndefined();
  });
  it('le clic ouvre le panneau SANS rien demander au serveur', async () => {
    entree(menuV2(BIBLIO))!.click();
    flushSync();
    expect(await attendreQue(() => panneau() != null)).toBe(true);
    expect(texte()).toContain('The Meaning of Flowers');
    expect(bouton(fr['spectro.generate'])).toBeTruthy();
    expect(requetes).toHaveLength(0);
  });
});

describe('#7857 — le panneau', () => {
  it('attente, puis image avec son texte alternatif', async () => {
    retarde = true;
    poser(SpectrogrammePanneau, { trackId: 2450, titre: 'Flowers', onClose: () => {} });
    bouton(fr['spectro.generate'])!.click();
    flushSync();
    expect(await attendreQue(() => texte().includes(fr['spectro.loading']))).toBe(true);
    expect(document.querySelector('[role="dialog"] img')).toBeNull();
    liberateur!();
    expect(await attendreQue(() => panneau()!.querySelector('img') != null)).toBe(true);
    const img = panneau()!.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:spectro-test');
    expect(img.getAttribute('alt')).toBe(fr['spectro.alt'].replace('{title}', 'Flowers'));
    expect(requetes).toHaveLength(1);
  });
  it('piste non locale : message clair, pas de « Réessayer »', async () => {
    reponse = { statut: 422, corps: 'track has no local file' };
    poser(SpectrogrammePanneau, { trackId: 9, titre: 'X', onClose: () => {} });
    bouton(fr['spectro.generate'])!.click();
    expect(await attendreQue(() => texte().includes(fr['spectro.notLocal']))).toBe(true);
    expect(bouton(fr['spectro.retry'])).toBeUndefined();
  });
  it('image impossible à produire : message clair et « Réessayer » relance l’appel', async () => {
    reponse = { statut: 422, corps: 'spectrogram failed: decode' };
    poser(SpectrogrammePanneau, { trackId: 9, titre: 'X', onClose: () => {} });
    bouton(fr['spectro.generate'])!.click();
    expect(await attendreQue(() => texte().includes(fr['spectro.failed']))).toBe(true);
    reponse = { statut: 200, corps: 'PNG' };
    bouton(fr['spectro.retry'])!.click();
    expect(await attendreQue(() => panneau()!.querySelector('img') != null)).toBe(true);
    expect(requetes).toHaveLength(2);
  });
  it('erreur serveur : message réseau', async () => {
    reponse = { statut: 500, corps: 'boom' };
    poser(SpectrogrammePanneau, { trackId: 9, titre: 'X', onClose: () => {} });
    bouton(fr['spectro.generate'])!.click();
    expect(await attendreQue(() => texte().includes(fr['spectro.network']))).toBe(true);
    expect(texte()).not.toContain('boom');
  });
  it('« × » ferme', () => {
    const fermer = vi.fn();
    poser(SpectrogrammePanneau, { trackId: 9, titre: 'X', onClose: fermer });
    document.querySelector<HTMLButtonElement>('[role="dialog"] button.x')!.click();
    expect(fermer).toHaveBeenCalled();
  });
});
