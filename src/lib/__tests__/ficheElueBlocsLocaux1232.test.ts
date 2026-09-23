// @vitest-environment jsdom
//
// #1232 — ÉTAPE 2 : les CINQ BLOCS qui n'existaient que dans `ArtistesV2` sont
// portés sur la fiche élue.
//
// L'inventaire de #1478 (`docs/mesures/1232-qui-ouvre-quelle-fiche-artiste.md`)
// les a chiffrés, une fois déduites les trois briques déjà communes
// (`EnTeteArtiste`, `BioEtTitresPhares`, `DiscographieCommune`) :
//
//   1. édition du nom et de la fiche (`ArtistEditModal`) ;
//   2. étiquettes (`EtiquettesPanneau`) ;
//   3. enrichissement et biographie distante ;
//   4. « À propos » — similaires, membres, instruments joués ;
//   5. signalement (`ReportButton`).
//
// À la fin de cette étape, et pas avant, les deux fiches sont équivalentes —
// c'est ce qui autorisera l'étape 3 à faire converger le routage.
//
// 🔴 DEUX MOITIÉS, ET IL EN FAUT DEUX.
//
// La première vérifie que les blocs SONT là sur un artiste local. La seconde
// vérifie qu'ils n'apparaissent PAS sur une fiche de service — la seule que le
// testeur atteint aujourd'hui, et qui ne doit rien montrer de neuf tant que
// l'étape 3 n'est pas faite. Sans elle, conditionner les blocs à `artisteLocal`
// (que la fiche de service résout déjà par le nom, #1356) serait resté vert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
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
function boutonPar(hote: HTMLElement, titre: string): HTMLButtonElement | null {
  return [...laFiche(hote).querySelectorAll('button')]
    .find((b) => (b.getAttribute('title') ?? '') === titre) as HTMLButtonElement | undefined ?? null;
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
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1232 étape 2 — les cinq blocs sur la fiche élue', () => {
  it('« À propos » : similaires, membres et instruments joués', async () => {
    const hote = await ouvrir({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' });

    expect(urls.some((u) => u.includes(`/library/artists/${ID_LOCAL}/metadata`))).toBe(true);
    expect(urls.some((u) => u.includes(`/library/artists/${ID_LOCAL}/credits`))).toBe(true);

    const apropos = hote.querySelector('.apropos');
    expect(apropos).not.toBeNull();
    expect(apropos!.textContent).toContain('Burt Bacharach');
    expect(apropos!.textContent).toContain('Dee Dee Warwick');
    expect(apropos!.textContent).toContain('Vibraphone');
  });

  it("édition, étiquettes, enrichissement et signalement sont offerts", async () => {
    const hote = await ouvrir({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' });

    // 1 — l'éditeur COMPLET de la fiche (nom, tri, bio, image téléversée).
    expect(boutonPar(hote, libelle('library.editArtist'))).not.toBeNull();
    // 2 — les étiquettes, le geste que la vignette avait et que la fiche n'a
    //     jamais eu de ce côté-ci.
    const etiquettes = boutonPar(hote, libelle('v2.cover.tags'));
    expect(etiquettes).not.toBeNull();
    expect(etiquettes!.getAttribute('aria-haspopup')).toBe('dialog');
    // 3 — l'enrichissement, RENDU DANS LE BLOC DE LA BIOGRAPHIE (#1356) et non
    //     flottant au milieu de la fiche.
    const reEnrichir = libelle('library.reEnrich');
    const enrichir = [...laFiche(hote).querySelectorAll('button')].find((b) => b.textContent?.trim() === reEnrichir);
    expect(enrichir, 'le bouton d’enrichissement manque').not.toBeUndefined();
    // 5 — le signalement : deux entités, l'image (elle existe ici) et la bio.
    expect(hote.textContent).toContain(ARTISTE_LOCAL.bio);
  });

  it('ouvre bien l’éditeur quand on clique « Modifier »', async () => {
    const hote = await ouvrir({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' });
    boutonPar(hote, libelle('library.editArtist'))!.click();
    flushSync();
    await respirer(30);
    flushSync();
    // Une modale ouverte sur CET artiste : son nom de tri n'est affiché nulle
    // part ailleurs dans la fiche.
    const champs = [...document.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value);
    expect(champs).toContain('Warwick, Dionne');
  });

  it("n'ajoute RIEN à la fiche d'un artiste de SERVICE", async () => {
    const hote = await ouvrir({ service: 'qobuz', id: 'q-42', nom: 'Leprous' });

    expect(hote.textContent).toContain('Leprous');
    // Aucun bloc local : cette fiche est la seule que le testeur atteint
    // aujourd'hui, et l'étape 2 ne doit rien lui montrer de neuf.
    expect(hote.querySelector('.apropos')).toBeNull();
    expect(boutonPar(hote, libelle('library.editArtist'))).toBeNull();
    expect(boutonPar(hote, libelle('v2.cover.tags'))).toBeNull();
    // Et surtout : pas d'appel aux routes de métadonnées locales.
    expect(urls.filter((u) => u.includes('/metadata') || u.includes('/credits'))).toEqual([]);
  });
});
