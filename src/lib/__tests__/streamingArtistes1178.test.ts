// @vitest-environment jsdom
// #1178 / serveur #3864 : vrais ShellV2, StreamingV2, fiche et retour.
// Seules les frontières réseau sont simulées ; aucun compte de service réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { activeStreamingService, ficheArtisteService, streamingServices } from '../stores/streaming';
import { tuneWS } from '../websocket';

const ZONE = { id: 1, name: 'Témoin', output_type: 'local', state: 'stopped', volume: 50 };
let artistes: any[] = [];
let requetes: string[] = [];
let serviceActif = 'qobuz';
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
  else if (p.endsWith('/streaming/services')) corps = { [serviceActif]: { enabled: true, authenticated: true } };
  else if (/\/streaming\/[^/]+\/search$/.test(p)) corps = { artists: artistes, albums: [], tracks: [], playlists: [], has_more: false };
  else if (/\/streaming\/[^/]+\/favorites\/artists$/.test(p)) corps = { artists: artistes };
  else if (/\/streaming\/[^/]+\/favorites\//.test(p)) corps = { albums: [], tracks: [] };
  else if (/\/streaming\/[^/]+\/artists\/[^/]+$/.test(p)) corps = { id: p.split('/').at(-1), name: 'Fiche chargée par HTTP', bio: '' };
  else if (/\/streaming\//.test(p)) corps = [];
  else if (/\/search$/.test(p)) corps = { artists: [], albums: [], tracks: [], services: {} };
  else if (/\/queue/.test(p)) corps = { tracks: [], position: 0, length: 0 };
  else if (p.endsWith('/zones')) corps = [ZONE];
  else if (/\/zones\/\d+$/.test(p)) corps = ZONE;
  else if (/\/(profiles|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|tracks|albums|top-artists|recent|genres)(\/|$)/.test(p)) corps = [];
  return { ok: status === 200, status, statusText: status === 200 ? 'OK' : 'Not Found', headers: new Map([['content-type', 'application/json']]), json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
}
async function monter(origine: 'recherche' | 'favoris') {
  hote = document.createElement('div'); document.body.append(hote);
  composant = mount(ShellV2, { target: hote }); flushSync();
  await vi.waitFor(() => expect(hote.querySelector('.v2-str .v2-rech input')).not.toBeNull());
  if (origine === 'recherche') {
    const input = hote.querySelector('.v2-str .v2-rech input') as HTMLInputElement;
    input.value = 'artiste témoin'; input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const bouton = [...hote.querySelectorAll<HTMLButtonElement>('.v2-str .subs button')].find((b) => b.textContent?.trim() === 'Favoris');
    expect(bouton).toBeDefined(); bouton!.click();
  }
  flushSync();
  await vi.waitFor(() => expect(hote.querySelectorAll('.v2-str .art').length).toBe(artistes.length));
}

beforeEach(() => {
  requetes = []; artistes = []; serviceActif = 'qobuz';
  localStorage.clear();
  activeView.set('streaming'); vueDeRetour.set(null); ficheArtisteService.set(null);
  activeStreamingService.set('qobuz'); streamingServices.set({});
  vi.stubGlobal('WebSocket', SocketTemoin);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { requetes.push(String(url)); return repondre(String(url)); }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; tuneWS.disconnect(); hote?.remove(); vi.unstubAllGlobals();
});

describe('Streaming : ouvrir un artiste puis revenir', () => {
  it.each([
    { origine: 'recherche', geste: 'portrait', artiste: { id: '610403', name: 'Leprous' }, service: 'qobuz', id: '610403' },
    { origine: 'recherche', geste: 'nom', artiste: { source: 'tidal', source_id: '9001', id: 'autre', name: 'Artiste Tidal' }, service: 'tidal', id: '9001' },
    { origine: 'favoris', geste: 'portrait', artiste: { id: 0, name: 'Identifiant zéro' }, service: 'qobuz', id: '0' },
    { origine: 'favoris', geste: 'nom', artiste: { source: 'tidal', source_id: 'artiste:37/a', name: 'Favori Tidal' }, service: 'tidal', id: 'artiste:37/a' },
  ] as const)('$origine / $geste ouvre $service et revient à Streaming', async ({ origine, geste, artiste, service, id }) => {
    artistes = [artiste];
    await monter(origine);
    const bouton = hote.querySelector<HTMLButtonElement>(geste === 'portrait' ? '.v2-str .art button.ouvrir' : '.v2-str .art button.an');
    expect(bouton, 'aucun geste ne permet de rejoindre la fiche existante').not.toBeNull();
    bouton!.click(); flushSync();
    await vi.waitFor(() => expect(hote.querySelector('.v2-fas h1')?.textContent).toBe('Fiche chargée par HTTP'));
    expect(get(ficheArtisteService)).toEqual({ service, id, nom: artiste.name });
    expect(hote.querySelector('.v2-fas .svc')?.textContent).toBe(service);
    expect(get(activeView)).toBe('streamingartist');
    const chemin = `/api/v1/streaming/${service}/artists/${encodeURIComponent(id)}`;
    expect(requetes).toContain(chemin);
    expect(requetes).toContain(`${chemin}/albums`);
    expect(requetes).toContain(`${chemin}/top-tracks`);
    (hote.querySelector('.v2-fas button.retour') as HTMLButtonElement).click(); flushSync();
    await vi.waitFor(() => expect(hote.querySelector('.v2-str h1')).not.toBeNull());
    expect(get(activeView)).toBe('streaming');
    expect(get(ficheArtisteService)).toBeNull(); expect(get(vueDeRetour)).toBeNull();
  });

  it('les identités incomplètes restent lisibles sans bouton ni requête artiste', async () => {
    artistes = [
      { name: 'Sans identifiant' },
      { source_id: '', id: 'ne-pas-substituer', name: 'Identifiant vide' },
      { id: '   ', name: 'Identifiant blanc' },
      { id: { valeur: 1 }, name: 'Identifiant objet' },
      { source: '', id: '77', name: 'Service vide' },
      { source: '  ', id: '78', name: 'Service blanc' },
    ];
    await monter('favoris');
    const cartes = [...hote.querySelectorAll('.v2-str .art')];
    expect(cartes).toHaveLength(artistes.length);
    for (const [i, carte] of cartes.entries()) {
      expect(carte.querySelector('.an')?.textContent).toBe(artistes[i].name);
      expect(carte.querySelector('button.ouvrir')).toBeNull();
      expect(carte.querySelector('button.an')).toBeNull();
      carte.querySelector('.an')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    flushSync();
    expect(get(activeView)).toBe('streaming'); expect(get(ficheArtisteService)).toBeNull();
    expect(requetes.some((u) => /\/streaming\/[^/]+\/artists\//.test(u))).toBe(false);
  });
});
