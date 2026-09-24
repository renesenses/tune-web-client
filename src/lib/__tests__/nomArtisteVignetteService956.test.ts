// @vitest-environment jsdom
//
// renesenses/tune-web-client#956 — **POINT 1 DE SANDRO**, fil 1769 (12/09/2026,
// v0.9.147, puis reconfirmé en 0.9.150) :
//
//   1. « Je cherche un artiste (ex: "Leprous") sur Qobuz. L'interface affiche
//      une grille d'albums. À ce stade, **le nom de l'artiste sous les
//      pochettes n'est pas cliquable**. »
//   2. « Je clique sur une pochette pour ouvrir un album. »
//   3. « Dans la description de l'album, je clique sur le nom "Leprous" […] »
//   4. « Le bug : […] l'interface tourne en boucle et me renvoie simplement
//      sur la grille des résultats de recherche du début. »
//
// ── CE QUI ÉTAIT DÉJÀ FAIT, ET QUI N'EST PAS REJOUÉ ICI ───────────────────
//
// Les points 2 à 4 — le lien de la FICHE d'album — sont corrigés et gardés
// ailleurs :
//
//   • `a7227649` (v0.9.159, `Refs #956`) : `artist_id` voyage de bout en bout
//     dans les fabriques d'album de service — témoin
//     `artisteAlbumDeService1361b.test.ts` ;
//   • `52695876` : le repli vers la recherche DIT pourquoi, et le `catch`
//     laisse une trace — témoin `repliArtisteService956.test.ts` ;
//   • `e3a5b5d1` (PR #1489, dans v0.9.163) : l'éditorial Qobuz, la clé
//     `__bandcamp__` et le recul d'historique — témoin
//     `lienArtisteAlbumService1486.test.ts`.
//
// ── CE QUI RESTAIT DEHORS, ET QUE CE TÉMOIN MESURE ────────────────────────
//
// Le POINT 1. Le triage du 20/09 l'écrit noir sur blanc dans le ticket :
// « le nom de l'artiste sous les pochettes n'est pas cliquable dans la grille
// de recherche — un second défaut, distinct, et rien dans la .159 ne le
// touche ». Rien dans la .162 ni la .163 non plus : le gabarit `tile` de
// `StreamingV2` rendait cette deuxième ligne en `<span class="ca">` inerte,
// pour TOUTES les grilles de l'écran Streaming (recherche, éditorial, genres,
// favoris, Bandcamp).
//
// Conséquence, et c'est le coût que Sandro décrit : la fiche d'album était le
// SEUL chemin vers un artiste de service. Chaque défaut de ce chemin le
// renvoyait à son point de départ, sans autre porte.
//
// Ce témoin MONTE l'écran (vrais `ShellV2`, `StreamingV2`, fiche artiste et
// retour), CLIQUE la ligne, et lit **où le geste mène** — la cible posée, la
// vue, et les requêtes réellement émises. Seules les frontières réseau sont
// simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { activeStreamingService, ficheArtisteService, streamingServices } from '../stores/streaming';
import { artisteDeVignetteService } from '../ouvrirArtisteDepuis';
import { tuneWS } from '../websocket';

const ZONE = { id: 1, name: 'Témoin', output_type: 'local', state: 'stopped', volume: 50 };

/** Ce que la recherche du service rend — rempli par chaque cas. */
let resultats: any = { artists: [], albums: [], tracks: [], playlists: [], has_more: false };
/** Ce que la recherche FÉDÉRÉE rend, par clé de service. */
let federee: Record<string, any> = {};
let requetes: string[] = [];
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

class SocketTemoin {
  readyState = 1;
  send() {} close() {} addEventListener() {} removeEventListener() {}
}

