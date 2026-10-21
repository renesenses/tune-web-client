// tune-server-rust#4908 — témoins des commandes de l'écran verrouillé.
import { describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import {
  brancherSessionMedia,
  etatDeSession,
  metadonneesDeSession,
  positionDeSession,
  type CommandesDeTransport,
  type SessionMediaLike,
} from './mediaSession';
import type { Zone } from './types';

function zone(partiel: Partial<Zone> = {}): Zone {
  return {
    id: 7,
    name: 'Salon',
    state: 'playing',
    position_ms: 61_000,
    current_track: {
      title: 'Blue in Green',
      artist_name: 'Miles Davis',
      album_title: 'Kind of Blue',
      cover_path: '/api/v1/library/artwork/abc.jpg',
      duration_ms: 337_000,
    },
    ...partiel,
  } as Zone;
}

class FausseSession implements SessionMediaLike {
  metadata: unknown = 'avant';
  playbackState: MediaSessionPlaybackState = 'none';
  gestionnaires = new Map<string, MediaSessionActionHandler | null>();
  positions: MediaPositionState[] = [];
  setActionHandler(action: MediaSessionAction, h: MediaSessionActionHandler | null) {
    this.gestionnaires.set(action, h);
  }
  setPositionState(p?: MediaPositionState) {
    if (p) this.positions.push(p);
  }
  appuyer(action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}) {
    const h = this.gestionnaires.get(action);
    if (!h) throw new Error(`aucun gestionnaire pour ${action}`);
    h({ action, ...details } as MediaSessionActionDetails);
  }
}

function commandes(): CommandesDeTransport & { [k: string]: ReturnType<typeof vi.fn> } {
  const ok = () => vi.fn(() => Promise.resolve());
  return { lire: ok(), pause: ok(), suivant: ok(), precedent: ok(), chercher: ok() } as any;
}

const pochette = (c: string) => `http://tune.local${c}?size=512`;
const fabriquer = (m: unknown) => ({ fabrique: m });

describe('métadonnées de la session', () => {
  it('reprennent la piste de la zone, pochette comprise', () => {
    expect(metadonneesDeSession(zone(), pochette)).toEqual({
      title: 'Blue in Green',
      artist: 'Miles Davis',
      album: 'Kind of Blue',
      artwork: [{ src: 'http://tune.local/api/v1/library/artwork/abc.jpg?size=512', sizes: '512x512' }],
    });
  });

  it('rien quand la zone ne joue rien', () => {
    expect(metadonneesDeSession(zone({ current_track: null }), pochette)).toBeNull();
    expect(metadonneesDeSession(null, pochette)).toBeNull();
  });

  it('les états et la position, en secondes et bornée', () => {
    expect(etatDeSession('playing')).toBe('playing');
    expect(etatDeSession('buffering')).toBe('playing');
    expect(etatDeSession('paused')).toBe('paused');
    expect(etatDeSession('stopped')).toBe('none');
    expect(positionDeSession(zone())).toEqual({ duration: 337, position: 61, playbackRate: 1 });
    expect(positionDeSession(zone({ position_ms: 999_999 }))?.position).toBe(337);
    expect(positionDeSession(zone({ current_track: { title: 'x' } as any }))).toBeNull();
  });
});

describe('branchement', () => {
  it('éteint par défaut : rien n’est touché', () => {
    const s = new FausseSession();
    brancherSessionMedia(s, writable(zone()), writable(false), commandes(), pochette, fabriquer);
    expect(s.gestionnaires.size).toBe(0);
    expect(s.metadata).toBe('avant');
  });

  it('allumé : les boutons pilotent la zone AFFICHÉE, pas l’onglet', async () => {
    const s = new FausseSession();
    const z = writable<Zone | null>(zone());
    const c = commandes();
    brancherSessionMedia(s, z, writable(true), c, pochette, fabriquer);
    expect(s.metadata).toEqual({ fabrique: expect.objectContaining({ title: 'Blue in Green' }) });
    expect(s.playbackState).toBe('playing');
    expect(s.positions.at(-1)).toEqual({ duration: 337, position: 61, playbackRate: 1 });

    s.appuyer('pause');
    s.appuyer('play');
    s.appuyer('nexttrack');
    s.appuyer('previoustrack');
    s.appuyer('seekto', { seekTime: 12.3456 });
    expect(c.pause).toHaveBeenCalledWith(7);
    expect(c.lire).toHaveBeenCalledWith(7);
    expect(c.suivant).toHaveBeenCalledWith(7);
    expect(c.precedent).toHaveBeenCalledWith(7);
    expect(c.chercher).toHaveBeenCalledWith(7, 12346);

    // L'utilisateur change de zone : les boutons suivent.
    z.set(zone({ id: 9, state: 'paused' }));
    expect(s.playbackState).toBe('paused');
    s.appuyer('nexttrack');
    expect(c.suivant).toHaveBeenLastCalledWith(9);
  });

  it('éteindre le réglage rend les boutons au navigateur', () => {
    const s = new FausseSession();
    const actif = writable(true);
    brancherSessionMedia(s, writable(zone()), actif, commandes(), pochette, fabriquer);
    actif.set(false);
    for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
      expect(s.gestionnaires.get(a)).toBeNull();
    }
    expect(s.metadata).toBeNull();
    expect(s.playbackState).toBe('none');
  });

  it('sans zone, un bouton ne fait rien (pas d’appel sur une zone nulle)', () => {
    const s = new FausseSession();
    const c = commandes();
    brancherSessionMedia(s, writable(null), writable(true), c, pochette, fabriquer);
    s.appuyer('play');
    expect(c.lire).not.toHaveBeenCalled();
    expect(s.playbackState).toBe('none');
  });

  it('un navigateur sans Media Session : rien à brancher', () => {
    expect(() =>
      brancherSessionMedia(undefined, writable(zone()), writable(true), commandes(), pochette, fabriquer)(),
    ).not.toThrow();
  });
});
