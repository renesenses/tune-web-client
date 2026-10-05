// @vitest-environment jsdom
//
// web#1895 (FabienM, fil 2120), seconde moitié : « Si on clique sur
// "Dimanche R&B / Neo-Soul" cela ouvre la playlist ». Le nom d'une ligne
// PLAYLIST de l'Historique mène à sa fiche — locale ou de service selon
// `context_source`, jamais d'après l'identifiant (un id Qobuz est un entier,
// comme un id local). Sans source connue, le nom reste du texte.
//
// 🔴 CES TÉMOINS CLIQUENT : le vrai Historique, et l'on regarde où l'on arrive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { ouverturePlaylistDuLot } from '../lienPlaylistDHistorique';
import { activeView, gestesNavigationService } from '../stores/navigation';
import { playbackHistory } from '../stores/history';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let lignes: unknown[] = [];
const restaurations: any[] = [];
const ecouter = (e: Event) => { restaurations.push((e as CustomEvent).detail?.target); };
const respirer = () => new Promise((r) => setTimeout(r, 0));

const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
function ligne(o: { id: number; source: string; contextId: string; contextSource: string | null; nom: string | null }) {
  return {
    id: o.id, track_id: o.source === 'local' ? o.id : null, title: `Titre ${o.id}`, artist_name: 'Orbital',
    album_title: 'The Middle Of Nowhere', source: o.source, source_id: o.source === 'local' ? null : `s${o.id}`,
    album_id: null, cover_url: null, duration_ms: 469_000, listened_at: ilYA(60_000 * o.id), zone_id: 3,
    context_type: 'playlist', context_id: o.contextId, context_position: o.id,
    context_name: o.nom, context_source: o.contextSource,
  };
}

beforeEach(() => {
  locale.set('fr');
  restaurations.length = 0;
  activeView.set('history' as never);
  playbackHistory.clear();
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: () => {} });
  window.addEventListener('tune:shortcut-restore', ecouter);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = url.includes('/library/history')
      ? { items: lignes, total: lignes.length }
      : url.includes('/streaming/qobuz/playlists/')
        ? { name: 'Dimanche R&B / Neo-Soul', source_id: '21846544', cover_path: 'https://x/p.jpg' }
        : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte, { outro: false });
  monte = null;
  hote?.remove();
  hote = null;
  window.removeEventListener('tune:shortcut-restore', ecouter);
  gestesNavigationService.set(null);
  playbackHistory.clear();
  vi.unstubAllGlobals();
});

async function poserHistorique(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HistoriqueV2, { target: hote });
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

describe('web#1895 — la cible du lien de playlist', () => {
  const lot = (source: string | null, id = '12') => [{ contexte: { type: 'playlist', id, source } }];
  it('la source du contexte décide ; sans elle, pas de lien', () => {
    expect(ouverturePlaylistDuLot('playlist', lot('local'), 'Ma liste')).not.toBeNull();
    expect(ouverturePlaylistDuLot('playlist', lot('qobuz', '21846544'), 'Dimanche')).not.toBeNull();
    expect(ouverturePlaylistDuLot('playlist', lot(null), 'Ma liste'), 'source inconnue : on ne devine pas').toBeNull();
    expect(ouverturePlaylistDuLot('playlist', lot('local', 'http://h/api/v1/library/tracks/14/audio'), 'X')).toBeNull();
    expect(ouverturePlaylistDuLot('playlist', lot('local'), null), 'sans nom, pas de fiche').toBeNull();
    expect(ouverturePlaylistDuLot('album', lot('local'), 'X')).toBeNull();
    // Deux écoutes du même numéro, deux catalogues : on ne choisit pas.
    expect(ouverturePlaylistDuLot('playlist', [...lot('local'), ...lot('qobuz')], 'X')).toBeNull();
  });
});

describe('web#1895 — le nom d’une ligne Playlist de l’Historique', () => {
  it('🔴 playlist LOCALE : le nom ouvre sa fiche, le reste de la ligne déplie toujours', async () => {
    lignes = [
      ligne({ id: 1, source: 'local', contextId: '12', contextSource: 'local', nom: 'Ma liste du soir' }),
      ligne({ id: 2, source: 'local', contextId: '12', contextSource: 'local', nom: 'Ma liste du soir' }),
    ];
    const el = await poserHistorique();
    const objet = el.querySelector<HTMLButtonElement>('button.objet');
    expect(objet, 'pas de ligne Playlist — le témoin ne mesure rien').not.toBeNull();
    const nom = objet!.querySelector<HTMLElement>('.otitre.lien-playlist');
    expect(nom, 'le nom de la playlist n’est pas un lien — web#1895').not.toBeNull();
    expect(nom!.textContent).toBe('Ma liste du soir');

    nom!.click();
    flushSync();
    for (let i = 0; i < 4; i++) await respirer();
    expect(get(activeView)).toBe('playlists');
    expect(restaurations).toEqual([expect.objectContaining({ key: 'playlists:12' })]);
    expect(objet!.getAttribute('aria-expanded'), 'le clic sur le nom a aussi déplié le tiroir').toBe('false');

    objet!.querySelector<HTMLElement>('.pli')!.click();
    flushSync();
    expect(objet!.getAttribute('aria-expanded')).toBe('true');
  });

  it('🔴 playlist QOBUZ (identifiant entier) : la fiche ouverte est celle du service', async () => {
    lignes = [ligne({ id: 1, source: 'qobuz', contextId: '21846544', contextSource: 'qobuz', nom: null })];
    const el = await poserHistorique();
    const nom = el.querySelector<HTMLElement>('button.objet .otitre.lien-playlist');
    expect(nom, 'le nom de la playlist Qobuz n’est pas un lien').not.toBeNull();
    expect(nom!.textContent).toBe('Dimanche R&B / Neo-Soul');
    nom!.click();
    for (let i = 0; i < 4; i++) await respirer();
    expect(get(activeView)).toBe('playlists');
    expect(restaurations).toEqual([expect.objectContaining({
      key: 'streamingplaylists:qobuz:21846544',
      restore: expect.objectContaining({ kind: 'streaming', service: 'qobuz' }),
    })]);
  });

  it('écoute sans `context_source` (serveur d’avant) : le nom reste du texte', async () => {
    lignes = [ligne({ id: 1, source: 'local', contextId: '12', contextSource: null, nom: 'Ma liste du soir' })];
    const el = await poserHistorique();
    const objet = el.querySelector<HTMLButtonElement>('button.objet');
    expect(objet).not.toBeNull();
    expect(objet!.querySelector('.lien-playlist')).toBeNull();
    expect(objet!.querySelector('.otitre')!.textContent).toBe('Ma liste du soir');
  });
});
