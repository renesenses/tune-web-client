// @vitest-environment jsdom
// web#3180 — FabienM, fil 2864 (rc12, Firefox + app Remote Android) : le
// Firefox du PC avait retenu, un jour, la zone « Z Fold8 de Fab » (16) de son
// téléphone. La prise durait pour toujours (localStorage) et rien ne la
// relâchait : le PC tirait le flux de la zone, le téléphone restait muet.
// Décision de Bertrand (20/11) : la prise ne vaut que pour l'onglet, et la
// carte de la zone offre « Ne plus jouer ici ». Plus les deux portes voisines :
// le transport V2 qui oubliait la zone jouée, et la fin de piste qui retombait
// sur la zone AFFICHÉE même quand elle appartient à un autre appareil.
// Vrai transport V2, vrais stores, vrai lecteur ; seules les frontières
// WebSocket, HTTP et HTMLAudioElement sont simulées.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import * as api from '../api';
import { demarrerTransportV2 } from '../v2Live';
import { tuneWS } from '../websocket';
import { currentZoneId, zones } from '../stores/zones';
import { stopSeekTimer } from '../stores/nowPlaying';
import {
  browserAudioDestroy, browserPlay, browserPositionMsPour, browserStreamUrl,
} from '../stores/browserAudio';
import {
  estZoneJouableIci, relacherZoneDeCetAppareil, retenirZoneDeCetAppareil, zonesRetenues,
} from '../zoneNavigateurProprietaire';
import { nePlusJouerZoneIci } from '../zoneNavigateurRelache';
import { zoneDeCetAppareil } from '../zoneDeCetAppareil';
import { entreesMenuZone, type GestesZone } from '../menuZone';
import fr from '../locales/fr';
import en from '../locales/en';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getZones: vi.fn(), getQueue: vi.fn(), play: vi.fn(), resume: vi.fn(),
  next: vi.fn(), getZone: vi.fn(),
}));

class AudioTemoin extends EventTarget {
  static instances: AudioTemoin[] = [];
  src = ''; crossOrigin = ''; preload = ''; volume = 1; muted = false;
  currentTime = 0; duration = 200; readyState = 4; error = null;
  paused = true; loads = 0;
  constructor() { super(); AudioTemoin.instances.push(this); }
  play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.loads++; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}

class SocketTemoin {
  static OPEN = 1;
  static instances: SocketTemoin[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() { SocketTemoin.instances.push(this); }
  send() {} close() {}
  recevoir(type: string, zoneId?: number) {
    this.onmessage?.({ data: JSON.stringify({ type, data: { zone_id: zoneId } }) });
  }
}

const CLE = 'tune.zonesNavigateurDeCetAppareil';
// Les deux zones du fil 2864 : celle du PC et celle du téléphone.
const PC = {
  id: 13, name: 'PC Fab', output_type: 'browser', output_device_id: null,
  state: 'playing', volume: 50, stream_url: '/stream/session-pc.flac',
};
const TELEPHONE = { ...PC, id: 16, name: 'Z Fold8 de Fab', stream_url: '/stream/session-fold.flac' };

let arreterTransport: (() => void) | undefined;
const envoyer = (id: number, type: string) => SocketTemoin.instances.at(-1)!.recevoir(type, id);
const lecteur = () => AudioTemoin.instances.at(-1)!;
const vider = () => { localStorage.clear(); sessionStorage.clear(); };

beforeEach(() => {
  vi.clearAllMocks();
  vider();
  vi.stubGlobal('Audio', AudioTemoin);
  vi.stubGlobal('WebSocket', SocketTemoin);
  AudioTemoin.instances = []; SocketTemoin.instances = [];
  zones.set([PC, TELEPHONE] as any);
  currentZoneId.set(PC.id);
  vi.mocked(api.getZones).mockResolvedValue([PC, TELEPHONE] as any);
  vi.mocked(api.getQueue).mockResolvedValue({ tracks: [], position: 0, length: 0 } as any);
});

afterEach(() => {
  arreterTransport?.(); arreterTransport = undefined;
  tuneWS.disconnect(); browserAudioDestroy(); stopSeekTimer();
  vi.unstubAllGlobals(); vider();
});

describe('la prise d\'une zone navigateur ne vaut que pour l\'onglet', () => {
  it('elle vit dans sessionStorage, plus dans localStorage', () => {
    retenirZoneDeCetAppareil(TELEPHONE.id);
    expect(localStorage.getItem(CLE)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(CLE)!)).toEqual([TELEPHONE.id]);
  });

  it('l\'ancienne prise persistée (rc12) est oubliée : la zone du téléphone ne se joue plus ici', async () => {
    // L'état du Firefox de FabienM : 13 et 16 retenues « pour toujours ».
    localStorage.setItem(CLE, JSON.stringify([PC.id, TELEPHONE.id]));
    localStorage.setItem('tune.zoneNavigateur.cetAppareil', String(TELEPHONE.id));
    vi.resetModules();
    const m = await import('../zoneNavigateurProprietaire');
    expect(m.estZoneJouableIci(TELEPHONE)).toBe(false);
    expect(localStorage.getItem(CLE)).toBeNull();
    expect(localStorage.getItem('tune.zoneNavigateur.cetAppareil')).toBeNull();
  });
});

