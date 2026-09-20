// @vitest-environment jsdom
//
// RECHARGER UNE ROUTE PROFONDE NE DOIT PAS RETOMBER SUR L'ACCUEIL.
//
// Mesuré au navigateur par Bertrand le 18/09/2026, .18, v0.9.153 — pas d'issue,
// demande directe :
//
//   • `http://192.168.1.18:8888/#library` affiche la Bibliothèque, **F5**
//     ramène à l'Accueil ET réécrit l'adresse en `#home` ;
//   • aller directement sur une route qui n'existe pas réécrit aussi l'adresse
//     en `#home`, sans que rien ne le dise.
//
// Conséquence : aucun lien profond ne fonctionne. « Regarde cet écran » est
// impossible à envoyer, et un rechargement perd la place.
//
// 🔴 CE QUE CE TÉMOIN REFUSE DE FAIRE.
//
// Appeler `vueDepuisHash` et vérifier qu'elle rend `'library'` ne prouverait
// rien : la fonction peut être juste et n'être appelée par personne — le motif
// « écrit mais pas branché ». On pose donc le fragment dans l'adresse, on monte
// la VRAIE coquille, et on regarde l'écran qu'elle rend et l'adresse qu'elle
// laisse. Le témoin n'appelle jamais `activeView.set` pour naviguer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { detailOuvert } from '../historiqueCoquille';
import { estNomDeVue, nomDeRoute, vueDepuisHash, vuesRestaurables } from '../routeAuChargement';

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/**
 * LE CHRONOMÈTRE DOIT COUVRIR LE DÉCOR QUE LE CAS POSE — #1350, le mécanisme
 * de #1347 sur un autre banc.
 *
 * 🔴 Onze des quatorze cas de ce fichier montent `ShellV2` : la coquille v2
 * ENTIÈRE, ses douze routes lues au montage, `LibraryV2` et ses 2 200 lignes,
 * la grille d'albums, la barre de transport. C'est tout leur objet — le témoin
 * refuse d'appeler `vueDepuisHash` en vase clos, parce qu'une fonction juste
 * que personne n'appelle ne prouve rien (« écrit mais pas branché »).
 *
 * Ils gardaient pourtant les 5 000 ms PAR DÉFAUT de vitest, un budget taillé
 * pour un test unitaire. Le fichier entier passe de 340 ms sur un Mac à vide à
 * 6 à 12,4 s sous huit portes `npm test` simultanées sur Shrek (mesuré sur
 * 24 portes le 20/09/2026) : les cas les plus lourds s'approchent du budget, et
 * il suffit d'un cran de lenteur de plus pour qu'ils le franchissent.
 *
 * Reproduit de façon déterministe en gonflant le décor — `/library/albums`
 * rendant 2 500 albums au lieu d'un tableau vide :
 *
 *     × 🔴 et l’ADRESSE reste #library … 6868ms → Test timed out in 5000ms.
 *     × un DÉTAIL dans l’adresse repose au moins la vue … 7621ms → Test timed out in 5000ms.
 *
 * Ce n'est PAS un défaut de production : la coquille se monte en 20 à 95 ms par
 * cas dès que la machine n'est pas saturée. C'est le budget du cas qui était
 * faux. 60 s est l'usage du dépôt (`sortieMonoZone`, `viderLaFileNeCoupePas`,
 * `favorisDeFacette`).
 */
const DELAI_MONTAGE = 60_000;

const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/**
 * LE GESTE MESURÉ : l'adresse porte déjà le fragment quand l'application se
 * monte. C'est ce que fait un F5 sur `#library`, et c'est ce que fait un lien
 * collé dans la barre d'adresse.
 */
