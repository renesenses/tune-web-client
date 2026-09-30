// @vitest-environment jsdom
/**
 * #1789 — une playlist Qobuz introuvable ne crie plus dans l'Historique.
 *
 * FabienM, fil 2037, points 5 et 14 : « Quand je vais dans le menu
 * Historique, j'ai une erreur » — le bandeau
 * `Server error: qobuz /playlist/get: 404 {"status":"error","code":404,…}`,
 * repeint à chaque visite. L'écran demande le nom d'une playlist de service
 * jouée (#988) ; Qobuz ne la connaît plus (404), le serveur relaie en 502, et
 * `fetchJSON` posait le bandeau avant que l'écran n'attrape l'échec.
 *
 * On monte le VRAI écran, avec le VRAI `api.getStreamingPlaylist` : seul
 * `fetch` est simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { currentZoneId, zones } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

class GeometryObserver { observe() {} unobserve() {} disconnect() {} }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const QOBUZ_404 = 'qobuz /playlist/get: 404 {"status":"error","code":404,"message":"No result matching given argument"}';
const historique = () => ({
  total: 2,
  items: [0, 1].map((i) => ({
    id: i + 1, track_id: null, title: `Titre ${i + 1}`, artist_name: 'Artiste',
    album_title: 'Album', source: 'qobuz', source_id: String(900 + i), album_id: null,
    duration_ms: 180000, listened_at: `2026-09-29T15:3${i}:00Z`, zone_id: 1,
    cover_url: null, context_type: 'playlist', context_id: '21846544',
    context_position: i, context_name: null,
  })),
});

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;
let reponsePlaylist: () => Response;
let demandes: string[];

async function settle() {
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
const titre = () => target.querySelector('button.objet .otitre')?.textContent?.trim();
const erreurs = () => get(notifications).filter((n) => n.level === 'error').map((n) => n.message);

beforeEach(() => {
  locale.set('fr');
  playbackHistory.clear();
  currentZoneId.set(1);
  zones.set([{ id: 1, name: 'Salon', state: 'stopped' }] as never);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  demandes = [];
  vi.stubGlobal('ResizeObserver', GeometryObserver);
  vi.stubGlobal('IntersectionObserver', GeometryObserver);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/library/history')) return json(historique());
    if (url.includes('/radio-favorites')) return json([]);
    if (url.includes('/streaming/qobuz/playlists/')) { demandes.push(url); return reponsePlaylist(); }
    return json({});
  }));
  target = document.createElement('div');
  document.body.append(target);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = null;
  target.remove();
  playbackHistory.clear();
  currentZoneId.set(null);
  zones.set([]);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#1789 — Historique : playlist de service introuvable', () => {
  it.each([
    ['502 (ce que rend le serveur pour un 404 de Qobuz)', 502],
    ['404', 404],
  ])('🔴 réponse %s : aucun bandeau, la ligne dit « Indisponible »', async (_l, statut) => {
    reponsePlaylist = () => json({ error: QOBUZ_404 }, statut);
    component = mount(HistoriqueV2, { target });
    await settle();
    expect(demandes.length, 'l’écran demande bien le nom de la playlist').toBe(1);
    expect(demandes[0]).toContain('/streaming/qobuz/playlists/21846544');
    expect(erreurs(), 'aucun bandeau « Server error » pour un nom manquant').toEqual([]);
    expect(titre()).toBe('Indisponible');
  });

  it('une playlist résolue garde son nom, et une réponse SANS nom dit toujours « sans nom »', async () => {
    reponsePlaylist = () => json({ name: 'Liberty', cover_path: null });
    component = mount(HistoriqueV2, { target });
    await settle();
    expect(titre()).toBe('Liberty');
    await unmount(component);
    target.innerHTML = '';
    reponsePlaylist = () => json({ name: '' });
    component = mount(HistoriqueV2, { target });
    await settle();
    expect(titre()).toBe('sans nom');
    expect(erreurs()).toEqual([]);
  });

  it('les autres routes gardent leur bandeau : un 502 hors `sansBandeau` crie toujours', async () => {
    const { fetchJSON } = await import('../api');
    reponsePlaylist = () => json({ error: 'panne' }, 502);
    await expect(fetchJSON('/api/v1/streaming/qobuz/playlists/1')).rejects.toBeTruthy();
    expect(erreurs().some((m) => m.startsWith('Server error'))).toBe(true);
  });
});
