// @vitest-environment jsdom
//
// « Recherche du nouveau client : un artiste de SERVICE n'a pas de fiche — le
// clic relance la recherche » — renesenses/tune-server-rust#3825, d'après
// FabienM (fils forum 1726 et 1749, 08-10/09/2026) :
//
//   « Menu recherche: si je cherche un artiste, on me propose une liste
//     d'artistes. Si je clique sur un artiste je m'attends à aller à la page
//     de l'artiste sauf que ça renvoie sur la page recherche avec des
//     résultats incohérents avec l'artiste sélectionnée »
//
// Ce n'était pas un lien cassé. `SearchV2.ouvrirArtiste` se terminait par
// `if (!estLocal(ar)) { q = ar.name; return; }`, et son commentaire l'assumait :
// « Seul un artiste LOCAL a une fiche ». L'ÉCRAN D'ARRIVÉE manquait.
//
// Le serveur savait déjà tout faire — trois routes, six services
// (`tune-streaming-http/src/lib.rs:313-320`). Deux avaient leur enveloppe
// cliente sans aucun consommateur v2 ; `top-tracks` n'avait pas d'enveloppe.
//
// 🔴 CE TÉMOIN APPELLE, IL NE LIT PAS LE SOURCE.
//
// `coquilleV2Branchee.test.ts` dit lui-même sa limite : il cherche des chaînes
// dans `ShellV2.svelte` et resterait vert sur un montage débranché. Ici on
// monte la VRAIE coquille, on pose la cible comme la Recherche la pose, et on
// regarde les URL que `fetch` a réellement reçues. Débrancher la vue de la
// coquille, ou retirer l'un des trois appels, fait rougir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';

const ARTISTE = { id: null, name: 'Leprous', source: 'qobuz', source_id: 'q-42', image_path: null };
const TOP = [
  { source_id: 't1', title: 'The Price', artist_name: 'Leprous', album_title: 'Malina', duration_ms: 321000 },
  { source_id: 't2', title: 'Below', artist_name: 'Leprous', album_title: 'Pitfalls', duration_ms: 280000 },
];
const ALBUMS = [{ id: null, title: 'Malina', source: 'qobuz', source_id: 'a-9', year: 2017, cover_path: null }];

let urls: string[] = [];

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  let corps: unknown = COLLECTIONS.test(url) ? [] : {};
  if (url.includes('/artists/q-42/top-tracks')) corps = TOP;
  else if (url.includes('/artists/q-42/albums')) corps = ALBUMS;
  else if (url.includes('/streaming/qobuz/artists/q-42')) corps = ARTISTE;
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

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    return reponsePour(String(url));
  }));
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

describe("#3825 — un artiste de service a une fiche dans la coquille v2", () => {
  it('la coquille MONTE la vue, et la fiche interroge les TROIS routes', async () => {
    const hote = poserLaCoquille();
    ficheArtisteService.set({ service: 'qobuz', id: 'q-42', nom: 'Leprous' });
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();

    // Le repli « À venir » de la coquille signerait une vue non montée.
    expect(hote.textContent).not.toMatch(/À venir|Coming soon/i);

    const vues = urls.filter((u) => u.includes('/streaming/qobuz/artists/q-42'));
    expect(vues.some((u) => u.endsWith('/artists/q-42'))).toBe(true);
    expect(vues.some((u) => u.includes('/top-tracks'))).toBe(true);
    expect(vues.some((u) => u.includes('/albums'))).toBe(true);
  });

  it('elle rend les titres phares et les albums reçus', async () => {
    const hote = poserLaCoquille();
    ficheArtisteService.set({ service: 'qobuz', id: 'q-42', nom: 'Leprous' });
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();

    expect(hote.textContent).toContain('Leprous');
    expect(hote.textContent).toContain('The Price');
    expect(hote.textContent).toContain('Malina');
  });

  it('le Retour rend la main à la vue que l\'ÉMETTEUR a désignée, pas à un repli', async () => {
    const hote = poserLaCoquille();
    // C'est ce que fait `SearchV2.ouvrirArtiste` : il pose les deux.
    vueDeRetour.set('search');
    ficheArtisteService.set({ service: 'qobuz', id: 'q-42', nom: 'Leprous' });
    activeView.set('streamingartist');
    flushSync();
    await respirer();
    flushSync();

    const retour = hote.querySelector<HTMLButtonElement>('.v2-fas .retour');
    expect(retour, 'la fiche porte un bouton Retour').toBeTruthy();
    retour!.click();
    flushSync();

    expect(get(activeView)).toBe('search');
    // Le dépôt est consommé UNE fois : sans cela, un retour ultérieur
    // téléporterait vers un écran quitté entre-temps.
    expect(get(vueDeRetour)).toBeNull();
    expect(get(ficheArtisteService)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// La moitié « aller » : le geste de la Recherche. Lu sur le source, car le
// monter demanderait toute une recherche fédérée — mais l'assertion porte sur
// la LIGNE qui a changé, pas sur une chaîne décorative.
// ---------------------------------------------------------------------------
describe('#3825 — la Recherche ouvre la fiche au lieu de se relancer', () => {
  it("ouvrirArtiste ne retombe plus sur `q = ar.name` quand la cible est complète", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SearchV2.svelte'), 'utf-8');
    expect(src).toContain("activeView.set('streamingartist')");
    expect(src).toContain("ficheArtisteService.set({ service: ar.source as Source, id: String(ar.source_id), nom: ar.name ?? '' })");
    // Le repli demeure — mais SEULEMENT sans service ni identifiant : un
    // service qu'on ne sait pas interroger n'a pas de fiche à ouvrir.
    expect(src).toContain("if (!ar?.source || !ar?.source_id) { q = ar.name; return; }");
  });
});
