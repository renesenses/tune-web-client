// @vitest-environment jsdom
//
// web#2151 (Didier, rc4, fil 2258) — « Sur la page d'un album certains
// boutons n'affichent pas la bulle d'aide : Aléatoire, Lire ensuite, Ajouter
// à la file et Ré-identifier. Dommage pour ce dernier car j'ai aucune idée de
// ce qu'il fait ! Attention aussi car certaines bulles d'aide ne font que
// recopier le titre du bouton. »
//
// Le témoin MONTE la fiche d'un album de la bibliothèque et lit chaque bouton
// des deux rangées d'actions : une bulle (`title`), et qui ne recopie pas le
// libellé du bouton.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const ALBUM = { id: 959, title: 'Akalé Wubé', artist_name: 'Akalé Wubé', year: 2010 } as Album;
const PISTES = [1, 2, 3].map((n) => ({
  id: 100 + n, title: `Titre ${n}`, artist_name: 'Akalé Wubé', album_id: 959, track_number: n,
  duration_ms: 200_000, source: 'local', file_path: `/musique/Akale Wube/0${n}.flac`,
}));

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps, text: async () => JSON.stringify(corps),
} as unknown as Response);

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/albums\/959\/tracks/.test(u)) return reponse(PISTES);
    if (/\/library\/albums\/959(\?|$)/.test(u)) return reponse({ ...ALBUM, tracks: PISTES });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function ouvrir(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, album: ALBUM } as any });
  for (let i = 0; i < 40; i++) {
    flushSync();
    if (hote.querySelector('.actions.local button')) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  flushSync();
  return hote;
}

const libelle = (b: HTMLButtonElement) => (b.textContent ?? '').replace(/\s+/g, ' ').trim();
const bouton = (h: HTMLElement, texte: string) =>
  [...h.querySelectorAll<HTMLButtonElement>('.actions button')].find((b) => libelle(b) === texte);

describe('#2151 — chaque bouton de la fiche album a une bulle qui dit ce qu’il fait', () => {
  it('🔴 les quatre boutons nommés par Didier ont leur bulle', { timeout: 60_000 }, async () => {
    const h = await ouvrir();
    for (const [cle, tip] of [
      ['v2.album.shuffle', 'v2.album.shuffleTip'],
      ['v2.album.playNext', 'v2.album.playNextTip'],
      ['v2.album.addQueue', 'v2.album.addQueueTip'],
      ['library.reidentify', 'v2.album.reidentifyTip'],
    ]) {
      const b = bouton(h, fr[cle]);
      expect(b, `bouton « ${fr[cle]} » introuvable`).toBeTruthy();
      expect(b!.getAttribute('title'), `« ${fr[cle]} » sans bulle`).toBe(fr[tip]);
    }
    expect(fr['v2.album.reidentifyTip']).toContain('MusicBrainz');
  });

  it('🔴 aucune bulle ne recopie le libellé de son bouton', { timeout: 60_000 }, async () => {
    const h = await ouvrir();
    const boutons = [...h.querySelectorAll<HTMLButtonElement>('.actions button')].filter((b) => libelle(b));
    expect(boutons.length, 'rangées d’actions vides — témoin sans objet').toBeGreaterThanOrEqual(8);
    for (const b of boutons) {
      const titre = (b.getAttribute('title') ?? '').trim();
      expect(titre, `« ${libelle(b)} » sans bulle`).not.toBe('');
      expect(titre, `la bulle de « ${libelle(b)} » recopie son libellé`).not.toBe(libelle(b));
    }
  });

  it.each(ONZE_LANGUES)('%s porte les onze bulles', (code) => {
    const d = dictionnaire(code);
    for (const k of ['play', 'shuffle', 'playNext', 'addQueue', 'addToPlaylist', 'locate', 'tags',
      'addToCollection', 'credits', 'reidentify', 'favorite']) {
      expect(d[`v2.album.${k}Tip`], `${code} : v2.album.${k}Tip`).toBeTruthy();
    }
  });
});
