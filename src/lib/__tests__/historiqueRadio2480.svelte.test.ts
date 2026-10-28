// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { noterSiDebutDEcoute, type ZoneEcoutee } from '../historiqueEcoutes';
import { regrouperParContexte } from '../historiqueParContexte';
import { nowPlayingToTrack } from '../stores/nowPlaying';
import { locale } from '../i18n';

class Observateur { observe() {} unobserve() {} disconnect() {} }
const salon = { id: 3, name: 'Salon', group_id: null, current_track: null };
const radio = (id: string | null, titre: string, station = 'BBC Radio 6 Music') => ({
  source: 'radio' as const, source_id: id, track_id: null, title: titre,
  artist_name: 'Artiste identifié', album_title: station,
});
function noter(piste: ReturnType<typeof radio>, zone: ZoneEcoutee = salon) {
  noterSiDebutDEcoute('playback.track_changed', 3, zone, zone, nowPlayingToTrack,
    (track, nom, contexte) => playbackHistory.add(track, nom, contexte), piste);
}
let hote: HTMLDivElement | null = null;
let instance: Record<string, unknown> | null = null;
async function respirer() {
  for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 0)); flushSync(); }
}
beforeEach(() => {
  locale.set('fr'); playbackHistory.clear();
  vi.stubGlobal('ResizeObserver', Observateur);
  vi.stubGlobal('IntersectionObserver', Observateur);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => new Response(JSON.stringify(
    String(input).includes('/library/history') ? { items: [], total: 0 } : []
  ), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = null; hote?.remove(); hote = null;
  playbackHistory.clear(); vi.unstubAllGlobals();
});

describe('web#2480 — titres identifiés sous leur station radio', () => {
  it('la vraie chaîne du carnet groupe deux titres et distingue deux stations de même nom', () => {
    noter(radio('17', 'Take California'));
    noter(radio('17', 'Blue Monday'));
    noter(radio('29', 'Autre station', 'BBC Radio 6 Music'));
    const niveaux = regrouperParContexte(get(playbackHistory));
    expect(niveaux).toHaveLength(2);
    expect(niveaux.map(n => n.genre)).toEqual(['objet', 'objet']);
    expect(niveaux.map(n => n.genre === 'objet' ? n.entrees.length : 0)).toEqual([1, 2]);
    expect(niveaux.map(n => n.genre === 'objet' ? n.type : '')).toEqual(['radio', 'radio']);
  });
  it('une identité absente ne reprend jamais le contexte de l’album précédent', () => {
    const ancienAlbum = { ...salon, session_context_type: 'album', session_context_id: '42' };
    noter(radio(null, 'Titre sans identité'), ancienAlbum);
    expect(regrouperParContexte(get(playbackHistory)).map(n => n.genre)).toEqual(['titre']);
    expect(get(playbackHistory)[0].contexte ?? null).toBeNull();
  });
  it('prend l’identité portée par l’événement et non celle d’un ancien instantané de zone', () => {
    const zone = { ...salon, current_track: radio('17', 'Ancien titre') };
    noter(radio('29', 'Nouveau titre', 'Autre radio'), zone);
    expect(get(playbackHistory)[0].contexte).toMatchObject({ type: 'radio', id: '29', nom: 'Autre radio' });
  });
  it('garde les groupes album et playlist séparés des stations', () => {
    const track = nowPlayingToTrack({ track_id: 1, title: 'Album' } as never);
    playbackHistory.add(track, 'Salon', { type: 'album', id: '17' });
    playbackHistory.add({ ...track, id: 2, title: 'Playlist' }, 'Salon', { type: 'playlist', id: '17' });
    noter(radio('17', 'Radio'));
    const niveaux = regrouperParContexte(get(playbackHistory));
    expect(niveaux.map(n => n.genre === 'objet' ? n.type : n.genre)).toEqual(['radio', 'playlist', 'album']);
  });
  it('monte l’historique et ouvre aussi les titres anciens conservés sans contexte de station', async () => {
    // Ancien carnet : l’identité du flux et le nom de station existaient déjà,
    // seul contexte manquait. Aucune réécriture du serveur ou du carnet.
    playbackHistory.add(nowPlayingToTrack(radio('https://radio.example/bbc', 'Take California')), 'Salon');
    playbackHistory.add(nowPlayingToTrack(radio('https://radio.example/bbc', 'Blue Monday')), 'Salon');
    hote = document.createElement('div'); document.body.append(hote);
    instance = mount(HistoriqueV2, { target: hote }); flushSync(); await respirer();
    const groupes = hote.querySelectorAll<HTMLButtonElement>('button.objet');
    expect(groupes).toHaveLength(1);
    expect(groupes[0].textContent).toContain('BBC Radio 6 Music');
    expect(groupes[0].textContent).not.toContain('v2.hist.ctx.radio');
    expect(groupes[0].getAttribute('aria-expanded')).toBe('false');
    groupes[0].click(); await respirer();
    expect(groupes[0].getAttribute('aria-expanded')).toBe('true');
    expect(hote.textContent).toContain('Take California');
    expect(hote.textContent).toContain('Blue Monday');
    expect(get(playbackHistory).every(e => !e.contexte)).toBe(true);
  });
});