describe('« Ne plus jouer ici »', () => {
  it('relâche la zone : elle ne se joue plus ici, les autres prises restent', () => {
    retenirZoneDeCetAppareil(PC.id);
    retenirZoneDeCetAppareil(TELEPHONE.id);
    relacherZoneDeCetAppareil(TELEPHONE.id, TELEPHONE.name);
    expect(estZoneJouableIci(TELEPHONE)).toBe(false);
    expect(estZoneJouableIci(PC)).toBe(true);
  });

  it('une zone « Ce navigateur » relâchée n\'est pas reprise par le repli du nom', () => {
    const ceNavigateur = { ...PC, id: 7, name: 'Ce navigateur' };
    expect(estZoneJouableIci(ceNavigateur)).toBe(true);
    relacherZoneDeCetAppareil(7, 'Ce navigateur');
    expect(estZoneJouableIci(ceNavigateur)).toBe(false);
  });

  it('la dernière prise relâchée rend la main au repli du nom', () => {
    retenirZoneDeCetAppareil(TELEPHONE.id);
    relacherZoneDeCetAppareil(TELEPHONE.id, TELEPHONE.name);
    expect(zonesRetenues()).toBeNull();
    expect(estZoneJouableIci({ ...PC, id: 7, name: 'Ce navigateur' })).toBe(true);
  });

  it('coupe la lecture locale de la zone relâchée', () => {
    retenirZoneDeCetAppareil(TELEPHONE.id);
    browserPlay(TELEPHONE.stream_url, false, TELEPHONE.id);
    expect(lecteur().paused).toBe(false);
    nePlusJouerZoneIci(TELEPHONE);
    expect(lecteur().paused).toBe(true);
    expect(get(browserStreamUrl)).toBeNull();
    expect(estZoneJouableIci(TELEPHONE)).toBe(false);
  });

  it('le menu de la zone ne le propose que si cet onglet la tient', () => {
    const rien = () => {};
    const gestes = {
      renommer: rien, image: rien, reglages: rien, correction: rien, latence: rien,
      appairer: rien, fusionner: rien, supprimer: rien, nePlusJouerIci: vi.fn(),
    } satisfies GestesZone;
    const capacites = { expert: false, appairable: false, jumelle: null };
    const cles = (tenueIci: boolean) =>
      entreesMenuZone({ ...capacites, tenueIci }, gestes).map((e) => e.cle);
    expect(cles(true)).toContain('v2.zone.browserStopHere');
    expect(cles(false)).not.toContain('v2.zone.browserStopHere');
    entreesMenuZone({ ...capacites, tenueIci: true }, gestes)
      .find((e) => e.cle === 'v2.zone.browserStopHere')!.faire();
    expect(gestes.nePlusJouerIci).toHaveBeenCalledOnce();
    expect((fr as any)['v2.zone.browserStopHere']).toBe('Ne plus jouer ici');
    expect((en as any)['v2.zone.browserStopHere']).toBe('Stop playing here');
  });
});

describe('« Ce téléphone » passe par la même prise', () => {
  it('la zone qu\'il crée est jouable ici même si une autre zone était déjà retenue', async () => {
    retenirZoneDeCetAppareil(99); // retenue par cet onglet, supprimée depuis
    const id = await zoneDeCetAppareil([PC, TELEPHONE] as any, 'Ce téléphone', async () => ({ id: 42 }));
    expect(id).toBe(42);
    expect(estZoneJouableIci({ id: 42, name: 'Ce téléphone (127.0.0.1)', output_type: 'browser' })).toBe(true);
  });

  it('une zone déjà tenue par cet onglet est la sienne : rien n\'est créé', async () => {
    retenirZoneDeCetAppareil(PC.id);
    const creer = vi.fn();
    expect(await zoneDeCetAppareil([PC, TELEPHONE] as any, 'Ce téléphone', creer)).toBe(PC.id);
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('les portes voisines', () => {
  it('le transport V2 dit à l\'élément quelle zone il joue', async () => {
    retenirZoneDeCetAppareil(PC.id);
    currentZoneId.set(TELEPHONE.id); // on regarde le téléphone pendant que le PC joue
    arreterTransport = demarrerTransportV2();
    envoyer(PC.id, 'playback.started');
    await vi.waitFor(() => expect(lecteur().loads).toBeGreaterThan(0));
    // La position n'est rendue que pour la zone dont l'élément joue la source.
    expect(browserPositionMsPour(PC.id)).not.toBeNull();
  });

  it('une fin de piste sans zone connue ne fait pas avancer la zone affichée d\'un autre appareil', async () => {
    retenirZoneDeCetAppareil(PC.id);
    currentZoneId.set(TELEPHONE.id);
    vi.mocked(api.next).mockResolvedValue({ status: 'playing' } as any);
    vi.mocked(api.getZone).mockResolvedValue(TELEPHONE as any);
    // Un chargement dont la zone est inconnue (appelant sans identifiant).
    browserPlay(PC.stream_url, false);
    lecteur().dispatchEvent(new Event('ended'));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.next).not.toHaveBeenCalled();
    expect(get(browserStreamUrl)).not.toContain('session-fold');
  });

  it('la piste suivante d\'une zone qui n\'est plus tenue ici ne se tire pas ici', async () => {
    retenirZoneDeCetAppareil(PC.id);
    vi.mocked(api.next).mockResolvedValue({ status: 'playing' } as any);
    vi.mocked(api.getZone).mockResolvedValue(TELEPHONE as any);
    browserPlay(TELEPHONE.stream_url, false, TELEPHONE.id);
    const charges = lecteur().loads;
    lecteur().dispatchEvent(new Event('ended'));
    await vi.waitFor(() => expect(api.getZone).toHaveBeenCalledWith(TELEPHONE.id));
    await new Promise((r) => setTimeout(r, 0));
    expect(lecteur().loads).toBe(charges);
  });
});
