// @vitest-environment jsdom
//
// « Écrit mais pas branché » — la moitié qui manque le plus souvent.
//
// `indicateurLecture.test.ts` monte l'indicateur SEUL : il prouve qu'il sait
// s'afficher, pas qu'une liste l'affiche. Ce fichier monte la LIGNE DE PISTE
// réelle — celle que rendent la fiche d'album, les playlists, la recherche, les
// favoris, l'historique et l'onglet Titres de la Bibliothèque, tous via
// `ListePistesV2` — et pilote la vraie chaîne : `zones` → `currentZone` →
// `currentTrack` / `playbackState` → la ligne.
//
// C'est cette chaîne que le ticket met en cause. Le commentaire de triage de
// #1845 le disait déjà : si l'indicateur n'atteint pas l'écran, « l'enquête se
// déplace vers `$currentTrackId`, le magasin qui alimente la comparaison ».
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import LignePisteV2 from '../../components/v2/LignePisteV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';
import type { NowPlaying, Track, Zone } from '../types';

const fr = lFr as Record<string, string>;

const PISTE: Track = {
  id: 7, title: 'Sœur Sourire', artist_name: 'A', album_title: 'B',
  duration_ms: 180000,
} as Track;
const AUTRE: Track = { id: 8, title: 'Autre', artist_name: 'A' } as Track;

/** Une zone réelle, telle que `GET /zones` la sérialise : l'identifiant de
 *  piste s'y nomme `track_id`, pas `id` — c'est le piège que documente
 *  `currentTrackId`, et le monter ici le tient. */
function zone(etat: Zone['state'], np: Partial<NowPlaying> | null): Zone {
  return {
    id: 1, name: 'Salon', state: etat,
    current_track: np ? ({ title: 'Sœur Sourire', ...np } as NowPlaying) : null,
  } as Zone;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(piste: Track): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LignePisteV2, {
    target: hote,
    props: { piste, onLire: () => {}, numero: 1, pochette: false },
  });
  return hote;
}
beforeEach(() => {
  currentZoneId.set(1);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  zones.set([]);
});

describe('la ligne de piste porte l’indicateur (#1845)', () => {
  it('la piste qui joue est marquée, et la ligne est « courante » pour un lecteur d’écran', () => {
    zones.set([zone('playing', { track_id: 7 })]);
    const el = poser(PISTE);
    const ligne = el.querySelector('.trk');
    expect(ligne?.getAttribute('aria-current')).toBe('true');
    expect(ligne?.classList.contains('np')).toBe(true);
    expect(el.querySelector('.il')?.getAttribute('aria-label')).toBe(fr['v2.piste.enLecture']);
  });

  // 🔴 Contre-épreuve indispensable : la MÊME chaîne, la même zone, une autre
  // piste. Sans elle, une ligne qui marquerait TOUT passerait le test ci-dessus.
  it('une autre piste de la même liste n’est pas marquée', () => {
    zones.set([zone('playing', { track_id: 7 })]);
    const el = poser(AUTRE);
    expect(el.querySelector('.trk')?.getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('.il')).toBeNull();
  });

  it('mise en pause, la ligne le DIT — elle ne se contente pas de rester allumée', () => {
    zones.set([zone('paused', { track_id: 7 })]);
    const el = poser(PISTE);
    expect(el.querySelector('.il')?.getAttribute('aria-label')).toBe(fr['v2.piste.enPause']);
    // La ligne reste repérée : c'est là qu'on a laissé son écoute.
    expect(el.querySelector('.trk')?.getAttribute('aria-current')).toBe('true');
  });

  // Une piste de service n'a pas d'identifiant local. La comparaison précédente
  // (`piste.id === $currentTrackId`) ne pouvait donc marquer AUCUNE ligne dans
  // les résultats Qobuz ou Tidal.
  it('une piste de streaming est marquée par sa paire source + source_id', () => {
    zones.set([zone('playing', { source: 'qobuz', source_id: 'q-99' })]);
    const el = poser({ id: null, title: 'Q', source: 'qobuz', source_id: 'q-99' } as Track);
    expect(el.querySelector('.il')?.getAttribute('aria-label')).toBe(fr['v2.piste.enLecture']);
  });

  it('rien ne joue : aucune ligne n’est marquée', () => {
    zones.set([zone('stopped', null)]);
    const el = poser(PISTE);
    expect(el.querySelector('.il')).toBeNull();
    expect(el.querySelector('.trk')?.getAttribute('aria-current')).toBeNull();
  });
});
