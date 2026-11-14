// @vitest-environment jsdom
//
// Recette rc12 du 13/11 sur le .18 (album Smashing Pumpkins, 18 titres,
// « Zero » en cours, 9 dessous) : la page File disait « 9 à suivre ·
// 38 min restantes » et le médaillon du bouton file de la barre de lecture
// disait « 18 ». La barre comptait `queueTracks.length` — la file entière,
// titres déjà joués compris — quand la page compte `upNextCount`.
//
// Contre-épreuve : `TransportBar.svelte` d'avant ce correctif dessine « 18 »
// et le premier témoin rougit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    getAudiophileMode: vi.fn(async () => ({ enabled: false, lock_volume: null, effective_lock_volume: false })),
    getDsp: vi.fn(async () => ({})),
    getLevelCompensation: vi.fn(async () => null),
  };
});

import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { queueTracks, queuePosition } from '../stores/queue';
import { locale } from '../i18n';
import { texteMedaillonFile, libelleBoutonFile } from '../medaillonFile';
import { dictionnaire } from './onzeDictionnaires';

const DELAI = 60_000;
const fr = dictionnaire('fr');
const tFr = (k: string) => fr[k] ?? k;

const pistes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Titre ${i + 1}`, artist_name: 'The Smashing Pumpkins', duration_ms: 250_000, source: 'local' }));

let file = { tracks: [] as unknown[], position: 0, length: 0 };
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | undefined;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = file;
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

function fileDe(n: number, position: number) {
  const tracks = pistes(n);
  file = { tracks, position, length: n };
  queueTracks.set(tracks as never);
  queuePosition.set(position);
  zones.set([{
    id: 3, name: 'Salon', state: 'playing', online: true, volume: 0.5,
    output_type: 'local', output_device_id: 'local:Salon', position_ms: 1000,
    current_track: { ...tracks[position], track_id: position + 1, format: 'flac', sample_rate: 44100, bit_depth: 16 },
  }] as never);
  currentZoneId.set(3);
}
const bouton = () => hote.querySelector('button.queue-btn') as HTMLButtonElement | null;
const medaillon = () => hote.querySelector('button.queue-btn .queue-badge');

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  hote = document.createElement('div');
  document.body.append(hote);
});
afterEach(async () => {
  if (monte) await unmount(monte);
  monte = undefined;
  hote.remove();
  zones.set([]);
  currentZoneId.set(null);
  queueTracks.set([]);
  queuePosition.set(0);
  vi.unstubAllGlobals();
});

describe('recette rc12 13/11 — le médaillon de la file compte les titres à suivre', () => {
  it('🔴 file de 18, 9e titre en cours : médaillon « 9 », pas « 18 »', { timeout: DELAI }, async () => {
    fileDe(18, 8);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    const b = bouton();
    expect(b, 'bouton file absent').not.toBeNull();
    expect(medaillon()?.textContent, 'le médaillon compte la file entière').toBe('9');
    expect(b!.getAttribute('aria-label')).toBe("File d'attente · 18 titres · 9 à suivre");
    expect(b!.getAttribute('title')).toBe(b!.getAttribute('aria-label'));
  });

  it('dernier titre en cours : plus de médaillon, l’infobulle garde le total', { timeout: DELAI }, async () => {
    fileDe(18, 17);
    monte = mount(TransportBar, { target: hote, props: {} as any });
    await attendre();
    expect(bouton()).not.toBeNull();
    expect(medaillon()).toBeNull();
    expect(bouton()!.getAttribute('aria-label')).toBe("File d'attente · 18 titres");
  });

  it('libellés : total nommé comme tel, puis « N à suivre »', () => {
    expect(texteMedaillonFile(9)).toBe('9');
    expect(texteMedaillonFile(0)).toBeNull();
    expect(libelleBoutonFile(tFr, 0, 0)).toBe("File d'attente");
    expect(libelleBoutonFile(tFr, 1, 0)).toBe("File d'attente · 1 titre");
    expect(libelleBoutonFile(tFr, 18, 9)).toBe("File d'attente · 18 titres · 9 à suivre");
  });
});