function repondre(adresse: string): Response {
  const url = new URL(adresse, 'http://localhost');
  const p = url.pathname;
  let corps: any = {};
  let status = 200;
  if (p.endsWith('/ext/bandcamp/tags')) status = 404;
  else if (p.endsWith('/streaming/services')) corps = { qobuz: { enabled: true, authenticated: true } };
  else if (/\/streaming\/[^/]+\/search$/.test(p)) corps = resultats;
  else if (/\/streaming\/[^/]+\/artists\/[^/]+$/.test(p)) corps = { id: p.split('/').at(-1), name: 'Fiche chargée par HTTP', bio: '' };
  else if (/\/streaming\//.test(p)) corps = [];
  else if (/\/search$/.test(p)) corps = { artists: [], albums: [], tracks: [], services: federee };
  else if (/\/queue/.test(p)) corps = { tracks: [], position: 0, length: 0 };
  else if (p.endsWith('/zones')) corps = [ZONE];
  else if (/\/zones\/\d+$/.test(p)) corps = ZONE;
  else if (/\/(profiles|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|tracks|albums|top-artists|recent|genres)(\/|$)/.test(p)) corps = [];
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Streaming ▸ Qobuz ▸ recherche « leprous » — le parcours exact de Sandro. */
async function chercher(q = 'leprous') {
  hote = document.createElement('div');
  document.body.append(hote);
  composant = mount(ShellV2, { target: hote });
  flushSync();
  await vi.waitFor(() => expect(hote.querySelector('.v2-str .v2-rech input')).not.toBeNull());
  const champ = hote.querySelector('.v2-str .v2-rech input') as HTMLInputElement;
  champ.value = q;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await vi.waitFor(() => expect(hote.querySelectorAll('.v2-str .card').length).toBeGreaterThan(0));
}

const lignesSecondaires = () => [...hote.querySelectorAll<HTMLElement>('.v2-str .card .ca')];

beforeEach(() => {
  requetes = [];
  federee = {};
  resultats = { artists: [], albums: [], tracks: [], playlists: [], has_more: false };
  localStorage.clear();
  activeView.set('streaming');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  activeStreamingService.set('qobuz');
  streamingServices.set({});
  vi.stubGlobal('WebSocket', SocketTemoin);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { requetes.push(String(url)); return repondre(String(url)); }));
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  tuneWS.disconnect();
  hote?.remove();
  vi.unstubAllGlobals();
});

describe('#956 point 1 — le nom sous la pochette MÈNE à la fiche de l’artiste', () => {
  it('Qobuz, « Leprous » : le clic ouvre la fiche par IDENTIFIANT, sans recherche fédérée', async () => {
    // `StreamAlbum` porte `artist_id` (l'identifiant CHEZ le service,
    // `tune-core/src/streaming/traits.rs:75`), et la recherche Qobuz le
    // remplit (`qobuz.rs:1355`, `item["artist"]["id"]`).
    resultats.albums = [
      { source_id: 'a1', title: 'Pitfalls', artist_name: 'Leprous', artist_id: '610403', year: 2019 },
    ];
    await chercher();

    const ligne = lignesSecondaires()[0];
    expect(ligne?.textContent, 'la deuxième ligne ne porte pas le nom de l’artiste').toBe('Leprous');
    expect(ligne?.tagName, '#956 point 1 : le nom sous la pochette n’est pas cliquable').toBe('BUTTON');

    (ligne as HTMLButtonElement).click();
    flushSync();

    await vi.waitFor(() => expect(hote.querySelector('.v2-fas h1')?.textContent).toBe('Fiche chargée par HTTP'));
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '610403', nom: 'Leprous' });
    expect(get(activeView)).toBe('streamingartist');
    // 🔴 CE QUI FAISAIT « tourner en boucle » : le geste ne repart PAS en
    // recherche fédérée quand l'identifiant est déjà là.
    expect(requetes.some((u) => /\/api\/v1\/search\?/.test(u)), 'une recherche fédérée est partie').toBe(false);
    expect(requetes).toContain('/api/v1/streaming/qobuz/artists/610403');

    // #3824 — le Retour ramène à l'écran d'où l'on vient, pas ailleurs.
    expect(get(vueDeRetour)).toBe('streaming');
    (hote.querySelector('.v2-fas button.retour') as HTMLButtonElement).click();
    flushSync();
    await vi.waitFor(() => expect(get(activeView)).toBe('streaming'));
  });

  it('sans `artist_id`, le nom est résolu CHEZ LE SERVICE et la fiche s’ouvre quand même', async () => {
    resultats.albums = [{ source_id: 'a2', title: 'Aphelion', artist_name: 'Leprous' }];
    federee = { qobuz: { artists: [{ id: '610403', name: 'Leprous' }], albums: [], tracks: [] } };
    await chercher();

    const ligne = lignesSecondaires()[0] as HTMLButtonElement;
    expect(ligne.tagName).toBe('BUTTON');
    ligne.click();
    flushSync();

    await vi.waitFor(() => expect(get(activeView)).toBe('streamingartist'));
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '610403', nom: 'Leprous' });
    expect(requetes.some((u) => /\/api\/v1\/search\?.*sources=qobuz/.test(u))).toBe(true);
  });

  it('la deuxième ligne d’une PLAYLIST — un NOMBRE de titres — reste inerte', async () => {
    // Un lien sur « 12 titres » chercherait un artiste nommé « 12 titres ».
    resultats.playlists = [{ source_id: 'p1', name: 'Rock du moment', track_count: 12 }];
    await chercher();

    const ligne = lignesSecondaires()[0];
    expect(ligne, 'la playlist n’affiche plus son nombre de titres').not.toBeUndefined();
    expect(ligne.tagName, 'le nombre de titres est devenu un lien').toBe('SPAN');
  });

  it('un album sans nom d’artiste garde du texte, jamais un lien mort', async () => {
    resultats.albums = [{ source_id: 'a3', title: 'Sans artiste', track_count: 3 }];
    await chercher();
    const ligne = lignesSecondaires()[0];
    expect(ligne?.tagName).toBe('SPAN');
  });
});

