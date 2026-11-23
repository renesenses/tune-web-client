// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas — un test vert qui
// n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LectureCdV2 from '../../components/v2/LectureCdV2.svelte';
import { preparerLocale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { tuneWS } from '../websocket';
import { cdPlugin } from '../lectureCd';
import { versListeDossiers, choixDestination } from '../extractionCd';

/**
 * Fil forum 3036 (Thierry, rc12) — « Enregistrer » un CD ripé : le choix du
 * dossier ne descendait pas sous le « niveau du disque ». La feuille ne
 * proposait qu'un menu des emplacements de la bibliothèque ; le serveur,
 * lui, acceptait déjà n'importe quel sous-dossier.
 *
 * Gardé ici : « Parcourir… » descend sur trois niveaux par le greffon
 * (`GET /ext/cd/extraction/dossiers`), le sous-dossier choisi part au
 * lancement et reste affiché ; en haut d'un emplacement, « .. » ramène aux
 * emplacements, jamais au parent du disque, et l'explorateur du système de
 * fichiers entier (`/system/browse-dirs`) n'est jamais appelé.
 */

const DISQUE = {
  disc_id: 'Wn8eRBtfLDfM0qjYPdxrz.Zjs_U-',
  metadonnees: 'musicbrainz',
  titre: 'Kind of Blue',
  artiste: 'Miles Davis',
  release_id: 'r1',
  pochette: null,
  pistes: [
    { numero: 1, titre: 'So What', artiste: 'Miles Davis', duree_ms: 562000, premier_secteur: 0, secteurs: 1, source_id: 'x/1' },
  ],
};

const EMPLACEMENTS = ['/music', '/nas/musique'];
let reglages: Record<string, unknown> = {};

/** L'arbre que le greffon accepte de lister : rien au-dessus de `/music`. */
const ARBRE: Record<string, { parent: string | null; enfants: string[] }> = {
  '/music': { parent: null, enfants: ['Classique'] },
  '/music/Classique': { parent: '/music', enfants: ['Bach'] },
  '/music/Classique/Bach': { parent: '/music/Classique', enfants: ['Cantates'] },
  '/music/Classique/Bach/Cantates': { parent: '/music/Classique/Bach', enfants: [] },
};

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function dossiers(u: string): Response {
  const chemin = new URL(u, 'http://x').searchParams.get('chemin');
  if (!chemin) {
    return reponse(200, { courant: null, parent: null, dossiers: EMPLACEMENTS.map((e) => ({ nom: e, chemin: e })) });
  }
  const n = ARBRE[chemin];
  if (!n) return reponse(400, { error: 'hors_bibliotheque', message: 'hors' });
  return reponse(200, {
    courant: chemin,
    parent: n.parent,
    dossiers: n.enfants.map((e) => ({ nom: e, chemin: `${chemin}/${e}` })),
  });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  reglages = {
    formats: ['flac', 'wav'], format: 'flac', verifications: ['doute', 'toujours'],
    destination: '/music', destination_source: 'reglage', emplacements: EMPLACEMENTS,
  };
  cdPlugin.set(null);
  currentZoneId.set(3);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.spyOn(tuneWS, 'onEvent').mockImplementation(() => () => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/cd/etat')) return reponse(200, { plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque' });
      if (u.includes('/ext/cd/disque')) return reponse(200, DISQUE);
      if (u.includes('/ext/cd/extraction/dossiers')) return dossiers(u);
      if (u.includes('/ext/cd/extraction/reglages')) {
        if (method === 'PUT') reglages = { ...reglages, ...JSON.parse(String(init?.body)), destination_source: 'reglage' };
        return reponse(200, reglages);
      }
      if (u.includes('/ext/cd/extractions')) {
        if (method === 'POST') {
          const b = JSON.parse(String(init?.body ?? '{}'));
          return reponse(202, {
            id: 'e1', statut: 'en_cours', format: 'flac', verification: 'doute', lecteur: '/dev/sr0',
            disc_id: DISQUE.disc_id, metadonnees: 'musicbrainz', artiste: 'Miles Davis', album: 'Kind of Blue',
            disque: 1, disques: 1, destination: b.destination, dossier: `${b.destination}/Miles Davis/Kind of Blue`,
            piste_courante: 1, pourcentage: 0, debut: 1, fin: null, erreur: null, scan: null, pistes: [],
          });
        }
        return reponse(200, { extractions: [] });
      }
      if (u.endsWith('/plugins')) return reponse(200, [{ name: 'cd', type: 'sdk', installed: true, enabled: true }]);
      return reponse(200, {});
    }),
  );
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.feuille-extraction').forEach((n) => n.closest('.fond')?.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function ouvrirLaFeuille() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LectureCdV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  (hote.querySelector('button.extraire') as HTMLButtonElement).click();
  await laisserFaire();
}

