// @vitest-environment jsdom
//
// #990 — Fabien, fil « v0.9.147 : v1 divers bugs », point 13 : une playlist en
// cours n'apparaît dans l'Historique qu'avec un seul titre, et ne se complète
// qu'après coup. Attendu : l'Historique montre la playlist en cours dès son
// lancement.
//
// Une écoute compte dès que le son part (#2125). L'écoute locale, notée au
// `playback.started`, ne portait pourtant aucun contexte : avant que le
// serveur ait écrit la sienne et que l'écran l'ait relue, elle s'affichait en
// titre nu, hors de sa playlist. Elle porte désormais le contexte que la zone
// publie (`session_context_*`), le même que le serveur recopie dans
// `listen_history`.
//
// La mesure monte le VRAI écran avec un serveur qui n'a encore RIEN écrit, et
// une écoute notée par la vraie chaîne (`noterSiDebutDEcoute` →
// `playbackHistory.add`), comme `v2Live` la note.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { contexteDeLaZone, noterSiDebutDEcoute } from '../historiqueEcoutes';
import { entreesDepuisServeur, fusionnerHistorique } from '../historiqueLecture';
import { regrouperParContexte } from '../historiqueParContexte';
import { nowPlayingToTrack } from '../stores/nowPlaying';
import { locale } from '../i18n';
import { get } from 'svelte/store';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** La zone telle que `GET /zones` la publie, playlist locale 42 lancée. */
const SALON = {
  id: 3,
  name: 'Salon',
  group_id: null,
  session_context_type: 'playlist',
  session_context_id: '42',
  session_context_source: 'local',
  current_track: null,
};

/** La charge de `playback.started` (`now_playing_event_data`). */
const charge = (id: number, titre: string) => ({
  zone_id: 3, track_id: id, title: titre, artist_name: 'Brel', album_title: 'Les Marquises',
  source: 'local', duration_ms: 200_000, queue_position: 0, queue_length: 10, track_generation: 1,
});

function noter(id: number, titre: string, zone: Record<string, unknown> = SALON) {
  return noterSiDebutDEcoute(
    'playback.started', 3, zone, zone, nowPlayingToTrack,
    (piste, nom, contexte) => playbackHistory.add(piste, nom, contexte),
    charge(id, titre),
  );
}

let lignes: unknown[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HistoriqueV2, { target: hote });
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

beforeEach(() => {
  locale.set('fr');
  playbackHistory.clear();
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  lignes = [];
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = url.includes('/library/history') ? { items: lignes, total: lignes.length } : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  playbackHistory.clear();
  vi.unstubAllGlobals();
});

describe('#990 — la playlist en cours est dans l’Historique dès son lancement', () => {
  it('🔴 l’écoute locale porte le contexte publié par la zone', () => {
    expect(noter(11, 'Jef')).toBe(true);
    const [e] = get(playbackHistory);
    expect(e.contexte).toMatchObject({ type: 'playlist', id: '42', source: 'local' });
  });

  it('🔴 premier titre, serveur encore muet : l’écran montre déjà le groupe de la playlist', async () => {
    noter(11, 'Jef');
    const racine = await poserEcran();
    expect(racine.querySelectorAll('button.objet').length, 'le groupe de la playlist manque').toBe(1);
    // Le groupe est replié : le titre ne doit pas sortir en ligne nue.
    expect(racine.querySelector('.list')?.textContent ?? '').not.toContain('Jef');
  });

  it('🔴 deux titres notés en local se rangent dans le MÊME groupe', () => {
    noter(11, 'Jef');
    noter(12, 'Orly');
    const niveaux = regrouperParContexte(fusionnerHistorique(get(playbackHistory), []));
    expect(niveaux).toHaveLength(1);
    expect(niveaux[0].genre).toBe('objet');
    expect(niveaux[0].genre === 'objet' && niveaux[0].entrees.length).toBe(2);
  });

  it('🔴 quand le serveur écrit la même écoute, elle ne fait pas doublon', () => {
    noter(11, 'Jef');
    const serveur = entreesDepuisServeur([{
      id: 1, track_id: 11, title: 'Jef', artist_name: 'Brel', album_title: 'Les Marquises',
      source: 'local', source_id: null, duration_ms: 200_000, listened_at: ilYA(2_000), zone_id: 3,
      context_type: 'playlist', context_id: '42', context_position: 0,
      context_name: 'Brel intégral', context_source: 'local',
    }]);
    const niveaux = regrouperParContexte(fusionnerHistorique(get(playbackHistory), serveur));
    expect(niveaux).toHaveLength(1);
    expect(niveaux[0].genre === 'objet' && niveaux[0].entrees.length).toBe(1);
  });

  it('TÉMOIN — une zone sans contexte (serveur ancien) laisse un titre nu, comme avant', () => {
    const ancienne = { id: 3, name: 'Salon', group_id: null, current_track: null };
    expect(contexteDeLaZone(ancienne)).toBeNull();
    noter(11, 'Jef', ancienne);
    const [e] = get(playbackHistory);
    expect(e.contexte ?? null).toBeNull();
    const niveaux = regrouperParContexte(fusionnerHistorique(get(playbackHistory), []));
    expect(niveaux[0].genre).toBe('titre');
  });
});