function chargerAvec(fragment: string): HTMLDivElement {
  history.replaceState(null, '', fragment === '' ? '/' : `/${fragment}`);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

const ecran = (el: HTMLElement) => ({
  bibliotheque: el.querySelector('.v2-lib'),
  accueil: el.querySelector('.v2-home'),
  playlists: el.querySelector('.v2-playlists'),
  zones: el.querySelector('.v2-zones'),
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  activeView.set('home');
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('la route de l’adresse survit au chargement', () => {
  it('🔴 charger sur #library rend la BIBLIOTHÈQUE, pas l’Accueil', { timeout: DELAI_MONTAGE }, () => {
    const el = chargerAvec('#library');

    expect(
      ecran(el).bibliotheque,
      'le chargement sur #library rend l’Accueil : le fragment est écrasé',
    ).not.toBeNull();
    expect(ecran(el).accueil, 'l’Accueil est rendu alors que l’adresse dit #library').toBeNull();
    expect(get(activeView)).toBe('library');
  });

  it('🔴 et l’ADRESSE reste #library — elle ne doit pas être réécrite en #home', { timeout: DELAI_MONTAGE }, () => {
    chargerAvec('#library');

    expect(
      location.hash,
      'l’ancrage de l’entrée d’historique réécrit l’adresse en #home sous les yeux ' +
        'de l’utilisateur : aucun lien profond ne survit',
    ).toBe('#library');
    expect(history.state, 'l’entrée ancrée ne porte pas la vue de l’adresse').toMatchObject({
      tune: 'v2', vue: 'library', detail: null,
    });
  });

  it('🔴 #playlists EXISTE — le signalement le croyait mort', { timeout: DELAI_MONTAGE }, () => {
    // Bertrand a relevé « ce nom de route n'existe pas » : le code dit le
    // contraire, `ShellV2` monte `PlaylistsV2` sur cette vue. Ce qui n'existait
    // pas, c'est la LECTURE du fragment.
    const el = chargerAvec('#playlists');

    expect(ecran(el).playlists, '#playlists ne rend pas l’écran des playlists').not.toBeNull();
    expect(location.hash).toBe('#playlists');
  });

  it('une route profonde quelconque tient aussi : #zonemanager', { timeout: DELAI_MONTAGE }, () => {
    const el = chargerAvec('#zonemanager');

    expect(ecran(el).zones, '#zonemanager ne rend pas le gestionnaire de zones').not.toBeNull();
    expect(location.hash).toBe('#zonemanager');
  });

  it('un DÉTAIL dans l’adresse repose au moins la vue : #library/artiste:12', { timeout: DELAI_MONTAGE }, () => {
    // Rouvrir la fiche demanderait de recharger l'artiste par l'API — limite
    // assumée, identique à celle de `historiqueCoquille`. Mais retomber sur
    // l'Accueil parce qu'il y a un détail serait pire que de ne rien faire.
    const el = chargerAvec('#library/artiste:12');

    expect(ecran(el).bibliotheque, 'un détail dans l’adresse fait perdre la vue').not.toBeNull();
    expect(location.hash, 'l’adresse est normalisée sur la vue reposée').toBe('#library');
  });
});

describe('une route INCONNUE ne laisse pas l’utilisateur perdu', () => {
  it('🔴 elle retombe sur l’Accueil, mais en le DISANT à la console', { timeout: DELAI_MONTAGE }, () => {
    const dit = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = chargerAvec('#nimportequoi');

    expect(ecran(el).accueil, 'une route inconnue ne rend pas l’Accueil').not.toBeNull();
    expect(
      location.hash,
      'l’adresse garde un nom de route qui ne mène nulle part : l’écran contredit ' +
        'la barre d’adresse',
    ).toBe('#home');
    expect(dit, 'la route inconnue part en SILENCE — le second constat du signalement')
      .toHaveBeenCalled();
    const message = String(dit.mock.calls[0]?.[0] ?? '');
    expect(message, 'la console ne nomme pas la route fautive').toContain('nimportequoi');
    expect(message, 'la console ne dit pas quelles routes existent').toContain('library');
  });

  it('une vue qui existe mais n’est pas une destination ne se repose pas : #login', { timeout: DELAI_MONTAGE }, () => {
    const el = chargerAvec('#login');

    expect(ecran(el).accueil, '#login a reposé un écran qu’on ne demande pas').not.toBeNull();
    expect(location.hash).toBe('#home');
  });

  it('une adresse de FICHE que Tune écrit lui-même ne crie pas « inconnue »', () => {
    // `App.svelte` donne à la fiche d'un album sa propre adresse (`#album/42`).
    // La traiter en route inconnue reviendrait à hurler sur une adresse que
    // l'application a écrite. On repose l'écran qui la porte ; la fiche
    // elle-même demanderait de recharger l'album par l'API.
    const dit = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(vueDepuisHash('#album/42')).toBe('library');
    expect(vueDepuisHash('#artist/12')).toBe('library');
    expect(dit, 'une adresse de fiche est prise pour une route inconnue').not.toHaveBeenCalled();
  });

  it('#tv garde son chemin à part : ce lot ne le repose pas', () => {
    // `App.svelte` le lit déjà, avec sa zone (`#tv&zone=12`). Un second
    // mécanisme ici perdrait la zone.
    expect(vueDepuisHash('#tv')).toBeNull();
    expect(vueDepuisHash('#tv&zone=12')).toBeNull();
    expect(nomDeRoute('#tv&zone=12'), 'le nom est bien reconnu, c’est le REPOS qui est refusé')
      .toBe('tv');
    expect(estNomDeVue('tv')).toBe(true);
  });
});

describe('AUCUNE boucle, AUCUNE entrée de plus', () => {
  it('le chargement sur #library n’empile rien : il ancre, comme avant', { timeout: DELAI_MONTAGE }, () => {
    // Le piège nommé : une restauration qui `pushState` au chargement mettrait
    // une entrée de plus sous le doigt de l'utilisateur, et le premier Précédent
    // ne bougerait pas de l'écran.
    history.replaceState(null, '', '/#library');
    const avant = history.length;

    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ShellV2, { target: hote });
    flushSync();

    expect(history.length, 'le chargement a EMPILÉ une entrée au lieu de l’ancrer').toBe(avant);
  });

  it('dix passes réactives après le chargement ne bougent pas la pile', { timeout: DELAI_MONTAGE }, async () => {
    chargerAvec('#library');
    const hauteur = history.length;
    const adresse = location.hash;

    // Si la restauration vivait dans un effet réactif, chaque passe en
    // rajouterait une : la pile enflerait et le Précédent deviendrait inerte.
    for (let i = 0; i < 10; i++) {
      flushSync();
      await attendre(5);
    }
    flushSync();

    expect(history.length, 'la pile a enflé après le chargement : il y a une boucle')
      .toBe(hauteur);
    expect(location.hash, 'l’adresse a bougé toute seule après le chargement').toBe(adresse);
  });

  it('naviguer APRÈS un chargement profond empile normalement — une seule fois', { timeout: DELAI_MONTAGE }, () => {
    chargerAvec('#library');
    const hauteur = history.length;

    activeView.set('queue');
    flushSync();

    expect(history.length, 'la navigation qui suit un chargement profond n’empile plus ' +
      '(ou empile deux fois)').toBe(hauteur + 1);
    expect(location.hash).toBe('#queue');
  });

  it('un chargement SANS fragment se comporte exactement comme avant', { timeout: DELAI_MONTAGE }, () => {
    const el = chargerAvec('');

    expect(ecran(el).accueil).not.toBeNull();
    expect(location.hash).toBe('#home');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'home', detail: null });
  });
});

describe('la liste des routes vient du CODE, pas d’un relevé d’écran', () => {
  it('elle contient les noms relevés au navigateur, et pas les états internes', () => {
    const routes = vuesRestaurables();

    for (const attendue of ['library', 'home', 'search', 'streaming', 'favorites',
      'zonemanager', 'playlistmanager', 'playlists']) {
      expect(routes, `« ${attendue} » manque à la liste des routes`).toContain(attendue);
    }
    for (const exclue of ['tv', 'login', 'offline', 'onboarding',
      'streamingalbum', 'streamingartist']) {
      expect(routes, `« ${exclue} » n’est pas une destination et ne doit pas se reposer`)
        .not.toContain(exclue);
    }
  });
});
