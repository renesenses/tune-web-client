// @vitest-environment jsdom
//
// web#2299 — fil 2341 (Scordia, rc7) : « quand on tombe sur un artiste absent
// de la bibliothèque […] après éventuelle écoute de cet artiste, pourrait-on
// remonter à la liste des similaires initiale ? »
//
// On monte la VRAIE coquille (même banc que #1232 étape 2) : fiche locale de
// Dionne Warwick → clic sur le similaire « Burt Bacharach », absent de la
// bibliothèque (la recherche ne rend aucun artiste) → la Recherche → une
// fiche Qobuz → « Retour aux similaires de Dionne Warwick ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour, requestListReset } from '../stores/navigation';
import { departSimilaires } from '../retourAuxSimilaires';
import { ficheArtisteService } from '../stores/streaming';
import { t } from '../i18n';

const ID_LOCAL = 51;
const ARTISTE_LOCAL = {
  id: ID_LOCAL,
  name: 'Dionne Warwick',
  image_path: '/covers/dionne.jpg',
  bio: 'Une voix de Broadway passée à la soul.',
  musicbrainz_id: 'mbid-dionne',
  sort_name: 'Warwick, Dionne',
};
const ALBUMS_LOCAUX = [
  { id: 900, title: 'Promises, Promises', artist_name: 'Dionne Warwick', year: 1968, cover_path: null },
];
const META = {
  similar_artists: [{ name: 'Burt Bacharach', reason: 'compositeur' }],
  members: [{ name: 'Dee Dee Warwick', role: 'chœurs' }],
};
const CREDITS = [{ instrument: 'Vibraphone' }];

const ARTISTE_SERVICE = { id: null, name: 'Leprous', source: 'qobuz', source_id: 'q-42', image_path: null };
const ALBUMS_SERVICE = [{ id: null, title: 'Malina', source: 'qobuz', source_id: 'a-9', year: 2017, cover_path: null }];

let urls: string[] = [];

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  let corps: unknown;
  // Du plus précis au plus large.
  if (url.includes(`/library/artists/${ID_LOCAL}/albums`)) corps = ALBUMS_LOCAUX;
  else if (url.includes(`/library/artists/${ID_LOCAL}/metadata`)) corps = META;
  else if (url.includes(`/library/artists/${ID_LOCAL}/credits`)) corps = CREDITS;
  else if (url.includes(`/library/artists/${ID_LOCAL}/bio`)) corps = { bio: null };
  else if (url.includes(`/library/artists/${ID_LOCAL}`)) corps = ARTISTE_LOCAL;
  else if (url.includes('/artists/q-42/top-tracks')) corps = [];
  else if (url.includes('/artists/q-42/albums')) corps = ALBUMS_SERVICE;
  else if (url.includes('/streaming/qobuz/artists/q-42')) corps = ARTISTE_SERVICE;
  else corps = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserLaCoquille(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));
/** jsdom n'a pas d'`ResizeObserver`, et `ClampedText` (le repli de la
 *  biographie) en instancie un dès qu'il y a une bio à replier. */
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
/** Le libellé RÉEL de la langue courante — pas un littéral français recopié. */
const libelle = (cle: string) => get(t)(cle as any);

/**
 * 🔴 Cherché DANS LA FICHE, pas dans la coquille entière : la barre de
 * navigation de `ShellV2` porte elle aussi un bouton « Étiquettes », et le
 * chercher partout aurait rendu vert le témoin qui doit prouver qu'il N'EST
 * PAS sur la fiche de service.
 */
function laFiche(hote: HTMLElement): HTMLElement {
  const f = hote.querySelector('.v2-fas');
  if (!f) throw new Error('la fiche artiste n’est pas montée');
  return f as HTMLElement;
}
/**
 * Un geste de la FICHE, pas d'une vignette de sa discographie : depuis le
 * 25/09/2026 (« il manque un CTA sur les covers Qobuz ! »), chaque pochette
 * d'album de service porte son propre coin « Étiquettes » (`.carte`).
 */
function boutonPar(hote: HTMLElement, titre: string): HTMLButtonElement | null {
  return [...laFiche(hote).querySelectorAll('button')]
    .find((b) => !b.closest('.carte') && (b.getAttribute('title') ?? '') === titre) as HTMLButtonElement | undefined ?? null;
}

async function ouvrir(cible: { service: string | null; id: string; nom: string }) {
  const h = poserLaCoquille();
  ficheArtisteService.set(cible as any);
  activeView.set('streamingartist');
  flushSync();
  await respirer();
  flushSync();
  return h;
}

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return reponsePour(String(url));
  }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('home');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  departSimilaires.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});


const boutonRetour = (h: HTMLElement) => h.querySelector('button.retour-similaires') as HTMLButtonElement | null;

describe('web#2299 — revenir aux similaires de l’artiste de départ', () => {
  it('similaire absent → Recherche → fiche de service → retour à la fiche de départ', async () => {
    const h = await ouvrir({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' });
    expect(boutonRetour(h), 'sur la fiche de départ, pas de bouton : les similaires sont là').toBeNull();

    const puce = [...h.querySelectorAll('.apropos button.puce')].find((b) => b.textContent === 'Burt Bacharach') as HTMLButtonElement;
    expect(puce, 'la puce du similaire n’est pas rendue').toBeTruthy();
    puce.click();
    await respirer();
    flushSync();

    expect(get(activeView)).toBe('search');
    const dansLaRecherche = boutonRetour(h);
    expect(dansLaRecherche, 'la Recherche n’offre aucun chemin vers les similaires de départ').not.toBeNull();
    expect(dansLaRecherche!.textContent).toContain('Dionne Warwick');

    // L'artiste trouvé chez le service, qu'on écoute.
    ficheArtisteService.set({ service: 'qobuz', id: 'q-42', nom: 'Leprous' } as any);
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();
    const surLaFiche = boutonRetour(h);
    expect(surLaFiche, 'la fiche de service n’offre aucun chemin vers les similaires de départ').not.toBeNull();

    surLaFiche!.click();
    flushSync();
    await respirer();
    flushSync();
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: String(ID_LOCAL) });
    expect(h.querySelector('.apropos')?.textContent).toContain('Burt Bacharach');
    expect(boutonRetour(h), 'revenu au départ, le bouton disparaît').toBeNull();
  });

  it('en enchaînant les voisins, le DÉPART reste ; la barre latérale abandonne le parcours', async () => {
    const { retenirDepartSimilaires } = await import('../retourAuxSimilaires');
    retenirDepartSimilaires({ id: String(ID_LOCAL), nom: 'Dionne Warwick', depuis: 'library' });
    expect(get(departSimilaires)?.id).toBe(String(ID_LOCAL));
    retenirDepartSimilaires({ id: '77', nom: 'Burt Bacharach', depuis: null });
    expect(get(departSimilaires)?.nom, 'le second voisin a écrasé le départ').toBe('Dionne Warwick');
    requestListReset();
    expect(get(departSimilaires)).toBeNull();
  });
});
