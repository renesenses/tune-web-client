// @vitest-environment jsdom
//
// Fil forum 2694 — Ilan (ancien utilisateur de Roon, client web dans Chrome) :
// « quand on revient en arrière, par exemple après avoir cliqué sur un
// artiste depuis un album, revenir à l'endroit précédent et non à la racine
// de Tidal ».
//
// Cause : changer de vue DÉTRUIT l'écran du service (`ShellV2`, `{#if}`). Le
// genre ouvert, la recherche dans le service, « Voir tout » et le défilement
// sont des `$state` locaux ; rien ne les rendait au Retour d'une page
// (`revenirA` empile une entrée neuve) ni au Précédent du navigateur (l'entrée
// ne porte que la vue, l'onglet et une clé). L'écran repartait de sa racine.
//
// Ces témoins MONTENT la vraie coquille et CLIQUENT : la fiche de l'album, le
// lien de l'artiste, le « < » de la page artiste, le Retour de la fiche, et le
// Précédent du navigateur (`history.back()`, attendu sur son `popstate`).
// Aucune lecture n'est lancée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, requestListReset, vueDeRetour } from '../stores/navigation';
import { activeStreamingService, ficheAlbumDeRetour, ficheAlbumService, ficheArtisteService } from '../stores/streaming';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { oublierMemoireStreaming, retenirAuDepart, reprendreAuRetour, type MemoireStreaming } from '../memoireStreaming';
import { t } from '../i18n';
import { reculer } from './reculer';
import { currentProfileId } from '../stores/profile';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Ilan' },
  tidal: { enabled: true, authenticated: true, username: 'Ilan' },
};
const album = (svc: string, id: string, titre: string) => ({
  source: svc, source_id: id, title: titre,
  artist_name: 'Artiste témoin', artist_id: 'a9', cover_path: null,
});
/** Assez de résultats pour que la page défile. */
const RESULTATS = Array.from({ length: 30 }, (_, i) => album('tidal', `r${i}`, `Résultat ${i}`));

let appels: { url: string; method: string }[] = [];
function corpsPour(url: string): unknown {
  const p = new URL(url, 'http://localhost');
  const c = p.pathname.replace(/^\/api\/v1/, '');
  if (c === '/streaming/services') return SERVICES;
  // Un profil : sans lui, la page à widgets ne charge rien (« Chargement… »).
  if (c === '/profiles') return [{ id: 1, name: 'Ilan', avatar_color: '#6366f1' }];
  if (c === '/streaming/tidal/genres' && !p.searchParams.get('parent_id')) return [{ id: 'pop', name: 'Pop' }, { id: 'rock', name: 'Rock' }];
  if (c === '/streaming/tidal/genres/pop/albums') return [album('tidal', 't1', 'Album Tidal')];
  // Sans identifiant d'artiste : le lien passe par une recherche, la vue change
  // APRÈS la réponse — la fiche a déjà quitté l'écran à cet instant.
  if (c === '/streaming/tidal/genres/rock/albums') return [{ ...album('tidal', 't2', 'Album Rock'), artist_id: null }];
  if (c === '/search') return { services: { tidal: { artists: [{ id: 'a9', name: 'Artiste témoin', source: 'tidal' }] } } };
  if (c === '/streaming/tidal/search') {
    return { albums: RESULTATS, artists: [], tracks: [], playlists: [], has_more: false };
  }
  if (c === '/streaming/qobuz/new-releases') return [album('qobuz', 'q1', 'Nouveauté Qobuz'), album('qobuz', 'q2', 'Autre nouveauté')];
  if (/^\/streaming\/\w+\/albums\/[^/]+\/tracks/.test(c)) return [];
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|featured|new-releases|mixes|sections)(\/|$|\?)/.test(c)) return [];
  return {};
}

let hote: HTMLDivElement;
let coquille: Record<string, any> | null = null;
const restaurerMiseEnPage: (() => void)[] = [];

async function laisserFaire(n = 80, jusqua?: () => boolean) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 2));
    flushSync();
    if (jusqua?.()) return;
  }
}

const boutons = (sel: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(sel));
const bouton = (sel: string, texte: string) => boutons(sel).find((b) => (b.textContent ?? '').trim() === texte) ?? null;
const filDeGenre = () => (document.querySelector('.v2-str .crumb .cur')?.textContent ?? '').trim();
const fiche = () => document.querySelector('.v2-detail');
const zoneDuService = () => document.querySelector<HTMLDivElement>('.v2-str > .scroll');
const champ = () => document.querySelector<HTMLInputElement>('.v2-str input[aria-label]');
const rechercheEnvoyees = () => appels.filter((a) => /\/streaming\/tidal\/search/.test(a.url)).length;

