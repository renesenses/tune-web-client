// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { libraryFolderScope } from '../stores/library';
import { currentZoneId } from '../stores/zones';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';

const { jouer } = vi.hoisted(() => ({ jouer: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../stores/zones', async (original) => ({ ...await original<any>(), playAndSync: jouer }));

const DOSSIER = '/Musique/Été_100%';
const ARTISTE = { id: 7, name: 'Artiste du dossier', album_count: 2, image_path: null, bio: null };
const DEDANS = { id: 10, title: 'Album du dossier', artist_id: 7, artist_name: ARTISTE.name, source: 'local', year: 2020 };
const DEHORS = { ...DEDANS, id: 99, title: 'Album ailleurs' };
const PISTES = [1,2].map((id) => ({ id, title: `Piste ${id}`, album_id: 10, artist_id: 7, artist_name: ARTISTE.name, source: 'local', duration_ms: 30000 }));
const COLLECTIONS = /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;
let urls: URL[] = [];
let capacites: unknown = { bibliotheque: { artiste_par_dossier: true } };
let panneCapacites = false;
let hote: HTMLDivElement;
let instance: ReturnType<typeof mount> | null = null;
function reponse(v: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type','application/json']]), json: async () => v, text: async () => JSON.stringify(v) } as unknown as Response;
}
function contenu(u: URL): unknown {
  if (u.pathname.endsWith('/system/capabilities')) {
    if (panneCapacites) throw new Error('serveur ancien : route absente');
    return capacites;
  }
  if (u.pathname.endsWith('/library/artists/7/albums')) return { albums: u.searchParams.get('folder') === DOSSIER ? [DEDANS] : [DEDANS,DEHORS] };
  if (u.pathname.endsWith('/library/artists/7/tracks')) return u.searchParams.get('folder') === DOSSIER ? PISTES : [...PISTES,{ ...PISTES[0], id: 99, album_id: 99 }];
  if (/\/library\/artists\/7\/bio$/.test(u.pathname)) return { bio: null };
  if (/\/library\/artists\/7\/(metadata|credits)$/.test(u.pathname)) return u.pathname.endsWith('metadata') ? {} : [];
  if (u.pathname.endsWith('/library/artists/7')) return ARTISTE;
  if (u.pathname.endsWith('/library/artists')) return [ARTISTE];
  if (u.pathname.endsWith('/streaming/services')) return {};
  return COLLECTIONS.test(u.pathname) ? [] : {};
}
async function attendre(condition: () => void) {
  await vi.waitFor(() => { flushSync(); condition(); }, { timeout: 8000, interval: 20 });
}
beforeEach(() => {
  urls = []; jouer.mockClear();
  capacites = { bibliotheque: { artiste_par_dossier: true } }; panneCapacites = false;
  vi.stubGlobal('fetch', vi.fn(async (input: any) => { const u = new URL(String(input), 'http://localhost'); urls.push(u); return reponse(contenu(u)); }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  activeView.set('library'); vueDeRetour.set('library'); ficheArtisteService.set(null); streamingServices.set({} as any);
  currentZoneId.set(1); libraryFolderScope.set(DOSSIER);
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(async () => {
  if (instance) await unmount(instance); instance = null;
  hote.remove(); ficheArtisteService.set(null); libraryFolderScope.set(null); currentZoneId.set(null); activeView.set('home'); vueDeRetour.set(null);
  vi.unstubAllGlobals();
});
async function monterFiche() {
  instance = mount(ArtisteServiceV2, { target: hote });
  await attendre(() => expect(hote.textContent).toContain(DEDANS.title));
}
it('transmet le dossier de la grille à la fiche et permet de le retirer (#3021)', async () => {
  instance = mount(ArtistesV2, { target: hote, props: { q: '', idsPortee: new Set([7]), nomPortee: 'Été_100%' } });
  await attendre(() => expect(hote.querySelector('.grille.artistes .carte')).not.toBeNull());
  (hote.querySelector('.grille.artistes .carte button.meta') as HTMLButtonElement).click();
  await attendre(() => expect(get(activeView)).toBe('streamingartist'));
  expect(get(ficheArtisteService)?.dossier, 'le clic sur l’artiste doit conserver le dossier').toBe(DOSSIER);
  await unmount(instance); instance = null;
  await monterFiche();
  expect(urls.filter((u) => u.pathname.endsWith('/7/albums')).at(-1)?.searchParams.get('folder')).toBe(DOSSIER);
  expect(hote.textContent).not.toContain(DEHORS.title);
  const puce = hote.querySelector<HTMLButtonElement>('[data-dossier-artiste]');
  expect(puce?.textContent).toContain('Été_100%');
  puce!.click();
  await attendre(() => expect(hote.textContent).toContain(DEHORS.title));
  expect(hote.querySelector('[data-dossier-artiste]')).toBeNull();
  expect(urls.filter((u) => u.pathname.endsWith('/7/albums')).at(-1)?.searchParams.has('folder')).toBe(false);
});
it.each(['Lire','Toutes les pistes','Aléatoire'])('%s reste dans les pistes du dossier (#3021)', async (geste) => {
  ficheArtisteService.set({ service: null, id: '7', nom: ARTISTE.name, dossier: DOSSIER });
  await monterFiche();
  if (geste === 'Aléatoire') {
    hote.querySelector<HTMLButtonElement>('[data-lecture-options]')!.click();
    await attendre(() => expect(document.querySelector('[data-aleatoire-artiste]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('[data-aleatoire-artiste]')!.click();
  } else {
    hote.querySelector<HTMLButtonElement>(geste === 'Lire' ? '[data-lecture-principale]' : '[data-toutes-pistes-artiste]')!.click();
  }
  await attendre(() => expect(jouer).toHaveBeenCalledTimes(1));
  const corps = (jouer.mock.calls[0] as any[])[1];
  expect(corps.artist_id, 'aucun tirage non filtré sur tout l’artiste').toBeUndefined();
  expect([...corps.track_ids].sort()).toEqual([1,2]);
  expect(corps.context_type).toBe('artist');
  expect(urls.find((u) => u.pathname.endsWith('/7/tracks'))?.searchParams.get('folder')).toBe(DOSSIER);
});
it('une ouverture depuis la recherche ne reprend pas le dossier de la grille (#3021)', async () => {
  await ouvrirArtisteDepuis({ id: 7, name: ARTISTE.name, source: 'local' }, 'search');
  expect(get(ficheArtisteService)?.dossier).toBeUndefined();
});

it.each(['absente', 'fausse', 'route absente'])('ne promet pas de dossier si la capacité est %s (#3021)', async (cas) => {
  capacites = cas === 'fausse' ? { bibliotheque: { artiste_par_dossier: false } } : {};
  panneCapacites = cas === 'route absente';
  ficheArtisteService.set({ service: null, id: '7', nom: ARTISTE.name, dossier: DOSSIER });
  await monterFiche();
  expect(hote.querySelector('[data-dossier-artiste]'), 'un serveur sans capacité ne doit pas annoncer une portée').toBeNull();
  expect(hote.textContent).toContain(DEHORS.title);
  expect(urls.filter((u) => u.pathname.endsWith('/7/albums')).at(-1)?.searchParams.has('folder')).toBe(false);
  hote.querySelector<HTMLButtonElement>('[data-toutes-pistes-artiste]')!.click();
  await attendre(() => expect(jouer).toHaveBeenCalledTimes(1));
  expect(urls.find((u) => u.pathname.endsWith('/7/tracks'))?.searchParams.has('folder')).toBe(false);
});

it('retire la portée locale en passant à une fiche de service (#3021)', async () => {
  ficheArtisteService.set({ service: null, id: '7', nom: ARTISTE.name, dossier: DOSSIER });
  await monterFiche();
  expect(hote.querySelector('[data-dossier-artiste]')).not.toBeNull();
  ficheArtisteService.set({ service: 'qobuz', id: '42', nom: 'Artiste Qobuz' });
  flushSync();
  expect(hote.querySelector('[data-dossier-artiste]'), 'le dossier local ne doit pas survivre sur une fiche de service').toBeNull();
});