// La règle, prise à part : elle décide DE QUOI on fait un lien, et c'est elle
// qui empêche « 12 titres » d'en devenir un.
describe('#956 — `artisteDeVignetteService` : ce qui fabrique une cible, et ce qui n’en fabrique pas', () => {
  it('un album de service avec identifiant rend la cible complète', () => {
    expect(artisteDeVignetteService({ artist_name: 'Leprous', artist_id: '610403' }, 'album', 'qobuz'))
      .toEqual({ service: 'qobuz', nom: 'Leprous', id: '610403' });
  });

  it('la source portée par l’objet l’emporte sur l’onglet actif', () => {
    expect(artisteDeVignetteService({ artist_name: 'Agnes Obel', source: '__bandcamp__' }, 'album', 'qobuz'))
      .toEqual({ service: '__bandcamp__', nom: 'Agnes Obel', id: null });
  });

  it('une piste porte aussi son artiste', () => {
    expect(artisteDeVignetteService({ artist: 'Leprous' }, 'track', 'qobuz'))
      .toEqual({ service: 'qobuz', nom: 'Leprous', id: null });
  });

  it.each([
    ['une playlist', { artist_name: 'Leprous' }, 'playlist'],
    ['un artiste', { artist_name: 'Leprous' }, 'artist'],
    ['un type absent', { artist_name: 'Leprous' }, null],
  ] as const)('%s ne fabrique aucune cible', (_q, p, type) => {
    expect(artisteDeVignetteService(p, type, 'qobuz')).toBeNull();
  });

  it.each([
    ['nom absent', {}],
    ['nom blanc', { artist_name: '   ' }],
    ['nom d’un autre type', { artist_name: { valeur: 1 } }],
  ] as const)('album, %s : aucune cible', (_q, p) => {
    expect(artisteDeVignetteService(p, 'album', 'qobuz')).toBeNull();
  });

  it.each([
    ['service absent', undefined],
    ['service blanc', '  '],
  ] as const)('album, %s : aucune cible', (_q, svc) => {
    expect(artisteDeVignetteService({ artist_name: 'Leprous' }, 'album', svc as any)).toBeNull();
  });

  it('un identifiant blanc ou d’un autre type n’est pas une route — garde de #1178', () => {
    expect(artisteDeVignetteService({ artist_name: 'Leprous', artist_id: '  ' }, 'album', 'qobuz')?.id).toBeNull();
    expect(artisteDeVignetteService({ artist_name: 'Leprous', artist_id: { v: 1 } }, 'album', 'qobuz')?.id).toBeNull();
    // `0` EST un identifiant, et `!0` est vrai : le piège de #1178.
    expect(artisteDeVignetteService({ artist_name: 'Leprous', artist_id: 0 }, 'album', 'qobuz')?.id).toBe('0');
  });
});