async function cliquer(sel: string, texte: string) {
  await laisserFaire(120, () => !!bouton(sel, texte));
  const b = bouton(sel, texte);
  expect(b, `bouton « ${texte} » (${sel}) absent`).not.toBeNull();
  b!.click();
  flushSync();
  await laisserFaire(10);
}

/** La barre latérale : `requestListReset`, le service, puis la vue (`allerService`). */
async function entrerPar(service: string) {
  coquille = mount(ShellV2, { target: hote });
  flushSync();
  await laisserFaire(10);
  requestListReset();
  activeStreamingService.set(service);
  activeView.set('streaming');
  flushSync();
  await laisserFaire(150, () => boutons('.v2-str nav.subs > button').length > 1);
}

async function ouvrirArtisteDepuisLaFiche() {
  await laisserFaire(80, () => !!document.querySelector('.v2-detail .artist.lien'));
  const lien = document.querySelector<HTMLButtonElement>('.v2-detail .artist.lien');
  expect(lien, 'le nom de l’artiste de la fiche doit être un lien').not.toBeNull();
  lien!.click();
  flushSync();
  await laisserFaire(80, () => get(activeView) === 'streamingartist');
  expect(get(activeView), 'le lien mène à la page de l’artiste').toBe('streamingartist');
}

async function retourDeLaPageArtiste() {
  await laisserFaire(80, () => !!document.querySelector('.v2-fas .retour'));
  const b = document.querySelector<HTMLButtonElement>('.v2-fas .retour');
  expect(b, 'la page artiste porte un bouton Retour').not.toBeNull();
  b!.click();
  flushSync();
  await laisserFaire(40);
}

async function retourDeLaFiche() {
  const b = document.querySelector<HTMLButtonElement>('.v2-detail button.close');
  expect(b, 'la fiche porte un bouton Retour').not.toBeNull();
  b!.click();
  flushSync();
  await laisserFaire(60);
}

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url: String(url), method: (init?.method ?? 'GET').toUpperCase() });
    if (/\/ext\/bandcamp\/tags/.test(String(url))) throw new Error('extension absente');
    const data = corpsPour(String(url));
    return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => data, text: async () => JSON.stringify(data) } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  // jsdom ne met pas en page : sans hauteur, aucune position ne se repose.
  for (const [prop, value] of [['scrollHeight', 12000], ['clientHeight', 600], ['clientWidth', 1400]] as const) {
    const avant = Object.getOwnPropertyDescriptor(Element.prototype, prop);
    Object.defineProperty(Element.prototype, prop, { configurable: true, get: () => value });
    restaurerMiseEnPage.push(() => { if (avant) Object.defineProperty(Element.prototype, prop, avant); else delete (Element.prototype as any)[prop]; });
  }
  localStorage.clear();
  // Sans profil, la page à widgets ne charge rien (« Chargement… »).
  currentProfileId.set(1);
  activeView.set('home');
  vueDeRetour.set(null);
  detailOuvert.set(null);
  ongletCourant.set(null);
  ficheAlbumService.set(null);
  ficheAlbumDeRetour.set(null);
  ficheArtisteService.set(null);
  oublierMemoireStreaming();
  history.replaceState(null, '', '/');
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (coquille) { try { await unmount(coquille); } catch { /* hors sujet */ } }
  coquille = null;
  hote.remove();
  document.body.innerHTML = '';
  while (restaurerMiseEnPage.length) restaurerMiseEnPage.pop()!();
  activeStreamingService.set(null as any);
  oublierMemoireStreaming();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Le Suivant du navigateur, attendu sur son `popstate` (comme `reculer`). */
function avancer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error('aucun popstate après history.forward()')), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
    history.forward();
  });
}