const feuille = () => document.querySelector('.feuille-extraction') as HTMLElement;
const selecteur = () => document.querySelector('.folder-modal') as HTMLElement | null;
const nomsListes = () =>
  [...(selecteur()?.querySelectorAll('.dir-row .name') ?? [])].map((n) => (n.textContent ?? '').trim());
const appelsDossiers = () => appels.filter((a) => a.url.includes('/ext/cd/extraction/dossiers'));

async function ouvrir(nom: string) {
  const ligne = [...selecteur()!.querySelectorAll('.dir-row')].find(
    (r) => (r.querySelector('.name')?.textContent ?? '').trim() === nom,
  );
  expect(ligne, `« ${nom} » est proposé`).toBeTruthy();
  (ligne!.querySelector('button.open') as HTMLButtonElement).click();
  await laisserFaire();
}

describe('Extraction CD — choix du dossier sous l’emplacement (fil 3036)', () => {
  it('« Parcourir… » descend sur trois niveaux ; le sous-dossier choisi part et reste affiché', async () => {
    await ouvrirLaFeuille();
    const bouton = feuille().querySelector('button.parcourir-destination') as HTMLButtonElement | null;
    expect(bouton, 'la feuille offre de descendre sous l’emplacement').not.toBeNull();
    bouton!.click();
    await laisserFaire();
    expect(selecteur()).not.toBeNull();
    expect(nomsListes()).toEqual(['Classique']);

    await ouvrir('Classique');
    expect(nomsListes()).toEqual(['Bach']);
    await ouvrir('Bach');
    expect(nomsListes()).toEqual(['Cantates']);
    await ouvrir('Cantates');
    expect(nomsListes()).toEqual([]);
    expect(selecteur()!.querySelector('.current-path')?.textContent).toBe('/music/Classique/Bach/Cantates');

    (selecteur()!.querySelector('button.select-btn') as HTMLButtonElement).click();
    await laisserFaire();
    expect(selecteur()).toBeNull();
    const menu = feuille().querySelector('select.destination') as HTMLSelectElement;
    expect(menu.value).toBe('/music/Classique/Bach/Cantates');

    (feuille().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await laisserFaire();
    const put = appels.find((a) => a.url.includes('/extraction/reglages') && a.method === 'PUT');
    expect((put?.body as any)?.destination).toBe('/music/Classique/Bach/Cantates');
    const post = appels.find((a) => a.url.includes('/ext/cd/extractions') && a.method === 'POST');
    expect((post?.body as any)?.destination).toBe('/music/Classique/Bach/Cantates');
    // Les boutons du sélecteur ne soumettaient pas la feuille en route.
    expect(appels.filter((a) => a.method === 'POST')).toHaveLength(1);
  });

  it('en haut de l’emplacement, « .. » ramène aux emplacements, jamais au parent du disque', async () => {
    await ouvrirLaFeuille();
    (feuille().querySelector('button.parcourir-destination') as HTMLButtonElement).click();
    await laisserFaire();
    (selecteur()!.querySelector('button.parent') as HTMLButtonElement).click();
    await laisserFaire();
    expect(nomsListes()).toEqual(EMPLACEMENTS);
    expect(selecteur()!.querySelector('button.parent'), 'au-dessus des emplacements : rien').toBeNull();
    expect((selecteur()!.querySelector('button.select-btn') as HTMLButtonElement).disabled).toBe(true);
    const chemins = appelsDossiers().map((a) => new URL(a.url, 'http://x').searchParams.get('chemin'));
    expect(chemins).toEqual(['/music', null]);
    expect(appels.some((a) => a.url.includes('/system/browse-dirs')), 'pas d’explorateur du disque entier').toBe(false);
  });

  it('un refus du serveur (sortie de la bibliothèque) se dit, et ne change pas la destination', async () => {
    reglages = { ...reglages, destination: '/ailleurs' };
    await ouvrirLaFeuille();
    (feuille().querySelector('button.parcourir-destination') as HTMLButtonElement).click();
    await laisserFaire();
    expect(selecteur()!.querySelector('.error')).not.toBeNull();
    expect(nomsListes()).toEqual([]);
    (selecteur()!.querySelector('button.cancel-btn') as HTMLButtonElement).click();
    await laisserFaire();
    expect((feuille().querySelector('select.destination') as HTMLSelectElement).value).toBe('/ailleurs');
  });

  it('versListeDossiers et choixDestination', () => {
    expect(versListeDossiers({ courant: null, parent: null, dossiers: [{ nom: '/m', chemin: '/m' }] }))
      .toEqual({ dirs: [{ name: '/m', path: '/m', has_children: true }], parent: null, current: '' });
    expect(versListeDossiers({ courant: '/m', parent: null, dossiers: [] }).parent).toBe('');
    expect(versListeDossiers({ courant: '/m/a', parent: '/m', dossiers: [] }).parent).toBe('/m');
    expect(choixDestination(['/m'], '/m')).toEqual(['/m']);
    expect(choixDestination(['/m'], '/m/a/b')).toEqual(['/m', '/m/a/b']);
  });
});