const lectures = () => appels.filter((a) => a.method !== 'GET' && /playback|queue|\/play\b|\/zones\//.test(a.url));

describe('fil 2694 — TIDAL › un genre › un album › son artiste › retour', () => {
  async function jusquALArtiste() {
    await entrerPar('tidal');
    await cliquer('.v2-str nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.v2-str .chips .chip', 'Pop');
    await cliquer('.v2-str button.ct', 'Album Tidal');
    await laisserFaire(40, () => !!fiche());
    expect(fiche(), 'la fiche de l’album doit s’ouvrir').not.toBeNull();
    await ouvrirArtisteDepuisLaFiche();
  }

  it('bouton Retour : la fiche de l’album, puis la page du genre (pas la racine de TIDAL)', async () => {
    await jusquALArtiste();
    await retourDeLaPageArtiste();
    expect(get(activeView), 'le « < » de la page artiste rouvre la fiche (web#1602)').toBe('streamingalbum');
    expect(fiche()?.textContent).toContain('Album Tidal');

    await retourDeLaFiche();
    await laisserFaire(150, () => filDeGenre() === 'Pop');
    expect(get(activeView)).toBe('streaming');
    expect(filDeGenre(), 'le Retour doit rendre le genre ouvert, pas la racine de TIDAL').toBe('Pop');
    expect(bouton('.v2-str button.ct', 'Album Tidal'), 'les albums du genre sont de nouveau là').not.toBeNull();
    expect(fiche(), 'la fiche déjà traversée ne se rouvre pas une seconde fois').toBeNull();
    expect(lectures(), 'naviguer ne lance aucune lecture').toEqual([]);
  });

  it('Précédent du navigateur : la fiche de l’album sur la page du genre, puis la page du genre', async () => {
    await jusquALArtiste();
    await reculer();
    await laisserFaire(150, () => filDeGenre() === 'Pop' && !!fiche());
    expect(get(activeView)).toBe('streaming');
    expect(filDeGenre(), 'le Précédent doit rendre le genre ouvert, pas la racine de TIDAL').toBe('Pop');
    expect(fiche()?.textContent, 'l’écran d’avant le clic était la fiche de l’album').toContain('Album Tidal');

    await reculer();
    await laisserFaire(60, () => !fiche());
    expect(get(activeView)).toBe('streaming');
    expect(fiche(), 'un second Précédent referme la fiche').toBeNull();
    expect(filDeGenre(), 'et laisse la page du genre').toBe('Pop');
    expect(lectures()).toEqual([]);
  });

  it('relecture #2926 : la fiche rouverte ne jette pas la page artiste — Suivant y retourne', async () => {
    await jusquALArtiste();
    const longueur = history.length;
    await reculer();
    await laisserFaire(150, () => filDeGenre() === 'Pop' && !!fiche());
    expect(history.length, 'la fiche rouverte n’empile aucune entrée').toBe(longueur);
    await avancer();
    await laisserFaire(80, () => get(activeView) === 'streamingartist');
    expect(get(activeView), 'Suivant ramène à la page de l’artiste').toBe('streamingartist');
    await reculer();
    await laisserFaire(150, () => filDeGenre() === 'Pop' && !!fiche());
    expect(fiche()?.textContent).toContain('Album Tidal');
    await reculer();
    await laisserFaire(60, () => !fiche());
    expect(get(activeView)).toBe('streaming');
    expect(fiche(), 'le Précédent suivant rend la page d’avant l’album').toBeNull();
    expect(filDeGenre()).toBe('Pop');
  });
});

describe('fil 2694 — l’artiste sans identifiant (résolu par une recherche)', () => {
  async function jusquALArtiste() {
    await entrerPar('tidal');
    await cliquer('.v2-str nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.v2-str .chips .chip', 'Rock');
    await cliquer('.v2-str button.ct', 'Album Rock');
    await laisserFaire(40, () => !!fiche());
    await ouvrirArtisteDepuisLaFiche();
  }
  it('bouton Retour › Retour : la page du genre', async () => {
    await jusquALArtiste();
    await retourDeLaPageArtiste();
    expect(get(activeView)).toBe('streamingalbum');
    await retourDeLaFiche();
    await laisserFaire(150, () => filDeGenre() === 'Rock');
    expect(filDeGenre()).toBe('Rock');
    expect(fiche()).toBeNull();
  });
  it('Précédent : la fiche sur la page du genre', async () => {
    await jusquALArtiste();
    await reculer();
    await laisserFaire(150, () => filDeGenre() === 'Rock' && !!fiche());
    expect(filDeGenre()).toBe('Rock');
    expect(fiche()?.textContent).toContain('Album Rock');
  });
});

describe('fil 2694 — recherche dans TIDAL › un album › retour', () => {
  async function chercher() {
    await entrerPar('tidal');
    const c = champ();
    expect(c, 'le champ de recherche du service').not.toBeNull();
    c!.value = 'beatles';
    c!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await laisserFaire(400, () => !!bouton('.v2-str button.ct', 'Résultat 29'));
    expect(bouton('.v2-str button.ct', 'Résultat 29'), 'les résultats de la recherche').not.toBeNull();
    zoneDuService()!.scrollTop = 900;
  }

  it('Retour de la fiche : résultats et position conservés', async () => {
    await chercher();
    const envoyees = rechercheEnvoyees();
    await cliquer('.v2-str button.ct', 'Résultat 12');
    await laisserFaire(40, () => !!fiche());
    await retourDeLaFiche();
    expect(fiche()).toBeNull();
    expect(champ()?.value).toBe('beatles');
    expect(bouton('.v2-str button.ct', 'Résultat 29')).not.toBeNull();
    expect(zoneDuService()?.scrollTop).toBe(900);
    expect(rechercheEnvoyees(), 'aucune recherche relancée').toBe(envoyees);
  });

  it('album › artiste › Retour › Retour : la recherche, ses résultats et la position', async () => {
    await chercher();
    const envoyees = rechercheEnvoyees();
    await cliquer('.v2-str button.ct', 'Résultat 12');
    await laisserFaire(40, () => !!fiche());
    await ouvrirArtisteDepuisLaFiche();
    await retourDeLaPageArtiste();
    await retourDeLaFiche();
    await laisserFaire(300, () => zoneDuService()?.scrollTop === 900);
    expect(get(activeView)).toBe('streaming');
    expect(champ()?.value, 'la saisie est rendue').toBe('beatles');
    expect(bouton('.v2-str button.ct', 'Résultat 29'), 'les résultats sont rendus').not.toBeNull();
    expect(zoneDuService()?.scrollTop, 'la position dans les résultats est rendue').toBe(900);
    expect(rechercheEnvoyees(), 'les résultats rendus sont ceux de la page quittée, sans nouvel appel').toBe(envoyees);
  });

  it('album › artiste › Précédent : les résultats et la position', async () => {
    await chercher();
    await cliquer('.v2-str button.ct', 'Résultat 12');
    await laisserFaire(40, () => !!fiche());
    await ouvrirArtisteDepuisLaFiche();
    await reculer();
    await laisserFaire(300, () => zoneDuService()?.scrollTop === 900 && !!fiche());
    expect(champ()?.value).toBe('beatles');
    expect(bouton('.v2-str button.ct', 'Résultat 29')).not.toBeNull();
    expect(zoneDuService()?.scrollTop).toBe(900);
    expect(fiche()?.textContent).toContain('Résultat 12');
  });
});

describe('relecture #2926 — la page n’est rendue que sur l’entrée quittée', () => {
  it('TIDAL racine → Bibliothèque → TIDAL recherche → Bibliothèque, Précédent ×3 : la racine reste la racine', async () => {
    await entrerPar('tidal');
    await laisserFaire(40);
    const racine = history.state;
    activeView.set('library'); flushSync(); await laisserFaire(20);
    requestListReset(); activeStreamingService.set('tidal'); activeView.set('streaming'); flushSync();
    await laisserFaire(150, () => !!champ());
    const c = champ()!;
    c.value = 'beatles';
    c.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await laisserFaire(400, () => !!bouton('.v2-str button.ct', 'Résultat 29'));
    activeView.set('library'); flushSync(); await laisserFaire(20);

    await reculer();
    await laisserFaire(300, () => champ()?.value === 'beatles' && !!bouton('.v2-str button.ct', 'Résultat 29'));
    expect(champ()?.value, 'Précédent rend la recherche quittée').toBe('beatles');
    await reculer();
    await laisserFaire(20);
    expect(get(activeView)).toBe('library');
    await reculer();
    await laisserFaire(150, () => !!champ());
    await laisserFaire(40);
    expect(get(activeView)).toBe('streaming');
    expect(champ()?.value, 'la racine de TIDAL ne montre pas la recherche d’une autre visite').toBe('');
    expect(bouton('.v2-str button.ct', 'Résultat 29')).toBeNull();
    expect(history.state, 'l’entrée atteinte n’est pas réécrite').toEqual(racine);
  });
});

describe('relecture #2926 — profil et compte', () => {
  const page = (): MemoireStreaming => ({
    active: 'tidal', sub: 'editorial', genrePath: [], subGenres: [], genreId: '',
    fiche: null, ficheService: null, ficheBc: null, fichePlaylist: null, defilement: 0,
    q: 'beatles', page: 'p1', compte: 'Ilan',
  });
  it('un changement de profil oublie la page retenue', () => {
    currentProfileId.set(1);
    retenirAuDepart('streamingartist', page());
    currentProfileId.set(2);
    expect(reprendreAuRetour('streamingartist', 'tidal', 'retour', { compte: 'Ilan' })).toBeNull();
  });
  it('un autre compte du service ne reprend rien', () => {
    retenirAuDepart('streamingartist', page());
    expect(reprendreAuRetour('streamingartist', 'tidal', 'retour', { compte: 'Autre' })).toBeNull();
    retenirAuDepart('streamingartist', page());
    expect(reprendreAuRetour('streamingartist', 'tidal', 'retour', { compte: 'Ilan' })?.q).toBe('beatles');
  });
  it('par l’historique, seulement sur l’entrée quittée', () => {
    retenirAuDepart('library', page());
    expect(reprendreAuRetour('library', 'tidal', 'historique', { page: 'p2', compte: 'Ilan' })).toBeNull();
    retenirAuDepart('library', page());
    expect(reprendreAuRetour('library', 'tidal', 'historique', { page: 'p1', compte: 'Ilan' })?.q).toBe('beatles');
  });
});

describe('fil 2694 — Qobuz › « Nouveautés » (Voir tout) › un album › retour', () => {
  const pageNouveautes = () => document.querySelector('.v2-str .voir-tout-page');
  async function ouvrirNouveautes() {
    await entrerPar('qobuz');
    const titre = get(t)('v2.svc.wNew' as any);
    await laisserFaire(200, () => !!document.querySelector(`.v2-str button.voir-tout[aria-label*="${titre}"]`));
    const vt = document.querySelector<HTMLButtonElement>(`.v2-str button.voir-tout[aria-label*="${titre}"]`);
    expect(vt, '« Voir tout » des nouveautés').not.toBeNull();
    vt!.click();
    flushSync();
    await laisserFaire(80, () => !!pageNouveautes()?.textContent?.includes('Nouveauté Qobuz'));
    expect(pageNouveautes(), 'la page des nouveautés').not.toBeNull();
  }
  const ouvrirAlbum = async () => {
    const b = Array.from(document.querySelectorAll<HTMLButtonElement>('.v2-str .voir-tout-page button.meta'))
      .find((x) => x.textContent?.includes('Nouveauté Qobuz'));
    expect(b, 'la carte de l’album dans les nouveautés').toBeDefined();
    b!.click();
    flushSync();
    await laisserFaire(40, () => !!fiche());
    expect(fiche()).not.toBeNull();
  };

  it('Retour de la fiche : les nouveautés', async () => {
    await ouvrirNouveautes();
    await ouvrirAlbum();
    await retourDeLaFiche();
    expect(fiche()).toBeNull();
    expect(pageNouveautes(), 'le Retour rend la page des nouveautés').not.toBeNull();
  });

  it('album › artiste › Retour › Retour : les nouveautés, pas l’éditorial', async () => {
    await ouvrirNouveautes();
    await ouvrirAlbum();
    await ouvrirArtisteDepuisLaFiche();
    await retourDeLaPageArtiste();
    expect(get(activeView)).toBe('streamingalbum');
    await retourDeLaFiche();
    await laisserFaire(200, () => !!pageNouveautes());
    expect(get(activeView)).toBe('streaming');
    expect(pageNouveautes(), 'le Retour rend la page des nouveautés').not.toBeNull();
    expect(fiche()).toBeNull();
  });

  it('album › artiste › Précédent › Précédent : la fiche sur les nouveautés, puis les nouveautés', async () => {
    await ouvrirNouveautes();
    await ouvrirAlbum();
    await ouvrirArtisteDepuisLaFiche();
    await reculer();
    await laisserFaire(200, () => !!pageNouveautes() && !!fiche());
    expect(pageNouveautes(), 'le Précédent rend la page des nouveautés').not.toBeNull();
    expect(fiche()?.textContent).toContain('Nouveauté Qobuz');
    await avancer();
    await laisserFaire(80, () => get(activeView) === 'streamingartist');
    expect(get(activeView), 'Suivant ramène à la page de l’artiste').toBe('streamingartist');
    await reculer();
    await laisserFaire(200, () => !!pageNouveautes() && !!fiche());
    expect(fiche()?.textContent).toContain('Nouveauté Qobuz');
    await reculer();
    await laisserFaire(60, () => !fiche());
    expect(fiche()).toBeNull();
    expect(pageNouveautes(), 'puis les nouveautés, sans la fiche').not.toBeNull();
  });

  it('#3843 tient : la barre latérale repart de la racine du service', async () => {
    await ouvrirNouveautes();
    await ouvrirAlbum();
    await ouvrirArtisteDepuisLaFiche();
    requestListReset();
    activeView.set('streaming');
    flushSync();
    await laisserFaire(150, () => boutons('.v2-str nav.subs > button').length > 1);
    await laisserFaire(30);
    expect(pageNouveautes(), 'une arrivée par la barre latérale n’est pas un retour').toBeNull();
    expect(fiche()).toBeNull();
  });
});
